// 차량 상세 드로어(읽기 전용) — 마일스톤 타임라인, 기본 정보, 그룹별 필드.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { openDrawer } from "../app/ui.js";
import { STATUS } from "../domain/status.js";
import { COLUMNS, GROUPS, sourceBadge, stageClass } from "../data/columns.js";

const isEmpty = (v) => v == null || v === "";
const dash = () => mk("span", { class: "muted" }, "—");

// 타임라인에서 현재 위치(완료한 칸 수). Current Status 로 정한다.
function doneCount(v) {
  switch (v.current_status) {
    case STATUS.SOLD: return 7;
    case STATUS.OH_STOCK: return 6;
    case STATUS.BONDED_STOCK: return 5;
    case STATUS.IN_TRANSIT: return 4;
    case STATUS.SHIPMENT_SCHEDULED: return 3;
    case STATUS.IN_PRODUCTION: return v.dispatch ? 3 : 2;
    default: return 0;
  }
}

function timeline(v) {
  const milestones = [
    ["PM", v.pm],
    ["TDD", v.tdd_calc],
    ["Dispatch", v.dispatch],
    ["Shipping", v.shipping],
    // 도착일은 확정된 값부터: ATA → ETA(선사) → Planned Arrival → ETA From TDD
    ["ETA·ATA", v.ata || v.eta_from_eukor_pirt || v.planned_arrival || v.eta_from_tdd],
    ["Customs", v.customs_clearance_date],
    ["Sales", v.sales_month],
  ];
  const done = doneCount(v);
  return mk(
    "div",
    { class: "timeline" },
    milestones.map(([label, date], i) =>
      mk(
        "div",
        { class: `ms ${i < done ? "done" : ""} ${i === done ? "cur" : ""}` },
        mk("div", { class: "dot" }),
        mk("div", { class: "l" }, label),
        mk("div", { class: "d" }, isEmpty(date) ? "—" : date)
      )
    )
  );
}

function card(title, ...children) {
  return mk("div", { class: "card" }, mk("div", { class: "card-h" }, mk("h2", null, title)), children);
}

// 기본 그룹은 "Vehicle : Tractor" 형식의 5줄로 보여준다.
function basicCard(v) {
  // 연식은 이 줄에서만 "MY26" 형식으로 보여준다. 데이터와 그리드는 "26" 그대로다.
  const modelYear = isEmpty(v.model_year) ? "" : `MY${v.model_year}`;
  const model = [modelYear, v.model, v.type, v.axle, v.cab, v.cab_gen, v.wheelbase, v.pto, v.emission]
    .filter((x) => !isEmpty(x))
    .join(" ");
  const lines = [
    ["Model", model],
    ["Vehicle", v.vehicle],
    ["BM", v.bm],
    ["VIN No", v.vin_no],
    ["Engine", v.engine_no],
  ];
  return card(
    tx("기본"),
    mk(
      "div",
      { class: "lines" },
      lines.map(([label, value]) =>
        mk(
          "div",
          { class: "line" },
          mk("span", { class: "k" }, label),
          mk("span", { class: "c" }, ":"),
          isEmpty(value) ? mk("span", { class: "v muted" }, "—") : mk("span", { class: "v" }, String(value))
        )
      )
    )
  );
}

// 그룹의 열. drawerAfter 가 있는 열은 지정한 열 바로 뒤로 옮긴다(그리드 순서는 그대로).
function groupColumns(group) {
  const columns = COLUMNS.filter((c) => c.group === group);
  for (const column of columns.filter((c) => c.drawerAfter)) {
    columns.splice(columns.indexOf(column), 1);
    const at = columns.findIndex((c) => c.key === column.drawerAfter);
    columns.splice(at < 0 ? columns.length : at + 1, 0, column);
  }
  return columns;
}

function field(column, v) {
  const value = v[column.key];
  const badge = sourceBadge(column.src);
  let content;
  if (column.key === "current_status") content = mk("span", { class: `pill ${stageClass(value)}` }, value);
  else content = isEmpty(value) ? dash() : mk("span", null, String(value));
  return mk(
    "div",
    { class: `f ${column.memo ? "wide" : ""}` },
    mk(
      "div",
      { class: "k" },
      tx(column.label),
      " ",
      mk("span", { class: `badge ${badge.cls}`, title: badge.tip }, tx(column.src)),
      column.src === "입력" ? null : mk("span", { class: "lock", title: badge.tip }, "🔒")
    ),
    // 긴 글은 줄바꿈을 살려 여러 줄로 보여준다
    mk("div", { class: column.memo ? "v long-text" : "v" }, content)
  );
}

/** 차량 1대의 상세를 드로어로 연다. */
export function openVehicle(v) {
  const head = mk(
    "div",
    null,
    mk("h2", null, v.commission_no, " ", mk("span", { class: `pill ${stageClass(v.current_status)}` }, v.current_status)),
    mk(
      "div",
      { class: "meta" },
      [v.model_classification, v.vehicle, `VIN ${isEmpty(v.vin_no) ? tx("미부여") : v.vin_no}`]
        .filter((x) => !isEmpty(x))
        .join(" · ")
    )
  );
  const groups = GROUPS.filter((group) => group !== "기본").map((group) =>
    card(tx(group), mk("div", { class: "fields" }, groupColumns(group).map((column) => field(column, v))))
  );
  openDrawer(head, [card(tx("마일스톤 타임라인"), timeline(v)), basicCard(v), ...groups]);
}
