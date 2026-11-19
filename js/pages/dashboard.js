// 대시보드 — 차량 주문·재고 흐름 카드, 입항 예정 선박, 당월 도착 예정, 월별 추이, 차종별 파이프라인, 연식별 재고.
// 모든 수치는 차량 목록에서 계산한다. 날짜 계산은 기준일(app/base-date.js)을 오늘로 삼는다.
import { mk, mkSvg } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { addMonths, diffDays, monthOf } from "../domain/dates.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import { stageClass } from "../data/columns.js";
import { STAGES, STAGE_COLOR, SERIES, LOCATIONS, PORTS } from "../data/stages.js";
import {
  countBy, countByMonth, modelYearKey, myCountText, expectedArrivalMonth, deriveVoyages,
  arrivalSchedule, vehicleTypes, vesselLink,
} from "../data/derive.js";
import {
  num, pct, monthEn, barChartEl, scrollChartTo, stackChartEl, hbarEl, miniStackEl, legendEl,
  locBandEl, locationTip, portsRowEl, vlinesEl, gridBoundaryLeft,
} from "../app/charts.js";

const stagePill = (stage) => mk("span", { class: `pill ${stageClass(stage)}` }, stage);
const card = (attrs, ...children) => mk("div", { class: "card", ...attrs }, children);
const cardHead = (title, desc, ...extra) =>
  mk("div", { class: "card-h" }, mk("h2", null, title), desc ? mk("span", { class: "desc" }, desc) : null, extra);

// ---- 카드 아이콘(선 그림). 색은 카드 색(--c)을 따른다 ----
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const CARD_ICONS = {
  // 주문서 + 연필
  changeable: ["M5 3h8l4 4v4", "M5 3v18h6", "M13 3v4h4", "M8 10h6M8 13h4", "M13 21l1-3 6.5-6.5 2 2L16 20z"],
  // 주문서 + 확인 표시
  fixed: ["M5 3h8l4 4v5", "M5 3v18h7", "M13 3v4h4", "M8 10h6M8 13h4", circle(17, 17, 4), "M15 17l1.5 1.5 3-3"],
  // 공장
  factory: ["M3 21V11l5 3v-3l5 3v-3l5 3v7H3z", "M16 11V5h3v10", "M7 17h2M11 17h2M15 17h2"],
  // 선박
  transit: ["M3 15l2 5h14l2-5z", "M6 15v-4h12v4", "M9 11V8h6v3", "M12 5v3", "M2 23c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"],
  // 창고 안 트럭
  stock: [
    "M2.5 21V12.5L12 7.5l9.5 5V21", "M2 21h20", "M5 13.5h7.5v5H5z", "M12.5 15h3l2 2.2v1.3h-5",
    circle(7.5, 19.6, 1.1), circle(15, 19.6, 1.1), circle(12, 4, 2.8), "M12 4V1.2", "M12 4l-2.42 1.4", "M12 4l2.42 1.4",
  ],
  // 리본 달린 트럭
  sold: [
    "M2.5 8.5h11v8.5h-11z", "M13.5 11h4.2l2.8 3.3V17h-7", circle(6.5, 18.3, 1.7), circle(17, 18.3, 1.7), "M8 8.5V17",
    "M8 8.5c-1.4-2.6-3.8-2.7-3.8-1.2 0 .9 1.6 1.2 3.8 1.2zM8 8.5c1.4-2.6 3.8-2.7 3.8-1.2 0 .9-1.6 1.2-3.8 1.2z",
  ],
};
function cardIcon(kind) {
  return mkSvg(
    "svg",
    {
      class: "ic", viewBox: "0 0 24 24", "aria-hidden": "true", fill: "none", stroke: "currentColor",
      "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round",
    },
    (CARD_ICONS[kind] ?? []).map((d) => mkSvg("path", { d }))
  );
}

const stageLink = (...stages) => `#/logistics?stage=${encodeURIComponent(stages.join(","))}`;

