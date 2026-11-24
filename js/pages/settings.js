// 마스터 · 설정 — 모델 마스터, 색상 마스터(편집은 settings-edit.js), 상태 규칙(읽기 전용).
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { loadVehicles } from "../data/vehicles.js";
import { loadModelMaster, loadColorMaster } from "../data/masters.js";
import { stageClass, VEHICLE_ORDER } from "../data/columns.js";
import { countBy } from "../data/derive.js";
import { num } from "../app/charts.js";
import { specOf } from "../data/master-store.js";
import { openValueFilter, closeValueFilter } from "../app/column-filter.js";
import { edit, editControl, editToolbar, shownValue } from "./settings-edit.js";

const TABS = [
  ["model", "모델 마스터"],
  ["color", "색상 마스터"],
  ["rules", "상태 규칙"],
];

// Current Status 판정 규칙. 판정 코드는 js/domain/status.js 에 있고, 여기는 화면에 보여주는 설명이다.
const STAGE_RULES = [
  { order: 1, source: "Key-in", stage: "Ordered(Dummy)", rule: "오더 생성 시" },
  { order: 2, source: "Key-in", stage: "Ordered(Changeable)", rule: "KUFRI 확정 후 오더 변경 시" },
  { order: 3, source: "AFAB", stage: "Ordered(Fixed)", rule: "Changeability Date 경과 시" },
  { order: 4, source: "AFAB", stage: "Rejected", rule: "WB열 값이 R인 경우" },
  { order: 5, source: "AFAB", stage: "In Production", rule: "생산월 도래 시" },
  { order: 6, source: "AFAB", stage: "Shipment scheduled", rule: "Vessel, Shipping Date 확정 시" },
  { order: 7, source: "AFAB", stage: "In Transit", rule: "Shipping Date 기준" },
  { order: 8, source: "선적·입항", stage: "Bonded Stock", rule: "TSC Arrival 확정 시 (입력만 하면 예정 · ATA ~ TSC 확정 전은 In Transit 유지)" },
  { order: 9, source: "통관", stage: "OH Stock", rule: "통관 탭 입력 후 (Customs Clearance Date 입력)" },
  { order: 10, source: "Key-in", stage: "Sold", rule: "월말 입력 후" },
  { order: 11, source: "Key-in", stage: "Cancelled", rule: "STK 담당자가 취소할 경우" },
];

// 화면 상태. 탭을 오가도 검색어·필터·정렬을 유지한다.
const view = {
  tab: "model",
  // filters: 열 필터 { 열 key: Set(고른 값) }. 없는 열은 전체.
  // sort 가 null 이면 기본 순서(모델은 MODEL_DEFAULT_SORT, 색상은 List 에 등록된 순서)
  model: { q: "", filters: {}, sort: null, dir: 1 },
  color: { q: "", filters: {}, sort: null, dir: 1 },
};

// 모델 마스터의 기본 순서: 앞의 열부터 차례로 비교한다. Vehicle 은 정해 둔 순서(VEHICLE_ORDER)를 쓴다
const MODEL_DEFAULT_SORT = [
  "vehicle", "model", "type", "axle", "cab", "my", "bm", "cab_gen", "pto", "wheelbase", "emission",
];
const BLANK = "(빈 값)"; // 열 필터에서 빈 칸을 가리키는 값

const isEmpty = (v) => v == null || v === "";

