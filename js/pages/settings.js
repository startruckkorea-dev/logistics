// 마스터 · 설정 — 모델 마스터, 색상 마스터, 상태 규칙(읽기 전용).
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { loadVehicles } from "../data/vehicles.js";
import { loadModelMaster, loadColorMaster } from "../data/masters.js";
import { stageClass } from "../data/columns.js";
import { countBy } from "../data/derive.js";
import { num } from "../app/charts.js";

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
  { order: 8, source: "선적·입항", stage: "Bonded Stock", rule: "TSC Arrival Date 확정 시 (입력만 하면 예정 · ATA ~ TSC 확정 전은 In Transit 유지)" },
  { order: 9, source: "통관", stage: "OH Stock", rule: "통관 탭 입력 후 (Customs Clearance Date 입력)" },
  { order: 10, source: "Key-in", stage: "Sold", rule: "월말 입력 후" },
  { order: 11, source: "Key-in", stage: "Cancelled", rule: "STK 담당자가 취소할 경우" },
];

// 화면 상태. 탭을 오가도 검색어·필터·정렬을 유지한다.
const view = {
  tab: "model",
  model: { q: "", filters: { vehicle: "", model: "", my: "", cab_gen: "", active: "" }, sort: null, dir: 1 },
  color: { q: "", sort: null, dir: 1 },
};

const isEmpty = (v) => v == null || v === "";
const dash = () => mk("span", { class: "muted" }, "—");
const yesNo = (value) => mk("span", { class: `pill ${value ? "ok" : "neutral"}` }, value ? "Y" : "N");

// 머리글을 눌러 정렬하는 표. columns: [{key, label, sub?, num?, render?}]
// state: {sort, dir}. onSort 는 다시 그리는 함수
function sortableTable(columns, rows, state, onSort) {
  const th = (column) =>
    mk(
      "th",
      {
        class: column.num ? "num" : null,
        "data-sort": column.key,
        onclick: () => {
          if (state.sort === column.key) state.dir *= -1;
          else Object.assign(state, { sort: column.key, dir: 1 });
          onSort();
        },
      },
      column.label,
      column.sub ? mk("div", { class: "muted small", style: "font-weight:500" }, column.sub) : null,
      state.sort === column.key ? mk("span", { class: "sort" }, state.dir > 0 ? "▲" : "▼") : null
    );
  const sorted = [...rows];
  if (state.sort) {
    const key = state.sort;
    sorted.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x === y) return 0;
      if (isEmpty(x)) return 1; // 빈 값은 방향과 관계없이 뒤로
      if (isEmpty(y)) return -1;
      return (x > y ? 1 : -1) * state.dir;
    });
  }
  return mk(
    "div",
    { class: "tbl-wrap" },
    mk(
      "table",
      { class: "tbl" },
      mk("thead", null, mk("tr", null, columns.map(th))),
      mk(
        "tbody",
        null,
        sorted.length
          ? sorted.map((row) =>
              mk(
                "tr",
                null,
                columns.map((column) => {
                  const value = row[column.key];
                  const content = column.render ? column.render(value, row) : isEmpty(value) ? dash() : String(value);
                  return mk("td", { class: column.num ? "num" : null }, content);
                })
              )
            )
          : mk("tr", null, mk("td", { colspan: columns.length, class: "muted", style: "text-align:center" }, tx("조건에 맞는 항목이 없습니다.")))
      )
    )
  );
}

