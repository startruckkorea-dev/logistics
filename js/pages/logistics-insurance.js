// Logistics · 보험 조회 탭 — Commission No 여러 개로 차량을 조회해 표로 보고 엑셀로 내려받는다. 읽기 전용이다.
import { mk } from "../lib/dom.js";
import { downloadXlsx } from "../lib/xlsx.js";
import { tx } from "../app/i18n.js";
import { num } from "../app/charts.js";
import { baseDate } from "../app/base-date.js";
import { toast } from "../app/ui.js";
import { COLUMNS, stageClass } from "../data/columns.js";
import { loadVehicles, commissionFinder } from "../data/vehicles.js";
import { openVehicle } from "./vehicle-drawer.js";

// 표와 엑셀에 나오는 열(이 순서대로)
const KEYS = [
  "commission_no", "current_status", "type", "axle", "cab", "pm", "vin_no", "bl_no", "vessel",
  "dispatch", "shipping", "ata", "tsc_arrival_date",
];
// 엑셀에 날짜 칸으로 넣는 열
const DATE_KEYS = ["dispatch", "shipping", "ata", "tsc_arrival_date"];
// 고정폭 글꼴로 보이는 열
const MONO_KEYS = new Set(["commission_no", "vin_no", "bl_no", "pm", ...DATE_KEYS]);

const labelOf = (key) => COLUMNS.find((c) => c.key === key)?.label ?? key;

// 입력칸의 글자 → Commission No 목록(줄바꿈·쉼표·세미콜론·공백 구분, 중복은 처음 것만, 입력 순서 유지)
function parseCommissions(text) {
  const seen = new Set();
  return String(text ?? "")
    .split(/[\s,;]+/)
    .filter((part) => part && !seen.has(part) && seen.add(part));
}

// 탭을 떠났다 돌아와도 입력한 번호가 남아 있게 둔다
let lastText = "";

/** 보험 조회 탭을 root 에 그린다. */
export function renderInsuranceTab(root) {
  let found = [];
  let vehicles = null;
  const info = mk("div", { class: "muted small" });
  const result = mk("div");

  const exportButton = mk("button", { class: "btn", type: "button", disabled: true }, "Excel Export");
  exportButton.addEventListener("click", async () => {
    try {
      await downloadXlsx(
        `Insurance_${baseDate()}.xlsx`,
        "Insurance",
        [KEYS.map(labelOf), ...found.map((v) => KEYS.map((key) => String(v[key] ?? "")))],
        { dateColumns: DATE_KEYS.map((key) => KEYS.indexOf(key)) }
      );
    } catch (err) {
      console.error(err);
      toast(tx("엑셀 파일을 만들지 못했습니다."));
    }
  });

  const input = mk("textarea", { class: "cu-ta", rows: "3", placeholder: tx("Commission No 여러 개 (줄바꿈·쉼표 구분)") });
  input.value = lastText;
  input.addEventListener("input", () => {
    lastText = input.value;
  });

  function cell(key, v) {
    const value = v[key];
    if (key === "current_status") return mk("td", null, mk("span", { class: `pill ${stageClass(value)}` }, value));
    if (value == null || value === "") return mk("td", null, mk("span", { class: "muted" }, "·"));
    return mk("td", { class: MONO_KEYS.has(key) ? "mono" : null }, String(value));
  }

  function drawResult() {
    exportButton.disabled = !found.length;
    if (!found.length) {
      result.replaceChildren();
      return;
    }
    const table = mk(
      "table",
      { class: "tbl compact clickable" },
      mk("thead", null, mk("tr", null, KEYS.map((key) => mk("th", null, labelOf(key))))),
      mk(
        "tbody",
        null,
        found.map((v) => mk("tr", { "data-comm": v.commission_no }, KEYS.map((key) => cell(key, v))))
      )
    );
    // 행 클릭: 차량 상세. 저장하면 표를 다시 그린다
    table.addEventListener("click", (event) => {
      const comm = event.target.closest("tbody tr[data-comm]")?.dataset.comm;
      const vehicle = comm && found.find((v) => v.commission_no === comm);
      if (vehicle) openVehicle(vehicle, { onSaved: drawResult });
    });
    result.replaceChildren(mk("div", { class: "tbl-wrap" }, table));
  }

  async function search() {
    const commissions = parseCommissions(input.value);
    if (!commissions.length) {
      found = [];
      info.textContent = tx("Commission No를 입력하세요.");
      drawResult();
      return;
    }
    try {
      if (!vehicles) {
        info.textContent = tx("차량 데이터를 불러오는 중...");
        vehicles = (await loadVehicles()).vehicles;
      }
    } catch (err) {
      console.error(err);
      info.replaceChildren(mk("span", { class: "error" }, `${tx("차량 데이터를 불러오지 못했습니다.")} ${err.status ?? ""}`.trim()));
      return;
    }
    if (!root.isConnected) return;
    const find = commissionFinder(vehicles);
    const missing = [];
    const seen = new Set();
    found = [];
    for (const commission of commissions) {
      const vehicle = find(commission);
      if (!vehicle) missing.push(commission);
      else if (!seen.has(vehicle) && seen.add(vehicle)) found.push(vehicle);
    }
    info.replaceChildren(
      tx("조회 {n}건", { n: num(found.length) }),
      ...(missing.length
        ? [" · ", mk("span", { class: "error" }, tx("미등록 {n}건: {list}", { n: num(missing.length), list: missing.join(", ") }))]
        : [])
    );
    drawResult();
  }

  const searchButton = mk("button", { class: "btn primary", type: "button" }, tx("조회"));
  searchButton.addEventListener("click", search);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) search();
  });

  root.replaceChildren(
    mk(
      "div",
      { class: "card" },
      mk(
        "div",
        { class: "card-h" },
        mk("h2", null, tx("보험 조회")),
        mk("span", { class: "desc" }, tx("Commission No 로 차량을 조회해 Excel(xlsx)로 내보내기")),
        mk("span", { class: "spacer" }),
        exportButton
      ),
      mk("div", { class: "cu-row" }, input, searchButton),
      info,
      result
    )
  );
  if (lastText.trim()) search();
}
