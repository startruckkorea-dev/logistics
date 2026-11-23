// Logistics · 통관 완료 처리 탭 — 통관 엑셀(Commission · 수리일 · 신고번호)을 올려 차량에 반영한다.
// 파일 선택 → 미리보기(왼쪽: 올린 값, 오른쪽: 반영 후의 차량 값) → 반영하지 않을 행은 체크를 품 → 확인 창 → 저장 → 결과 표시.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { readXlsxFile, downloadXlsx, XLSX_MAX_BYTES } from "../lib/xlsx.js";
import { tx } from "../app/i18n.js";
import { num } from "../app/charts.js";
import { baseDate } from "../app/base-date.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { COLUMNS, stageClass } from "../data/columns.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import {
  CUSTOMS_HEADERS, CUSTOMS_TEMPLATE_FILE, CUSTOMS_FIELDS,
  parseCustomsBook, planCustoms, turnsToOhStock, customsListNames, applyCustoms,
} from "../data/customs-store.js";

const labelOf = (field) => COLUMNS.find((c) => c.key === field)?.label ?? field;
const pill = (kind, text) => mk("span", { class: `pill ${kind}` }, text);
const dim = () => mk("span", { class: "muted" }, "·");

// 표에 보이는 순서: 사람이 봐야 하는 것부터
const KIND_ORDER = ["review", "error", "missing", "ok", "same"];
const ERROR_TEXT = {
  no_commission: "Commission 이 비어 있음",
  date: "수리일을 날짜로 읽을 수 없음",
  empty: "수리일과 신고번호가 모두 비어 있음",
  future: "수리일이 기준일보다 뒤",
  duplicate: "같은 차량이 여러 줄에 있음",
  too_long: "신고번호가 너무 김",
};
const FILE_ERROR_TEXT = {
  not_xlsx: ".xlsx 파일만 올릴 수 있습니다.",
  too_large: "파일이 너무 큽니다({n}MB 까지).",
  xlsx_library: "엑셀을 읽는 모듈을 불러오지 못했습니다. 다시 시도하세요.",
  unreadable: "파일을 읽을 수 없습니다. 엑셀에서 .xlsx 로 다시 저장해 올려 주세요.",
  no_header: "머리글(Commission · 수리일 · 신고번호)이 있는 시트를 찾지 못했습니다. 템플릿을 내려받아 맞춰 주세요.",
  no_rows: "머리글 아래에 내용이 없습니다.",
};
const RESULT_PILL = {
  saved: ["ok", "반영"],
  unchanged: ["neutral", "변경 없음"],
  conflict: ["danger", "충돌"],
  denied: ["danger", "권한 없음"],
  invalid: ["danger", "형식 오류"],
};