// ---- 차량 주문·재고 흐름: 카드 6종 + 장소 띠 + 항구 표시 ----
function flowCard(vehicles, baseMonth, schedule) {
  const byStage = countBy(vehicles, (v) => v.current_status);
  const of = (...stages) => vehicles.filter((v) => stages.includes(v.current_status));
  const year = baseMonth.slice(0, 4);
  const changeable = of(STATUS.ORDERED_CHANGEABLE);
  const fixed = of(STATUS.ORDERED_FIXED);
  const factory = of(STATUS.IN_PRODUCTION, STATUS.SHIPMENT_SCHEDULED);
  const transit = of(STATUS.IN_TRANSIT);
  const stock = of(STATUS.BONDED_STOCK, STATUS.OH_STOCK);
  const soldYtd = of(STATUS.SOLD).filter((v) => String(v.sales_month ?? "").startsWith(year));
  // 비율의 분모 = 전체(Cancelled 제외)
  const total = vehicles.length - (byStage[STATUS.CANCELLED] ?? 0);
  const salesByMonth = countByMonth(vehicles, "sales_month");
  const month = { m: Number(baseMonth.slice(5)), mon: monthEn(baseMonth) };

  const cards = [
    { label: tx("수정 가능 주문"), icon: "changeable", vs: changeable, color: STAGE_COLOR[STATUS.ORDERED_CHANGEABLE], href: stageLink(STATUS.ORDERED_CHANGEABLE), to: "Logistics 목록 (Ordered(Changeable))" },
    { label: tx("확정 주문"), icon: "fixed", vs: fixed, color: STAGE_COLOR[STATUS.ORDERED_FIXED], href: stageLink(STATUS.ORDERED_FIXED), to: "Logistics 목록 (Ordered(Fixed))" },
    {
      label: tx("확정 재고 (Factory Stock)"), icon: "factory", vs: factory, color: STAGE_COLOR[STATUS.IN_PRODUCTION],
      sub: `In Production ${num(byStage[STATUS.IN_PRODUCTION] ?? 0)} · Shipment scheduled ${num(byStage[STATUS.SHIPMENT_SCHEDULED] ?? 0)}`,
      href: stageLink(STATUS.IN_PRODUCTION, STATUS.SHIPMENT_SCHEDULED), to: "Logistics 목록 (In Production + Shipment scheduled)",
    },
    {
      label: tx("운송 중"), icon: "transit", vs: transit, color: STAGE_COLOR[STATUS.IN_TRANSIT],
      sub: tx("당월 입항 예정({m}월) {n}대", { ...month, n: num(schedule.total) }),
      href: stageLink(STATUS.IN_TRANSIT), to: "Logistics 목록 (In Transit)",
    },
    {
      label: tx("재고 (보세 + 통관)"), icon: "stock", vs: stock, color: STAGE_COLOR[STATUS.BONDED_STOCK],
      sub: `Bonded ${num(byStage[STATUS.BONDED_STOCK] ?? 0)} · OH ${num(byStage[STATUS.OH_STOCK] ?? 0)}`,
      href: "#/stock", to: "재고현황",
    },
    {
      label: tx("판매 ({y} YTD)", { y: year }), icon: "sold", vs: soldYtd, color: STAGE_COLOR[STATUS.SOLD],
      sub: tx("전월 {n}", { n: num(salesByMonth[addMonths(baseMonth, -1)] ?? 0) }),
      href: stageLink(STATUS.SOLD), to: "Logistics 목록 (Sold)",
    },
  ];

  // 카드 위 장소 띠: 공장 = 확정 주문·확정 재고, 센터 = 재고. 항구는 카드 사이 세로선(Antwerp, 평택)
  const ports = [
    { name: PORTS.antwerp, left: gridBoundaryLeft(3, 6, 8) },
    { name: PORTS.pyeongtaek, left: gridBoundaryLeft(4, 6, 8) },
  ];
  const band = (key, list, stages) =>
    locBandEl(LOCATIONS[key], list.length, locationTip(LOCATIONS[key], stages, list.length), true);
  const gap = () => mk("div", { class: "locb gap" });
  const factoryBand = band("factory", [...fixed, ...factory], tx("확정 주문 · 확정 재고"));
  factoryBand.style.gridColumn = "span 2";

  return card(
    null,
    cardHead(
      tx("차량 주문·재고 흐름"),
      tx("6개 지표 · 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 재고 → 판매 · 전체 {n} (Cancelled 제외)", { n: num(total) })
    ),
    mk(
      "div",
      { class: "flowwrap" },
      portsRowEl(ports),
      mk(
        "div",
        { class: "flow" },
        [gap(), factoryBand, gap(), band("center", stock, tx("재고 (보세 + 통관)")), gap()],
        cards.map((c, i) =>
          mk(
            "div",
            { class: "stage-box", style: `--c:${c.color}`, "data-href": c.href, title: `클릭 → ${c.to}` },
            cardIcon(c.icon),
            mk("div", { class: "n num" }, num(c.vs.length)),
            mk("div", { class: "l" }, c.label),
            c.sub ? mk("div", { class: "s" }, c.sub) : null,
            mk("div", { class: "s my" }, `${pct(c.vs.length, total)} · ${myCountText(c.vs)}`),
            miniStackEl(c.label, c.vs),
            i < cards.length - 1 ? mk("span", { class: "arrow" }, "›") : null
          )
        )
      ),
      vlinesEl(ports)
    ),
    mk("div", { class: "muted small", style: "margin-top:8px" }, tx("카드 클릭 시 관련 목록으로 이동합니다."))
  );
}

