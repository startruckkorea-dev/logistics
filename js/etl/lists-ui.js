// List 점검·생성 화면과 적재 화면.
// 쓰기 전에 항상 대상 List 이름과 건수를 보여주고, 운영에서는 한 번 더 확인받는다.
// 화면에는 List·열 이름과 건수만 표시한다.
import { mk } from "../lib/dom.js";
import { ENV, ENV_NAME } from "../lib/config.js";
import {
  listLists, listColumns, createList, addListColumn, readListItems, writeListItems, deleteListItems,
} from "../lib/splist.js";
import { LISTS, APP_LISTS, listForTable } from "./lists.js";
import { planLoad, planPrune, compareColumns } from "./load-plan.js";
import { readModelLock } from "./model-lock.js";

// 운영에서 쓰기 전에 입력해야 하는 확인 문구
const PROD_CONFIRM_WORD = "PRD";

function grid(headLabels, bodyRows) {
  return mk(
    "div",
    { class: "grid-wrap" },
    mk(
      "table",
      { class: "grid" },
      mk("thead", null, mk("tr", null, headLabels.map((label) => mk("th", null, label)))),
      mk("tbody", null, bodyRows)
    )
  );
}

const cells = (...values) => mk("tr", null, values.map((v) => mk("td", null, v)));

function describeError(err) {
  if (err?.status === 403) {
    return "권한이 없습니다(403). List·열을 만들려면 앱에 Sites.Manage.All 권한이 필요합니다.";
  }
  return `${err?.status ?? ""} ${err?.code ?? ""} ${err?.message ?? ""}`.trim();
}

// 운영에서만 나타나는 확인 입력. 반환한 isConfirmed() 가 참이어야 쓴다.
export function prodConfirm() {
  if (ENV_NAME !== "prod") return { node: null, isConfirmed: () => true };
  const input = mk("input", { type: "text", "aria-label": "운영 확인 문구" });
  const node = mk(
    "p",
    { class: "error" },
    `운영에 씁니다. 계속하려면 ${PROD_CONFIRM_WORD} 를 입력하세요: `,
    input
  );
  return { node, isConfirmed: () => input.value.trim() === PROD_CONFIRM_WORD };
}

// ---- List 점검·생성 ----

async function inspect() {
  const existing = await listLists();
  const out = [];
  for (const def of [...LISTS, ...APP_LISTS]) {
    const found = existing.find((l) => l.displayName === def.listName);
    if (!found) {
      out.push({ def, listId: null, diff: null });
      continue;
    }
    out.push({ def, listId: found.id, diff: compareColumns(def, await listColumns(found.id)) });
  }
  return out;
}

function inspectionTable(inspection) {
  return grid(
    ["List", "상태", "없는 열", "타입이 다른 열", "인덱스 없음", "고유값 없음", "고유값 해제 필요"],
    inspection.map(({ def, listId, diff }) =>
      listId
        ? cells(
            def.listName,
            "있음",
            diff.missing.map((c) => c.name).join(", ") || "-",
            diff.wrongType.join(", ") || "-",
            diff.notIndexed.join(", ") || "-",
            diff.notUnique.join(", ") || "-",
            diff.extraUnique.join(", ") || "-"
          )
        : cells(def.listName, `없음 (열 ${def.columns.length}개)`, "-", "-", "-", "-", "-")
    )
  );
}

