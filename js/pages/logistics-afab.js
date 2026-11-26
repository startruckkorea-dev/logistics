// Logistics · AFAB 업로드 탭 — AFAB 엑셀을 올려 차량의 AFAB 열에 반영한다.
// 파일 선택 → 규칙 파일로 가공 → 미리보기(차량 1행, 바뀌는 열마다 1칸) → 반영하지 않을 행은 체크를 품 → 확인 창 → 저장 → 결과 표시.
// Current Status 는 Rejected · Shipment scheduled 만 바꾼다. 파일에 없는 차량과 차량 마스터에 없는 Commission 은 보여주기만 한다.
// 올린 파일의 검토 상태(판정 · 체크 · 결과)는 다른 화면에 다녀와도 남는다. "다른 파일"을 누르거나 브라우저를 새로 고치면 사라진다.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { readXlsxWorkbook, XLSX_MAX_BYTES } from "../lib/xlsx.js";
import { tx } from "../app/i18n.js";
import { num } from "../app/charts.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { COLUMNS, STAGE_ORDER, stageClass } from "../data/columns.js";
import { RuleError } from "../etl/transform.js";
import { loadVehicles } from "../data/vehicles.js";
import { loadColorMaster } from "../data/masters.js";
import { AFAB_DERIVED_FIELDS } from "../data/store.js";
import {
  AfabRulesError, afabRulesPath, loadAfabRules, readAfabTable, planAfab, afabListNames, applyAfab, statusKind,
} from "../data/afab-store.js";

const labelOf = (field) => COLUMNS.find((c) => c.key === field)?.label ?? field;
const pill = (kind, text) => mk("span", { class: `pill ${kind}` }, text);
const dim = () => mk("span", { class: "muted" }, "·");

const ERROR_TEXT = {
  no_commission: "Commission No 가 비어 있음",
  duplicate: "같은 차량이 여러 줄에 있음",
  too_long: "값이 너무 김",
  vin_mismatch: "파일의 두 Vin No 열 값이 서로 다름",
};
const FILE_ERROR_TEXT = {
  not_xlsx: ".xlsx 파일만 올릴 수 있습니다.",
  too_large: "파일이 너무 큽니다({n}MB 까지).",
  xlsx_library: "엑셀을 읽는 모듈을 불러오지 못했습니다. 다시 시도하세요.",
  unreadable: "파일을 읽을 수 없습니다. 엑셀에서 .xlsx 로 다시 저장해 올려 주세요.",
};
const RULES_ERROR_TEXT = {
  missing: "AFAB 규칙 파일이 없습니다.",
  unreadable: "AFAB 규칙 파일을 읽지 못했습니다.",
  json: "AFAB 규칙 파일이 JSON 형식이 아닙니다(쉼표·따옴표·괄호를 확인하세요).",
  invalid: "AFAB 규칙 파일에 형식 오류가 있습니다.",
};
const RESULT_PILL = {
  saved: ["ok", "반영"],
  unchanged: ["neutral", "변경 없음"],
  conflict: ["danger", "충돌"],
  denied: ["danger", "권한 없음"],
  invalid: ["danger", "형식 오류"],
};

// 화면 상태. 다른 화면에 다녀와도 유지한다(파일 내용은 이 브라우저의 메모리에만 있다).
//   file: 파일 이름, table: 규칙을 적용한 AFAB 표, plan: 판정 결과,
//   off: 체크를 푼 행의 엑셀 행 번호(반영하지 않는다),
//   results: 저장 결과(item → 결과). 있으면 반영이 끝난 상태다. problem: 파일·규칙 오류 안내(노드 목록)
const state = {
  busy: "", problem: null, file: "", table: null, plan: null, off: new Set(), results: null, saving: false,
};
// 지금 화면에 붙어 있는 탭을 다시 그린다. 파일 읽기·저장이 끝났을 때, 그사이 화면을 옮겼다 돌아왔어도 새 화면에 그려지게 한다
let redraw = () => {};