// 한 열의 두 값 비교(오름차순). 빈 값의 위치는 부르는 쪽이 정한다
function compareValues(key, x, y) {
  if (x === y) return 0;
  if (key === "vehicle") {
    const rank = (value) => {
      const i = VEHICLE_ORDER.indexOf(value);
      return i < 0 ? VEHICLE_ORDER.length : i;
    };
    if (rank(x) !== rank(y)) return rank(x) - rank(y);
  }
  if (typeof x === "number" && typeof y === "number") return x - y;
  if (typeof x === "boolean" || typeof y === "boolean") return Number(Boolean(x)) - Number(Boolean(y));
  const a = String(x);
  const b = String(y);
  return a === b ? 0 : a > b ? 1 : -1;
}
// 빈 값은 방향과 관계없이 뒤로
function compareRows(key, a, b, dir) {
  const x = a[key];
  const y = b[key];
  if (isEmpty(x) || isEmpty(y)) return isEmpty(x) === isEmpty(y) ? 0 : isEmpty(x) ? 1 : -1;
  return compareValues(key, x, y) * dir;
}
const dash = () => mk("span", { class: "muted" }, "—");
const yesNo = (value) => mk("span", { class: `pill ${value ? "ok" : "neutral"}` }, value ? "Y" : "N");

