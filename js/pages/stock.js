// 재고현황 — TSC 재고(센터 재고), 현재·미래 재고(Ordered(Fixed) ~ OH Stock), 월말 마감.
// 앞의 두 탭은 지금의 차량 목록에서 계산한다. 월말 마감 탭은 마감할 때 저장해 둔 파일을 읽어 그린다
// (마감은 Logistics 차량 마스터에서 한다. 마감한 뒤 차량 값이 바뀌어도 마감 숫자는 변하지 않는다).
import { mk, mkSvg } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import { listClosings, loadClosing, downloadClosing } from "../data/closing-store.js";
import { toast } from "../app/ui.js";
import { stageClass } from "../data/columns.js";
import { STAGES, STAGE_COLOR, MY_KEYS, MY_OTHER, MY_COLORS, LOCATIONS, PORTS } from "../data/stages.js";
import {
  countBy, modelYearKey, mySegments, modelOptionTag, vehicleTypes, currentStock, modelGroups,
} from "../data/derive.js";
import {
  num, pct, hbarEl, miniStackEl, picIconEl, locBandEl, locationTip, portsRowEl, vlinesEl,
  svgLocBand, svgPorts, rgbaOf,
} from "../app/charts.js";

// 화면 상태
//   scope: "stock" = 센터 재고, "pipe" = 현재 및 미래 재고현황, "closing" = 월말 마감
//   month: 월말 마감 탭에서 보는 달 "YYYY-MM". 비어 있거나 마감하지 않은 달이면 가장 최근에 마감한 달
const view = { month: "", scope: "stock" };

const SCOPES = [["stock", "TSC 재고"], ["pipe", "현재 및 미래 재고현황"], ["closing", "월말 마감"]];
const PIPE_STAGES = STAGES.slice(3, 9); // Ordered(Fixed) ~ OH Stock
const CLOSING_STAGES = [STATUS.BONDED_STOCK, STATUS.OH_STOCK]; // 월말 마감이 다루는 상태
// 현재 및 미래 재고현황의 5구역. Factory Stock = In Production + Shipment scheduled
const ZONES = [
  { name: "Ordered(Fixed)", stages: [STATUS.ORDERED_FIXED], color: STAGE_COLOR[STATUS.ORDERED_FIXED] },
  { name: "Factory Stock", stages: [STATUS.IN_PRODUCTION, STATUS.SHIPMENT_SCHEDULED], color: STAGE_COLOR[STATUS.IN_PRODUCTION] },
  { name: "In Transit", stages: [STATUS.IN_TRANSIT], color: STAGE_COLOR[STATUS.IN_TRANSIT] },
  { name: "Bonded Stock", stages: [STATUS.BONDED_STOCK], color: STAGE_COLOR[STATUS.BONDED_STOCK] },
  { name: "OH Stock", stages: [STATUS.OH_STOCK], color: STAGE_COLOR[STATUS.OH_STOCK] },
];
// 장소 띠가 덮는 구역: [장소, 첫 구역, 끝 구역]
const LOCATION_ZONES = [["factory", 0, 1], ["sea", 2, 2], ["center", 3, 4]];
// 항구 세로선은 before 구역의 왼쪽 경계에 둔다
const PORT_LINES = [{ key: "antwerp", before: 2 }, { key: "pyeongtaek", before: 3 }];

const locationOf = (status) =>
  status === STATUS.IN_TRANSIT ? "sea" : [STATUS.BONDED_STOCK, STATUS.OH_STOCK].includes(status) ? "center" : "factory";
const inZone = (vehicles, zone) => vehicles.filter((v) => zone.stages.includes(v.current_status));
const units = (v) => tx("{v}대", { v });
const swatch = (color, size) =>
  mk("span", { class: "sw", style: `display:inline-block;width:${size}px;height:${size}px;border-radius:2px;background:${color};vertical-align:middle;margin-right:4px` });