// ---- 월별 생산 / 입항 / 판매 추이: 올해 1월부터 24개월, 한 화면에 8개월 ----
function trendCard(vehicles, baseMonth) {
  const year = baseMonth.slice(0, 4);
  const months = Array.from({ length: 24 }, (_, i) => addMonths(`${year}-01`, i));
  const baseIdx = months.indexOf(baseMonth);
  const live = (v) => v.current_status !== STATUS.CANCELLED;
  const production = countByMonth(vehicles, "pm", live);
  const arrival = countBy(vehicles.filter(live), expectedArrivalMonth);
  const sales = countByMonth(vehicles, "sales_month");
  // 판매 계획 = 최근 6개월 평균(당월 포함). 1~5월에는 올해 지난 달만으로 평균을 낸다
  const recent = months.slice(Math.max(0, baseIdx - 5), baseIdx + 1).map((m) => sales[m] ?? 0);
  const average = Math.round(recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length));

  const chart = barChartEl({
    months, baseIdx, visible: 8, scrollTo: Math.max(0, baseIdx - 3), width: 800, height: 220, barW: 20, barGap: 3,
    series: [
      { name: "Production (PM final)", color: "var(--s4)", values: months.map((m) => production[m] ?? 0) },
      { name: tx("Arrival (ATA / 예정)"), color: "var(--s1)", values: months.map((m) => arrival[m] ?? 0) },
      { name: tx("Sales (판매 / 계획)"), color: "var(--s3)", values: months.map((m, i) => (i <= baseIdx ? sales[m] ?? 0 : average)) },
    ],
  });
  const label = (m) => `${monthEn(m)} ${m.slice(0, 4)}`;
  return card(
    null,
    cardHead(
      tx("월별 생산 / 입항 / 판매 추이"),
      tx("{a} ~ {b} (24개월) · 당월 포함 8개월 표시, 나머지는 가로 스크롤 · 기준월 {c} 강조, 이후 음영", {
        a: label(months[0]), b: label(months[23]), c: label(baseMonth),
      })
    ),
    chart,
    mk("div", { class: "muted small", style: "margin-top:6px" }, tx("Sales 계획 = 최근 6개월 평균(당월 포함) {n}대.", { n: average }))
  );
}