// 마스터 그리드 — 차량 그리드와 같은 모양: 머리글의 정렬 버튼 · 열 필터 버튼, 편집 모드에서는 누른 칸만 입력칸으로 바뀐다.
//   kind        : "model" | "color"
//   keyField    : 행을 가리키는 열(moma_no / color_code)
//   columns     : [{key, label, sub?, num?, render?, edit?, filter?}]. filter: false 인 열은 열 필터를 두지 않는다
//   rows        : 화면용 행. 편집은 원래 행(_row)에 대해 한다
//   state       : {q, filters, sort, dir}
//   searchKeys  : 검색어를 찾는 열
//   defaultSort : 기본 순서로 비교할 열(앞에서부터). 비우면 List 에 등록된 순서
//   toolbar     : editToolbar 의 결과(저장 대기 표시를 다시 그릴 때 쓴다)
// 돌려주는 것: { box: 표가 들어가는 상자, count: 건수 표시, draw: 다시 그리기 }
function masterGrid({ kind, keyField, columns, rows, state, searchKeys, defaultSort, toolbar }) {
  const columnOf = (key) => columns.find((c) => c.key === key);
  const isFlag = (key) => columnOf(key)?.edit === "check";
  // 열 필터가 비교하는 값. 체크 열은 Y / N, 빈 칸은 BLANK
  const filterValue = (row, key) => {
    const value = row[key];
    if (isFlag(key)) return value ? "Y" : "N";
    return isEmpty(value) ? BLANK : String(value);
  };

  const count = mk("span", { class: "muted small" });
  const box = mk("div", { class: "grid-wrap" });

  const isPending = (row, key) => key in (edit[kind].get(row[keyField]) ?? {});
  // 칸 하나. 편집 모드에서는 저장 대기 값을 보여주고, 체크 열은 바로 체크할 수 있게 둔다
  const fillCell = (td, column, row) => {
    const editable = edit.on && Boolean(column.edit);
    const isCheck = column.edit === "check";
    td.className = [
      column.num ? "num" : "",
      editable && !isCheck ? "keyin" : "",
      editable && isPending(row, column.key) ? "pend" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (editable && isCheck) {
      const check = editControl(kind, row._row, column, () => {
        toolbar.drawBar();
        td.classList.toggle("pend", isPending(row, column.key));
      });
      td.replaceChildren(check);
      return td;
    }
    const value = editable ? shownValue(kind, row._row, column.key) : row[column.key];
    const content = column.render ? column.render(value, row) : isEmpty(value) ? dash() : String(value);
    td.replaceChildren(...[content].filter((node) => node != null && node !== ""));
    return td;
  };
  // 누른 칸을 입력칸으로 바꾼다. 원래 내용은 보이지 않게 남겨 칸 크기를 잡아 둔다
  const startEdit = (td, column, row) => {
    if (td.classList.contains("editing") || edit.saving) return;
    const input = editControl(kind, row._row, column, toolbar.drawBar);
    input.classList.add("cell-in");
    const before = input.value;
    td.replaceChildren(mk("span", { class: "cell-hold" }, ...td.childNodes), mk("div", { class: "cell-edit" }, input));
    td.classList.add("editing");
    input.addEventListener("blur", () => fillCell(td, column, row));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.blur();
      else if (event.key === "Escape") {
        input.value = before;
        input.blur();
      }
    });
    input.focus();
    input.select();
  };

  const headerRow = () =>
    mk(
      "tr",
      { class: "fld" },
      columns.map((column) =>
        mk(
          "th",
          { "data-sort": column.key },
          mk(
            "div",
            { class: "th-in" },
            mk(
              "span",
              { class: "th-name" },
              mk("span", null, column.label),
              column.sub ? mk("span", { class: "muted small" }, column.sub) : null
            ),
            mk(
              "button",
              {
                class: `sortbtn ${state.sort === column.key ? "on" : ""}`,
                type: "button",
                title: tx("{c} 열 정렬", { c: column.label }),
              },
              state.sort === column.key ? (state.dir > 0 ? "▲" : "▼") : "⇅"
            ),
            column.filter === false
              ? null
              : mk(
                  "button",
                  {
                    class: `cf ${state.filters[column.key] ? "on" : ""}`,
                    type: "button",
                    "data-filter": column.key,
                    title: tx("{c} 열 필터", { c: column.label }),
                  },
                  "▼"
                )
          )
        )
      )
    );

  const draw = () => {
    const term = state.q.trim().toLowerCase();
    const filters = Object.entries(state.filters);
    const shown = rows.filter(
      (r) =>
        (!term || searchKeys.some((key) => String(r[key] ?? "").toLowerCase().includes(term))) &&
        filters.every(([key, chosen]) => chosen.has(filterValue(r, key)))
    );
    // 기본 순서로 놓은 뒤, 고른 열이 있으면 그 열로 다시 정렬한다(같은 값끼리는 기본 순서가 남는다)
    if (defaultSort.length) {
      shown.sort((a, b) => {
        for (const key of defaultSort) {
          const diff = compareRows(key, a, b, 1);
          if (diff) return diff;
        }
        return 0;
      });
    }
    if (state.sort) shown.sort((a, b) => compareRows(state.sort, a, b, state.dir));

    count.textContent =
      tx("{n}건 / 전체 {m}", { n: num(shown.length), m: num(rows.length) }) +
      (filters.length ? tx(" · 열 필터: {cols}", { cols: filters.map(([key]) => columnOf(key)?.label ?? key).join(" · ") }) : "");
    box.replaceChildren(
      mk(
        "table",
        { class: "grid mst" },
        mk("thead", null, headerRow()),
        mk(
          "tbody",
          null,
          shown.length
            ? shown.map((row) =>
                mk(
                  "tr",
                  { "data-key": row[keyField] },
                  columns.map((column) => fillCell(mk("td", { "data-col": column.key }), column, row))
                )
              )
            : mk("tr", null, mk("td", { colspan: columns.length, class: "muted empty-msg" }, tx("조건에 맞는 항목이 없습니다.")))
        )
      )
    );
  };

  // 열 필터 창: 그 열에 있는 값을 정렬 순서대로 나열한다. 빈 값은 맨 앞
  const openFilter = (button, key) => {
    const column = columnOf(key);
    const found = new Map(); // 필터 값 → { 원래 값, 건수 }
    for (const row of rows) {
      const value = filterValue(row, key);
      const entry = found.get(value) ?? { raw: row[key], count: 0 };
      entry.count++;
      found.set(value, entry);
    }
    const values = [...found.entries()]
      .sort(([a, x], [b, y]) => {
        if (a === BLANK || b === BLANK) return a === b ? 0 : a === BLANK ? -1 : 1;
        if (isFlag(key)) return a === b ? 0 : a === "Y" ? -1 : 1;
        return compareValues(key, x.raw, y.raw);
      })
      .map(([value, entry]) => ({ value, text: value === BLANK ? tx(BLANK) : value, count: entry.count }));
    openValueFilter(button, {
      title: tx("{c} 열 필터", { c: column.label }),
      values,
      chosen: state.filters[key] ?? null,
      onApply: (chosen) => {
        if (chosen) state.filters[key] = chosen;
        else delete state.filters[key];
        draw();
      },
    });
  };

  box.addEventListener("click", (event) => {
    const filterButton = event.target.closest("button.cf");
    if (filterButton) {
      openFilter(filterButton, filterButton.dataset.filter);
      return;
    }
    const sortKey = event.target.closest("button.sortbtn")?.closest("th[data-sort]")?.dataset.sort;
    if (sortKey) {
      if (state.sort === sortKey) state.dir *= -1;
      else Object.assign(state, { sort: sortKey, dir: 1 });
      draw();
      return;
    }
    // 편집 모드: 입력할 수 있는 칸을 누르면 그 칸만 입력칸으로 바뀐다
    const td = edit.on && event.target.closest("td.keyin");
    if (!td) return;
    const row = rows.find((r) => String(r[keyField]) === td.closest("tr").dataset.key);
    const column = columnOf(td.dataset.col);
    if (row && column) startEdit(td, column, row);
  });

  return { box, count, draw };
}

