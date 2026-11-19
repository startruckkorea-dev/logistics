// Logistics 차량 마스터 — Commission No 기준 1행, 전체 열을 보여주는 그리드(읽기 전용).
// 검색, 정렬, 50행 페이지, Commission No 열 고정, 바로가기.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { diffDays, todayIso } from "../domain/dates.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import {
  COLUMNS, GRID_JUMPS, SEARCH_COLUMNS, sourceBadge, stageClass,
} from "../data/columns.js";

const PAGE_SIZE = 50;
const SEARCH_HINT = "Comm(여러 개는 쉼표 구분) / VIN / B/L / Vessel / Type / Order·Option Note";

// 화면 상태. 다른 화면에 다녀와도 검색어와 정렬은 유지한다.
const view = { q: "", sort: "commission_no", dir: -1, page: 1 };
let vehicles = [];
let els = {};

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

function filteredRows() {
  const terms = searchTerms();
  const rows = terms.length
    ? vehicles.filter((v) =>
        terms.some((term) =>
          SEARCH_COLUMNS.some((key) => !isEmpty(v[key]) && String(v[key]).toLowerCase().includes(term))
        )
      )
    : [...vehicles];
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
      return [
        isEmpty(value) ? dim() : value,
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

function headerRows() {
  const sortMark = (key) =>
    view.sort === key ? mk("span", { class: "sort" }, view.dir > 0 ? "▲" : "▼") : null;
  const badge = (src) => {
    const b = sourceBadge(src);
    return mk("span", { class: `badge ${b.cls}`, title: b.tip }, tx(src));
  };
  const th = (column, children) =>
    mk(
      "th",
      { class: column.key === "commission_no" ? "sticky" : null, "data-sort": column.key, title: column.key },
      children
    );
  return [
    mk("tr", { class: "fld" }, COLUMNS.map((c) => th(c, tx(c.label)))),
    mk("tr", { class: "sub" }, COLUMNS.map((c) => th(c, [badge(c.src), sortMark(c.key)]))),
  ];
}

function renderGrid() {
  const rows = filteredRows();
  const terms = searchTerms();
  const today = todayIso();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  view.page = Math.min(Math.max(1, view.page), totalPages);
  const from = (view.page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(from, from + PAGE_SIZE);

  els.count.textContent = tx("{n}건 / 전체 {m}", { n: num(rows.length), m: num(vehicles.length) });

  if (!rows.length) {
    els.grid.replaceChildren(mk("div", { class: "muted empty-msg" }, tx("조건에 맞는 차량이 없습니다.")));
  } else {
    const table = mk(
      "table",
      { class: "grid" },
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
  });

  const reset = mk("button", { class: "btn sm", type: "button" }, tx("초기화"));
  reset.addEventListener("click", () => {
    Object.assign(view, { q: "", page: 1 });
    search.value = "";
    renderGrid();
  });

  const reload = mk("button", { class: "btn sm", type: "button" }, tx("새로 고침"));
  reload.addEventListener("click", () => load(root, true));

  els = {
    count: mk("span", { class: "muted small" }),
    grid: mk("div", { class: "grid-wrap" }),
    pager: mk("div", { class: "pager" }),
  };

  // 정렬: 머리글 클릭
  els.grid.addEventListener("click", (event) => {
    const th = event.target.closest("th[data-sort]");
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

export const logisticsPage = {
  render(root, params) {
    const q = params.get("q");
    if (q != null) Object.assign(view, { q, page: 1 });
    // 이 화면만의 상자를 두어, 화면이 바뀌면(상자가 떨어져 나가면) 늦게 도착한 결과를 버린다.
    const box = mk("div");
    root.append(box);
    load(box, false);
  },
};