const cardHead = (title, desc) => mk("div", { class: "card-h" }, mk("h2", null, title), desc ? mk("span", { class: "desc" }, desc) : null);
const sectionHead = (title, sub, first) =>
  mk("div", { class: "section-h", style: first ? "margin-top:0" : null }, title, mk("span", { class: "sub" }, sub));

// ---- 여정 지도: 항로선 위 5구역 원(면적 = 대수) + 장소 띠 + 항구 표시 ----
function journeyCard(list, containerWidth) {
  const total = list.length;
  const count = (zone) => inZone(list, zone).length;
  // 카드의 실제 폭으로 1:1 로 그려 글자 크기를 다른 차트와 맞춘다
  const W = Math.max(900, containerWidth - 32);
  const H = 258;
  const routeY = 180;
  const groupW = W / ZONES.length;
  const center = (i) => groupW * i + groupW / 2;
  const left = (i) => groupW * i;

  const svg = mkSvg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", style: `max-width:${W}px` });
  for (const [key, from, to] of LOCATION_ZONES) {
    const zones = ZONES.slice(from, to + 1);
    const n = zones.reduce((sum, zone) => sum + count(zone), 0);
    svgLocBand(svg, LOCATIONS[key], n, left(from) + 6, left(to) + groupW - 6, 32, 50, locationTip(LOCATIONS[key], zones.map((z) => z.name).join(" · "), n));
  }
  // 항로선: 공장~Antwerp 실선, 바다 구간 파선, 평택 이후 실선과 화살표
  svg.append(
    mkSvg("path", { class: "route", d: `M40 ${routeY}H${left(2)}` }),
    mkSvg("path", { class: "route sea", d: `M${left(2)} ${routeY}H${left(3)}` }),
    mkSvg("path", { class: "route", d: `M${left(3)} ${routeY}H${W - 40}` }),
    mkSvg("path", { class: "route", d: `M${W - 48} ${routeY - 6}l8 6-8 6` })
  );
  svgPorts(svg, PORT_LINES.map((p) => ({ name: PORTS[p.key], x: left(p.before) })), 14, routeY + 40);

  const max = Math.max(1, ...ZONES.map(count));
  ZONES.forEach((zone, i) => {
    const vehicles = inZone(list, zone);
    const n = vehicles.length;
    const r = Math.max(9, Math.sqrt(n / max) * 44);
    const x = center(i);
    const tip = [
      zone.name,
      zone.stages.length > 1 ? zone.stages.map((s) => `${s} ${num(vehicles.filter((v) => v.current_status === s).length)}`).join(" · ") : null,
      units(num(n)),
      pct(n, total),
    ]
      .filter(Boolean)
      .join(" · ");
    svg.append(
      mkSvg("circle", { cx: x, cy: routeY, r, fill: zone.color, stroke: "#fff", "stroke-width": 2, "data-tip": tip }),
      r >= 15
        ? mkSvg("text", { class: "w", x, y: routeY + 4, "text-anchor": "middle", style: "font-size:12.5px;pointer-events:none" }, num(n))
        : mkSvg("text", { class: "t", x, y: routeY - r - 6, "text-anchor": "middle" }, num(n)),
      mkSvg("text", { class: "sl", x, y: routeY + 66, "text-anchor": "middle" }, zone.name)
    );
  });
  return mk(
    "div",
    { class: "card cfs1" },
    cardHead(tx("여정 지도"), tx("Ordered(Fixed) ~ OH Stock {n}대 · 원 면적 = 대수 · Factory Stock = In Production + Shipment scheduled", { n: num(total) })),
    svg
  );
}

// 구분 > 차종 > 모델 순서의 행 목록
function groupedRows(list) {
  const rows = [];
  for (const group of modelGroups(list)) {
    rows.push({ cls: "g1", label: group.gen, vs: group.vehicles.flatMap((t) => t.rows.flatMap((r) => r.vs)) });
    for (const type of group.vehicles) {
      rows.push({ cls: "g2", label: type.vehicle, vs: type.rows.flatMap((r) => r.vs) });
      for (const row of type.rows) rows.push({ cls: "m", label: row.label, vs: row.vs });
    }
  }
  return rows;
}

