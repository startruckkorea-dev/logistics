// 선적 · 입항 — 운송 중·입항 예정 지표, 선박별 현황(편집은 shipping-vessels.js), 월별 입항 예정·실적 표.
import { cssZoom, mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { addMonths, monthOf } from "../domain/dates.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import { loadVoyageNotes, loadShippingNotice } from "../data/store.js";
import { expectedArrivalMonth, arrivalSchedule } from "../data/derive.js";
import { num, monthEn } from "../app/charts.js";
import { vesselsCard } from "./shipping-vessels.js";

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
  // 잰 값은 화면 배율이 걸린 뒤의 크기라, 스타일에 넣을 크기로 되돌린다
  const zoom = cssZoom(table);
  const widths = heads.map((th) => th.getBoundingClientRect().width / zoom);
  const total = widths.reduce((a, b) => a + b, 0);
  if (!total) return; // 아직 화면에 없으면 기본 배치를 둔다
  const extra = Math.max(0, (table.parentElement.clientWidth - total) / heads.length);
  heads.forEach((th, i) => {
    th.style.width = `${widths[i] + extra}px`;
  });
  table.style.tableLayout = "fixed";
  table.style.width = "100%";
}

// ---- 월별 입항 예정·실적: 행 = 구분 > 차종 > 모델, 열 = 입항 월 > 선박 ----
function monthlyCard(vehicles, baseMonth, rerender) {
  const year = baseMonth.slice(0, 4);
  const whole = view.range === "year";
  const range = { from: whole ? `${year}-01` : baseMonth, to: `${year}-12` };
  const schedule = arrivalSchedule(vehicles, baseMonth, { range, unassigned: true });
  const { months, voyagesByMonth } = schedule;

  const keyOf = (y) => y.key; // 선박 = 선박 이름 + Shipping 날짜, 입항 실적·미배정 = "YYYY-MM|…"
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
    const names = new Set(real.map((y) => y.vessel));
    const statuses = arrived ? ARRIVED : ON_VESSEL;
    const month = real[0].key.slice(0, 7);
    const list = real.flatMap((y) => schedule.commissions[keyOf(y)] ?? []);
    // 이름이 같은 다른 선박(Shipping 날짜가 다름)이 있으면 열 필터가 그 차량까지 잡는다. 그때는 차량 목록으로 넘긴다
    const byFilter = vehicles.filter(
      (v) => names.has(v.vessel) && statuses.includes(v.current_status) && (!arrived || (v.ata ?? "").slice(0, 7) === month)
    ).length;
    if (byFilter !== list.length) return list.length ? `#/logistics?comm=${list.map(encodeURIComponent).join(",")}` : null;
    const query = { vessel: [...names].join(","), current_status: statuses.join(",") };
    if (arrived) query.ata = month;
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
          tx("행: 구분 > 차종 > 모델(Model · Type · Axle · Cab · 비표준 옵션) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)"),
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

function build(root, vehicles, notes, notice) {
  const baseMonth = monthOf(baseDate());
  const rerender = (options = {}) => {
    // 표를 다시 그린 뒤 세로(창)·가로(표) 스크롤 위치를 되돌린다.
    const top = window.scrollY;
    const left = root.querySelector(".pivot")?.closest(".tbl-wrap")?.scrollLeft ?? 0;
    build(root, vehicles, notes, notice);
    if (options.keepScroll) {
      window.scrollTo(0, top);
      const wrap = root.querySelector(".pivot")?.closest(".tbl-wrap");
      if (wrap) wrap.scrollLeft = left;
    }
  };
  const vessels = vesselsCard(vehicles, notes, notice, { rerender: () => rerender({ keepScroll: true }) });
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
    // 선박 단위 값(총중량, TSC 예정일)은 읽지 못해도 화면은 보여준다
    const notes = await loadVoyageNotes({ refresh }).catch((err) => {
      console.error(err);
      return new Map();
    });
    // 공지를 읽지 못하면 그 칸만 안내하고 고치지 못하게 한다
    const notice = await loadShippingNotice({ refresh }).catch((err) => {
      console.error(err);
      return null;
    });
    if (!root.isConnected) return; // 불러오는 동안 다른 화면으로 옮겨 갔다
    build(root, data.vehicles, notes, notice);
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
      const row = event.target.closest("tr[data-href]");
      if (row) window.location.hash = row.dataset.href;
    });
    load(box, false);
  },
};
