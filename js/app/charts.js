// 차트·그림 부품 — 세로 막대, 세로 누적 막대, 가로 누적 막대, 연식 미니 막대, 장소 띠, 항구 표시.
// 모두 DOM/SVG 노드를 돌려준다. 풍선 도움말은 data-tip 속성으로 넣고 ui.js 가 보여준다.
import { mk, mkSvg } from "../lib/dom.js";
import { tx } from "./i18n.js";
import { state } from "./state.js";
import { mySegments } from "../data/derive.js";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthEn = (ym) => MONTHS_EN[Number(ym.slice(5, 7)) - 1] ?? ym;

export const num = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("ko-KR"));
export const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "0.0%");
const units = (v) => tx("{v}대", { v });

/** 범례. items: [{name, color, border?}] */
export function legendEl(items) {
  return mk(
    "div",
    { class: "legend" },
    items.map((item) =>
      mk(
        "span",
        null,
        mk("span", {
          class: "sw",
          style: `background:${item.color}${item.border ? `;border:1px solid ${item.border}` : ""}`,
        }),
        item.name
      )
    )
  );
}

/**
 * 월별 세로 막대 차트(계열별 묶음 막대).
 * @param {{months: string[], series: Array<{name, color, values: number[]}>, baseIdx?: number,
 *          width?: number, height?: number, visible?: number, scrollTo?: number,
 *          barW?: number, barGap?: number}} opts
 *   baseIdx : 기준월 위치. 그 달을 강조하고 이후 달은 음영으로 표시
 *   visible : 한 화면에 보일 월 수. 나머지는 가로 스크롤(Y축은 왼쪽에 고정)
 *   scrollTo: 처음에 왼쪽 끝에 올 월 위치
 */