// ---- 모델별 구역 현황: 행 = 구분 > 차종 > 모델, 열 = 5구역, 칸 = 연식 누적 막대 + 대수 ----
function matrixCard(list) {
  const rows = groupedRows(list);
  const maxOf = (classes) =>
    Math.max(1, ...rows.filter((r) => classes.includes(r.cls)).flatMap((r) => ZONES.map((zone) => inZone(r.vs, zone).length)));
  // 막대 길이의 기준은 모델 행끼리, 그룹 행끼리 따로 둔다
  const maxModel = maxOf(["m"]);
  const maxGroup = maxOf(["g1", "g2"]);
  // 항구 세로선 위치: 첫 열 300px + 간격 10px 을 뺀 나머지를 5등분한 경계
  const ports = PORT_LINES.map((p) => ({
    name: PORTS[p.key],
    left: `calc(${305 + 10 * p.before}px + (100% - 350px) * ${(p.before / ZONES.length).toFixed(2)})`,
  }));
  const band = mk(
    "div",
    { class: "r band", style: "border:0;padding:0 0 4px" },
    mk("div"),
    LOCATION_ZONES.map(([key, from, to]) => {
      const zones = ZONES.slice(from, to + 1);
      const n = zones.reduce((sum, zone) => sum + inZone(list, zone).length, 0);
      const el = locBandEl(LOCATIONS[key], n, locationTip(LOCATIONS[key], zones.map((z) => z.name).join(" · "), n));
      el.style.gridColumn = `span ${to - from + 1}`;
      return el;
    })
  );
  const head = mk("div", { class: "hd" }, mk("div"), ZONES.map((zone) => mk("div", { class: "z", style: `--c:${zone.color}` }, zone.name)));
  const body = rows.map((row) =>
    mk(
      "div",
      { class: `r ${row.cls}` },
      mk("div", { class: "lbl", title: row.label }, row.label),
      ZONES.map((zone) => {
        const vehicles = inZone(row.vs, zone);
        const cell = mk("div", { class: "cell" });
        if (vehicles.length) {
          const bar = miniStackEl(`${row.label} · ${zone.name}`, vehicles);
          bar.style.width = `${((vehicles.length / (row.cls === "m" ? maxModel : maxGroup)) * 80).toFixed(1)}%`;
          cell.append(bar, mk("span", { class: "n num" }, num(vehicles.length)));
        }
        return cell;
      })
    )
  );
  return mk(
    "div",
    { class: "card" },
    cardHead(
      tx("모델별 구역 현황"),
      tx("행 = 구분 > 차종 > 모델(Model Type Axle Cab 비표준 옵션) · 열 = 5구역 균등 · 막대 = 연식 누적, 길이 = 대수(모델 행끼리 · 그룹 행끼리 같은 기준)")
    ),
    mk("div", { class: "cfs3" }, portsRowEl(ports), mk("div", { class: "cfs3body" }, band, head, body, vlinesEl(ports)))
  );
}

