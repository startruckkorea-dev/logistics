// Logistics 차량 마스터 — Commission No 기준 1행, 전체 열을 보여주는 그리드(읽기 전용).
// 검색, 열 필터, 정렬, 50행 페이지, Commission No 열 고정, 바로가기.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { diffDays } from "../domain/dates.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import { changeabilityDday } from "../data/derive.js";
import { openVehicle } from "./vehicle-drawer.js";
import {
  COLUMNS, GRID_JUMPS, SEARCH_COLUMNS, FILTER_COLUMNS, DATE_FILTER_COLUMNS, STAGE_ORDER,
  sourceBadge, stageClass,
} from "../data/columns.js";

const PAGE_SIZE = 50;
const MEMO_WIDTH = 220; // 긴 글 열(Tires · Option Note · Order Note)의 고정 너비(px). 넘치면 말줄임
const WIDTH_SAMPLES = 5; // 열 너비를 잴 때 열마다 쓰는 가장 긴 값의 수
const DDAY_WITHIN = 30; // Changeability Date 가 이 일수 안으로 다가오면 D-day 배지를 붙인다
const SEARCH_HINT = "Comm(여러 개는 쉼표 구분) / VIN / B/L / Vessel / Type / Order·Option Note";

const BLANK = "(빈 값)"; // 열 필터에서 빈 칸을 가리키는 값
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 화면 상태. 다른 화면에 다녀와도 검색어와 정렬은 유지한다.
//   col     : 열 필터 { 열 key: Set(선택한 값) }. 없는 열은 전체
//   delayed : Shipping Calc 경과 배지가 있는 행만
const view = { q: "", col: {}, delayed: false, sort: "commission_no", dir: -1, page: 1 };
let vehicles = [];
let els = {};
let columnWidths = []; // 열마다 고정한 너비(px). 페이지·검색·필터가 바뀌어도 그대로다

const num = (n) => Number(n).toLocaleString("ko-KR");
const isEmpty = (v) => v == null || v === "";
const dim = () => mk("span", { class: "dim muted" }, "·");

// 검색어 → 검색 항목. 쉼표·세미콜론으로 나누면 여러 건을 한 번에 찾는다(OR).
// 숫자와 공백만 있으면 공백으로도 나눈다(엑셀 열을 붙여넣은 경우).
function searchTerms() {
  const text = view.q.trim();
  if (!text) return [];
  let terms = text.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (terms.length === 1 && /^[\d\s]+$/.test(text)) terms = text.split(/\s+/).filter(Boolean);
  return [...new Set(terms.map((s) => s.toLowerCase()))];
}

// 열 필터가 비교하는 값. 빈 칸은 BLANK, 날짜 열은 연-월까지만 본다.
function filterValue(v, key) {
  const value = v[key];
  if (isEmpty(value)) return BLANK;
  return DATE_FILTER_COLUMNS.includes(key) ? String(value).slice(0, 7) : String(value);
}

function filteredRows() {
  const terms = searchTerms();
  const today = baseDate();
  const filters = Object.entries(view.col);
  const rows = vehicles.filter(
    (v) =>
      (!view.delayed || shipDelayDays(v, today) > 0) &&
      filters.every(([key, chosen]) => chosen.has(filterValue(v, key))) &&
      (!terms.length ||
        terms.some((term) =>
          SEARCH_COLUMNS.some((key) => !isEmpty(v[key]) && String(v[key]).toLowerCase().includes(term))
        ))
  );
  const { sort: key, dir } = view;
  rows.sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return 0;
    if (isEmpty(x)) return 1; // 빈 값은 방향과 관계없이 뒤로
    if (isEmpty(y)) return -1;
    return (x > y ? 1 : -1) * dir;
  });
  return rows;
}