export function barChartEl(opts) {
  const n = opts.months.length;
  const visible = opts.visible && opts.visible < n ? opts.visible : null;
  // visible 이 있으면 그림 폭을 n/visible 배로 늘려(월당 폭과 글자 크기는 그대로) 가로 스크롤한다.
  const base = opts.width || 1200;
  const axisW = 42;
  const padL = visible ? 6 : axisW;
  const W = base * (visible ? n / visible : 1);
  const H = opts.height || 300;
  const padR = 10;
  const padT = 20;
  const padB = 40;
  const groupW = (W - padL - padR) / n;
  const plotH = H - padT - padB;
  const max = Math.max(1, ...opts.series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 10) * 10;
  const y = (v) => padT + plotH * (1 - v / nice);
  const hasBase = opts.baseIdx != null;

  const svg = mkSvg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  const axis = visible
    ? mkSvg("svg", { class: "chart chart-axis", viewBox: `0 0 ${axisW} ${H}`, "aria-hidden": "true" })
    : null;

  for (let i = 0; i < n; i++) {
    const x = padL + i * groupW;
    if (hasBase && i > opts.baseIdx) svg.append(mkSvg("rect", { class: "future", x, y: padT, width: groupW, height: plotH }));
    if (i === opts.baseIdx) svg.append(mkSvg("rect", { class: "base strong", x: x + 1, y: padT, width: groupW - 2, height: plotH }));
  }
  for (let t = 0; t <= 4; t++) {
    const v = (nice * t) / 4;
    svg.append(mkSvg("line", { class: "gridl", x1: padL, x2: W - padR, y1: y(v), y2: y(v) }));
    (axis ?? svg).append(mkSvg("text", { x: axisW - 6, y: y(v) + 4, "text-anchor": "end" }, v));
  }

  const gap = opts.barGap != null ? opts.barGap : 2;
  const barW = Math.min(opts.barW || 14, (groupW - 8) / opts.series.length - gap);
  opts.series.forEach((series, si) => {
    series.values.forEach((v, i) => {
      const x = padL + i * groupW + (groupW - (barW + gap) * opts.series.length) / 2 + si * (barW + gap);
      const top = y(v);
      const height = Math.max(0, H - padB - top);
      const future = hasBase && i > opts.baseIdx;
      svg.append(
        mkSvg("rect", {
          class: "bar", x, y: top, width: barW, height, fill: series.color,
          "data-tip": `${monthEn(opts.months[i])} ${opts.months[i].slice(0, 4)} · ${series.name} ${units(v)}${future ? tx(" (계획/예정)") : ""}`,
        })
      );
      // 수치는 막대 안쪽 위에, 막대가 짧으면 막대 위에 적는다.
      if (v > 0) {
        svg.append(
          height >= 16
            ? mkSvg("text", { class: "ilbl", x: x + barW / 2, y: top + 11, "text-anchor": "middle" }, v)
            : mkSvg("text", { class: "vlbl", x: x + barW / 2, y: top - 3, "text-anchor": "middle" }, v)
        );
      }
    });
  });
  opts.months.forEach((m, i) => {
    const cx = padL + i * groupW + groupW / 2;
    svg.append(mkSvg("text", { class: i === opts.baseIdx ? "base-m" : "", x: cx, y: H - padB + 15, "text-anchor": "middle" }, monthEn(m)));
    if (i === 0 || m.endsWith("-01")) {
      svg.append(mkSvg("text", { class: "yr", x: cx, y: H - padB + 30, "text-anchor": "middle" }, m.slice(0, 4)));
    }
  });

  const legend = legendEl([
    ...opts.series.map((s) => ({ name: s.name, color: s.color })),
    ...(hasBase
      ? [
          { name: tx("기준월"), color: "#ffe0a8", border: "#e08a00" },
          { name: tx("기준월 이후(계획·예정)"), color: "#eef1f5", border: "#d3dae3" },
        ]
      : []),
  ]);
  if (!visible) return mk("div", null, svg, legend);

  svg.style.width = `${((n / visible) * 100).toFixed(1)}%`;
  const wrap = mk("div", { class: "chart-scroll" }, svg);
  // 처음 스크롤 위치는 화면에 붙은 뒤 scrollChartTo() 가 맞춘다(전체 폭에 대한 비율로 기억).
  wrap.dataset.scrollFrac = ((padL + (opts.scrollTo || 0) * groupW) / W).toFixed(4);
  // Y축 그림의 폭을 이 비율로 두면 두 그림의 배율이 같아져 눈금 높이가 맞는다.
  axis.style.width = `${((axisW / (base + axisW)) * 100).toFixed(3)}%`;
  return mk("div", null, mk("div", { class: "chart-split" }, axis, wrap), legend);
}

/** 스크롤되는 차트를 처음 위치로 옮긴다. 화면에 붙은 뒤에 부른다. */
export function scrollChartTo(root) {
  const go = () => {
    for (const wrap of root.querySelectorAll(".chart-scroll")) {
      wrap.scrollLeft = wrap.scrollWidth * Number(wrap.dataset.scrollFrac || 0);
    }
  };
  go();
  requestAnimationFrame(go);
}

/**
 * 세로 누적 막대 차트.
 * @param {{cats: string[], series: Array<{name, color, values: number[]}>, width?: number, height?: number}} opts
 */