// ---- 상태 × 연식 히트맵: 열 = 장소 > Current Status > 연식 + Total, 모델 행의 칸은 상태 색 농도 ----
// stages: 열로 둘 상태(월말 마감은 Bonded Stock · OH Stock 만 넘긴다)
function heatmapCard(list, stages = PIPE_STAGES) {
  const yearKeys = [...MY_KEYS, MY_OTHER];
  // 상태마다 대수가 있는 연식만 열로 둔다(Total 열은 항상)
  const columns = Object.fromEntries(
    stages.map((s) => [s, yearKeys.filter((k) => list.some((v) => v.current_status === s && modelYearKey(v) === k))])
  );
  const span = (s) => columns[s].length + 1;
  const keyOf = (v) => `${v.current_status}|${modelYearKey(v)}`;
  const counts = (vehicles) => countBy(vehicles, keyOf);
  const groups = modelGroups(list);
  const modelRows = groups.flatMap((g) => g.vehicles.flatMap((t) => t.rows));
  const maxCell = Math.max(1, ...modelRows.flatMap((r) => Object.values(counts(r.vs))));
  // 장소 묶음. 열로 두지 않는 상태는 빼고, 상태가 하나도 남지 않는 장소는 두지 않는다
  const locationColumns = [
    ["factory", PIPE_STAGES.slice(0, 3)],
    ["sea", [STATUS.IN_TRANSIT]],
    ["center", [STATUS.BONDED_STOCK, STATUS.OH_STOCK]],
  ]
    .map(([key, group]) => [key, group.filter((s) => stages.includes(s))])
    .filter(([, group]) => group.length);
  const stageTip = (s) => `${s} (${tx(LOCATIONS[locationOf(s)].name)})`;

  const head1 = mk(
    "tr",
    null,
    mk("th", { rowspan: 3 }, "Model"),
    locationColumns.map(([key, group]) => {
      const n = list.filter((v) => group.includes(v.current_status)).length;
      return mk(
        "th",
        { class: "loc", colspan: group.reduce((sum, s) => sum + span(s), 0), "data-tip": locationTip(LOCATIONS[key], group.join(" · "), n) },
        mk("span", { class: "lh" }, picIconEl(LOCATIONS[key].icon), mk("span", null, tx(LOCATIONS[key].name)), mk("b", { class: "num" }, num(n)))
      );
    }),
    mk("th", { class: "num gt", rowspan: 3 }, "Grand Total")
  );
  const head2 = mk("tr", null, stages.map((s) => mk("th", { class: "st", colspan: span(s) }, mk("span", { class: `pill ${stageClass(s)}` }, s))));
  const head3 = mk(
    "tr",
    null,
    stages.flatMap((s) => [...columns[s].map((k) => mk("th", { class: "num my" }, tx(k))), mk("th", { class: "num tot" }, "Total")])
  );
  // 0 은 빈 칸. heat: 모델 행만 상태 색 농도(대수/최대)를 준다
  const cells = (by, label, heat) => {
    const out = [];
    let grand = 0;
    for (const s of stages) {
      let stageTotal = 0;
      for (const k of columns[s]) {
        const n = by[`${s}|${k}`] ?? 0;
        stageTotal += n;
        const td = mk("td", { class: "num", "data-tip": n ? `${label} · ${stageTip(s)} · ${tx(k)} · ${units(n)}` : null }, n ? num(n) : "");
        if (heat && n) td.style.background = rgbaOf(STAGE_COLOR[s], 0.08 + 0.5 * Math.min(1, n / maxCell));
        out.push(td);
      }
      out.push(mk("td", { class: "num tot" }, stageTotal ? num(stageTotal) : ""));
      grand += stageTotal;
    }
    out.push(mk("td", { class: "num gt" }, num(grand)));
    return out;
  };
  const body = [];
  for (const group of groups) {
    body.push(mk("tr", { class: "g1" }, mk("td", null, group.gen), cells(counts(group.vehicles.flatMap((t) => t.rows.flatMap((r) => r.vs))), group.gen, false)));
    for (const type of group.vehicles) {
      body.push(mk("tr", { class: "g2" }, mk("td", null, type.vehicle), cells(counts(type.rows.flatMap((r) => r.vs)), `${group.gen} ${type.vehicle}`, false)));
      for (const row of type.rows) body.push(mk("tr", null, mk("td", { class: "model", title: row.label }, row.label), cells(counts(row.vs), row.label, true)));
    }
  }
  return mk(
    "div",
    { class: "card cfs2" },
    cardHead(tx("상태 × 연식 히트맵"), tx("행 = 구분 > 차종 > 모델 · 열 = 장소 > Current Status > 연식 + Total · 셀 색 농도 = 대수(상태 색) · 0은 공란 · 대수 0인 연식 열은 숨김")),
    mk(
      "div",
      { class: "tbl-wrap" },
      mk(
        "table",
        { class: "tbl compact pivot fixcol" },
        mk("thead", null, head1, head2, head3, mk("tr", { class: "total" }, mk("td", null, "Grand Total"), cells(counts(list), "Grand Total", false))),
        mk("tbody", null, body)
      )
    )
  );
}