/** "List 점검" 화면. 정의와 실제 List 를 비교하고, 없는 List·열을 만들 수 있다. */
export async function renderListCheck(container, setStatus) {
  container.hidden = false;
  container.replaceChildren(mk("h2", null, `List 점검 — ${ENV.label}`));
  setStatus("List 를 점검하는 중...");

  let inspection;
  try {
    inspection = await inspect();
  } catch (err) {
    console.error(err);
    setStatus(`List 점검 실패: ${describeError(err)}`, true);
    return;
  }
  container.append(inspectionTable(inspection));

  const toCreate = inspection.filter((i) => !i.listId);
  const toExtend = inspection.filter((i) => i.listId && i.diff.missing.length);
  const manual = inspection.filter(
    (i) =>
      i.listId &&
      (i.diff.wrongType.length || i.diff.notIndexed.length || i.diff.notUnique.length || i.diff.extraUnique.length)
  );
  if (manual.length) {
    container.append(
      mk(
        "p",
        { class: "hint" },
        "타입·인덱스·고유값 차이는 자동으로 고치지 않습니다. SharePoint 의 List 설정에서 확인하세요."
      )
    );
  }
  if (!toCreate.length && !toExtend.length) {
    setStatus(manual.length ? "List 는 있지만 정의와 다른 점이 있습니다." : `List ${inspection.length}개가 정의와 같습니다.`);
    return;
  }

  const confirm = prodConfirm();
  const button = mk("button", { type: "button" }, "없는 List·열 만들기");
  const log = mk("ul", { class: "hint" });
  button.addEventListener("click", async () => {
    if (!confirm.isConfirmed()) {
      setStatus("확인 문구가 맞지 않습니다.", true);
      return;
    }
    button.disabled = true;
    try {
      for (const { def } of toCreate) {
        setStatus(`${def.listName} 을(를) 만드는 중...`);
        await createList(def);
        log.append(mk("li", null, `${def.listName} 생성`));
      }
      for (const { def, listId, diff } of toExtend) {
        for (const column of diff.missing) {
          setStatus(`${def.listName} 에 ${column.name} 열을 추가하는 중...`);
          await addListColumn(listId, column, def);
        }
        log.append(mk("li", null, `${def.listName} 에 열 ${diff.missing.length}개 추가`));
      }
      await renderListCheck(container, setStatus);
    } catch (err) {
      console.error(err);
      setStatus(`List 생성 실패: ${describeError(err)}`, true);
      button.disabled = false;
    }
  });
  container.append(
    mk(
      "p",
      { class: "hint" },
      `만들 List: ${toCreate.map((i) => i.def.listName).join(", ") || "없음"}` +
        ` · 열을 추가할 List: ${toExtend.map((i) => i.def.listName).join(", ") || "없음"}`
    ),
    confirm.node ?? "",
    button,
    log
  );
  setStatus("정의와 다른 점이 있습니다.");
}

// ---- 적재 ----

// def.keepEmptyWhen 에 해당하는 키(빈 값으로 List 값을 지우지 않는 차량). 기준 표가 결과에 없으면 빈 집합
function keepEmptyKeysOf(result, def) {
  const keys = new Set();
  const rule = def.keepEmptyWhen;
  const source = rule && result.tables.find((t) => t.name === rule.table);
  if (!source) return keys;
  const keyIndex = source.columns.indexOf(listForTable(rule.table).key);
  // 결과 표에 없는 열(표시 열을 내지 않는 규칙 파일)의 조건은 건너뛴다
  const conditions = rule.any
    .map((c) => ({ index: source.columns.indexOf(c.column), values: c.values }))
    .filter((c) => c.index >= 0);
  for (const row of source.rows) {
    if (row[keyIndex] != null && conditions.some((c) => c.values.includes(row[c.index]))) keys.add(String(row[keyIndex]));
  }
  return keys;
}

// baseline: 1차 이관 파일을 다시 적재해 List 를 1차 상태로 되돌리는 경우.
//   모델 고정 목록과 "빈 값으로 지우지 않음"을 적용하지 않고 결과 표 그대로 쓴다
async function buildPlans(result, baseline) {
  const existing = await listLists();
  const plans = [];
  for (const table of result.tables) {
    const def = listForTable(table.name);
    if (!def) {
      plans.push({ table, def: null, listId: null, plan: null, note: "List 정의가 없는 결과 표" });
      continue;
    }
    const found = existing.find((l) => l.displayName === def.listName);
    if (!found) {
      plans.push({ table, def, listId: null, plan: null, note: "List 가 없음(List 점검에서 먼저 생성)" });
      continue;
    }
    const diff = compareColumns(def, await listColumns(found.id));
    if (diff.missing.length || diff.wrongType.length) {
      plans.push({ table, def, listId: found.id, plan: null, note: "List 의 열이 정의와 다름(List 점검 확인)" });
      continue;
    }
    const items = await readListItems(found.id, def.columns.map((c) => c.name));
    // 모델 고정 목록을 쓰는 List 면 목록을 읽어 넘긴다. 목록 파일이 없으면 고정 없이 비교한다
    if (baseline) {
      plans.push({ table, def, listId: found.id, plan: planLoad(table, { ...def, lock: undefined }, items), note: "" });
      continue;
    }
    const lock = def.lock ? await readModelLock() : null;
    const keepEmptyKeys = keepEmptyKeysOf(result, def);
    plans.push({
      table,
      def,
      listId: found.id,
      plan: planLoad(table, def, items, { lockedKeys: lock?.keys, keepEmptyKeys }),
      note: "",
      lockSize: def.lock ? lock?.keys.size ?? null : undefined,
    });
  }
  return plans;
}

