// 선적 · 입항 — 운송 중·입항 예정 지표, 선박별 현황, 월별 입항 예정·실적 표(읽기 전용).
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { addMonths, monthOf } from "../domain/dates.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import { stageClass } from "../data/columns.js";
import { STAGES } from "../data/stages.js";
import { countBy, expectedArrivalMonth, deriveVoyages, arrivalSchedule, vesselLink } from "../data/derive.js";
import { num, monthEn } from "../app/charts.js";

// 화면 상태
//   range: 월별 표의 기간. "rest" = 이번 달~연말, "year" = 올해 전체
//   open : 올해 전체 보기에서 선박 열을 펼친 달
const view = { range: "rest", open: new Set() };

const dash = () => mk("span", { class: "muted" }, "—");
const monthLabel = (month) => `${month.slice(0, 4)}-${monthEn(month)}`; // "2026-10" → "2026-Oct"
const ON_VESSEL = [STATUS.IN_TRANSIT, STATUS.SHIPMENT_SCHEDULED];
const NOT_SHIPPED = [STATUS.ORDERED_CHANGEABLE, STATUS.ORDERED_FIXED, STATUS.IN_PRODUCTION];
const ARRIVED = [STATUS.BONDED_STOCK, STATUS.OH_STOCK, STATUS.SOLD];

// ---- 지표 3종 ----
function kpiCards(vehicles, baseMonth) {
  const moving = vehicles.filter((v) => ON_VESSEL.includes(v.current_status));
  const transit = moving.filter((v) => v.current_status === STATUS.IN_TRANSIT);
  const next = addMonths(baseMonth, 1);
  const arriving = (month) => moving.filter((v) => expectedArrivalMonth(v) === month).length;
  const kpi = (label, value, foot) =>
    mk(
      "div",
      { class: "card kpi" },
      mk("span", { class: "label" }, label),
      mk("span", { class: "value num" }, num(value)),
      mk("span", { class: "foot" }, foot)
    );
  return mk(
    "div",
    { class: "grid3" },
    kpi(
      tx("운송중 (In Transit)"),
      transit.length,
      tx("Shipped / Invoiced · {n}척 · 선적 예정 {m}대 별도", {
        n: new Set(transit.map((v) => v.vessel).filter(Boolean)).size,
        m: num(moving.length - transit.length),
      })
    ),
    kpi(tx("당월 입항 예정 ({m})", { m: baseMonth }), arriving(baseMonth), tx("ATA → ETA 선사 → Pl. arrival 순")),
    kpi(tx("익월 입항 예정 ({m})", { m: next }), arriving(next), tx("Shipment scheduled 포함"))
  );
}

// ---- 선박별 현황 ----

// 열 너비: 내용 폭으로 한 번 그려 열별 폭을 재고, 남는 폭을 모든 열에 똑같이 나눠 간격을 맞춘다.
function evenColumns(table) {
  if (!table?.isConnected) return;
  const heads = [...table.querySelectorAll("thead th")];
  table.style.tableLayout = "auto";
  table.style.width = "auto";
  for (const th of heads) th.style.width = "";
  const widths = heads.map((th) => th.getBoundingClientRect().width);
  const total = widths.reduce((a, b) => a + b, 0);
  if (!total) return; // 아직 화면에 없으면 기본 배치를 둔다
  const extra = Math.max(0, (table.parentElement.clientWidth - total) / heads.length);
  heads.forEach((th, i) => {
    th.style.width = `${widths[i] + extra}px`;
  });
  table.style.tableLayout = "fixed";
  table.style.width = "100%";
}