// 검색창과 초기화 버튼(검색어 · 열 필터 · 정렬을 푼다)
function searchAndReset(state, placeholder, draw) {
  const search = mk("input", { class: "st-search", placeholder, value: state.q });
  search.addEventListener("input", () => {
    state.q = search.value;
    draw();
  });
  const reset = mk("button", { class: "btn sm", type: "button" }, tx("초기화"));
  reset.addEventListener("click", () => {
    closeValueFilter();
    Object.assign(state, { q: "", filters: {}, sort: null, dir: 1 });
    search.value = "";
    draw();
  });
  return { search, reset };
}

// ---- 모델 마스터 ----
function modelTab(body, data, rebuild) {
  const { models, vehicles } = data;
  const state = view.model;
  // 모델을 추가한 뒤에는 새 행이 가려지지 않게 검색과 필터를 푼다
  const redraw = (options) => {
    if (options?.added) Object.assign(state, { q: "", filters: {} });
    rebuild();
  };
  const usage = countBy(vehicles, (v) => v.moma_no);
  const rows = models.map((m) => ({ ...m, n: usage[m.moma_no] ?? 0, _row: m }));

  const columns = [
    { key: "moma_no", label: "moma_no", filter: false }, // 값이 행마다 다르다
    { key: "my", label: "MY", edit: "text" },
    { key: "bm", label: "BM", edit: "text" },
    { key: "gen", label: "Gen", edit: "text" },
    { key: "vehicle", label: "Vehicle", edit: "text" },
    { key: "model", label: "Model", edit: "text" },
    { key: "type", label: "Type", edit: "text" },
    { key: "axle", label: "Axle", edit: "text" },
    { key: "cab", label: "Cab", edit: "text" },
    { key: "cab_gen", label: "Cab Gen", edit: "text" },
    { key: "pto", label: "PTO", edit: "text" },
    { key: "wheelbase", label: "Wheelbase", num: true, edit: "number" },
    { key: "emission", label: "Emission", edit: "text" },
    { key: "lead_days", label: tx("리드타임(일)"), sub: "PM ~ Shipping", num: true, edit: "number" },
    { key: "lead", label: tx("리드타임(월)"), sub: "PM ~ ETA", num: true, edit: "number" },
    // Spec 은 속성에서 만드는 값이라 표에는 두지 않는다(검색에는 쓴다)
    { key: "is_rep", label: tx("대표"), render: (value) => (value ? yesNo(true) : ""), edit: "check" },
    { key: "n", label: tx("차량 수"), num: true, render: (value) => num(value) },
    { key: "active", label: "Active", render: (value) => yesNo(value), edit: "check" },
  ];
  const toolbar = editToolbar(data, "model", redraw);
  // 속성 조합과 Spec 이 다른 모델 수(Spec 은 속성에서 만드는 값이라 같아야 한다)
  const specMismatch = models.filter((m) => String(m.spec ?? "") !== specOf(m)).length;

  const grid = masterGrid({
    kind: "model",
    keyField: "moma_no",
    columns,
    rows,
    state,
    searchKeys: ["moma_no", "bm", "type", "model", "spec"],
    defaultSort: MODEL_DEFAULT_SORT,
    toolbar,
  });
  const { search, reset } = searchAndReset(state, tx("moma_no · BM · Type · Model · Spec 검색"), grid.draw);

  body.replaceChildren(
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("모델 마스터 (Model_Master)")),
      mk("div", { class: "filters" }, mk("label", null, tx("검색"), " ", search), reset, grid.count),
      toolbar.nodes
    ),
    grid.box,
    mk("div", { class: "muted small", style: "margin-top:6px" }, tx("차량 수 = 이 모델(moma_no)로 연결된 Logistics 차량 수. 머리글의 ⇅ 는 정렬, ▼ 는 열 필터입니다.")),
    mk(
      "div",
      { class: "muted small", style: "margin-top:4px" },
      tx("편집: 칸을 눌러 고칩니다. 고친 칸은 '편집 종료'에서 저장하고 그 모델의 차량에도 반영합니다. Spec 은 속성 9개를 이어 자동으로 만듭니다. 리드타임(일)을 고치면 선적 전 차량의 Shipping Calc 를 다시 계산합니다."),
      specMismatch ? ` ${tx("Spec 이 속성 조합과 다른 모델 {n}건.", { n: num(specMismatch) })}` : ""
    )
  );
  grid.draw();
}