// 검색어와 일치하는 부분을 <mark> 로 감싼 노드 목록
function highlight(value, terms) {
  const text = String(value);
  if (!terms.length) return [text];
  const pattern = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(pattern, "gi");
  const out = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(mk("mark", null, m[0]));
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Shipping Calc 경과 일수. 선적 후 = Shipping − Shipping Calc(고정),
// 선적 전 = 오늘 − Shipping Calc(In Production 만, 매일 늘어난다). 해당 없으면 0
function shipDelayDays(v, today) {
  if (!v.shipping_calc || v.current_status === STATUS.CANCELLED) return 0;
  if (v.shipping) return Math.max(0, diffDays(v.shipping, v.shipping_calc) ?? 0);
  if (v.current_status !== STATUS.IN_PRODUCTION) return 0;
  return Math.max(0, diffDays(today, v.shipping_calc) ?? 0);
}

// 셀 내용(노드 또는 텍스트의 배열)
function cellContent(column, v, terms, today) {
  const value = v[column.key];
  switch (column.key) {
    case "current_status":
      return [mk("span", { class: `pill ${stageClass(value)}` }, value)];
    case "type": {
      const same = String(value ?? "").slice(0, 4) === String(v.model_in_afab ?? "").slice(0, 4);
      return [
        ...highlight(value ?? "", terms),
        mk("span", {
          class: `dot r ${same ? "ok" : "bad"}`,
          title: same ? "Model In AFAB 앞 4글자 일치" : `Model In AFAB 앞 4글자 불일치: ${v.model_in_afab ?? ""}`,
        }),
      ];
    }
    case "changeability_date": {
      const dotClass = { J: "ok", N: "bad", B: "warn" }[v.afab_editable];
      const dday = changeabilityDday(v, today);
      return [
        isEmpty(value) ? dim() : value,
        dday != null && dday <= DDAY_WITHIN ? [" ", mk("span", { class: "pill warn" }, `D-${dday}`)] : null,
        dotClass ? mk("span", { class: `dot r ${dotClass}`, title: `AFAB 수정 가능(Ä): ${v.afab_editable}` }) : null,
      ];
    }
    case "color_code":
      return isEmpty(value) ? [dim()] : [mk("span", { title: v.color_name ?? "" }, value)];
    case "shipping_calc": {
      if (isEmpty(value)) return [dim()];
      const days = shipDelayDays(v, today);
      if (days <= 0) return [value];
      const tip = v.shipping
        ? tx("Shipping {s} · 실적 PM~Shipping {m}일 (계획 {p}일, 초과 {n}일)", {
            s: v.shipping,
            m: diffDays(v.shipping, `${v.pm}-01`) ?? "-",
            p: v.lead_days,
            n: days,
          })
        : tx("Shipping 미입력 · Shipping Calc 경과 {n}일 (기준일 {d})", { n: days, d: today });
      // 선적 전은 빨강(늘어나는 중), 선적 후는 회색(확정)
      return [value, " ", mk("span", { class: `pill ${v.shipping ? "neutral" : "danger"}`, title: tip }, `D+${days}`)];
    }
    default:
      if (isEmpty(value)) return [dim()];
      return SEARCH_COLUMNS.includes(column.key) ? highlight(value, terms) : [String(value)];
  }
}

function cellClass(column) {
  return [
    column.key === "commission_no" ? "sticky" : "",
    column.memo ? "memo" : "",
    column.key === "type" || column.key === "changeability_date" ? "dotcell" : "",
  ]
    .filter(Boolean)
    .join(" ") || null;
}

// forMeasure: 너비를 잴 때는 모든 열에 정렬 표시를 넣어 가장 넓은 경우로 잰다.
function headerRows(forMeasure = false) {
  const sortMark = (key) =>
    forMeasure || view.sort === key ? mk("span", { class: "sort" }, view.dir > 0 ? "▲" : "▼") : null;
  const badge = (src) => {
    const b = sourceBadge(src);
    return mk("span", { class: `badge ${b.cls}`, title: b.tip }, tx(src));
  };
  const isFiltered = (key) => Boolean(view.col[key]) || (key === "shipping_calc" && view.delayed);
  const filterButton = (column) =>
    FILTER_COLUMNS.includes(column.key)
      ? mk(
          "button",
          {
            class: `cf ${isFiltered(column.key) ? "on" : ""}`,
            type: "button",
            "data-filter": column.key,
            title: tx("{c} 열 필터", { c: tx(column.label) }),
          },
          "▼"
        )
      : null;
  const th = (column, children) =>
    mk(
      "th",
      { class: column.key === "commission_no" ? "sticky" : null, "data-sort": column.key, title: column.key },
      children
    );
  return [
    mk("tr", { class: "fld" }, COLUMNS.map((c) => th(c, tx(c.label)))),
    mk("tr", { class: "sub" }, COLUMNS.map((c) => th(c, [badge(c.src), sortMark(c.key), filterButton(c)]))),
  ];
}

// 열 너비를 정한다. 전체 차량에서 열마다 가장 긴 값 몇 개를 골라 보이지 않는 표에 실제 모양대로 그리고,
// 브라우저가 잡은 너비를 읽는다. 머리글(열 이름·배지·정렬 표시·필터 버튼)도 같이 잰다.
function measureColumnWidths() {
  const today = baseDate();
  const picks = COLUMNS.map((column) => {
    // 배지가 붙는 열은 배지가 가장 긴 행으로 잰다.
    const score =
      column.key === "shipping_calc"
        ? (v) => shipDelayDays(v, today)
        : column.key === "changeability_date"
          ? (v) => {
              const dday = changeabilityDday(v, today);
              return dday != null && dday <= DDAY_WITHIN ? 100 + dday : String(v.changeability_date ?? "").length;
            }
          : (v) => String(v[column.key] ?? "").length;
    return [...vehicles].sort((a, b) => score(b) - score(a)).slice(0, WIDTH_SAMPLES);
  });
  const sampleRows = Array.from({ length: Math.min(WIDTH_SAMPLES, vehicles.length) }, (_, r) =>
    mk(
      "tr",
      null,
      COLUMNS.map((c, i) => mk("td", { class: cellClass(c) }, cellContent(c, picks[i][r], [], today)))
    )
  );
  const table = mk("table", { class: "grid measure" }, mk("thead", null, headerRows(true)), mk("tbody", null, sampleRows));
  els.grid.append(table);
  const widths = [...table.querySelectorAll("thead tr.fld th")].map((th, i) => {
    const width = Math.ceil(th.getBoundingClientRect().width) + 1;
    return COLUMNS[i].memo ? MEMO_WIDTH : width;
  });
  table.remove();
  return widths;
}

function columnGroup() {
  return mk(
    "colgroup",
    null,
    columnWidths.map((width) => {
      const col = mk("col");
      col.style.width = `${width}px`;
      return col;
    })
  );
}

function renderGrid() {
  const rows = filteredRows();
  const terms = searchTerms();
  const today = baseDate();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), totalPages);
  const from = (view.page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(from, from + PAGE_SIZE);

  const filtered = Object.keys(view.col);
  if (view.delayed && !filtered.includes("shipping_calc")) filtered.push("shipping_calc");
  const labelOf = (key) => tx(COLUMNS.find((c) => c.key === key)?.label ?? key);
  els.count.textContent =
    tx("{n}건 / 전체 {m}", { n: num(rows.length), m: num(vehicles.length) }) +
    (filtered.length ? tx(" · 열 필터: {cols}", { cols: filtered.map(labelOf).join(" · ") }) : "");

  if (!rows.length) {
    els.grid.replaceChildren(mk("div", { class: "muted empty-msg" }, tx("조건에 맞는 차량이 없습니다.")));
  } else {
    const table = mk(
      "table",
      { class: "grid fixed" },
      columnGroup(),
      mk("thead", null, headerRows()),
      mk(
        "tbody",
        null,
        pageRows.map((v) =>
          mk(
            "tr",
            { "data-comm": v.commission_no },
            COLUMNS.map((c) =>
              mk(
                "td",
                { class: cellClass(c), "data-key": c.key, title: c.memo && !isEmpty(v[c.key]) ? v[c.key] : null },
                cellContent(c, v, terms, today)
              )
            )
          )
        )
      )
    );
    table.style.width = `${columnWidths.reduce((sum, w) => sum + w, 0)}px`;
    els.grid.replaceChildren(table);
  }

  els.pager.replaceChildren(
    mk(
      "span",
      null,
      tx("{n}건 중 {a}–{b}", {
        n: num(rows.length),
        a: num(rows.length ? from + 1 : 0),
        b: num(Math.min(rows.length, from + PAGE_SIZE)),
      })
    ),
    mk("button", { class: "btn sm", type: "button", disabled: view.page <= 1, "data-page": "-1" }, tx("‹ 이전")),
    mk("span", null, `${view.page} / ${totalPages}`),
    mk("button", { class: "btn sm", type: "button", disabled: view.page >= totalPages, "data-page": "1" }, tx("다음 ›"))
  );
}