function vesselsCard(vehicles) {
  const voyages = deriveVoyages(vehicles).sort((a, b) =>
    (a.shipping || "9") !== (b.shipping || "9") ? ((a.shipping || "9") < (b.shipping || "9") ? -1 : 1) : a.vessel < b.vessel ? -1 : 1
  );
  // 단계 칸: 그 선박 차량의 Current Status. 여러 단계면 단계별 대수를 같이 적는다.
  const stageCell = (list) => {
    const counts = countBy(list, (v) => v.current_status);
    const stages = Object.keys(counts).sort((a, b) => STAGES.indexOf(a) - STAGES.indexOf(b));
    return mk(
      "td",
      null,
      stages.map((s) =>
        mk("span", { class: `pill ${stageClass(s)}`, style: "margin-right:4px" }, stages.length > 1 ? `${s} ${num(counts[s])}` : s)
      )
    );
  };
  const date = (value, empty) => mk("td", { class: "mono" }, value || empty);
  const table = mk(
    "table",
    { class: "tbl compact even clickable" },
    mk(
      "thead",
      null,
      mk(
        "tr",
        null,
        mk("th", null, tx("Vessel")),
        mk("th", null, tx("단계")),
        mk("th", { class: "num" }, tx("대수")),
        mk("th", null, tx("B/L No")),
        mk("th", null, tx("Shipping")),
        mk("th", null, tx("Planned Arrival")),
        mk("th", null, tx("ETA 선사 (EUKOR/MOL)")),
        mk("th", null, tx("ATA")),
        mk("th", null, tx("TSC 입고일 (TSC Arrival Date)"))
      )
    ),
    mk(
      "tbody",
      null,
      voyages.length
        ? voyages.map((y) =>
            mk(
              "tr",
              { "data-vessel": y.vessel },
              mk("td", null, mk("b", null, y.vessel)),
              stageCell(y.vehicles),
              mk("td", { class: "num" }, mk("b", null, y.count)),
              date(y.bl, mk("span", { class: "muted" }, tx("미확정"))),
              mk("td", { class: "mono" }, y.shipping || dash(), y.kind === "scheduled" ? mk("div", { class: "muted small" }, tx("예정")) : null),
              date(y.pl, dash()),
              date(y.eta_carrier, dash()),
              date(y.eta_final, mk("span", { class: "muted" }, tx("미입력"))),
              date(y.tsc, dash())
            )
          )
        : mk("tr", null, mk("td", { colspan: 9, class: "muted", style: "text-align:center" }, tx("운송 중이거나 선적 예정인 선박이 없습니다.")))
    )
  );
  const cardEl = mk(
    "div",
    { class: "card" },
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("선박별 현황")),
      mk("span", { class: "desc" }, tx("운송 중·선적 예정 차량을 선박별로 묶은 현황 · ATA = 실제 입항일"))
    ),
    mk("div", { class: "tbl-wrap" }, table),
    mk("div", { class: "muted small", style: "margin-top:6px" }, tx("행 클릭 → 해당 선박의 차량 Logistics 목록."))
  );
  return { cardEl, table };
}

