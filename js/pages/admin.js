// 관리 화면 — 이관 도구(폴더 목록 · 엑셀 구조 미리보기 · 전처리 · List 점검·적재).
import { SHAREPOINT, ENV, ENV_NAME } from "../lib/config.js";
import { getToken } from "../lib/auth.js";
import { listFolder, readTextFile } from "../lib/sharepoint.js";
import { mk } from "../lib/dom.js";
import { readWorkbook, isExcelFile } from "../etl/read.js";
import { renderPreview } from "../etl/preview.js";
import { validateRules } from "../etl/rules-validate.js";
import { runRules, RuleError } from "../etl/transform.js";
import { renderResult, renderRuleErrors, renderRunError } from "../etl/result.js";
import { renderListCheck, loadSection, prodConfirm } from "../etl/lists-ui.js";
import { checkLockRules, lockKeysOf, readModelLock, saveModelLock } from "../etl/model-lock.js";
import { renderWriteCheck, WRITE_CHECK_LIST } from "../etl/write-check.js";

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const status = $("status");
  // 작업이 끝나기 전에 다른 화면으로 옮겨 갔으면 표시할 곳이 없다.
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("error", isError);
}

function formatSize(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
}

// 엑셀 파일을 읽어 시트 구조를 미리보기로 보여준다.
async function showWorkbook(item, button) {
  button.disabled = true;
  setStatus(`${item.name} 을(를) 읽는 중...`);
  try {
    const workbook = await readWorkbook(item.id);
    renderPreview($("preview"), item.name, workbook);
    setStatus(`${item.name} — 시트 ${workbook.sheets.length}개를 읽었습니다.`);
  } catch (err) {
    console.error(err);
    setStatus(`엑셀 읽기 실패: ${err.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function loadButton(item) {
  const button = mk("button", { type: "button" }, "불러오기");
  button.addEventListener("click", () => showWorkbook(item, button));
  return button;
}

// 폴더의 엑셀 파일. 참조 파일 선택 칸이 이 목록에서 고른다
let excelItems = [];
const referenceItem = () => excelItems.find((item) => item.id === $("reference")?.value) ?? null;

function renderReference() {
  const select = $("reference");
  const chosen = select.value;
  select.replaceChildren(
    mk("option", { value: "" }, "없음"),
    ...excelItems.map((item) => mk("option", { value: item.id }, item.name))
  );
  if (excelItems.some((item) => item.id === chosen)) select.value = chosen;
  $("reference-row").hidden = excelItems.length < 2;
}

// 전처리에 쓸 규칙 파일. 1차 이관 파일용(고정)이 설정에 있으면 화면에서 고른다.
//   baseline: 그 결과를 적재하면 List 를 1차 상태로 되돌린다(lists-ui.js)
const RULE_SETS = [
  { id: "update", label: "2차(업데이트)", path: SHAREPOINT.rulesFile, baseline: false },
  ...(SHAREPOINT.baselineRulesFile
    ? [{ id: "baseline", label: "1차(복구)", path: SHAREPOINT.baselineRulesFile, baseline: true }]
    : []),
];
const ruleSet = () => RULE_SETS.find((set) => set.id === $("rule-set")?.value) ?? RULE_SETS[0];

// 규칙 파일을 읽어 엑셀에 적용하고 결과를 보여준다. List 에는 쓰지 않는다.
async function runPreprocess(item, button) {
  button.disabled = true;
  const container = $("result");
  const set = ruleSet();
  try {
    setStatus(`규칙 파일(${set.path})을 읽는 중...`);
    let file;
    try {
      file = await readTextFile(set.path);
    } catch (err) {
      if (err?.status !== 404) throw err;
      setStatus(`규칙 파일이 없습니다: ${set.path}`, true);
      return;
    }
    const info = { ...file, envLabel: RULE_SETS.length > 1 ? `${ENV.label} · ${set.label}` : ENV.label };

    let rules;
    try {
      rules = JSON.parse(file.text);
    } catch {
      // JSON.parse 의 오류 문구에는 파일 내용 일부가 섞일 수 있어 그대로 보여주지 않는다.
      renderRuleErrors(container, info, [
        { where: "파일", item: "전체", message: "JSON 형식이 아닙니다(쉼표·따옴표·괄호를 확인하세요)" },
      ]);
      setStatus("규칙 파일을 읽을 수 없습니다.", true);
      return;
    }

    const errors = validateRules(rules, ENV_NAME);
    if (errors.length) {
      renderRuleErrors(container, info, errors);
      setStatus(`규칙 파일 형식 오류 ${errors.length}건`, true);
      return;
    }

    setStatus(`${item.name} 을(를) 읽는 중...`);
    let workbook = await readWorkbook(item.id);
    let sourceName = item.name;

    // 참조 파일을 골랐으면 그 파일의 시트를 합쳐서 규칙을 돌린다(마스터와 Logistics 가 다른 파일일 때)
    const reference = referenceItem();
    if (reference && reference.id !== item.id) {
      setStatus(`${reference.name} 을(를) 읽는 중...`);
      const other = await readWorkbook(reference.id);
      const names = new Set(workbook.sheets.map((sheet) => sheet.name));
      const same = other.sheets.filter((sheet) => names.has(sheet.name)).length;
      if (same) {
        setStatus(`두 파일에 이름이 같은 시트가 ${same}개 있어 전처리를 하지 않았습니다.`, true);
        return;
      }
      workbook = { sheets: [...workbook.sheets, ...other.sheets] };
      sourceName = `${item.name} + ${reference.name}`;
    }

    try {
      const result = runRules(workbook, rules);
      renderResult(container, info, sourceName, result);
      container.append(loadSection(result, setStatus, { baseline: set.baseline }));
      setStatus(
        `${sourceName} — 전처리 결과 표 ${result.tables.length}개를 만들었습니다.` +
          (RULE_SETS.length > 1 ? ` 규칙: ${set.label}` : "")
      );
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      renderRunError(container, info, err);
      setStatus("전처리를 중단했습니다.", true);
    }
  } catch (err) {
    console.error(err);
    setStatus(`전처리 실패: ${err.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function preprocessButton(item) {
  const button = mk("button", { type: "button" }, "전처리");
  button.addEventListener("click", () => runPreprocess(item, button));
  return button;
}

// 모델 고정 목록 — 고정 목록용 규칙 파일을 이 엑셀(1차 이관 파일)에 적용해 대상 차량의 키를 모으고,
// 건수를 확인받은 뒤 JSON 파일로 저장한다. 화면에는 건수와 파일 경로만 보여준다.
async function runModelLock(item, button) {
  button.disabled = true;
  const container = $("result");
  try {
    setStatus(`규칙 파일(${SHAREPOINT.lockRulesFile})을 읽는 중...`);
    let file;
    try {
      file = await readTextFile(SHAREPOINT.lockRulesFile);
    } catch (err) {
      if (err?.status !== 404) throw err;
      setStatus(`모델 고정 목록용 규칙 파일이 없습니다: ${SHAREPOINT.lockRulesFile}`, true);
      return;
    }
    const info = { ...file, envLabel: ENV.label };
    let rules;
    try {
      rules = JSON.parse(file.text);
    } catch {
      renderRuleErrors(container, info, [
        { where: "파일", item: "전체", message: "JSON 형식이 아닙니다(쉼표·따옴표·괄호를 확인하세요)" },
      ]);
      setStatus("규칙 파일을 읽을 수 없습니다.", true);
      return;
    }
    const errors = validateRules(rules, ENV_NAME);
    if (!errors.length) errors.push(...checkLockRules(rules));
    if (errors.length) {
      renderRuleErrors(container, info, errors);
      setStatus(`규칙 파일 형식 오류 ${errors.length}건`, true);
      return;
    }

    setStatus(`${item.name} 을(를) 읽는 중...`);
    const workbook = await readWorkbook(item.id);
    let keys;
    try {
      keys = lockKeysOf(runRules(workbook, rules));
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
      renderRunError(container, info, err);
      setStatus("모델 고정 목록을 만들지 못했습니다.", true);
      return;
    }
    const current = await readModelLock();
    renderModelLock(container, item, keys, current);
    setStatus(`${item.name} — 모델 고정 대상 ${keys.length}대`);
  } catch (err) {
    console.error(err);
    setStatus(`모델 고정 목록 실패: ${err.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function renderModelLock(container, item, keys, current) {
  const confirm = prodConfirm();
  const save = mk("button", { type: "button" }, `목록 저장 (${keys.length}대)`);
  save.disabled = keys.length === 0;
  save.addEventListener("click", async () => {
    if (!confirm.isConfirmed()) {
      setStatus("확인 문구가 맞지 않습니다.", true);
      return;
    }
    save.disabled = true;
    try {
      await saveModelLock(keys, item.name, current?.etag);
      setStatus(`모델 고정 목록을 저장했습니다 — ${keys.length}대`);
    } catch (err) {
      console.error(err);
      setStatus(
        err?.status === 412
          ? "그사이 목록 파일이 바뀌었습니다. 다시 만들어 주세요."
          : `모델 고정 목록 저장 실패: ${err?.status ?? ""} ${err?.message ?? ""}`.trim(),
        true
      );
      save.disabled = false;
    }
  });
  container.replaceChildren(
    mk("h2", null, "모델 고정 목록"),
    mk("p", { class: "hint" }, `원본 ${item.name} · 규칙 파일 ${SHAREPOINT.lockRulesFile}`),
    mk("p", null, `모델 고정 대상 ${keys.length}대. 적재는 이 차량의 모델 연결과 모델 속성을 바꾸지 않습니다.`),
    mk(
      "p",
      { class: "hint" },
      current
        ? `지금 저장된 목록: ${current.keys.size}대 · 원본 ${current.source || "-"} · 저장 ${
            current.savedAt ? new Date(current.savedAt).toLocaleString("ko-KR") : "-"
          }. 저장하면 이 목록을 바꿉니다.`
        : "지금 저장된 목록이 없습니다."
    ),
    mk("p", { class: "hint" }, `대상(${ENV.label}): ${SHAREPOINT.modelLockFile}`),
    confirm.node ?? "",
    save
  );
  container.hidden = false;
}

function modelLockButton(item) {
  const button = mk("button", { type: "button" }, "모델 고정 목록");
  button.addEventListener("click", () => runModelLock(item, button));
  return button;
}

function excelCell(item) {
  return mk("span", { class: "actions" }, loadButton(item), preprocessButton(item), modelLockButton(item));
}

function renderItems(items) {
  const tbody = $("files").querySelector("tbody");
  tbody.replaceChildren(
    ...items.map((item) => {
      const tr = document.createElement("tr");
      const name = document.createElement("a");
      name.href = item.webUrl;
      name.target = "_blank";
      name.rel = "noopener";
      name.textContent = item.folder ? `${item.name}/` : item.name;
      const cells = [
        name,
        item.folder ? `항목 ${item.folder.childCount}개` : formatSize(item.size),
        new Date(item.lastModifiedDateTime).toLocaleString("ko-KR"),
        isExcelFile(item) ? excelCell(item) : "",
      ];
      for (const cell of cells) {
        const td = document.createElement("td");
        td.append(cell);
        tr.append(td);
      }
      return tr;
    })
  );
  $("files").hidden = false;
  excelItems = items.filter(isExcelFile);
  renderReference();
}

async function showFolder() {
  const folderPath = SHAREPOINT.folders.modify;
  setStatus(`${folderPath} 폴더를 불러오는 중...`);
  try {
    const { scopes } = await getToken();
    $("scopes").textContent = `부여된 권한: ${scopes.join(", ")}`;
    const items = await listFolder(folderPath);
    renderItems(items);
    setStatus(`${SHAREPOINT.sitePath}/${folderPath} — 항목 ${items.length}개`);
  } catch (err) {
    console.error(err);
    setStatus(`폴더 조회 실패: ${err.errorCode ?? ""} ${err.message}`, true);
  }
}

// 관리 화면의 뼈대. 아래 영역을 각 기능이 id 로 찾아 채운다.
function layout() {
  return mk(
    "div",
    { class: "card admin" },
    mk("div", { class: "card-h" }, mk("h2", null, `관리 — ${ENV.label}`)),
    mk("p", { id: "status" }, "초기화 중..."),
    mk("p", { id: "scopes" }),
    mk(
      "table",
      { id: "files", hidden: true },
      mk("thead", null, mk("tr", null, ["이름", "크기", "수정한 날짜", "엑셀"].map((h) => mk("th", null, h)))),
      mk("tbody")
    ),
    mk(
      "p",
      { id: "rule-set-row", hidden: RULE_SETS.length < 2 },
      mk(
        "label",
        null,
        "전처리 규칙 ",
        mk("select", { id: "rule-set" }, RULE_SETS.map((set) => mk("option", { value: set.id }, set.label)))
      ),
      mk("span", { class: "hint" }, " 1차(복구)는 1차 이관 파일을 다시 적재해 List 를 1차 상태로 되돌릴 때만 고릅니다.")
    ),
    mk(
      "p",
      { id: "reference-row", hidden: true },
      mk("label", null, "참조 파일 ", mk("select", { id: "reference" })),
      mk("span", { class: "hint" }, " 전처리할 때 이 파일의 시트를 함께 읽습니다(마스터 파일이 따로 있을 때).")
    ),
    mk(
      "p",
      { id: "tools" },
      mk("button", { type: "button", onclick: () => renderListCheck($("lists"), setStatus) }, "List 점검"),
      WRITE_CHECK_LIST
        ? mk("button", { type: "button", onclick: () => renderWriteCheck($("lists"), setStatus) }, "쓰기 점검")
        : null
    ),
    mk("section", { id: "lists", hidden: true }),
    mk("section", { id: "preview", hidden: true }),
    mk("section", { id: "result", hidden: true })
  );
}

/** 관리 화면 — 폴더 목록, 엑셀 구조 미리보기, 전처리, List 점검·적재 */
export const adminPage = {
  render(root) {
    root.append(layout());
    showFolder();
  },
};