/** 통관 완료 처리 탭을 root 에 그린다. */
export function renderCustomsTab(root) {
  // file: 파일 이름, items: 판정한 행, off: 체크를 푼 행(반영하지 않는다),
  // results: 저장 결과(item → 결과). 있으면 반영이 끝난 상태다
  const state = { vehicles: null, busy: "", fileError: "", file: "", items: null, off: new Set(), results: null, saving: false };
  const body = mk("div");

  const template = mk("button", { class: "btn", type: "button" }, tx("템플릿 다운로드"));
  template.addEventListener("click", async () => {
    try {
      await downloadXlsx(CUSTOMS_TEMPLATE_FILE, "Template", [Object.values(CUSTOMS_HEADERS)]);
    } catch (err) {
      console.error(err);
      toast(tx("템플릿을 만들지 못했습니다."), tx(FILE_ERROR_TEXT.xlsx_library));
    }
  });

  root.replaceChildren(
    mk(
      "div",
      { class: "card" },
      mk(
        "div",
        { class: "card-h" },
        mk("h2", null, tx("통관 완료 처리")),
        mk("span", { class: "desc" }, tx("통관 엑셀 업로드 → Customs Clearance Date · Import License 반영 · 통관일이 들어가면 Bonded Stock → OH Stock")),
        mk("span", { class: "spacer" }),
        template
      ),
      body
    )
  );

  // 반영할 수 있는 행(차량이 있고 바뀌는 값이 있다)과, 그중 체크되어 있는 행
  const canApply = (item) => item.kind === "ok" || item.kind === "review";
  const isOn = (item) => canApply(item) && !state.off.has(item);
  const picked = () => state.items.filter(isOn);

  async function choose(file) {
    if (!file || state.busy) return;
    Object.assign(state, { busy: tx("파일을 읽는 중..."), fileError: "", file: "", items: null, results: null });
    state.off.clear();
    draw();
    try {
      const table = parseCustomsBook(await readXlsxFile(file));
      if (!table) throw new Error("no_header");
      if (!table.rows.length) throw new Error("no_rows");
      state.vehicles ??= (await loadVehicles()).vehicles;
      state.items = planCustoms(table.rows, state.vehicles, baseDate());
      state.file = file.name;
    } catch (err) {
      const known = FILE_ERROR_TEXT[err.message];
      if (!known) console.error(err);
      state.fileError = known
        ? tx(known, { n: XLSX_MAX_BYTES / 1024 / 1024 })
        : `${tx("차량 데이터를 불러오지 못했습니다.")} ${err.status ?? ""}`.trim();
    } finally {
      state.busy = "";
      if (root.isConnected) draw();
    }
  }

  function dropzone() {
    const input = mk("input", { type: "file", accept: ".xlsx", hidden: true });
    input.addEventListener("change", () => choose(input.files[0]));
    const zone = mk(
      "div",
      { class: "dropzone", role: "button", tabindex: "0" },
      mk("b", null, tx("통관 엑셀(Commission · 수리일 · 신고번호)을 여기에 놓거나 클릭하여 선택")),
      mk("div", { class: "small" }, tx(".xlsx · 머리글은 템플릿과 같아야 합니다 · 파일은 이 PC 에서만 읽고 어디에도 올리지 않습니다"))
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

  // ---- 미리보기 표: 왼쪽은 올린 값 그대로, 오른쪽은 그 행을 반영한 뒤의 차량 값 ----

  // 오른쪽 값 칸. 체크된 행의 바뀌는 칸만 강조하고, 덮어쓰는 칸은 기존 값을 옆에 작게 적는다
  function afterCell(item, { column, field }) {
    if (!item.vehicle || item.kind === "error") return mk("td", { class: "mono cu-apply" }, dim());
    const now = item.vehicle[field] ?? "";
    const fills = item.fill.includes(field);
    const overwrites = item.overwrite.includes(field);
    if (state.results || !isOn(item) || (!fills && !overwrites)) return mk("td", { class: "mono cu-apply" }, now || dim());
    return mk(
      "td",
      { class: `mono cu-apply cu-set${overwrites ? " over" : ""}` },
      item[column],
      overwrites ? mk("span", { class: "cu-was" }, ` (${tx("기존 {v}", { v: now })})`) : null
    );
  }

  function afterStatusCell(item) {
    if (!item.vehicle || item.kind === "error") return mk("td", { class: "cu-apply" }, dim());
    const now = item.vehicle.current_status;
    const stage = (name) => pill(stageClass(name), name);
    if (state.results || !isOn(item) || !turnsToOhStock(item)) return mk("td", { class: "cu-apply" }, stage(now));
    return mk(
      "td",
      { class: "cu-apply cu-set" },
      stage(STATUS.OH_STOCK),
      mk("span", { class: "cu-was" }, ` (${tx("기존 {v}", { v: now })})`)
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
    if (item.kind === "review") {
      const reasons = [
        item.offStatus ? tx("Bonded Stock 이 아님") : null,
        ...item.overwrite.map((field) => tx("{f} 덮어씀", { f: labelOf(field) })),
      ].filter(Boolean);
      return [pill("warn", `⚠ ${tx("확인")}`), " ", mk("span", { class: "small" }, reasons.join(" · "))];
    }
    if (item.kind === "same") return pill("neutral", tx("변경 없음"));
    if (item.kind === "missing") return pill("danger", tx("미등록"));
    if (item.kind === "error") return [pill("danger", tx("오류")), " ", mk("span", { class: "muted small" }, tx(ERROR_TEXT[item.error]))];
    return null;
  }

  function previewRow(item, onChange) {
    const selectable = canApply(item) && !state.results;
    const box = selectable
      ? mk("input", { type: "checkbox", class: "rowsel", checked: isOn(item), disabled: state.saving })
      : null;
    const cls = !selectable ? null : !isOn(item) ? "cu-off" : item.kind === "review" ? "cu-review" : null;
    const tr = mk(
      "tr",
      { class: cls },
      mk("td", { class: "cu-pick" }, box),
      mk("td", { class: "num" }, item.line),
      mk("td", { class: "mono" }, item.commission || dim()),
      CUSTOMS_FIELDS.map(({ column }) => mk("td", { class: "mono" }, item[column] || dim())),
      afterStatusCell(item),
      CUSTOMS_FIELDS.map((f) => afterCell(item, f)),
      mk("td", null, noteCell(item))
    );
    box?.addEventListener("change", () => {
      if (box.checked) state.off.delete(item);
      else state.off.add(item);
      // 그 행만 다시 그린다(표의 스크롤 위치가 유지된다)
      tr.replaceWith(previewRow(item, onChange));
      onChange();
    });
    return tr;
  }

  // @returns {{node: Node, sync: () => void}} sync 는 머리글 체크박스를 지금의 선택에 맞춘다
  function previewTable(onChange) {
    const sorted = [...state.items].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.line - b.line
    );
    const appliable = state.items.filter(canApply);
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
      else for (const item of appliable) state.off.add(item);
      draw();
    });
    sync();
    const node = mk(
      "div",
      { class: "tbl-wrap" },
      mk(
        "table",
        { class: "tbl compact cu-tbl" },
        mk(
          "thead",
          null,
          mk(
            "tr",
            null,
            mk("th", { class: "cu-pick", rowspan: "2" }, all),
            mk("th", { class: "cu-group", colspan: String(2 + CUSTOMS_FIELDS.length) }, tx("올린 파일")),
            mk("th", { class: "cu-group cu-apply", colspan: String(1 + CUSTOMS_FIELDS.length) }, tx(state.results ? "차량 마스터 (반영 후 현재 값)" : "차량 마스터 (반영 후)")),
            mk("th", { rowspan: "2" }, tx(state.results ? "결과" : "확인"))
          ),
          mk(
            "tr",
            { class: "cu-names" },
            mk("th", { class: "num" }, tx("행")),
            mk("th", null, CUSTOMS_HEADERS.commission),
            CUSTOMS_FIELDS.map(({ column }) => mk("th", null, CUSTOMS_HEADERS[column])),
            mk("th", { class: "cu-apply" }, labelOf("current_status")),
            CUSTOMS_FIELDS.map(({ field }) => mk("th", { class: "cu-apply" }, labelOf(field)))
          )
        ),
        mk("tbody", null, sorted.map((item) => previewRow(item, onChange)))
      )
    );
    return { node, sync };
  }

  function confirmApply() {
    const picks = picked();
    if (!picks.length || state.saving) return;
    const count = (test) => num(picks.filter(test).length);
    openModal(
      tx("통관 정보 반영"),
      [
        mk("p", null, tx("선택한 차량 {n}대에 통관 정보를 반영합니다.", { n: num(picks.length) })),
        mk(
          "p",
          null,
          tx("기존 값 덮어쓰기 {o}대 · Bonded Stock 이 아닌 차량 {s}대 · Bonded Stock → OH Stock {c}대", {
            o: count((item) => item.overwrite.length),
            s: count((item) => item.offStatus),
            c: count(turnsToOhStock),
          })
        ),
        mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${customsListNames().join(", ")}`),
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
      const out = await applyCustoms(picks, baseDate(), (done, total) => {
        state.busy = `${tx("저장 중...")} ${num(done)}/${num(total)}`;
        draw();
      });
      state.results = out.results;
      const troubled = [...out.results.values()].filter((r) => r !== "saved" && r !== "unchanged").length;
      toast(
        tx("통관 정보 반영"),
        tx("차량 {n}대에 반영 · Bonded Stock → OH Stock {c}대", { n: num(out.saved), c: num(out.cleared) }) +
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
      if (root.isConnected) draw();
    }
  }

  function preview() {
    const count = (kind) => state.items.filter((item) => item.kind === kind).length;
    const done = Boolean(state.results);
    const appliable = state.items.filter(canApply).length;
    const applyButton = mk("button", { class: "btn primary", type: "button" });
    applyButton.addEventListener("click", confirmApply);
    const summary = mk("span", { class: "sub" });
    let table;
    // 체크가 바뀔 때마다: 요약, 머리글 체크박스, 반영 버튼
    const sync = () => {
      const n = picked().length;
      summary.textContent = [
        done ? null : tx("선택 {n}건 / 반영할 수 있는 행 {a}건", { n: num(n), a: num(appliable) }),
        tx("변경 없음 {n}건", { n: num(count("same")) }),
        tx("미등록 {n}건", { n: num(count("missing")) }),
        tx("오류 {n}건", { n: num(count("error")) }),
      ]
        .filter(Boolean)
        .join(" · ");
      applyButton.textContent = state.saving ? state.busy || tx("저장 중...") : tx("반영 ({n}건)", { n: num(n) });
      applyButton.disabled = !n || state.saving;
      table?.sync();
    };
    table = previewTable(sync);
    sync();

    const other = mk("button", { class: "btn", type: "button", disabled: state.saving }, tx("다른 파일"));
    other.addEventListener("click", () => {
      Object.assign(state, { file: "", items: null, results: null, fileError: "" });
      state.off.clear();
      draw();
    });

    return [
      mk("div", { class: "section-h" }, tx(done ? "반영 결과 — {f}" : "미리보기 — {f}", { f: state.file }), summary),
      !done && count("review")
        ? mk(
            "div",
            { class: "callout warn" },
            tx("⚠ 표시가 있는 행은 Bonded Stock 이 아니거나 기존 값을 덮어씁니다. 반영하지 않을 행은 체크를 푸세요.")
          )
        : null,
      table.node,
      mk("div", { class: "btn-group cu-actions" }, other, done ? null : applyButton),
    ];
  }

  function draw() {
    if (state.items) {
      body.replaceChildren(...preview().flat(Infinity).filter(Boolean));
      return;
    }
    body.replaceChildren(
      ...[
        state.busy ? mk("p", { class: "muted" }, state.busy) : dropzone(),
        state.fileError ? mk("p", { class: "error" }, state.fileError) : null,
      ]
        .flat()
        .filter(Boolean)
    );
  }

  draw();
}