function planTable(plans) {
  return grid(
    ["대상 List", "결과 표", "추가", "변경", "동일", "List 에만 있음", "문제"],
    plans.map(({ table, def, plan, note }) =>
      plan
        ? cells(
            def.listName,
            table.name,
            plan.adds,
            plan.updates,
            plan.same,
            plan.onlyInList,
            plan.problems.join(" / ") || "-"
          )
        : cells(def?.listName ?? "-", table.name, "-", "-", "-", "-", note)
    )
  );
}

function changedColumnsNote(plans) {
  const lines = plans
    .filter((p) => p.plan && p.plan.updates)
    .map(
      (p) =>
        `${p.def.listName}: ` +
        Object.entries(p.plan.changedByColumn)
          .map(([name, n]) => `${name} ${n}`)
          .join(" · ")
    );
  return lines.length ? mk("p", { class: "hint" }, "변경되는 열 — ", lines.join(" / ")) : null;
}

// 빈 값으로 지우지 않은 차량 수(Cancelled 등)
function keptEmptyNote(plans) {
  const lines = plans
    .filter((p) => p.plan?.keptEmpty)
    .map((p) => `${p.def.listName}: ${p.plan.keptEmpty}대`);
  return lines.length
    ? mk("p", { class: "hint" }, "빈 값으로 지우지 않음(Cancelled 이거나 AFAB 연결 열이 모두 오류인 차량) — ", lines.join(" / "), ". 결과 표에서 빈 칸은 List 값을 그대로 둡니다.")
    : null;
}

// 고정 목록에 없는데 모델이 정해지지 않은 행. 엑셀에서 찾아 고칠 수 있게 행 번호를 보여준다
function unresolvedNote(plans) {
  const lines = plans
    .filter((p) => p.plan?.unresolved)
    .map((p) => {
      const { unresolved, unresolvedLines } = p.plan;
      const rows = unresolvedLines.length
        ? ` 엑셀 행 번호(${p.table.sheet ?? p.table.name}): ${unresolvedLines.join(", ")}${unresolved > unresolvedLines.length ? " …" : ""}`
        : "";
      return `${p.def.listName}: ${p.def.lock.required} 를 정하지 못한 차량 ${unresolved}대.${rows}`;
    });
  return lines.length
    ? mk(
        "p",
        { class: "error" },
        "모델을 찾지 못한 차량 — ",
        lines.join(" / "),
        " 엑셀의 연식·BM 이나 Model Master 를 고친 뒤 다시 전처리하세요."
      )
    : null;
}

// 모델 고정 목록을 쓰는 List: 목록 크기와 이번 결과에서 고정된 항목 수
function lockNote(plans) {
  const lines = plans
    .filter((p) => p.plan && p.lockSize !== undefined)
    .map((p) =>
      p.lockSize === null
        ? `${p.def.listName}: 목록 파일이 없어 고정 없이 비교했습니다`
        : `${p.def.listName}: 목록 ${p.lockSize}대 중 이번 결과의 ${p.plan.locked}대는 ${p.def.lock.columns.join(", ")} 을 바꾸지 않습니다`
    );
  return lines.length ? mk("p", { class: "hint" }, "모델 고정 — ", lines.join(" / ")) : null;
}

// 모델을 찾지 못했지만 막지 않는 행(Cancelled 등): List 의 모델 값을 그대로 둔 항목 수
function exemptNote(plans) {
  const lines = plans
    .filter((p) => p.plan?.exempted)
    .map((p) => {
      const { exempt, required } = p.def.lock;
      return `${p.def.listName}: ${required} 를 찾지 못한 ${exempt.values.join("·")} 차량 ${p.plan.exempted}대는 모델 관련 열을 바꾸지 않습니다`;
    });
  return lines.length ? mk("p", { class: "hint" }, "모델 유지 — ", lines.join(" / ")) : null;
}

// ---- 1차 복구 정리 ----