// 검색어가 처음 나오는 칸이 보이도록 옮긴다. 입력할 때마다 표를 다시 그리므로 애니메이션 없이 바로 이동.
function scrollToMatch() {
  const wrap = els.grid;
  wrap.scrollTop = 0;
  const td = wrap.querySelector("tbody mark")?.closest("td");
  if (!td || td.classList.contains("sticky")) {
    wrap.scrollLeft = 0;
    return;
  }
  const stickyWidth = wrap.querySelector("thead th.sticky")?.offsetWidth ?? 0;
  wrap.scrollLeft = Math.max(0, td.offsetLeft - stickyWidth - 8);
}

// ---- 열 필터: 머리글 ▼ → 값 목록에서 체크로 고른다(값 검색 가능). 날짜 열은 연 → 월 묶음 ----

function closeColumnFilter() {
  document.getElementById("colfilter")?.remove();
  document.removeEventListener("mousedown", closeOnOutside);
}

function closeOnOutside(event) {
  if (!event.target.closest("#colfilter") && !event.target.closest(".cf")) closeColumnFilter();
}

function openColumnFilter(button, key) {
  closeColumnFilter();
  const column = COLUMNS.find((c) => c.key === key);
  if (!column) return;
  const today = baseDate();

  const counts = new Map();
  for (const v of vehicles) {
    const value = filterValue(v, key);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const values = [...counts.keys()].sort();
  if (key === "current_status") {
    const order = (value) => {
      const i = STAGE_ORDER.indexOf(value);
      return i < 0 ? 99 : i;
    };
    values.sort((a, b) => order(a) - order(b));
  }
  const checked = new Set(view.col[key] ?? values);
  const isDate = DATE_FILTER_COLUMNS.includes(key);

  const search = mk("input", {
    type: "text",
    placeholder: key === "type" ? tx("값 검색 (예: 2853)") : isDate ? tx("연·월 검색 (예: 2026-11)") : tx("값 검색"),
  });
  const list = mk("div", { class: "cf-list" });
  const shown = () => {
    const term = search.value.trim().toLowerCase();
    return values.filter((value) => !term || value.toLowerCase().includes(term));
  };
  const leaf = (value, cls, text, onChange) => {
    const box = mk("input", { type: "checkbox" });
    box.checked = checked.has(value);
    box.addEventListener("change", () => {
      if (box.checked) checked.add(value);
      else checked.delete(value);
      onChange?.();
    });
    return mk(
      "label",
      { class: cls },
      box,
      mk("span", null, text),
      mk("span", { class: "muted small" }, num(counts.get(value) ?? 0))
    );
  };
  const draw = () => {
    list.replaceChildren();
    if (!isDate) {
      for (const value of shown()) list.append(leaf(value, null, value === BLANK ? tx(BLANK) : value));
    } else {
      const byYear = new Map();
      for (const value of shown()) {
        const year = value === BLANK ? BLANK : value.slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(value);
      }
      for (const year of [...byYear.keys()].sort()) {
        const months = byYear.get(year);
        if (year === BLANK) {
          list.append(leaf(BLANK, null, tx(BLANK)));
          continue;
        }
        const yearBox = mk("input", { type: "checkbox" });
        const sync = () => {
          const n = months.filter((m) => checked.has(m)).length;
          yearBox.checked = n === months.length;
          yearBox.indeterminate = n > 0 && n < months.length;
        };
        yearBox.addEventListener("change", () => {
          for (const m of months) {
            if (yearBox.checked) checked.add(m);
            else checked.delete(m);
          }
          draw();
        });
        sync();
        list.append(
          mk(
            "label",
            { class: "yr" },
            yearBox,
            mk("span", null, tx("{y}년", { y: year })),
            mk("span", { class: "muted small" }, num(months.reduce((sum, m) => sum + (counts.get(m) ?? 0), 0)))
          )
        );
        for (const m of months) {
          const mon = MONTHS_EN[Number(m.slice(5, 7)) - 1] ?? m.slice(5);
          list.append(leaf(m, "mo", tx("{m}월", { m: m.slice(5), mon }), sync));
        }
      }
    }
    if (!list.childElementCount) list.append(mk("div", { class: "muted small" }, tx("일치하는 값이 없습니다.")));
  };
  search.addEventListener("input", draw);
  draw();

  // Shipping Calc 열만: 경과 배지가 있는 행만 보기(연·월 선택과 함께 적용)
  let delayedBox = null;
  let delayedRow = null;
  if (key === "shipping_calc") {
    delayedBox = mk("input", { type: "checkbox" });
    delayedBox.checked = view.delayed;
    delayedRow = mk(
      "label",
      {
        class: "cf-delayed",
        title: tx("Shipping Calc 경과 배지가 있는 행만 표시 (선적 전·후 모두) · 리드타임 재검토 후보"),
      },
      delayedBox,
      mk("span", null, tx("경과 배지 행만")),
      mk("span", { class: "muted small" }, num(vehicles.filter((v) => shipDelayDays(v, today) > 0).length))
    );
  }

  const apply = (clear) => {
    if (clear || checked.size >= values.length) delete view.col[key];
    else view.col[key] = new Set(checked);
    if (delayedBox) view.delayed = clear ? false : delayedBox.checked;
    view.page = 1;
    closeColumnFilter();
    renderGrid();
  };
  const tool = (label, action) => {
    const b = mk("button", { class: "btn sm", type: "button" }, label);
    b.addEventListener("click", action);
    return b;
  };
  const applyButton = tool(tx("적용"), () => apply(false));
  applyButton.classList.add("primary");

  const pop = mk(
    "div",
    { class: "colfilter", id: "colfilter" },
    mk(
      "div",
      { class: "cf-h" },
      mk("b", null, tx("{c} 열 필터", { c: tx(column.label) })),
      mk("button", { class: "x", type: "button", title: tx("닫기"), onclick: closeColumnFilter }, "×")
    ),
    delayedRow,
    search,
    mk(
      "div",
      { class: "cf-tools" },
      tool(tx("표시된 값 전체 선택"), () => {
        for (const value of shown()) checked.add(value);
        draw();
      }),
      tool(tx("표시된 값 해제"), () => {
        for (const value of shown()) checked.delete(value);
        draw();
      })
    ),
    list,
    mk("div", { class: "cf-foot" }, tool(tx("필터 해제"), () => apply(true)), applyButton)
  );
  // 버튼 바로 아래에 띄운다. 화면 오른쪽을 넘지 않게 한다.
  const rect = button.getBoundingClientRect();
  pop.style.top = `${rect.bottom + 4}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 296))}px`;
  document.body.append(pop);
  search.focus();
  setTimeout(() => document.addEventListener("mousedown", closeOnOutside), 0);
}

// 바로가기: 고정된 Commission No 열 너비만큼 띄워 대상 열이 가려지지 않게 한다.
function jumpTo(key) {
  const wrap = els.grid;
  const target = key === "current_status" ? null : wrap.querySelector(`thead th[data-sort="${key}"]`);
  const sticky = wrap.querySelector("thead th.sticky");
  const left = target ? Math.max(0, target.offsetLeft - (sticky?.offsetWidth ?? 0) - 8) : 0;
  wrap.scrollTo({ left, behavior: "smooth" });
}

function buildScreen(root, meta) {
  const search = mk("input", {
    id: "lgSearch",
    class: "lg-search",
    placeholder: tx(SEARCH_HINT),
    title: tx(SEARCH_HINT),
    value: view.q,
  });
  search.addEventListener("input", () => {
    view.q = search.value;
    view.page = 1;
    renderGrid();
    scrollToMatch();
  });

  const reset = mk("button", { class: "btn sm", type: "button" }, tx("초기화"));
  reset.addEventListener("click", () => {
    Object.assign(view, { q: "", col: {}, delayed: false, page: 1 });
    search.value = "";
    closeColumnFilter();
    renderGrid();
  });

  const reload = mk("button", { class: "btn sm", type: "button" }, tx("새로 고침"));
  reload.addEventListener("click", () => load(root, true));

  els = {
    count: mk("span", { class: "muted small" }),
    grid: mk("div", { class: "grid-wrap" }),
    pager: mk("div", { class: "pager" }),
  };

  // 머리글 클릭: ▼ 는 열 필터, 그 외는 정렬
  els.grid.addEventListener("click", (event) => {
    const filter = event.target.closest("button.cf");
    if (filter) {
      openColumnFilter(filter, filter.dataset.filter);
      return;
    }
    // 행 클릭: 차량 상세
    const row = event.target.closest("tbody tr[data-comm]");
    if (row) {
      const vehicle = vehicles.find((v) => v.commission_no === row.dataset.comm);
      if (vehicle) openVehicle(vehicle, { onSaved: renderGrid });
      return;
    }
    // 정렬은 배지가 있는 둘째 줄에서만. 열 이름 줄은 눌러도 바뀌지 않는다.
    const th = event.target.closest("tr.sub th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (view.sort === key) view.dir *= -1;
    else Object.assign(view, { sort: key, dir: 1 });
    renderGrid();
  });
  els.pager.addEventListener("click", (event) => {
    const step = Number(event.target.closest("button[data-page]")?.dataset.page);
    if (!step) return;
    view.page += step;
    renderGrid();
    els.grid.scrollTop = 0;
  });

  const jumps = mk(
    "div",
    { class: "grp-nav" },
    `${tx("바로가기")}: `,
    GRID_JUMPS.map((key) => {
      const label = COLUMNS.find((c) => c.key === key)?.label ?? key;
      const button = mk("button", { type: "button", title: `${label} 열로 이동` }, label);
      button.addEventListener("click", () => jumpTo(key));
      return button;
    }),
    mk("span", { class: "muted" }, tx("· 열 {n}개 · 가로 스크롤 · Comm No. 고정", { n: COLUMNS.length }))
  );

  const mismatch =
    meta.onlyAfab || meta.onlyMain
      ? mk(
          "p",
          { class: "error small" },
          `두 List 의 차량이 맞지 않습니다 — AFAB 에만 ${meta.onlyAfab}건, Main 에만 ${meta.onlyMain}건`
        )
      : null;

  root.replaceChildren(
    mk(
      "div",
      { class: "card" },
      mk(
        "div",
        { class: "card-h" },
        mk("h2", null, tx("Logistics 차량 마스터")),
        mk("div", { class: "filters" }, mk("label", null, tx("검색"), " ", search), reset, reload, els.count)
      ),
      mismatch,
      jumps,
      els.grid,
      els.pager
    )
  );
  // 화면에 붙은 뒤에 재야 실제 글꼴과 스타일이 적용된다.
  columnWidths = measureColumnWidths();
  renderGrid();
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
    vehicles = data.vehicles;
    // 불러오는 동안 다른 화면으로 옮겨 갔으면 그리지 않는다.
    if (!root.isConnected) return;
    buildScreen(root, data);
  } catch (err) {
    console.error(err);
    if (!root.isConnected) return;
    message(root, `${tx("차량 데이터를 불러오지 못했습니다.")} ${err.status ?? ""} ${err.message ?? ""}`, true, () =>
      load(root, true)
    );
  }
}

// 다른 화면으로 옮겨 가면 열려 있던 열 필터를 닫는다.
window.addEventListener("hashchange", closeColumnFilter);

export const logisticsPage = {
  render(root, params) {
    closeColumnFilter();
    // 다른 화면의 링크가 넘겨주는 조건: ?q= 검색어, ?stage= 상태(쉼표로 여러 개),
    // ?열이름= 열 필터 값(쉼표로 여러 개, 빈 문자열은 빈 칸), ?comm= Commission No 목록, ?delayed=1 경과 배지 행만
    const q = params.get("q");
    if (q != null) Object.assign(view, { q, page: 1 });
    const presets = {};
    const stage = params.get("stage");
    if (stage) presets.current_status = new Set(stage.split(","));
    for (const key of FILTER_COLUMNS) {
      const value = params.get(key);
      if (value != null) presets[key] = new Set(value.split(",").map((x) => (x === "" ? BLANK : x)));
    }
    // ?comm= Commission No 목록(쉼표 구분). 열 필터 조합으로 나타낼 수 없는 묶음을 그대로 넘길 때 쓴다
    const commissions = params.get("comm");
    if (commissions) presets.commission_no = new Set(commissions.split(","));
    if (Object.keys(presets).length || params.has("delayed")) {
      // 링크가 건 조건만 적용되도록, 주소에 없는 이전 검색어는 지운다
      Object.assign(view, { q: q ?? "", col: presets, delayed: params.get("delayed") === "1", page: 1 });
    }
    // 이 화면만의 상자를 두어, 화면이 바뀌면(상자가 떨어져 나가면) 늦게 도착한 결과를 버린다.
    const box = mk("div");
    root.append(box);
    load(box, false);
  },
};