// ---- 요약 카드: Total Stock + 연식별 대수·비율 ----
function summaryCards(items) {
  const list = items.map((x) => x.v);
  const total = list.length;
  const byYear = countBy(list, modelYearKey);
  const cleared = items.filter((x) => x.cleared).length;
  const kpi = (label, value, foot) =>
    mk("div", { class: "card kpi" }, mk("span", { class: "label" }, label), mk("span", { class: "value num" }, num(value)), mk("span", { class: "foot" }, foot));
  return mk(
    "div",
    { class: "grid4", style: `grid-template-columns:1.3fr repeat(${MY_KEYS.length},1fr)` },
    kpi("Total Stock", total, tx("보세(Bonded) {b} · 통관(OH) {c} · 보세/통관 = Customs Clearance Date 유무", { b: num(total - cleared), c: num(cleared) })),
    MY_KEYS.map((k) => kpi([swatch(MY_COLORS[k], 10), k], byYear[k] ?? 0, pct(byYear[k] ?? 0, total)))
  );
}

function yearLegend() {
  return mk(
    "div",
    { class: "my-legend" },
    `${tx("연식(MY) 범례")}: `,
    [...MY_KEYS, MY_OTHER].map((k) => mk("span", null, swatch(MY_COLORS[k], 12), tx(k), k === MY_OTHER ? tx(" (MY23 이하·판독 불가)") : ""))
  );
}

// ---- By Vehicle / By Model: 연식 누적 가로 막대 ----
function byVehicleCards(list) {
  const total = list.length;
  const segs = (vehicles) => mySegments(vehicles).map((s) => ({ ...s, name: tx(s.name) }));
  const types = vehicleTypes(list).map((type) => ({ type, vs: list.filter((v) => v.vehicle === type) }));
  const max = Math.max(1, ...types.map((t) => t.vs.length));
  const modelName = (v) => [v.model, v.type, v.axle, v.cab, modelOptionTag(v)].filter(Boolean).join(" · ");

  const byVehicle = mk(
    "div",
    { class: "card" },
    sectionHead("By Vehicle", tx("차종별 · 막대 길이 = 대수 · 우측 대수·비율"), true),
    mk("div", { class: "hbars" }, types.map((t) => hbarEl(t.type, segs(t.vs), t.vs.length, max, total)))
  );
  const byModel = mk(
    "div",
    { class: "card" },
    sectionHead("By Model", tx("차종 섹션 안 모델별 · 모델명 = Model · Type · Axle · Cab · 비표준 옵션"), true),
    types.map((t) => {
      const models = new Map();
      for (const v of t.vs) {
        const name = modelName(v);
        if (!models.has(name)) models.set(name, []);
        models.get(name).push(v);
      }
      const sorted = [...models.entries()].sort((a, b) => b[1].length - a[1].length);
      return [
        sectionHead(t.type, `${tx("{n}대", { n: num(t.vs.length) })} · ${pct(t.vs.length, total)}`, false),
        mk("div", { class: "hbars" }, sorted.map(([name, vs]) => hbarEl(name, segs(vs), vs.length, max, total, "model"))),
      ];
    })
  );
  return [byVehicle, byModel];
}