// ---- 입항 예정 선박: 입항 예정일은 Planned Arrival → ETA(선사) → ATA 순으로 바뀌고, ATA 뒤 2일까지 보여준다 ----
function shipsCard(vehicles, today) {
  const voyages = deriveVoyages(vehicles)
    .filter((y) => !y.eta_final || (diffDays(today, y.eta_final) ?? 0) <= 2)
    .sort((a, b) => ((a.eta_final || a.eta_carrier || a.pl || "9") < (b.eta_final || b.eta_carrier || b.pl || "9") ? -1 : 1));
  const arrivalCell = (y) => {
    const [date, tag] = y.eta_final ? [y.eta_final, "ATA"] : y.eta_carrier ? [y.eta_carrier, "ETA"] : [y.pl, "Pl."];
    const cls = tag === "ATA" ? "st-oh" : tag === "ETA" ? "st-transit" : "neutral";
    const tip = tag === "ATA" ? "실제 입항일" : tag === "ETA" ? "ETA (EUKOR, 평택)" : "Planned Arrival";
    return mk("td", { class: "mono" }, tag === "ATA" ? mk("b", null, date) : date || "—", " ", mk("span", { class: `pill ${cls}`, title: tip }, tag));
  };
  return card(
    null,
    cardHead(
      tx("입항 예정 선박"),
      tx("Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환 · ATA 후 2일까지 표시"),
      mk("span", { class: "spacer" }),
      mk("a", { href: "#/shipping" }, tx("선적·입항 →"))
    ),
    mk(
      "table",
      { class: "tbl clickable" },
      mk(
        "thead",
        null,
        mk("tr", null, ["Vessel", "단계", "Shipping", "입항 예정"].map((h) => mk("th", null, tx(h))), mk("th", { class: "num" }, tx("대수")))
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
                mk("td", null, stagePill(y.kind === "transit" ? STATUS.IN_TRANSIT : STATUS.SHIPMENT_SCHEDULED)),
                mk("td", { class: "mono" }, y.shipping || "—", y.kind === "scheduled" ? [" ", mk("span", { class: "muted small" }, tx("(예정)"))] : null),
                arrivalCell(y),
                mk("td", { class: "num" }, mk("b", null, y.count))
              )
            )
          : mk("tr", null, mk("td", { colspan: 5, class: "muted", style: "text-align:center" }, tx("입항 예정 선박이 없습니다.")))
      )
    )
  );
}

// ---- 당월 도착 예정: 구분 > 차종 > 모델 × 당월 입항 선박 ----
function arrivalCard(schedule, baseMonth) {
  const voyages = schedule.voyagesByMonth[baseMonth] ?? [];
  const cell = (n, isTotal) => mk("td", { class: isTotal ? "num tot" : "num" }, n ? num(n) : null);
  const cells = (by) => [
    ...voyages.map((y) => cell(by[y.vessel] ?? 0)),
    cell(voyages.reduce((sum, y) => sum + (by[y.vessel] ?? 0), 0), true),
  ];
  const sumBy = (rows) => {
    const by = {};
    for (const row of rows) for (const [key, n] of Object.entries(row.by)) by[key] = (by[key] ?? 0) + n;
    return by;
  };
  const rows = [];
  for (const group of schedule.groups) {
    rows.push(mk("tr", { class: "g1" }, mk("td", null, group.gen), cells(sumBy(group.vehicles.flatMap((t) => t.rows)))));
    for (const type of group.vehicles) {
      rows.push(mk("tr", { class: "g2" }, mk("td", null, type.vehicle), cells(sumBy(type.rows))));
      for (const row of type.rows) rows.push(mk("tr", null, mk("td", { class: "model" }, row.label), cells(row.by)));
    }
  }
  const month = { m: Number(baseMonth.slice(5)), mon: monthEn(baseMonth) };
  // fillcol: 표 영역의 높이를 옆 카드에 맞추고 넘치면 세로 스크롤
  return card(
    { class: "card fillcol" },
    cardHead(
      tx("당월 도착 예정 ({m}월)", month),
      tx("구분 > 차종 > 모델 × 당월 입항 선박 · 합계 {n}대 · 선박 {v}척", { n: num(schedule.total), v: voyages.length }),
      mk("span", { class: "spacer" }),
      mk("a", { href: "#/shipping" }, tx("월별 입항 예정 →"))
    ),
    mk(
      "div",
      { class: "fill" },
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
              mk("th", null, "Model"),
              voyages.map((y) => mk("th", { class: "num", title: `Shipping ${y.shipping || "—"}` }, y.vessel)),
              mk("th", { class: "num tot" }, "Total")
            ),
            mk("tr", { class: "total" }, mk("td", null, "Grand Total"), cells(schedule.grand))
          ),
          mk(
            "tbody",
            null,
            schedule.total
              ? rows
              : mk("tr", null, mk("td", { colspan: voyages.length + 2, class: "muted", style: "text-align:center" }, tx("당월 입항 예정 차량이 없습니다.")))
          )
        )
      )
    )
  );
}