// ---- 색상 마스터 ----
function colorTab(body, data, redraw) {
  const { colors, vehicles } = data;
  const state = view.color;
  const usage = countBy(vehicles, (v) => v.color_code);
  const rows = colors.map((c) => ({ ...c, n: usage[c.color_code] ?? 0, _row: c }));
  const columns = [
    { key: "no", label: "No", num: true, filter: false }, // 값이 행마다 다르다
    { key: "color_code", label: "Color Code", filter: false },
    { key: "color_name_mb", label: "Color Name (MB)", edit: "text" },
    { key: "color_name_molit", label: tx("Color Name (국토부)"), edit: "text" },
    { key: "n", label: tx("차량 수"), num: true, render: (value) => num(value) },
  ];
  const toolbar = editToolbar(data, "color", redraw);
  const grid = masterGrid({
    kind: "color",
    keyField: "color_code",
    columns,
    rows,
    state,
    searchKeys: ["color_code", "color_name_mb", "color_name_molit"],
    defaultSort: [], // List 에 등록된 순서
    toolbar,
  });
  const { search, reset } = searchAndReset(state, tx("Color Code · Color Name 검색"), grid.draw);
  // 마스터에 없는 색상 코드를 가진 차량 수
  const known = new Set(colors.map((c) => c.color_code));
  const unknown = vehicles.filter((v) => !isEmpty(v.color_code) && !known.has(v.color_code)).length;

  body.replaceChildren(
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("색상 마스터 (Color_Master)")),
      mk("div", { class: "filters" }, mk("label", null, tx("검색"), " ", search), reset, grid.count),
      toolbar.nodes
    ),
    grid.box,
    mk(
      "div",
      { class: "muted small", style: "margin-top:6px" },
      tx("차량 수 = 이 Color Code 를 가진 Logistics 차량 수."),
      ` ${tx("머리글의 ⇅ 는 정렬, ▼ 는 열 필터입니다.")}`,
      ` ${tx("편집: 칸을 눌러 고칩니다.")}`,
      ` ${tx("Color Name (MB) 을 고치면 그 Color Code 차량의 Color Name 에도 반영합니다.")}`,
      unknown ? ` ${tx("색상 마스터에 없는 Color Code 를 가진 차량 {n}대.", { n: num(unknown) })}` : ""
    )
  );
  grid.draw();
}