// 열별 변경 대수: 그 열의 값이 바뀌는 차량 수(Current Status 포함). 차량 그리드의 열 순서
function columnCounts(items) {
  const counts = new Map();
  const add = (field) => counts.set(field, (counts.get(field) ?? 0) + 1);
  for (const item of items) {
    if (item.status) add("current_status");
    for (const change of [...item.changes, ...item.derived]) add(change.field);
  }
  return COLUMNS.map((c) => c.key).filter((key) => counts.has(key)).map((key) => [key, counts.get(key)]);
}

function columnCountsEl(title, items) {
  const counts = columnCounts(items);
  return mk(
    "p",
    { class: "af-colcounts" },
    mk("b", null, title),
    counts.length
      ? counts.map(([field, n]) => mk("span", null, `${labelOf(field)} `, mk("b", { class: "num" }, num(n))))
      : mk("span", { class: "muted" }, "·")
  );
}

/** AFAB 업로드 탭을 root 에 그린다. */
export function renderAfabTab(root) {
  const body = mk("div");

  root.replaceChildren(
    mk(
      "div",
      { class: "card" },
      mk(
        "div",
        { class: "card-h" },
        mk("h2", null, tx("AFAB 업로드")),
        mk("span", { class: "desc" }, tx("AFAB 엑셀 업로드 → 차량의 AFAB 열 반영 · Shipping Calc · ETA From TDD · Color Name 은 같이 맞춤"))
      ),
      body
    )
  );

  // 반영할 수 있는 행(차량이 있고 바뀌는 값이 있다)과, 그중 체크되어 있는 행
  const canApply = (item) => item.kind === "ok" || item.kind === "review";
  const isOn = (item) => canApply(item) && !state.off.has(item.line);
  const picked = () => state.plan.items.filter(isOn);

  // 오류 → 화면에 보여줄 안내. 규칙에 적힌 값과 데이터 값은 넣지 않는다
  function problemOf(err) {
    if (FILE_ERROR_TEXT[err?.message]) {
      return [mk("p", { class: "error" }, tx(FILE_ERROR_TEXT[err.message], { n: XLSX_MAX_BYTES / 1024 / 1024 }))];
    }
    if (err instanceof AfabRulesError) {
      return [
        mk("p", { class: "error" }, `${tx(RULES_ERROR_TEXT[err.code])} ${err.status ?? ""}`.trim()),
        mk("p", { class: "muted small" }, `${tx("규칙 파일")}(${ENV.label}): ${afabRulesPath()}`),
        err.errors.length
          ? mk("ul", { class: "small af-errors" }, err.errors.map((e) => mk("li", null, `${e.where} · ${e.item} — ${e.message}`)))
          : null,
      ];
    }
    if (err instanceof RuleError) {
      const rows = err.rowCount
        ? ` · ${tx("해당 행 {n}건 (엑셀 행 번호: {rows})", { n: num(err.rowCount), rows: err.rows.join(", ") + (err.rowCount > err.rows.length ? " …" : "") })}`
        : "";
      return [
        mk("p", { class: "error" }, tx("올린 파일을 규칙대로 읽지 못했습니다. 파일의 시트·머리글이 규칙 파일과 맞는지 확인하세요.")),
        mk("p", { class: "small" }, `${err.sheet ?? ""} · ${err.ruleId ?? "-"} — ${err.message}${rows}`),
      ];
    }
    console.error(err);
    return [mk("p", { class: "error" }, `${tx("차량 데이터를 불러오지 못했습니다.")} ${err?.status ?? ""}`.trim())];
  }

  async function choose(file) {
    if (!file || state.busy) return;
    Object.assign(state, { busy: tx("파일을 읽는 중..."), problem: null, file: "", table: null, plan: null, results: null });
    state.off.clear();
    draw();
    try {
      const workbook = await readXlsxWorkbook(file);
      // 규칙 파일은 올릴 때마다 다시 읽는다(그사이 고쳤을 수 있다)
      const table = readAfabTable(workbook, await loadAfabRules());
      if (!table.rows.length) throw new Error("no_rows");
      const [{ vehicles }, colors] = await Promise.all([loadVehicles(), loadColorMaster()]);
      state.plan = planAfab(table, vehicles, colors);
      state.table = table;
      state.file = file.name;
    } catch (err) {
      state.problem =
        err?.message === "no_rows" ? [mk("p", { class: "error" }, tx("머리글 아래에 내용이 없습니다."))] : problemOf(err);
    } finally {
      state.busy = "";
      redraw();
    }
  }

  // 다른 화면에 다녀온 뒤: 그사이 차량이 바뀌었을 수 있으므로(편집 · 상태 업데이트 · 새로 고침) 같은 파일을 지금의 차량과 다시 맞춘다.
  // 체크를 푼 행은 엑셀 행 번호로 기억하므로 그대로 남는다. 차량을 다시 읽지 못하면 앞서 판정한 내용을 그대로 둔다
  async function replan() {
    try {
      const [{ vehicles }, colors] = await Promise.all([loadVehicles(), loadColorMaster()]);
      if (!state.table || state.results || state.saving || state.busy) return;
      state.plan = planAfab(state.table, vehicles, colors);
      redraw();
    } catch (err) {
      console.error(err);
    }
  }

  function dropzone() {
    const input = mk("input", { type: "file", accept: ".xlsx", hidden: true });
    input.addEventListener("change", () => choose(input.files[0]));
    const zone = mk(
      "div",
      { class: "dropzone", role: "button", tabindex: "0" },
      mk("b", null, tx("AFAB 엑셀을 여기에 놓거나 클릭하여 선택")),
      mk("div", { class: "small" }, tx(".xlsx · 시트와 머리글은 AFAB 규칙 파일과 같아야 합니다 · 파일은 이 PC 에서만 읽고 어디에도 올리지 않습니다"))
    );
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") input.click();
    });
    zone.addEventListener("dragover", (event) => event.preventDefault());
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      choose(event.dataTransfer?.files?.[0]);
    });
    return [zone, input];
  }

  // ---- 미리보기 표: 차량 1대 = 1행(파일의 행 순서), 바뀌는 열마다 1칸(차량 그리드의 열 순서) ----

  // 표에 펼칠 열: 반영할 수 있는 행 중 하나라도 바뀌는 열만, 차량 그리드의 순서로
  function shownFields() {
    const used = new Set();
    for (const item of state.plan.items) {
      if (canApply(item)) for (const change of [...item.changes, ...item.derived]) used.add(change.field);
    }
    return COLUMNS.map((c) => c.key).filter((key) => used.has(key));
  }

  // 값 칸. 체크된 행의 바뀌는 칸만 강조해 새 값을 보여주고 기존 값을 아래에 작게 적는다. 그 밖에는 지금 값을 보여준다.
  // 값을 비우는 칸은 Color Name 뿐이다(색상 마스터에 없는 Color Code 가 올 때). 파일의 빈 칸은 값을 지우지 않는다
  function valueCell(item, field) {
    if (!item.vehicle || item.kind === "error") return mk("td", { class: "mono af-val" }, dim());
    const now = String(item.vehicle[field] ?? "");
    const change = [...item.changes, ...item.derived].find((c) => c.field === field);
    if (state.results || !isOn(item) || !change) return mk("td", { class: "mono af-val" }, now || dim());
    return mk(
      "td",
      { class: `mono af-val af-set${change.new ? "" : " clear"}` },
      change.new || tx("(빈 값)"),
      change.old ? mk("span", { class: "af-was" }, tx("기존 {v}", { v: change.old })) : null
    );
  }

  // Current Status 칸. 체크된 행의 상태가 바뀌면 새 상태를 강조하고 기존 상태를 아래에 적는다
  function statusCell(item) {
    const now = item.vehicle?.current_status;
    if (!now) return mk("td", null, dim());
    if (state.results || !isOn(item) || !item.status) return mk("td", null, pill(stageClass(now), now));
    return mk(
      "td",
      { class: "af-set" },
      pill(stageClass(item.status.new), item.status.new),
      mk("span", { class: "af-was" }, tx("기존 {v}", { v: item.status.old }))
    );
  }

  // 확인 열: 주의할 점 또는 반영하지 않는 까닭. 반영이 끝난 뒤에는 그 행의 결과
  function noteCell(item) {
    if (state.results) {
      const result = state.results.get(item);
      if (result) {
        const [kind, text] = RESULT_PILL[result] ?? ["danger", null];
        return text ? pill(kind, tx(text)) : [pill("danger", tx("실패")), " ", mk("span", { class: "muted small" }, result)];
      }
      if (canApply(item)) return pill("neutral", tx("반영 안 함"));
    }
    if (item.kind === "missing") return pill("danger", tx("미등록"));
    if (item.kind === "error") return [pill("danger", tx("오류")), " ", mk("span", { class: "muted small" }, tx(ERROR_TEXT[item.error]))];
    const notes = [
      ...item.oddDates.map((field) => tx("{f} 이 날짜가 아님", { f: labelOf(field) })),
      item.unknownColor ? tx("색상 마스터에 없는 Color Code") : null,
    ].filter(Boolean);
    return [
      item.kind === "review" ? [pill("warn", `⚠ ${tx("확인")}`), " "] : null,
      item.creates ? [pill("neutral", tx("AFAB 행 추가")), " "] : null,
      notes.length ? mk("span", { class: "small" }, notes.join(" · ")) : null,
    ];
  }

  function previewRow(item, fields, onChange) {
    const selectable = canApply(item) && !state.results;
    const box = selectable
      ? mk("input", { type: "checkbox", class: "rowsel", checked: isOn(item), disabled: state.saving })
      : null;
    const cls = !selectable ? null : !isOn(item) ? "af-off" : item.kind === "review" ? "af-review" : null;
    const tr = mk(
      "tr",
      { class: cls },
      mk("td", { class: "af-pick" }, box),
      mk("td", { class: "num" }, item.line),
      mk("td", { class: "mono" }, item.commission || dim()),
      statusCell(item),
      fields.map((field) => valueCell(item, field)),
      mk("td", null, noteCell(item))
    );
    box?.addEventListener("change", () => {
      if (box.checked) state.off.delete(item.line);
      else state.off.add(item.line);
      // 그 행만 다시 그린다(표의 스크롤 위치가 유지된다)
      tr.replaceWith(previewRow(item, fields, onChange));
      onChange();
    });
    return tr;
  }

  // @returns {{node: Node, sync: () => void}} sync 는 머리글 체크박스를 지금의 선택에 맞춘다
  function previewTable(onChange) {
    // 파일의 행 순서 그대로. 변경 없는 행은 표에 넣지 않는다
    const shown = state.plan.items.filter((item) => item.kind !== "same").sort((a, b) => a.line - b.line);
    const fields = shownFields();
    const appliable = state.plan.items.filter(canApply);
    const all = state.results || !appliable.length
      ? null
      : mk("input", { type: "checkbox", title: tx("전체 선택"), disabled: state.saving });
    const sync = () => {
      if (!all) return;
      const on = picked().length;
      all.checked = on === appliable.length;
      all.indeterminate = on > 0 && on < appliable.length;
    };
    all?.addEventListener("change", () => {
      if (all.checked) state.off.clear();
      else for (const item of appliable) state.off.add(item.line);
      draw();
    });
    sync();
    const node = shown.length
      ? mk(
          "div",
          { class: "tbl-wrap" },
          mk(
            "table",
            { class: "tbl compact af-tbl" },
            mk(
              "thead",
              null,
              mk(
                "tr",
                null,
                mk("th", { class: "af-pick" }, all),
                mk("th", { class: "num" }, tx("행")),
                mk("th", null, labelOf("commission_no")),
                mk("th", null, labelOf("current_status")),
                fields.map((field) =>
                  mk(
                    "th",
                    null,
                    labelOf(field),
                    AFAB_DERIVED_FIELDS.includes(field) ? mk("span", { class: "af-auto" }, tx("자동")) : null
                  )
                ),
                mk("th", null, tx(state.results ? "결과" : "확인"))
              )
            ),
            mk("tbody", null, shown.map((item) => previewRow(item, fields, onChange)))
          )
        )
      : mk("p", { class: "muted" }, tx("바뀌는 차량이 없습니다."));
    return { node, sync };
  }

  // 파일에 없는 차량: 아무것도 바꾸지 않고 보여주기만 한다
  function absentSection() {
    const { absent } = state.plan;
    if (!absent.length) return null;
    const counts = new Map();
    for (const v of absent) counts.set(v.current_status, (counts.get(v.current_status) ?? 0) + 1);
    const order = (status) => (STAGE_ORDER.includes(status) ? STAGE_ORDER.indexOf(status) : STAGE_ORDER.length);
    const statuses = [...counts.keys()].sort((a, b) => order(a) - order(b));
    const sorted = [...absent].sort(
      (a, b) => order(a.current_status) - order(b.current_status) || String(a.commission_no).localeCompare(String(b.commission_no))
    );
    return mk(
      "details",
      { class: "af-absent" },
      mk("summary", null, tx("파일에 없는 차량 {n}대 — 아무것도 바꾸지 않습니다", { n: num(absent.length) })),
      mk(
        "p",
        { class: "af-counts" },
        statuses.map((status) => [pill(stageClass(status), status || tx("(빈 값)")), ` ${num(counts.get(status))} `])
      ),
      mk(
        "div",
        { class: "tbl-wrap" },
        mk(
          "table",
          { class: "tbl compact" },
          mk("thead", null, mk("tr", null, mk("th", null, labelOf("commission_no")), mk("th", null, labelOf("current_status")))),
          mk(
            "tbody",
            null,
            sorted.map((v) =>
              mk(
                "tr",
                null,
                mk("td", { class: "mono" }, v.commission_no),
                mk("td", null, v.current_status ? pill(stageClass(v.current_status), v.current_status) : dim())
              )
            )
          )
        )
      )
    );
  }

  function confirmApply() {
    const picks = picked();
    if (!picks.length || state.saving) return;
    const count = (test) => num(picks.filter(test).length);
    openModal(
      tx("AFAB 반영"),
      [
        mk("p", null, tx("선택한 차량 {n}대에 AFAB 값을 반영합니다.", { n: num(picks.length) })),
        mk(
          "p",
          null,
          tx("AFAB 행 추가 {c}대 · 날짜가 아닌 값이 들어가는 차량 {d}대", {
            c: count((item) => item.creates),
            d: count((item) => item.oddDates.length),
          })
        ),
        mk(
          "p",
          null,
          tx("상태 변경 — Rejected {r}대 · Shipment scheduled {s}대", {
            r: count((item) => statusKind(item) === "rejected"),
            s: count((item) => statusKind(item) === "scheduled"),
          })
        ),
        columnCountsEl(tx("열별 변경 대수"), picks),
        mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${afabListNames().join(", ")}`),
      ],
      [
        mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")),
        mk(
          "button",
          {
            class: "btn primary",
            type: "button",
            onclick: () => {
              closeModal();
              apply(picks);
            },
          },
          tx("반영")
        ),
      ]
    );
  }

  async function apply(picks) {
    state.saving = true;
    draw();
    try {
      const out = await applyAfab(picks, (done, total) => {
        state.busy = `${tx("저장 중...")} ${num(done)}/${num(total)}`;
        redraw();
      });
      state.results = out.results;
      const troubled = [...out.results.values()].filter((r) => r !== "saved" && r !== "unchanged").length;
      toast(
        tx("AFAB 반영"),
        tx("차량 {n}대에 반영 · AFAB 행 추가 {c}대", { n: num(out.saved), c: num(out.created) }) +
          (troubled ? ` · ${tx("저장하지 못한 것")}: ${tx("{n}건", { n: num(troubled) })}` : "")
      );
      if (out.historyFailed) {
        toast(
          tx("변경 이력 기록 실패 {n}건", { n: num(out.historyFailed) }),
          `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${out.historyCodes.join(", ")})`
        );
      }
    } catch (err) {
      console.error(err);
      toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
    } finally {
      state.saving = false;
      state.busy = "";
      redraw();
    }
  }

  function preview() {
    const { items } = state.plan;
    const count = (test) => items.filter(test).length;
    const done = Boolean(state.results);
    const appliable = count(canApply);
    const applyButton = mk("button", { class: "btn primary", type: "button" });
    applyButton.addEventListener("click", confirmApply);
    const summary = mk("span", { class: "sub" });
    // 열별 변경 대수: 반영 전에는 체크한 행, 반영 뒤에는 저장된 행을 센다
    const columnBox = mk("div");
    let table;
    // 체크가 바뀔 때마다: 요약, 머리글 체크박스, 반영 버튼
    const sync = () => {
      const n = picked().length;
      summary.textContent = [
        done ? null : tx("선택 {n}건 / 반영할 수 있는 행 {a}건", { n: num(n), a: num(appliable) }),
        tx("변경 없음 {n}건", { n: num(count((item) => item.kind === "same")) }),
        tx("미등록 {n}건", { n: num(count((item) => item.kind === "missing")) }),
        tx("오류 {n}건", { n: num(count((item) => item.kind === "error")) }),
      ]
        .filter(Boolean)
        .join(" · ");
      applyButton.textContent = state.saving ? state.busy || tx("저장 중...") : tx("반영 ({n}건)", { n: num(n) });
      applyButton.disabled = !n || state.saving;
      columnBox.replaceChildren(
        done
          ? columnCountsEl(tx("열별 변경 대수 (반영된 행)"), items.filter((item) => state.results.get(item) === "saved"))
          : columnCountsEl(tx("열별 변경 대수 (선택한 행)"), picked())
      );
      table?.sync();
    };
    table = previewTable(sync);
    sync();

    const other = mk("button", { class: "btn", type: "button", disabled: state.saving }, tx("다른 파일"));
    other.addEventListener("click", () => {
      Object.assign(state, { file: "", table: null, plan: null, results: null, problem: null });
      state.off.clear();
      draw();
    });

    return [
      mk("div", { class: "section-h" }, tx(done ? "반영 결과 — {f}" : "미리보기 — {f}", { f: state.file }), summary),
      mk(
        "p",
        { class: "muted small" },
        tx("파일 {r}행 · AFAB 행 추가 {c}대 · 색상 마스터에 없는 Color Code {u}건 · 파일에 없는 차량 {a}대", {
          r: num(items.length),
          c: num(count((item) => canApply(item) && item.creates)),
          u: num(count((item) => item.unknownColor)),
          a: num(state.plan.absent.length),
        })
      ),
      !done && count((item) => item.kind === "review")
        ? mk(
            "div",
            { class: "callout warn" },
            tx("⚠ 표시가 있는 행은 날짜 열에 날짜가 아닌 값이 들어갑니다. 반영하지 않을 행은 체크를 푸세요.")
          )
        : null,
      columnBox,
      table.node,
      mk("div", { class: "btn-group cu-actions" }, other, done ? null : applyButton),
      absentSection(),
    ];
  }

  function draw() {
    if (state.plan) {
      body.replaceChildren(...preview().flat(Infinity).filter(Boolean));
      return;
    }
    body.replaceChildren(
      ...[state.busy ? mk("p", { class: "muted" }, state.busy) : dropzone(), state.problem].flat(Infinity).filter(Boolean)
    );
  }

  redraw = draw;
  draw();
  if (state.plan && !state.results && !state.saving) replan();
}