// ---- 월별 입항 예정·실적: 행 = 구분 > 차종 > 모델, 열 = 입항 월 > 선박 ----
function monthlyCard(vehicles, baseMonth, rerender) {
  const year = baseMonth.slice(0, 4);
  const whole = view.range === "year";
  const range = { from: whole ? `${year}-01` : baseMonth, to: `${year}-12` };
  const schedule = arrivalSchedule(vehicles, baseMonth, { range, unassigned: true });
  const { months, voyagesByMonth } = schedule;

  const keyOf = (y) => y.key ?? y.vessel; // 항차 = 선박 이름, 입항 실적·미배정 = "YYYY-MM|이름"
  const current = (month) => (whole && month === baseMonth ? " cur" : ""); // 당월 열 강조는 올해 전체 보기에서만
  // 올해 전체 보기에서 당월이 아닌 달은 Total 만 보이고, 머리글을 누르면 선박 열이 펼쳐진다.
  const shown = (month) => (!whole || month === baseMonth || view.open.has(month) ? voyagesByMonth[month] : []);
  const togglable = (month) => whole && month !== baseMonth && voyagesByMonth[month].length > 0;

  // 수량 칸 → Logistics 열 필터 링크. Grand Total 행에만 건다.
  const linkFor = (voyages) => {
    if (voyages.length === 1 && voyages[0].unassigned) {
      return `#/logistics?vessel=&current_status=${encodeURIComponent(NOT_SHIPPED.join(","))}&eta_from_tdd=${voyages[0].key.slice(0, 7)}`;
    }
    const real = voyages.filter((y) => !y.unassigned);
    if (!real.length) return null;
    // 선박분과 미배정이 섞이면 열 필터로는 한 번에 나타낼 수 없어(필터는 열끼리 AND) 차량 목록으로 넘긴다
    if (real.length < voyages.length) {
      const list = voyages.flatMap((y) => schedule.commissions[keyOf(y)] ?? []);
      return list.length ? `#/logistics?comm=${list.map(encodeURIComponent).join(",")}` : null;
    }
    const arrived = Boolean(real[0].arrived);
    const query = {
      vessel: [...new Set(real.map((y) => y.vessel))].join(","),
      current_status: (arrived ? ARRIVED : ON_VESSEL).join(","),
    };
    if (arrived) query.ata = real[0].key.slice(0, 7);
    return `#/logistics?${Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
  };
  // 0 은 빈 칸으로 둔다
  const cell = (n, href, title) =>
    n
      ? mk("td", { class: `num${href ? " lnk" : ""}`, "data-href": href, title: href ? title ?? tx("클릭 → Logistics 목록") : null }, num(n))
      : mk("td", { class: "num" });
  const valueCells = (by, linked) => {
    const cells = [];
    const link = (voyages) => (linked ? linkFor(voyages) : null);
    let grand = 0;
    for (const month of months) {
      for (const y of shown(month)) cells.push(cell(by[keyOf(y)] ?? 0, link([y])));
      const total = voyagesByMonth[month].reduce((sum, y) => sum + (by[keyOf(y)] ?? 0), 0);
      grand += total;
      const totalCell = cell(total, link(voyagesByMonth[month]));
      totalCell.classList.add("tot");
      if (current(month)) totalCell.classList.add("cur");
      cells.push(totalCell);
    }
    cells.push(mk("td", { class: "num gt" }, num(grand)));
    return cells;
  };

  const rangeButton = (value, label) =>
    mk(
      "button",
      {
        class: `btn sm${view.range === value ? " primary" : ""}`,
        type: "button",
        onclick: () => {
          view.range = value;
          view.open.clear();
          rerender();
        },
      },
      label
    );
  const totalHead = (month) => {
    const open = shown(month).length > 0;
    const canToggle = togglable(month);
    return mk(
      "th",
      {
        class: `num tot${current(month)}${canToggle ? " tg" : ""}`,
        rowspan: 2,
        title: !voyagesByMonth[month].length
          ? tx("해당 월 입항 선박 없음")
          : canToggle
            ? open ? tx("클릭 → 선박 열 접기") : tx("클릭 → 선박 열 펼치기")
            : null,
        onclick: canToggle
          ? () => {
              if (view.open.has(month)) view.open.delete(month);
              else view.open.add(month);
              rerender({ keepScroll: true });
            }
          : null,
      },
      `${monthLabel(month)} Total${canToggle ? (open ? " ▾" : " ▸") : ""}`
    );
  };
  const vesselHead = (y, month) =>
    y.unassigned
      ? mk(
          "th",
          {
            class: `num unas${current(month)}`,
            title: tx("Vessel 미배정 · ETA From TDD 월 기준 (Ordered(Changeable) · Ordered(Fixed) · In Production) · Pl. Arrival·Shipping·Vessel 반영 시 선박 열로 이동"),
          },
          tx("미배정")
        )
      : mk("th", { class: `num${current(month)}`, title: y.arrived ? tx("입항 실적 (ATA 기준)") : `Shipping ${y.shipping || "—"}` }, y.vessel);

  const sumBy = (rows) => {
    const by = {};
    for (const row of rows) for (const [key, n] of Object.entries(row.by)) by[key] = (by[key] ?? 0) + n;
    return by;
  };
  const bodyRows = [];
  for (const group of schedule.groups) {
    bodyRows.push(mk("tr", { class: "g1" }, mk("td", null, group.gen), valueCells(sumBy(group.vehicles.flatMap((t) => t.rows)), false)));
    for (const type of group.vehicles) {
      bodyRows.push(mk("tr", { class: "g2" }, mk("td", null, type.vehicle), valueCells(sumBy(type.rows), false)));
      for (const row of type.rows) bodyRows.push(mk("tr", null, mk("td", { class: "model" }, row.label), valueCells(row.by, false)));
    }
  }

  return mk(
    "div",
    { class: "card" },
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("월별 입항 예정·실적 (Arrival Schedule)")),
      mk(
        "span",
        { class: "desc" },
        [
          tx("행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · 비표준 옵션) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)"),
          tx("당월 이전 달은 입항 실적(ATA 기준, Bonded·OH·Sold)"),
          tx("미배정 = Vessel 없이 ETA From TDD만 있는 오더 (ETA From TDD 월)"),
        ].join(" · ")
      ),
      mk("span", { class: "spacer" }),
      mk(
        "div",
        { class: "btn-group" },
        rangeButton("rest", tx("이번달~연말 ({a}~{b})", { a: monthLabel(baseMonth), b: monthLabel(range.to) })),
        rangeButton("year", tx("올해 전체 ({y})", { y: year }))
      )
    ),
    mk(
      "div",
      { class: "tbl-wrap" },
      mk(
        "table",
        { class: "tbl compact pivot fixcol" },
        mk(
          "thead",
          null,
          mk(
            "tr",
            null,
            mk("th", { rowspan: 2 }, "Model"),
            months.flatMap((month) =>
              shown(month).length
                ? [mk("th", { class: `ym${current(month)}`, colspan: shown(month).length }, monthLabel(month)), totalHead(month)]
                : [totalHead(month)]
            ),
            mk("th", { class: "num gt", rowspan: 2 }, "Grand Total")
          ),
          mk("tr", null, months.flatMap((month) => shown(month).map((y) => vesselHead(y, month)))),
          // 합계 행은 머리글 안에 두어 세로로 스크롤해도 고정된다. 링크는 이 행에만 있다.
          mk("tr", { class: "total" }, mk("td", null, "Grand Total"), valueCells(schedule.grand, true))
        ),
        mk("tbody", null, bodyRows)
      )
    ),
    mk(
      "div",
      { class: "muted small", style: "margin-top:6px" },
      [
        tx("선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. Grand Total 행의 수량 셀·월 Total 클릭 → 해당 선박 Logistics 목록(같은 건수). 모델 행과 Grand Total 열은 표시 전용."),
        tx("미배정 셀 클릭 → 해당 월 ETA From TDD · Vessel 빈 값 목록. 월 Total 은 미배정을 포함한 그 달 전체."),
        whole ? tx("올해 전체에서 당월 외 월은 Total만 표시 — 월 Total 머리글(▸) 클릭으로 선박 열 펼침.") : null,
      ]
        .filter(Boolean)
        .join(" ")
    )
  );
}

function build(root, vehicles) {
  const baseMonth = monthOf(baseDate());
  const rerender = (options = {}) => {
    // 표를 다시 그린 뒤 세로(창)·가로(표) 스크롤 위치를 되돌린다.
    const top = window.scrollY;
    const left = root.querySelector(".pivot")?.closest(".tbl-wrap")?.scrollLeft ?? 0;
    build(root, vehicles);
    if (options.keepScroll) {
      window.scrollTo(0, top);
      const wrap = root.querySelector(".pivot")?.closest(".tbl-wrap");
      if (wrap) wrap.scrollLeft = left;
    }
  };
  const vessels = vesselsCard(vehicles);
  root.replaceChildren(kpiCards(vehicles, baseMonth), vessels.cardEl, monthlyCard(vehicles, baseMonth, rerender));
  evenColumns(vessels.table); // 화면에 붙은 뒤에 잰다
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
  message(root, tx("차량 데이터를 불러오는 중..."));
  try {
    const data = await loadVehicles({ refresh });
    if (!root.isConnected) return; // 불러오는 동안 다른 화면으로 옮겨 갔다
    build(root, data.vehicles);
  } catch (err) {
    console.error(err);
    if (!root.isConnected) return;
    message(root, `${tx("차량 데이터를 불러오지 못했습니다.")} ${err.status ?? ""} ${err.message ?? ""}`, true, () => load(root, true));
  }
}

export const shippingPage = {
  render(root) {
    // 화면에 들어올 때마다 기간과 펼친 달을 처음 상태로 둔다.
    view.range = "rest";
    view.open.clear();
    const box = mk("div");
    root.append(box);
    // 선박 행 → 그 선박의 차량, 합계 행의 수량 칸 → 필터가 걸린 Logistics 목록
    box.addEventListener("click", (event) => {
      const linked = event.target.closest("td.lnk[data-href]");
      if (linked) {
        window.location.hash = linked.dataset.href;
        return;
      }
      const vessel = event.target.closest("tr[data-vessel]");
      if (vessel) window.location.hash = vesselLink(vessel.dataset.vessel);
    });
    load(box, false);
  },
};