function build(root, vehicles) {
  const today = baseDate();
  const body = mk("div");
  // 월말 마감 탭의 머리줄: 마감 월 선택 · 마감한 날 · 파일 내려받기
  const closingHead = mk("div", { class: "card-h", hidden: true });
  let turn = 0; // 그릴 때마다 올린다. 늦게 도착한 마감 읽기 결과를 버리는 데 쓴다

  const note = (text) => mk("div", { class: "muted small", style: "margin:-4px 0 10px" }, text);
  const say = (text, isError) => body.replaceChildren(mk("p", { class: isError ? "error" : "muted" }, text));

  // TSC 재고 · 현재 및 미래 재고현황: 지금의 차량 목록에서 계산한다
  const drawCurrent = () => {
    const items = currentStock(vehicles, view.scope);
    const list = items.map((x) => x.v);
    const label =
      view.scope === "pipe"
        ? tx("현재 ({d}, 상태 Ordered(Fixed) ~ OH Stock 기준)", { d: today })
        : tx("현재 ({d}, 상태 Bonded Stock·OH Stock 기준)", { d: today });
    body.replaceChildren(
      note(label),
      ...(view.scope === "pipe"
        ? [journeyCard(list, body.clientWidth || 1200), yearLegend(), matrixCard(list), heatmapCard(list)]
        : [summaryCards(items), yearLegend()]),
      ...byVehicleCards(list)
    );
  };

  // 월말 마감: 마감할 때 저장해 둔 파일을 읽어 그린다
  const drawClosing = async (mine) => {
    const stale = () => mine !== turn || !root.isConnected;
    say(tx("마감 내역을 불러오는 중..."));
    let months;
    let closing;
    try {
      months = await listClosings();
      if (stale()) return;
      if (!months.length) {
        say(tx("아직 마감한 달이 없습니다. Logistics 차량 마스터의 '월말 마감'에서 마감하면 여기에 나옵니다."));
        return;
      }
      if (!months.includes(view.month)) view.month = months[0];
      closing = await loadClosing(view.month);
      if (stale()) return;
    } catch (err) {
      console.error(err);
      if (!stale()) say(`${tx("마감 내역을 불러오지 못했습니다.")} ${err.status ?? ""}`.trim(), true);
      return;
    }

    const select = mk("select", { id: "stockSel" }, months.map((m) => mk("option", { value: m }, tx("{m} 월말 마감", { m }))));
    select.value = view.month;
    select.addEventListener("change", () => {
      view.month = select.value;
      draw();
    });
    const download = mk("button", { class: "btn sm", type: "button", disabled: !closing }, tx("파일 내려받기"));
    download.addEventListener("click", () =>
      downloadClosing(closing).catch((err) => {
        console.error(err);
        toast(tx("파일 내려받기"), tx("파일을 만들지 못했습니다. 다시 시도하세요."));
      })
    );
    closingHead.replaceChildren(
      mk("h2", null, tx("마감 월")),
      select,
      closing?.closedAt ? mk("span", { class: "muted small" }, tx("마감한 날 {d}", { d: closing.closedAt })) : null,
      download
    );
    closingHead.hidden = false;
    if (!closing) {
      say(tx("마감 파일을 읽을 수 없습니다."), true);
      return;
    }
    const list = closing.items.map((x) => x.v);
    body.replaceChildren(
      note(tx("{m} 월말 마감 · 마감 시점의 Bonded Stock · OH Stock", { m: closing.month })),
      summaryCards(closing.items),
      yearLegend(),
      heatmapCard(list, CLOSING_STAGES),
      ...byVehicleCards(list)
    );
  };

  const draw = () => {
    turn++;
    for (const tab of tabs.children) tab.classList.toggle("active", tab.dataset.scope === view.scope);
    closingHead.hidden = true;
    if (view.scope === "closing") drawClosing(turn);
    else drawCurrent();
  };

  const tabs = mk(
    "div",
    { class: "tabs", id: "stockTabs" },
    SCOPES.map(([scope, label]) =>
      mk(
        "span",
        {
          class: "tab",
          "data-scope": scope,
          onclick: () => {
            if (view.scope === scope) return;
            view.scope = scope;
            draw();
          },
        },
        tx(label)
      )
    )
  );

  root.replaceChildren(mk("div", { class: "card" }, tabs, closingHead, body));
  draw(); // 화면에 붙은 뒤에 그려야 여정 지도가 카드 폭을 잴 수 있다
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

export const stockPage = {
  render(root, params) {
    // 주소로 탭과 마감 월을 정할 수 있다: ?view=pipe, ?view=closing&m=YYYY-MM
    view.scope = SCOPES.some(([scope]) => scope === params.get("view")) ? params.get("view") : "stock";
    view.month = params.get("m") || "";
    const box = mk("div");
    root.append(box);
    load(box, false);
  },
};