// ---- 차종별 파이프라인: Ordered(Changeable) ~ OH Stock 7단계 ----
function pipelineCard(vehicles) {
  const stages = STAGES.slice(2, 9);
  const bars = vehicleTypes(vehicles)
    .map((type) => {
      const list = vehicles.filter((v) => v.vehicle === type && stages.includes(v.current_status));
      const counts = countBy(list, (v) => v.current_status);
      return { type, total: list.length, segs: stages.map((s) => ({ name: s, color: STAGE_COLOR[s], value: counts[s] ?? 0 })) };
    })
    .filter((bar) => bar.total > 0);
  const max = Math.max(1, ...bars.map((b) => b.total));
  const grand = bars.reduce((sum, b) => sum + b.total, 0);
  return card(
    null,
    cardHead(tx("차종별 파이프라인"), tx("7단계 (Sold·Cancelled 제외) · 합계 {n}", { n: num(grand) })),
    mk("div", { class: "hbars" }, bars.map((b) => hbarEl(b.type, b.segs, b.total, max, grand))),
    legendEl(stages.map((s) => ({ name: s, color: STAGE_COLOR[s] })))
  );
}

// ---- 연식별 재고: 세로 누적 막대(연식 최신순), 누적 = 차종 ----
function modelYearCard(vehicles) {
  const stock = vehicles.filter((v) => [STATUS.BONDED_STOCK, STATUS.OH_STOCK].includes(v.current_status));
  const years = [...new Set(stock.map(modelYearKey))].sort((a, b) => (Number(b.slice(2)) || 0) - (Number(a.slice(2)) || 0));
  const types = vehicleTypes(stock);
  const chart = stackChartEl({
    cats: years.map((y) => tx(y)),
    series: types.map((type, i) => ({
      name: type,
      color: SERIES[i % SERIES.length],
      values: years.map((y) => stock.filter((v) => modelYearKey(v) === y && v.vehicle === type).length),
    })),
  });
  return card(
    null,
    cardHead(tx("연식별 재고"), tx("Bonded + OH Stock {n}대 · 연식(MY) 최신순 · 누적 = Vehicle", { n: num(stock.length) })),
    mk("div", { style: "max-width:640px" }, chart)
  );
}

function build(root, vehicles) {
  const today = baseDate();
  const baseMonth = monthOf(today);
  const schedule = arrivalSchedule(vehicles, baseMonth, { onlyMonth: baseMonth });
  const trend = trendCard(vehicles, baseMonth);

  // 배치: 흐름 카드 → [입항 예정 선박 | 당월 도착 예정(2행 높이)] + 월별 추이 → [차종별 파이프라인 | 연식별 재고]
  root.replaceChildren(
    flowCard(vehicles, baseMonth, schedule),
    mk("div", { class: "grid2 dash-top" }, shipsCard(vehicles, today), arrivalCard(schedule, baseMonth), trend),
    mk("div", { class: "grid2" }, pipelineCard(vehicles), modelYearCard(vehicles))
  );
  scrollChartTo(trend); // 화면에 붙은 뒤에 당월 3개월 전이 왼쪽 끝에 오도록 옮긴다

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

export const dashboardPage = {
  render(root) {
    const box = mk("div");
    root.append(box);
    // 카드 → 관련 목록, 선박 행 → 그 선박의 차량
    box.addEventListener("click", (event) => {
      const linked = event.target.closest("[data-href]");
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