export function stackChartEl(opts) {
  const W = opts.width || 600;
  const H = opts.height || 260;
  const padL = 42;
  const padR = 10;
  const padT = 26;
  const padB = 28;
  const n = opts.cats.length;
  const groupW = (W - padL - padR) / Math.max(1, n);
  const plotH = H - padT - padB;
  const totals = opts.cats.map((_, i) => opts.series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
  const nice = Math.max(10, Math.ceil(Math.max(1, ...totals) / 10) * 10);
  const y = (v) => padT + plotH * (1 - v / nice);

  const svg = mkSvg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img" });
  for (let t = 0; t <= 4; t++) {
    const v = (nice * t) / 4;
    svg.append(
      mkSvg("line", { class: "gridl", x1: padL, x2: W - padR, y1: y(v), y2: y(v) }),
      mkSvg("text", { x: padL - 6, y: y(v) + 4, "text-anchor": "end" }, v)
    );
  }
  const barW = Math.min(64, groupW * 0.6);
  opts.cats.forEach((cat, i) => {
    const x = padL + i * groupW + (groupW - barW) / 2;
    let acc = 0;
    for (const series of opts.series) {
      const v = series.values[i] || 0;
      if (!v) continue;
      const top = y(acc + v);
      const height = y(acc) - top;
      svg.append(
        mkSvg("rect", {
          class: "bar", x, y: top, width: barW, height, fill: series.color,
          "data-tip": `${cat} · ${series.name} ${units(v)} (${pct(v, totals[i])})`,
        })
      );
      if (height >= 14) {
        svg.append(mkSvg("text", { class: "slbl", x: x + barW / 2, y: top + height / 2, "text-anchor": "middle", "dominant-baseline": "middle" }, v));
      }
      acc += v;
    }
    svg.append(
      mkSvg("text", { class: "vlbl", x: x + barW / 2, y: y(acc) - 5, "text-anchor": "middle" }, totals[i]),
      mkSvg("text", { x: x + barW / 2, y: H - padB + 16, "text-anchor": "middle" }, cat)
    );
  });
  return mk("div", null, svg, legendEl(opts.series.map((s) => ({ name: s.name, color: s.color }))));
}

/**
 * 가로 누적 막대 한 줄. 길이는 max 대비 n 의 비율.
 * @param {Array<{name, color, value}>} segs
 * @param {number} [grand] 있으면 오른쪽에 전체 대비 비율을 붙인다
 */
export function hbarEl(label, segs, n, max, grand, cls) {
  const width = max ? (n / max) * 100 : 0;
  const track = mk(
    "div",
    { class: "track" },
    segs
      .filter((s) => s.value > 0)
      .map((s) =>
        mk("div", {
          class: "seg",
          style: `width:${((s.value / n) * width).toFixed(2)}%;background:${s.color}`,
          "data-tip": `${label} · ${s.name} ${units(s.value)} (${pct(s.value, n)})`,
        })
      )
  );
  return mk(
    "div",
    { class: `hbar ${cls ?? ""}` },
    mk("div", { class: "lbl", title: label }, label),
    track,
    mk("div", { class: "val num" }, mk("b", null, num(n)), grand ? ` · ${pct(n, grand)}` : "")
  );
}

/** 차량 목록의 연식 구성을 보여주는 얇은 누적 막대. */
export function miniStackEl(label, vehicles) {
  const n = vehicles.length;
  return mk(
    "div",
    { class: "mini" },
    mySegments(vehicles)
      .filter((s) => s.value > 0)
      .map((s) =>
        mk("div", {
          style: `flex:${s.value};background:${s.color}`,
          "data-tip": `${label} · ${tx(s.name)} ${units(s.value)} (${pct(s.value, n)})`,
        })
      )
  );
}

// ---- 그림 아이콘(24×24): de = 독일 국기 깃발, kr = 태극기 깃발, sea = 바다 그림 ----
// 틀 안에 무늬를 clipPath 로 잘라 넣고 테두리를 그린다. clipPath id 는 겹치지 않게 번호를 매긴다.
let iconSeq = 0;
const FLAG_FRAME = "M5.5 4C10 2.2 14 6 21 4.3V15.3C14 17 10 13.2 5.5 15Z";
const SEA_FRAME = "M2 3h20v18H2z";
const stroke = (d, attrs) =>
  mkSvg("path", { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs });

function framed(d, inner) {
  const id = `picclip${++iconSeq}`;
  return [
    mkSvg("clipPath", { id }, mkSvg("path", { d })),
    mkSvg("g", { "clip-path": `url(#${id})` }, inner),
    mkSvg("path", { d, fill: "none", stroke: "#8a95a3", "stroke-width": 0.8 }),
  ];
}

function flag(inner) {
  return [
    ...framed(FLAG_FRAME, inner),
    mkSvg("line", { x1: 4.5, y1: 2.5, x2: 4.5, y2: 22, stroke: "#5b6b82", "stroke-width": 1.6, "stroke-linecap": "round" }),
    mkSvg("circle", { cx: 4.5, cy: 2.2, r: 1.1, fill: "#5b6b82" }),
  ];
}

function iconNodes(kind) {
  if (kind === "de") {
    return flag([
      mkSvg("rect", { x: 5, y: 2, width: 17, height: 5.3, fill: "#000" }),
      mkSvg("rect", { x: 5, y: 7.3, width: 17, height: 5, fill: "#dd0000" }),
      mkSvg("rect", { x: 5, y: 12.3, width: 17, height: 5.5, fill: "#ffce00" }),
    ]);
  }
  if (kind === "kr") {
    return flag([
      mkSvg("rect", { x: 5, y: 2, width: 17, height: 16, fill: "#fff" }),
      mkSvg("path", { d: "M10 9.7a3.2 3.2 0 0 1 6.4 0a1.6 1.6 0 0 1-3.2 0a1.6 1.6 0 0 0-3.2 0z", fill: "#cd2e3a" }),
      mkSvg("path", { d: "M16.4 9.7a3.2 3.2 0 0 1-6.4 0a1.6 1.6 0 0 1 3.2 0a1.6 1.6 0 0 0 3.2 0z", fill: "#0047a0" }),
      // 4괘는 짧은 막대 3줄로 줄여 그린다
      ...[[6.3, 4.6], [17.6, 5.2], [6.3, 12.3], [17.6, 12.9]].flatMap(([x, y]) =>
        [0, 1, 2].map((i) => mkSvg("rect", { x, y: y + i * 1.1, width: 2.6, height: 0.6, fill: "#1d2733" }))
      ),
    ]);
  }
  if (kind === "sea") {
    return framed(SEA_FRAME, [
      mkSvg("rect", { x: 2, y: 3, width: 20, height: 18, fill: "#dceefb" }),
      mkSvg("circle", { cx: 16.8, cy: 8.2, r: 2.7, fill: "#ffce00" }),
      stroke("M5 8.2c1.3-1.6 2.6-1.9 3.9-.9 1.3-1 2.6-.7 3.9.9", { stroke: "#3a4553", "stroke-width": 1.1 }),
      stroke("M8.5 11.6c.9-1.1 1.8-1.3 2.7-.6.9-.7 1.8-.5 2.7.6", { stroke: "#3a4553", "stroke-width": 0.9 }),
      mkSvg("path", { d: "M2 14.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0 2 0 2 0V21H2z", fill: "#2a78d6" }),
      stroke("M2 14.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0", { stroke: "#fff", "stroke-width": 0.9, opacity: 0.85 }),
      mkSvg("path", { d: "M2 18.2c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0 2 0 2 0V21H2z", fill: "#1b4f9b" }),
    ]);
  }
  return [];
}

// SVG 안에 넣는 그림 아이콘. (x, y) 위치에 k 배로 그린다
function picIconSvg(kind, x, y, k) {
  return mkSvg("g", { transform: `translate(${x},${y}) scale(${k})` }, iconNodes(kind));
}

export function picIconEl(kind) {
  return mkSvg("svg", { class: "loc-ic", viewBox: "0 0 24 24", "aria-hidden": "true" }, iconNodes(kind));
}

// ---- 장소 띠와 항구 표시 ----

/** 장소 띠의 풍선 도움말 문구 */
export function locationTip(loc, stages, n) {
  return [tx(loc.name), state.lang === "en" ? null : loc.en, stages, units(num(n))].filter(Boolean).join(" · ");
}

/** 장소 띠(아이콘 + 이름 + 대수). short: 국가명을 뺀 짧은 이름을 쓴다 */
export function locBandEl(loc, n, tip, short) {
  return mk(
    "div",
    { class: "locb", style: `--c:${loc.color}`, "data-tip": tip || locationTip(loc, "", n) },
    picIconEl(loc.icon),
    mk("div", { class: "nm" }, tx(short && loc.short ? loc.short : loc.name)),
    mk("div", { class: "ct num" }, units(num(n)))
  );
}

/** 항구 이름 줄. ports: [{name, left(CSS 값)}] */
export function portsRowEl(ports) {
  return mk("div", { class: "ports" }, ports.map((p) => mk("span", { style: `left:${p.left}` }, tx(p.name))));
}

/** 항구 위치의 세로 점선 */
export function vlinesEl(ports) {
  return ports.map((p) => mk("div", { class: "vline", style: `left:${p.left}` }));
}

/** 같은 폭의 격자(열 cols 개, 간격 gap px)에서 i-1 열과 i 열 사이의 left 값 */
export function gridBoundaryLeft(i, cols, gap) {
  return `calc(${((i / cols) * 100).toFixed(3)}% + ${(gap * (i / cols - 0.5)).toFixed(2)}px)`;
}

// ---- SVG 안에 그리는 장소 띠와 항구 표시(여정 지도용) ----

// CSS 변수 색("var(--x)") → 실제 색 값
function cssColor(color) {
  const m = /var\((--[\w-]+)\)/.exec(color);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : color;
}

/** 색에 투명도를 준 rgba 문자열. 히트맵 농도와 띠 배경에 쓴다 */
export function rgbaOf(color, alpha) {
  const hex = cssColor(color).replace("#", "");
  const n = parseInt(hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// SVG 글자 폭 추정(한글 11px, 그 외 6.3px)
const textWidth = (text) => [...text].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 11 : 6.3), 0);

/** SVG 장소 띠: x0~x1 구간에 배경 상자, 아이콘(폭이 충분할 때), 이름, 대수 */
export function svgLocBand(svg, loc, n, x0, x1, y, h, tip) {
  const color = cssColor(loc.color);
  const width = x1 - x0;
  const iconW = 26;
  const name = tx(loc.name);
  svg.append(
    mkSvg("rect", {
      x: x0, y, width, height: h, rx: 7, fill: rgbaOf(color, 0.08), stroke: rgbaOf(color, 0.45),
      "data-tip": tip || locationTip(loc, "", n),
    })
  );
  let textX = x0 + 10;
  if (width >= iconW + 8 + textWidth(name) + 60) {
    svg.append(picIconSvg(loc.icon, x0 + 10, y + (h - 26) / 2, 26 / 24));
    textX = x0 + 10 + iconW + 8;
  }
  svg.append(
    mkSvg("text", { class: "bn", x: textX, y: y + h / 2 + 5 }, name),
    mkSvg("text", { class: "bc", x: x1 - 10, y: y + h / 2 + 5, "text-anchor": "end" }, units(num(n)))
  );
}

/** SVG 항구 표시: 알약 모양 이름표와 세로 점선. ports: [{name, x}] */
export function svgPorts(svg, ports, yTop, yBottom) {
  for (const port of ports) {
    const name = tx(port.name);
    const width = textWidth(name) + 16;
    svg.append(
      mkSvg("line", { x1: port.x, x2: port.x, y1: yTop + 5, y2: yBottom, stroke: "var(--line-strong)", "stroke-dasharray": "3 3" }),
      mkSvg("rect", { x: port.x - width / 2, y: yTop - 13, width, height: 18, rx: 9, fill: "#fff", stroke: "var(--line)" }),
      mkSvg("text", { class: "bs", x: port.x, y: yTop, "text-anchor": "middle", style: "pointer-events:none" }, name)
    );
  }
}
