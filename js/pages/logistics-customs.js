// Logistics · 통관 완료 처리 탭 — 통관 엑셀(Commission · 수리일 · 신고번호)을 올려 차량에 반영한다.
// 파일 선택 → 미리보기(행마다 판정) → 검토 필요 행은 사람이 반영 여부를 고름 → 확인 창 → 저장 → 결과 표시.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { readXlsxFile, downloadXlsx, XLSX_MAX_BYTES } from "../lib/xlsx.js";
import { tx } from "../app/i18n.js";
import { num } from "../app/charts.js";
import { baseDate } from "../app/base-date.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { COLUMNS, stageClass } from "../data/columns.js";
import { loadVehicles } from "../data/vehicles.js";
import {
  CUSTOMS_HEADERS, CUSTOMS_TEMPLATE_FILE, CUSTOMS_FIELDS,
  parseCustomsBook, planCustoms, reviewChoices, turnsToOhStock, customsListNames, applyCustoms,
} from "../data/customs-store.js";

const labelOf = (field) => COLUMNS.find((c) => c.key === field)?.label ?? field;
const pill = (kind, text) => mk("span", { class: `pill ${kind}` }, text);
const dim = () => mk("span", { class: "muted" }, "·");

// 표에 보이는 순서: 사람이 봐야 하는 것부터
const KIND_ORDER = ["review", "error", "missing", "ok", "same"];
const KIND_PILL = {
  ok: ["ok", "반영 대상"],
  review: ["warn", "검토 필요"],
  same: ["neutral", "변경 없음"],
  missing: ["danger", "미등록"],
  error: ["danger", "오류"],
};
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
const CHOICE_TEXT = { skip: "반영 안 함", fill: "빈 칸만 반영", all: "반영" };
const RESULT_PILL = {
  saved: ["ok", "반영"],
  unchanged: ["neutral", "변경 없음"],
  conflict: ["danger", "충돌"],
  denied: ["danger", "권한 없음"],
  invalid: ["danger", "형식 오류"],
};