// 지울 것을 List 별로 모은다. 1차 결과 표에 없는 행(차량·모델·색상)과, 앱에서만 생기는 List 의 모든 항목
async function buildPrunePlans(result) {
  const existing = await listLists();
  const idOf = (def) => existing.find((l) => l.displayName === def.listName)?.id ?? null;
  const plans = [];
  for (const def of LISTS.filter((d) => d.pruneOnRestore)) {
    const table = result.tables.find((t) => t.name === def.table);
    const listId = idOf(def);
    if (!table || !listId) {
      plans.push({ def, listId, ids: [], kept: null, note: table ? "List 가 없음" : "결과 표가 없어 정리하지 않음" });
      continue;
    }
    const plan = planPrune(table, def, await readListItems(listId, [def.key]));
    plans.push({ def, listId, ids: plan.ids, kept: plan.kept, note: plan.problem || "1차 결과 표에 없는 행" });
  }
  for (const def of APP_LISTS.filter((d) => d.clearOnRestore)) {
    const listId = idOf(def);
    if (!listId) {
      plans.push({ def, listId, ids: [], kept: null, note: "List 가 없음" });
      continue;
    }
    const items = await readListItems(listId, [def.columns[0].name]);
    plans.push({ def, listId, ids: items.map((item) => item.id), kept: 0, note: "전부 비움" });
  }
  return plans;
}

// 1차 복구 정리 영역. 운영에서는 만들지 않는다
function pruneSection(result, setStatus) {
  const body = mk("div");
  const planButton = mk("button", { type: "button" }, "정리 계획 보기");

  planButton.addEventListener("click", async () => {
    planButton.disabled = true;
    setStatus("List 의 현재 내용을 읽어 지울 항목을 세는 중...");
    try {
      showPlans(await buildPrunePlans(result));
    } catch (err) {
      console.error(err);
      setStatus(`정리 계획 실패: ${describeError(err)}`, true);
    } finally {
      planButton.disabled = false;
    }
  });

  function showPlans(plans) {
    const total = plans.reduce((n, p) => n + p.ids.length, 0);
    body.replaceChildren(
      grid(
        ["대상 List", "지움", "남김", "내용"],
        plans.map((p) => cells(p.def.listName, p.ids.length, p.kept ?? "-", p.note))
      )
    );
    if (!total) {
      body.append(mk("p", { class: "hint" }, "지울 항목이 없습니다."));
      setStatus("정리할 항목이 없습니다.");
      return;
    }
    const runButton = mk("button", { type: "button" }, `삭제 실행 (${total}건)`);
    runButton.addEventListener("click", async () => {
      runButton.disabled = true;
      planButton.disabled = true;
      const rows = [];
      try {
        for (const { def, listId, ids } of plans) {
          if (!ids.length) continue;
          const outcome = await deleteListItems(listId, ids, (done, all) =>
            setStatus(`${def.listName} 에서 지우는 중... ${done}/${all}`)
          );
          const codes = [...new Set(outcome.failed.map((f) => `${f.status} ${f.code}`))];
          rows.push(cells(def.listName, ids.length, outcome.ok, outcome.failed.length, codes.join(", ") || "-"));
        }
        body.append(
          mk("h4", null, "정리 결과"),
          grid(["대상 List", "시도", "성공", "실패", "실패 코드"], rows),
          mk("p", { class: "hint" }, "\"정리 계획 보기\"를 다시 누르면 남은 항목을 확인할 수 있습니다.")
        );
        setStatus("정리를 마쳤습니다.");
      } catch (err) {
        console.error(err);
        setStatus(`정리 실패: ${describeError(err)}`, true);
      } finally {
        planButton.disabled = false;
      }
    });
    body.append(
      mk(
        "p",
        { class: "error" },
        `대상(${ENV.label}): ${plans.filter((p) => p.ids.length).map((p) => p.def.listName).join(", ")}. ` +
          "항목을 지웁니다. 지운 항목은 SharePoint 사이트의 휴지통에서만 되살릴 수 있습니다."
      ),
      runButton
    );
    setStatus(`정리 계획: ${total}건 삭제`);
  }

  return mk(
    "section",
    { class: "sheet" },
    mk("h3", null, `1차에 없는 항목 정리 — ${ENV.label}`),
    mk(
      "p",
      { class: "hint" },
      "1차 결과 표에 없는 차량·모델·색상 행을 지우고, 변경 이력과 선박 정보를 비웁니다. 먼저 List 별 건수를 보여주고, 확인한 뒤에만 지웁니다."
    ),
    planButton,
    body
  );
}

/**
 * 전처리 결과 화면 아래에 붙는 적재 영역.
 * @param {object} result runRules 의 결과
 * @param {(text: string, isError?: boolean) => void} setStatus
 * @param {{baseline?: boolean}} [options] baseline: 1차 이관 파일용 규칙으로 만든 결과(List 를 1차 상태로 되돌린다)
 */