// ---- 상태 규칙 ----
function rulesTab(body, vehicles) {
  const counts = countBy(vehicles, (v) => v.current_status);
  body.replaceChildren(
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("Current Status 판정 규칙")),
      mk("span", { class: "desc" }, tx("상태별 Source · 판정 기준 · 1대 = 1단계"))
    ),
    mk(
      "table",
      { class: "tbl clickable" },
      mk(
        "thead",
        null,
        mk("tr", null, mk("th", { class: "num" }, "No."), mk("th", null, "Source"), mk("th", null, "Current Status"), mk("th", null, tx("판정 규칙")), mk("th", { class: "num" }, tx("현재 건수")))
      ),
      mk(
        "tbody",
        null,
        STAGE_RULES.map((r) =>
          mk(
            "tr",
            { "data-stage": r.stage, title: tx("클릭 → Logistics 목록") },
            mk("td", { class: "num" }, r.order),
            mk("td", null, tx(r.source)),
            mk("td", null, mk("span", { class: `pill ${stageClass(r.stage)}` }, r.stage)),
            mk("td", null, r.rule),
            mk("td", { class: "num" }, num(counts[r.stage] ?? 0))
          )
        )
      )
    ),
    mk("div", { class: "muted small", style: "margin-top:8px" }, tx("합계 {n}대. 행을 누르면 그 상태의 Logistics 목록으로 이동합니다.", { n: num(vehicles.length) }))
  );
}

function build(root, data) {
  const body = mk("div", { class: "body" });
  const draw = () => {
    for (const button of side.children) button.classList.toggle("active", button.dataset.tab === view.tab);
    closeValueFilter();
    if (view.tab === "color") colorTab(body, data, draw);
    else if (view.tab === "rules") rulesTab(body, data.vehicles);
    else modelTab(body, data, draw);
  };
  const side = mk(
    "div",
    { class: "side" },
    TABS.map(([tab, label]) =>
      mk(
        "button",
        {
          type: "button",
          "data-tab": tab,
          onclick: () => {
            view.tab = tab;
            draw();
          },
        },
        tx(label)
      )
    )
  );
  root.replaceChildren(mk("div", { class: "card" }, mk("div", { class: "vtabs" }, side, body)));
  draw();
}

function message(root, text, isError, retry) {
  root.replaceChildren(
    mk(
      "div",
      { class: "card notice-card" },
      mk("p", { class: isError ? "error" : null }, text),
      retry ? mk("button", { class: "btn", type: "button", onclick: retry }, tx("다시 시도")) : null
    )
  );
}

async function load(root, refresh) {
  message(root, tx("마스터 데이터를 불러오는 중..."));
  try {
    const [vehicleData, models, colors] = await Promise.all([
      loadVehicles({ refresh }),
      loadModelMaster({ refresh }),
      loadColorMaster({ refresh }),
    ]);
    if (!root.isConnected) return; // 불러오는 동안 다른 화면으로 옮겨 갔다
    build(root, { vehicles: vehicleData.vehicles, models, colors });
  } catch (err) {
    console.error(err);
    if (!root.isConnected) return;
    message(root, `${tx("마스터 데이터를 불러오지 못했습니다.")} ${err.status ?? ""} ${err.message ?? ""}`, true, () => load(root, true));
  }
}

export const settingsPage = {
  render(root, params) {
    const tab = params.get("tab");
    if (TABS.some(([id]) => id === tab)) view.tab = tab;
    const box = mk("div");
    root.append(box);
    // 상태 규칙의 행 → 그 상태의 Logistics 목록
    box.addEventListener("click", (event) => {
      const row = event.target.closest("tr[data-stage]");
      if (row) window.location.hash = `#/logistics?stage=${encodeURIComponent(row.dataset.stage)}`;
    });
    load(box, false);
  },
};