/** 통관 완료 처리 탭을 root 에 그린다. */
export function renderCustomsTab(root) {
  // file: 파일 이름, items: 판정한 행, choices: 검토 행의 선택(item → skip|fill|all),
  // results: 저장 결과(item → 결과). 있으면 반영이 끝난 상태다
  const state = { vehicles: null, busy: "", fileError: "", file: "", items: null, choices: new Map(), results: null, saving: false };
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

  const picked = () =>
    state.items.flatMap((item) => {
      if (item.kind === "ok") return [{ item, choice: "all" }];
      const choice = item.kind === "review" ? state.choices.get(item) ?? "skip" : "skip";
      return choice === "skip" ? [] : [{ item, choice }];
    });

  async function choose(file) {
    if (!file || state.busy) return;
    Object.assign(state, { busy: tx("파일을 읽는 중..."), fileError: "", file: "", items: null, results: null });
    state.choices.clear();
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

  // 검토 행: 사유와 선택
  function reviewCell(item, onChange) {
    const reasons = [
      item.offStatus ? tx("Bonded Stock 이 아님") : null,
      ...item.overwrite.map((field) => tx("{f} 덮어씀", { f: labelOf(field) })),
    ].filter(Boolean);
    const choices = reviewChoices(item);
    const select = mk(
      "select",
      { class: "cu-choice", disabled: state.saving },
      choices.map((choice) =>
        mk(
          "option",
          { value: choice, selected: (state.choices.get(item) ?? "skip") === choice },
          tx(choice === "all" && item.overwrite.length ? "덮어쓰기" : CHOICE_TEXT[choice])
        )
      )
    );
    select.addEventListener("change", () => {
      state.choices.set(item, select.value);
      onChange();
    });
    return [select, " ", mk("span", { class: "muted small" }, reasons.join(" · "))];
  }

  function judgeCell(item) {
    const result = state.results?.get(item);
    if (result) {
      const [kind, text] = RESULT_PILL[result] ?? ["danger", null];
      return text ? pill(kind, tx(text)) : [pill("danger", tx("실패")), " ", mk("span", { class: "muted small" }, result)];
    }
    // 반영이 끝난 뒤: 고르지 않은 검토 행은 반영하지 않았다고 적는다
    if (state.results && item.kind === "review") return pill("neutral", tx(CHOICE_TEXT.skip));
    const [kind, text] = KIND_PILL[item.kind];
    return [
      pill(kind, tx(text)),
      item.error ? [" ", mk("span", { class: "muted small" }, tx(ERROR_TEXT[item.error]))] : null,
    ];
  }

  function previewTable(onChange) {
    const sorted = [...state.items].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.line - b.line
    );
    // 올린 값 옆에 차량의 현재 값을 나란히 둔다. 덮어쓰게 되는 현재 값은 강조한다
    const pair = (item, { column, field }) => {
      const now = item.vehicle?.[field] ?? "";
      return [
        mk("td", { class: "mono" }, item[column] || dim()),
        mk("td", { class: `mono cu-apply${item.kind === "review" && item.overwrite.includes(field) && !state.results ? " cu-over" : ""}` }, now || dim()),
      ];
    };
    return mk(
      "div",
      { class: "tbl-wrap" },
      mk(
        "table",
        { class: "tbl compact" },
        mk(
          "thead",
          null,
          mk(
            "tr",
            null,
            mk("th", { class: "num" }, tx("행")),
            mk("th", null, CUSTOMS_HEADERS.commission),
            mk("th", null, labelOf("current_status")),
            CUSTOMS_FIELDS.map(({ column, field }) => [
              mk("th", null, CUSTOMS_HEADERS[column], " ", pill("neutral", "Upload")),
              mk("th", { class: "cu-apply" }, labelOf(field), " ", pill("ok", tx("현재"))),
            ]),
            mk("th", null, tx(state.results ? "결과" : "판정")),
            mk("th", null, tx("검토"))
          )
        ),
        mk(
          "tbody",
          null,
          sorted.map((item) =>
            mk(
              "tr",
              { class: item.kind === "review" && !state.results ? "cu-review" : null },
              mk("td", { class: "num" }, item.line),
              mk("td", { class: "mono" }, item.vehicle?.commission_no ?? (item.commission || dim())),
              mk(
                "td",
                null,
                item.vehicle
                  ? pill(stageClass(item.vehicle.current_status), item.vehicle.current_status)
                  : dim()
              ),
              CUSTOMS_FIELDS.map((f) => pair(item, f)),
              mk("td", null, judgeCell(item)),
              mk("td", null, item.kind === "review" && !state.results ? reviewCell(item, onChange) : null)
            )
          )
        )
      )
    );
  }

  function confirmApply() {
    const picks = picked();
    if (!picks.length || state.saving) return;
    const reviewed = picks.filter((p) => p.item.kind === "review");
    const overwriting = reviewed.filter((p) => p.choice === "all" && p.item.overwrite.length);
    const cleared = picks.filter((p) => turnsToOhStock(p.item, p.choice));
    openModal(
      tx("통관 정보 반영"),
      [
        mk("p", null, tx("차량 {n}대에 통관 정보를 반영합니다.", { n: num(picks.length) })),
        mk(
          "p",
          null,
          tx("검토 후 반영 {r}대(덮어쓰기 {o}대) · Bonded Stock → OH Stock {c}대", {
            r: num(reviewed.length),
            o: num(overwriting.length),
            c: num(cleared.length),
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
    const applyButton = mk("button", { class: "btn primary", type: "button" });
    applyButton.addEventListener("click", confirmApply);
    const syncButton = () => {
      const n = picked().length;
      applyButton.textContent = state.saving ? state.busy || tx("저장 중...") : tx("반영 ({n}건)", { n: num(n) });
      applyButton.disabled = !n || state.saving;
    };
    syncButton();

    const other = mk("button", { class: "btn", type: "button", disabled: state.saving }, tx("다른 파일"));
    other.addEventListener("click", () => {
      Object.assign(state, { file: "", items: null, results: null, fileError: "" });
      state.choices.clear();
      draw();
    });

    // 검토 필요 행 전체의 선택을 한 번에 바꾼다
    const bulkButton = (choice, label) => {
      const button = mk("button", { class: "btn sm", type: "button", disabled: state.saving }, tx(label));
      button.addEventListener("click", () => {
        for (const item of state.items) if (item.kind === "review") state.choices.set(item, choice);
        draw();
      });
      return button;
    };

    const summary = [
      tx("반영 대상 {n}건", { n: num(count("ok")) }),
      tx("검토 필요 {n}건", { n: num(count("review")) }),
      tx("변경 없음 {n}건", { n: num(count("same")) }),
      tx("미등록 {n}건", { n: num(count("missing")) }),
      tx("오류 {n}건", { n: num(count("error")) }),
    ].join(" · ");

    return [
      mk(
        "div",
        { class: "section-h" },
        tx(done ? "반영 결과 — {f}" : "미리보기 — {f}", { f: state.file }),
        mk("span", { class: "sub" }, summary)
      ),
      !done && count("review")
        ? mk(
            "div",
            { class: "callout warn cu-bulk" },
            mk("span", null, tx("검토 필요 행은 Bonded Stock 이 아니거나 이미 값이 있는 차량입니다. 기본은 '반영 안 함'이며, 확인한 행만 골라 반영하세요.")),
            mk("span", { class: "spacer" }),
            bulkButton("all", "모두 반영 (덮어쓰기 포함)"),
            bulkButton("skip", "모두 반영 안 함")
          )
        : null,
      previewTable(syncButton),
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