// ---- 모델 마스터 ----
function modelTab(body, models, vehicles) {
  const state = view.model;
  const usage = countBy(vehicles, (v) => v.moma_no);
  const rows = models.map((m) => ({ ...m, n: usage[m.moma_no] ?? 0 }));
  const distinct = (key) => [...new Set(rows.map((r) => r[key]).filter((x) => !isEmpty(x)))].sort();

  const columns = [
    { key: "moma_no", label: "moma_no" },
    { key: "my", label: "MY" },
    { key: "bm", label: "BM" },
    { key: "vehicle", label: "Vehicle" },
    { key: "model", label: "Model" },
    { key: "type", label: "Type" },
    { key: "axle", label: "Axle" },
    { key: "cab", label: "Cab" },
    { key: "cab_gen", label: "Cab Gen" },
    { key: "wheelbase", label: "Wheelbase", num: true },
    { key: "pto", label: "PTO" },
    { key: "emission", label: "Emission" },
    { key: "lead_days", label: tx("리드타임(일)"), sub: "PM ~ Shipping", num: true },
    { key: "lead", label: tx("리드타임(월)"), sub: "PM ~ ETA", num: true },
    { key: "spec", label: "Spec" },
    { key: "is_rep", label: tx("대표"), render: (value) => (value ? yesNo(true) : "") },
    { key: "n", label: tx("차량 수"), num: true, render: (value) => num(value) },
    { key: "active", label: "Active", render: (value) => yesNo(value) },
  ];

  const count = mk("span", { class: "muted small" });
  const tableBox = mk("div");
  const draw = () => {
    const term = state.q.trim().toLowerCase();
    const shown = rows.filter(
      (r) =>
        (!term || ["moma_no", "bm", "type", "model", "spec"].some((key) => String(r[key] ?? "").toLowerCase().includes(term))) &&
        (!state.filters.vehicle || r.vehicle === state.filters.vehicle) &&
        (!state.filters.model || r.model === state.filters.model) &&
        (!state.filters.my || String(r.my) === state.filters.my) &&
        (!state.filters.cab_gen || r.cab_gen === state.filters.cab_gen) &&
        (!state.filters.active || (state.filters.active === "Y") === Boolean(r.active))
    );
    count.textContent = tx("{n}건 / 전체 {m}", { n: num(shown.length), m: num(rows.length) });
    tableBox.replaceChildren(sortableTable(columns, shown, state, draw));
  };

  const search = mk("input", { class: "st-search", placeholder: tx("moma_no · BM · Type · Model · Spec 검색"), value: state.q });
  search.addEventListener("input", () => {
    state.q = search.value;
    draw();
  });
  const select = (key, options) => {
    const el = mk("select", null, mk("option", { value: "" }, tx("전체")), options.map((o) => mk("option", { value: o }, o)));
    el.value = state.filters[key];
    el.addEventListener("change", () => {
      state.filters[key] = el.value;
      draw();
    });
    return el;
  };
  const reset = mk("button", { class: "btn sm", type: "button" }, tx("초기화"));
  reset.addEventListener("click", () => {
    Object.assign(state, { q: "", sort: null, dir: 1 });
    for (const key of Object.keys(state.filters)) state.filters[key] = "";
    modelTab(body, models, vehicles);
  });

  body.replaceChildren(
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("모델 마스터 (Model_Master)")),
      mk(
        "div",
        { class: "filters" },
        mk("label", null, tx("검색"), " ", search),
        mk("label", null, "Vehicle ", select("vehicle", distinct("vehicle"))),
        mk("label", null, "Model ", select("model", distinct("model"))),
        mk("label", null, "MY ", select("my", distinct("my").map(String))),
        mk("label", null, "Cab Gen ", select("cab_gen", distinct("cab_gen"))),
        mk("label", null, "Active ", select("active", ["Y", "N"])),
        reset,
        count
      )
    ),
    tableBox,
    mk("div", { class: "muted small", style: "margin-top:6px" }, tx("차량 수 = 이 모델(moma_no)로 연결된 Logistics 차량 수. 머리글을 누르면 정렬됩니다."))
  );
  draw();
}

// ---- 색상 마스터 ----
function colorTab(body, colors, vehicles) {
  const state = view.color;
  const usage = countBy(vehicles, (v) => v.color_code);
  const rows = colors.map((c) => ({ ...c, n: usage[c.color_code] ?? 0 }));
  const columns = [
    { key: "no", label: "No", num: true },
    { key: "color_code", label: "Color Code" },
    { key: "color_name_mb", label: "Color Name (MB)" },
    { key: "color_name_molit", label: tx("Color Name (국토부)") },
    { key: "n", label: tx("차량 수"), num: true, render: (value) => num(value) },
  ];
  const count = mk("span", { class: "muted small" });
  const tableBox = mk("div");
  const draw = () => {
    const term = state.q.trim().toLowerCase();
    const shown = rows.filter(
      (r) => !term || ["color_code", "color_name_mb", "color_name_molit"].some((key) => String(r[key] ?? "").toLowerCase().includes(term))
    );
    count.textContent = tx("{n}건 / 전체 {m}", { n: num(shown.length), m: num(rows.length) });
    tableBox.replaceChildren(sortableTable(columns, shown, state, draw));
  };
  const search = mk("input", { class: "st-search", placeholder: tx("Color Code · Color Name 검색"), value: state.q });
  search.addEventListener("input", () => {
    state.q = search.value;
    draw();
  });
  // 마스터에 없는 색상 코드를 가진 차량 수
  const known = new Set(colors.map((c) => c.color_code));
  const unknown = vehicles.filter((v) => !isEmpty(v.color_code) && !known.has(v.color_code)).length;

  body.replaceChildren(
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("색상 마스터 (Color_Master)")),
      mk("div", { class: "filters" }, mk("label", null, tx("검색"), " ", search), count)
    ),
    tableBox,
    mk(
      "div",
      { class: "muted small", style: "margin-top:6px" },
      tx("차량 수 = 이 Color Code 를 가진 Logistics 차량 수."),
      unknown ? ` ${tx("색상 마스터에 없는 Color Code 를 가진 차량 {n}대.", { n: num(unknown) })}` : ""
    )
  );
  draw();
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
    if (view.tab === "color") colorTab(body, data.colors, data.vehicles);
    else if (view.tab === "rules") rulesTab(body, data.vehicles);
    else modelTab(body, data.models, data.vehicles);
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
