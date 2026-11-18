import { SHAREPOINT, ENV, ENV_NAME } from "./lib/config.js";
import { initAuth, login, logout, getToken } from "./lib/auth.js";
import { listFolder, readTextFile } from "./lib/sharepoint.js";
import { mk } from "./lib/dom.js";
import { readWorkbook, isExcelFile } from "./etl/read.js";
import { renderPreview } from "./etl/preview.js";
import { validateRules } from "./etl/rules-validate.js";
import { runRules, RuleError } from "./etl/transform.js";
import { renderResult, renderRuleErrors, renderRunError } from "./etl/result.js";
import { renderListCheck, loadSection } from "./etl/lists-ui.js";

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", isError);
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

// 규칙 파일을 읽어 엑셀에 적용하고 결과를 보여준다. List 에는 쓰지 않는다.
async function runPreprocess(item, button) {
  button.disabled = true;
  const container = $("result");
  try {
    setStatus(`규칙 파일(${SHAREPOINT.rulesFile})을 읽는 중...`);
    const file = await readTextFile(SHAREPOINT.rulesFile);
    const info = { ...file, envLabel: ENV.label };

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
    const workbook = await readWorkbook(item.id);

    try {
      const result = runRules(workbook, rules);
      renderResult(container, info, item.name, result);
      container.append(loadSection(result, setStatus));
      setStatus(`${item.name} — 전처리 결과 표 ${result.tables.length}개를 만들었습니다.`);
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

function excelCell(item) {
  return mk("span", { class: "actions" }, loadButton(item), preprocessButton(item));
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

async function main() {
  $("login").addEventListener("click", login);
  $("logout").addEventListener("click", logout);

  let account;
  try {
    account = await initAuth();
  } catch (err) {
    console.error(err);
    setStatus(`로그인 실패: ${err.errorCode ?? ""} ${err.message}`, true);
    $("login").hidden = false;
    return;
  }

  if (!account) {
    setStatus("Microsoft 계정으로 로그인하세요.");
    $("login").hidden = false;
    return;
  }

  $("user").textContent = `${account.name ?? ""} (${account.username})`;
  $("logout").hidden = false;
  $("check-lists").addEventListener("click", () => renderListCheck($("lists"), setStatus));
  $("tools").hidden = false;
  await showFolder();
}

main();