export function loadSection(result, setStatus, options = {}) {
  const baseline = options.baseline === true;
  const body = mk("div");
  const planButton = mk("button", { type: "button" }, "적재 계획 보기");

  planButton.addEventListener("click", async () => {
    planButton.disabled = true;
    setStatus("List 의 현재 내용을 읽어 비교하는 중...");
    try {
      const plans = await buildPlans(result, baseline);
      showPlans(plans);
    } catch (err) {
      console.error(err);
      setStatus(`적재 계획 실패: ${describeError(err)}`, true);
    } finally {
      planButton.disabled = false;
    }
  });

  function showPlans(plans) {
    const blocked = plans.some((p) => !p.plan || p.plan.problems.length);
    const total = plans.reduce((n, p) => n + (p.plan?.ops.length ?? 0), 0);
    body.replaceChildren(
      planTable(plans),
      changedColumnsNote(plans) ?? "",
      lockNote(plans) ?? "",
      exemptNote(plans) ?? "",
      keptEmptyNote(plans) ?? "",
      unresolvedNote(plans) ?? ""
    );

    if (blocked) {
      body.append(mk("p", { class: "error" }, "문제가 있어 적재할 수 없습니다. 위 표의 문제 열을 확인하세요."));
      setStatus("적재 계획에 문제가 있습니다.", true);
      return;
    }
    if (!total) {
      body.append(mk("p", { class: "hint" }, "List 가 전처리 결과와 같습니다. 쓸 것이 없습니다."));
      setStatus("적재할 변경이 없습니다.");
      return;
    }

    const confirm = prodConfirm();
    const runButton = mk("button", { type: "button" }, `적재 실행 (${total}건)`);
    runButton.addEventListener("click", async () => {
      if (!confirm.isConfirmed()) {
        setStatus("확인 문구가 맞지 않습니다.", true);
        return;
      }
      runButton.disabled = true;
      planButton.disabled = true;
      const rows = [];
      try {
        for (const { def, listId, plan } of plans) {
          if (!plan.ops.length) continue;
          const outcome = await writeListItems(listId, plan.ops, (done, all) =>
            setStatus(`${def.listName} 에 쓰는 중... ${done}/${all}`)
          );
          const codes = [...new Set(outcome.failed.map((f) => `${f.status} ${f.code}`))];
          rows.push(cells(def.listName, plan.ops.length, outcome.ok, outcome.failed.length, codes.join(", ") || "-"));
        }
        body.append(
          mk("h4", null, "적재 결과"),
          grid(["대상 List", "시도", "성공", "실패", "실패 코드"], rows),
          mk("p", { class: "hint" }, "\"적재 계획 보기\"를 다시 누르면 남은 차이를 확인할 수 있습니다.")
        );
        setStatus("적재를 마쳤습니다.");
      } catch (err) {
        console.error(err);
        setStatus(`적재 실패: ${describeError(err)}`, true);
      } finally {
        planButton.disabled = false;
      }
    });
    body.append(
      mk(
        "p",
        { class: "hint" },
        `대상(${ENV.label}): ${plans.map((p) => p.def.listName).join(", ")}. ` +
          "추가와 변경만 씁니다. List 에만 있는 행은 지우지 않습니다. " +
          "변경은 List 의 현재 값을 전처리 결과로 바꿉니다." +
          (baseline ? " 1차(복구): 모델 고정 목록과 \"빈 값으로 지우지 않음\"을 적용하지 않습니다." : "")
      ),
      confirm.node ?? "",
      runButton
    );
    setStatus(`적재 계획: ${total}건`);
  }

  const section = mk(
    "section",
    { class: "sheet" },
    mk("h3", null, `List 에 적재 — ${ENV.label}${baseline ? " · 1차(복구)" : ""}`),
    mk(
      "p",
      { class: "hint" },
      "먼저 List 의 현재 내용과 비교해 추가·변경 건수를 보여줍니다. 확인한 뒤에만 씁니다."
    ),
    planButton,
    body
  );
  // 1차 복구일 때만, 운영이 아닐 때만 정리 영역을 붙인다
  if (!baseline || ENV_NAME === "prod") return section;
  const wrap = document.createDocumentFragment();
  wrap.append(section, pruneSection(result, setStatus));
  return wrap;
}
