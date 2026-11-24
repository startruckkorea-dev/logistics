// Logistics 차량 마스터 — Commission No 기준 1행, 전체 열을 보여주는 그리드.
// 검색, 열 필터, 정렬, 50행 페이지, Commission No 열 고정, 바로가기, 편집 모드(입력 열).
import { cssZoom, mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { diffDays, monthOf } from "../domain/dates.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { loadVehicles } from "../data/vehicles.js";
import { changeabilityDday } from "../data/derive.js";
import { toast } from "../app/ui.js";
import { openVehicle } from "./vehicle-drawer.js";
import {
  edit, isEditableCell, isPending, shownRow, pendingCount, startCellEdit, openNoteEditor, closeNoteEditor,
  finishEdit, cancelEdit,
} from "./logistics-edit.js";
import { openBulkInput } from "./logistics-bulk.js";
import { openOrderCreate, openOrderChange } from "./logistics-order.js";
import { renderAfabTab } from "./logistics-afab.js";
import { renderCustomsTab } from "./logistics-customs.js";
import { renderInsuranceTab } from "./logistics-insurance.js";
import {
  COLUMNS, GRID_JUMPS, SEARCH_COLUMNS, FILTER_COLUMNS, DATE_FILTER_COLUMNS, PRESENCE_FILTER_COLUMNS, VALUE_ORDERS,
  sourceBadge, stageClass,
} from "../data/columns.js";

const PAGE_SIZE = 50;
const MEMO_WIDTH = 330; // 긴 글 열(Tires · Option Note · Order Note)의 고정 너비(px). 넘치면 말줄임
const WIDTH_SAMPLES = 5; // 열 너비를 잴 때 열마다 쓰는 가장 긴 값의 수
const KEYIN_MIN_WIDTH = 150;
const CHECK_WIDTH = 24; // 편집 모드에서 Commission No 열에 더하는 너비(px). 행 선택 체크박스 자리 // 셀 안에서 입력하는 열의 최소 너비(px). 날짜·월 선택 칸이 들어갈 만큼
// 잰 열 너비의 조정. SCALE 은 줄이는 비율(머리글이 들어가는 너비보다 좁아지지는 않는다), PAD 는 더하는 여백(px)
const WIDTH_SCALE = { engine_no: 0.6, co: 0.6, sales_month: 0.9, model_in_afab: 0.9, b1_factory_order: 0.9 };
const WIDTH_PAD = { vin_no: 12, bm: 12 };
const DELAY_BADGE_ROOM = "D+888"; // Shipping Calc 열 너비를 잴 때 넣어 보는 가장 긴 경과 배지
const DDAY_WITHIN = 30; // Changeability Date 가 이 일수 안으로 다가오면 D-day 배지를 붙인다
const SEARCH_HINT = "전체 열 검색 (여러 개는 쉼표 구분) · Current Status · 날짜 열 제외";

const BLANK = "(빈 값)"; // 열 필터에서 빈 칸을 가리키는 값
const FILLED = "(값 있음)"; // 값 목록을 두지 않는 열의 필터에서 빈 칸이 아닌 행을 가리키는 값
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 화면 상태. 다른 화면에 다녀와도 검색어와 정렬은 유지한다.
//   col     : 열 필터 { 열 key: Set(선택한 값) }. 없는 열은 전체
//   delayed : Shipping Calc 경과 배지가 있는 행만
//   hidden  : 숨긴 열의 key. Commission No 는 숨길 수 없다
const view = { q: "", col: {}, delayed: false, sort: "commission_no", dir: -1, page: 1, hidden: new Set() };
let vehicles = [];
let els = {};
let columnWidths = []; // 열마다 고정한 너비(px). 페이지·검색·필터가 바뀌어도 그대로다

// 숨긴 열은 이 브라우저에 기억한다(열 key 목록만. 데이터 값은 넣지 않는다).
// 저장소를 쓸 수 없는 환경(차단, 시크릿 창의 제한)에서는 기억하지 않고 그대로 동작한다.
const HIDDEN_STORE_KEY = "logistics.grid.hiddenColumns";
function loadHiddenColumns() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(HIDDEN_STORE_KEY) ?? "[]");
    const known = new Set(COLUMNS.map((c) => c.key));
    // 지금 있는 열만 받는다. Commission No 는 숨길 수 없다
    return Array.isArray(saved) ? saved.filter((key) => known.has(key) && key !== "commission_no") : [];
  } catch {
    return [];
  }
}
function saveHiddenColumns() {
  try {
    if (view.hidden.size) window.localStorage.setItem(HIDDEN_STORE_KEY, JSON.stringify([...view.hidden]));
    else window.localStorage.removeItem(HIDDEN_STORE_KEY);
  } catch {
    // 저장하지 못해도 화면은 그대로 쓴다
  }
}
for (const key of loadHiddenColumns()) view.hidden.add(key);

// 화면에 그리는 열(숨긴 열 제외)
const shownColumns = () => COLUMNS.filter((c) => !view.hidden.has(c.key));

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
// 값 목록을 두지 않는 열은 값이 있는지만 본다.
function filterValue(v, key) {
  const value = v[key];
  if (isEmpty(value)) return BLANK;
  if (PRESENCE_FILTER_COLUMNS.includes(key)) return FILLED;
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
  // 순서를 정해 둔 열(Current Status, Vehicle)은 글자 순이 아니라 그 순서로 정렬한다(목록에 없는 값은 뒤에 글자 순)
  const order = VALUE_ORDERS[key];
  const rank = (value) => {
    const i = order.indexOf(value);
    return i < 0 ? order.length : i;
  };
  rows.sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return 0;
    if (isEmpty(x)) return 1; // 빈 값은 방향과 관계없이 뒤로
    if (isEmpty(y)) return -1;
    if (order && rank(x) !== rank(y)) return (rank(x) - rank(y)) * dir;
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
        // 배지는 칸 오른쪽의 신호등 점 바로 옆에 붙인다
        dday != null && dday <= DDAY_WITHIN ? [" ", mk("span", { class: "pill warn dday" }, `D-${dday}`)] : null,
        dotClass ? mk("span", { class: `dot r ${dotClass}`, title: `AFAB 수정 가능(Ä): ${v.afab_editable}` }) : null,
      ];
    }
    case "pm":
      // 연월일로 저장하고 월까지만 보여준다
      return [isEmpty(value) ? dim() : monthOf(String(value))];
    case "color_code":
      return isEmpty(value) ? [dim()] : [mk("span", { title: v.color_name ?? "" }, highlight(value, terms))];
    case "shipping_calc": {
      if (isEmpty(value)) return [dim()];
      const days = shipDelayDays(v, today);
      if (days <= 0) return [value];
      const tip = v.shipping
        ? tx("Shipping {s} · 실적 PM~Shipping {m}일 (계획 {p}일, 초과 {n}일)", {
            s: v.shipping,
            m: diffDays(v.shipping, `${monthOf(v.pm)}-01`) ?? "-",
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

// v 를 넘기면 편집 모드 표시(입력할 수 있는 칸, 저장 대기 칸)를 더한다.
function cellClass(column, v) {
  return [
    column.key === "commission_no" ? "sticky" : "",
    column.memo ? "memo" : "",
    column.key === "type" || column.key === "changeability_date" ? "dotcell" : "",
    v && isEditableCell(column.key) ? "keyin" : "",
    v && isPending(v, column.key) ? "pend" : "",
  ]
    .filter(Boolean)
    .join(" ") || null;
}

// 긴 열 이름은 가운데에 가장 가까운 띄어쓰기에서 두 줄로 나눈다(열이 이름 길이만큼 넓어지지 않게).
const NAME_WRAP_FROM = 9; // 이 글자 수부터 나눈다
// 이름이 길어도 한 줄로 두는 열
const ONE_LINE_NAMES = new Set([
  "commission_no", "current_status", "changeability_date", "model_in_afab", "engine_no", "import_license",
  "option_note", "order_note", "model_classification",
]);
function nameLines(column) {
  const label = tx(column.label);
  if (ONE_LINE_NAMES.has(column.key) || label.length < NAME_WRAP_FROM || !label.includes(" ")) return [label];
  const middle = label.length / 2;
  let cut = -1;
  for (let i = label.indexOf(" "); i >= 0; i = label.indexOf(" ", i + 1)) {
    if (cut < 0 || Math.abs(i - middle) < Math.abs(cut - middle)) cut = i;
  }
  return [label.slice(0, cut), label.slice(cut + 1)];
}

// 머리글은 한 줄이다: 출처 색 점 · 열 이름 · 정렬 버튼 · 필터 버튼.
// forMeasure: 너비를 잴 때는 편집 모드의 전체 선택 체크박스를 넣지 않는다(그 자리는 CHECK_WIDTH 로 더한다).
function headerRows(forMeasure = false) {
  const sourceDot = (src) => {
    const b = sourceBadge(src);
    return mk("span", { class: `src-dot ${b.cls}`, title: `${tx(src)} · ${b.tip}` });
  };
  // 정렬은 이 버튼으로만 한다. 열 이름을 눌러도 순서가 바뀌지 않는다.
  const sortButton = (column) =>
    mk(
      "button",
      {
        class: `sortbtn ${view.sort === column.key ? "on" : ""}`,
        type: "button",
        title: tx("{c} 열 정렬", { c: tx(column.label) }),
      },
      view.sort === column.key ? (view.dir > 0 ? "▲" : "▼") : "⇅"
    );
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
  // 편집 모드: 현재 페이지의 행을 모두 선택하는 체크박스
  const selectAll = (column) =>
    !forMeasure && edit.on && column.key === "commission_no"
      ? mk("input", { type: "checkbox", id: "selAll", title: tx("현재 페이지 전체 선택") })
      : null;
  const th = (column) =>
    mk(
      "th",
      { class: column.key === "commission_no" ? "sticky" : null, "data-sort": column.key, title: column.key },
      mk(
        "div",
        { class: "th-in" },
        selectAll(column),
        sourceDot(column.src),
        mk("span", { class: "th-name" }, nameLines(column).map((line) => mk("span", null, line))),
        sortButton(column),
        filterButton(column)
      )
    );
  // 너비는 숨긴 열까지 모두 잰다(다시 켰을 때 바로 쓴다)
  return [mk("tr", { class: "fld" }, (forMeasure ? COLUMNS : shownColumns()).map(th))];
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
  // Shipping Calc 의 경과 배지는 날마다 늘어난다. 세 자리 일수(D+888)까지 들어가는 너비를 미리 잡아 둔다.
  const roomRow = mk(
    "tr",
    null,
    COLUMNS.map((c) =>
      mk(
        "td",
        { class: cellClass(c) },
        c.key === "shipping_calc" ? ["8888-88-88", " ", mk("span", { class: "pill danger" }, DELAY_BADGE_ROOM)] : null
      )
    )
  );
  const table = mk(
    "table",
    { class: "grid measure" },
    mk("thead", null, headerRows(true)),
    mk("tbody", null, sampleRows, roomRow)
  );
  els.grid.append(table);
  // 화면 배율(CSS zoom)이 걸려 있으면 잰 값이 배율만큼 줄어서 나온다. 열 너비는 배율 전 크기로 넣어야 하므로 되돌린다.
  const scale = table.offsetWidth ? table.getBoundingClientRect().width / table.offsetWidth : 1;
  const widths = [...table.querySelectorAll("thead tr.fld th")].map((th, i) => {
    const width = Math.ceil(th.getBoundingClientRect().width / scale) + 1;
    if (COLUMNS[i].memo) return MEMO_WIDTH;
    const { key, src } = COLUMNS[i];
    const base = src === "입력" ? Math.max(width, KEYIN_MIN_WIDTH) : width;
    if (!WIDTH_SCALE[key]) return base + (WIDTH_PAD[key] ?? 0);
    // 줄이는 열: 머리글(색 점 · 이름 · 버튼)이 들어가는 너비까지만 줄인다
    const inner = th.querySelector(".th-in");
    const style = getComputedStyle(th);
    const head =
      (inner.lastElementChild.getBoundingClientRect().right - inner.firstElementChild.getBoundingClientRect().left) / scale +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight);
    return Math.max(Math.round(base * WIDTH_SCALE[key]), Math.ceil(head) + 2);
  });
  table.remove();
  return widths;
}

// 지금 그리는 열의 너비. 편집 모드에서는 첫 열에 체크박스 자리를 더한다.
const currentWidths = () =>
  COLUMNS.map((c, i) => ({ c, width: columnWidths[i] + (edit.on && i === 0 ? CHECK_WIDTH : 0) }))
    .filter(({ c }) => !view.hidden.has(c.key))
    .map(({ width }) => width);

function columnGroup() {
  return mk(
    "colgroup",
    null,
    currentWidths().map((width) => {
      const col = mk("col");
      col.style.width = `${width}px`;
      return col;
    })
  );
}

// 칸 하나의 속성과 내용. 저장 대기 값이 있으면 그 값을 보여준다.
function fillCell(td, column, v, terms, today) {
  const shown = shownRow(v);
  const value = shown[column.key];
  td.className = cellClass(column, v) ?? "";
  td.title = isEditableCell(column.key)
    ? tx("클릭하여 입력 · 편집 종료 시 저장")
    : edit.on && column.key === "commission_no"
      ? tx("클릭하여 행 선택 (일괄 입력 대상)")
      : column.memo && !isEmpty(value)
        ? value
        : "";
  if (!td.title) td.removeAttribute("title");
  td.replaceChildren(...cellContent(column, shown, terms, today).flat(Infinity).filter((n) => n != null));
  // 편집 모드: 행 선택 체크박스
  if (edit.on && column.key === "commission_no") {
    const box = mk("input", { type: "checkbox", class: "rowsel" });
    box.checked = edit.selected.has(v.commission_no);
    td.prepend(box);
  }
  return td;
}

// 머리글의 전체 선택 체크박스를 현재 선택 상태에 맞춘다
function syncSelectAll() {
  const all = els.grid.querySelector("#selAll");
  if (!all) return;
  const boxes = [...els.grid.querySelectorAll("tbody input.rowsel")];
  const checked = boxes.filter((box) => box.checked).length;
  all.checked = boxes.length > 0 && checked === boxes.length;
  all.indeterminate = checked > 0 && checked < boxes.length;
}

// 편집 모드 표시줄과 편집 버튼
function renderEditState() {
  const { editButton, createButton, reloadButton, editbar } = els;
  // 오더 생성은 편집 모드 밖에서 한다(편집 중에는 저장 대기와 섞이지 않게)
  createButton.disabled = edit.on;
  editButton.textContent = edit.saving ? tx("저장 중...") : edit.on ? tx("편집 종료") : tx("편집");
  editButton.classList.toggle("primary", edit.on);
  editButton.disabled = edit.saving;
  editButton.title = edit.on ? tx("변경 내용을 저장하고 편집을 종료합니다") : tx("입력 열을 셀에서 바로 고칩니다");
  // 편집 중에 다시 불러오면 저장 대기와 화면이 어긋난다
  reloadButton.disabled = edit.on;
  editbar.hidden = !edit.on;
  if (!edit.on) return;
  editbar.replaceChildren(
    mk("b", null, tx("편집 모드")),
    mk("span", { class: "muted small" }, tx("입력 열: {cols} · 셀을 눌러 입력 (Note 는 여러 줄 창)", {
      cols: COLUMNS.filter((c) => c.src === "입력").map((c) => tx(c.label)).join(" · "),
    })),
    mk("span", { class: "muted small" }, tx("· 저장 대기 {n}건 → '편집 종료' 시 저장·변경 이력 기록", { n: num(pendingCount()) })),
    mk("span", null, tx("· 선택 {n}대", { n: num(edit.selected.size) })),
    mk(
      "button",
      {
        class: "btn sm primary",
        type: "button",
        disabled: edit.saving || edit.selected.size === 0,
        title: tx("체크한 행의 입력 열에 같은 값을 넣습니다"),
        onclick: () =>
          openBulkInput(vehicles.filter((v) => edit.selected.has(v.commission_no)), { render: renderGrid }),
      },
      tx("일괄 입력")
    ),
    mk(
      "button",
      {
        class: "btn sm",
        type: "button",
        disabled: edit.saving || edit.selected.size === 0,
        title: tx("체크한 오더의 모델·Original PM 을 바꿉니다 (Ordered(Dummy)·Ordered(Changeable) 만)"),
        onclick: () =>
          openOrderChange(vehicles.filter((v) => edit.selected.has(v.commission_no)), { render: renderGrid }),
      },
      tx("오더 변경")
    ),
    mk(
      "button",
      {
        class: "btn sm",
        type: "button",
        disabled: edit.saving,
        title: tx("저장하지 않고 편집을 끝냅니다"),
        onclick: () => cancelEdit({ render: renderGrid }),
      },
      tx("변경 취소")
    )
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
  // 선택은 화면에 보이는 행에만 남긴다. 검색·필터·정렬·페이지가 바뀌어 사라진 행은 선택에서 뺀다.
  const onPage = new Set(pageRows.map((v) => v.commission_no));
  for (const comm of edit.selected) if (!onPage.has(comm)) edit.selected.delete(comm);
  renderEditState();
  els.columnsButton.textContent = view.hidden.size
    ? tx("열 설정 (숨김 {n})", { n: num(view.hidden.size) })
    : tx("열 설정");

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
            { "data-comm": v.commission_no, class: edit.selected.has(v.commission_no) ? "sel" : null },
            shownColumns().map((c) => fillCell(mk("td", { "data-key": c.key }), c, v, terms, today))
          )
        )
      )
    );
    table.style.width = `${currentWidths().reduce((sum, w) => sum + w, 0)}px`;
    els.grid.replaceChildren(table);
    syncSelectAll();
    // 범위 선택은 화면에 보이는 행에만 남긴다(페이지·검색·정렬이 바뀌면 시작 칸도 다시 잡는다)
    for (const comm of range.set) if (!onPage.has(comm)) range.set.delete(comm);
    if (!onPage.has(range.anchor)) range.anchor = "";
    paintRange();
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
  // 순서를 정해 둔 열은 그 순서로 나열한다. 목록에 없는 값과 빈 값은 뒤에 둔다(앞의 글자 순 유지)
  const valueOrder = VALUE_ORDERS[key];
  if (valueOrder) {
    const order = (value) => {
      const i = valueOrder.indexOf(value);
      return i < 0 ? valueOrder.length : i;
    };
    values.sort((a, b) => order(a) - order(b));
  }
  const isDate = DATE_FILTER_COLUMNS.includes(key);
  // 값 있음 / 빈 값만 고르는 열: 값 검색과 전체 선택 도구를 두지 않는다
  const isPresence = PRESENCE_FILTER_COLUMNS.includes(key);
  if (isPresence) values.sort((a, b) => (a === FILLED ? -1 : 1) - (b === FILLED ? -1 : 1));
  const checked = new Set(view.col[key] ?? values);

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
      for (const value of shown()) {
        list.append(leaf(value, null, value === BLANK || (isPresence && value === FILLED) ? tx(value) : value));
      }
    } else {
      const byYear = new Map();
      for (const value of shown()) {
        const year = value === BLANK ? BLANK : value.slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(value);
      }
      // 빈 값을 맨 위에 두고, 연도는 최신부터
      const years = [...byYear.keys()].sort((a, b) => (a === BLANK ? -1 : b === BLANK ? 1 : b.localeCompare(a)));
      for (const year of years) {
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
    isPresence ? null : search,
    isPresence
      ? null
      : mk(
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
  document.body.append(pop);
  const zoom = cssZoom(pop);
  pop.style.top = `${(rect.bottom + 4) / zoom}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 296 * zoom)) / zoom}px`;
  if (!isPresence) search.focus();
  setTimeout(() => document.addEventListener("mousedown", closeOnOutside), 0);
}

// ---- 열 설정: 열을 골라 숨긴다. 열 필터와 같은 상자를 쓴다 ----
function openColumnSettings(button) {
  const wasOpen = document.getElementById("colfilter")?.dataset.kind === "columns";
  closeColumnFilter();
  if (wasOpen) return;
  const list = mk("div", { class: "cf-list" });
  const draw = () =>
    list.replaceChildren(
      ...COLUMNS.filter((c) => c.key !== "commission_no").map((c) => {
        const box = mk("input", { type: "checkbox" });
        box.checked = !view.hidden.has(c.key);
        box.addEventListener("change", () => {
          if (box.checked) view.hidden.delete(c.key);
          else view.hidden.add(c.key);
          saveHiddenColumns();
          renderGrid();
        });
        return mk("label", null, box, mk("span", null, tx(c.label)));
      })
    );
  draw();
  const tool = (label, action) => mk("button", { class: "btn sm", type: "button", onclick: action }, label);
  const pop = mk(
    "div",
    { class: "colfilter", id: "colfilter", "data-kind": "columns" },
    mk(
      "div",
      { class: "cf-h" },
      mk("b", null, tx("열 설정")),
      mk("span", { class: "muted small" }, tx("체크를 풀면 숨김")),
      mk("button", { class: "x", type: "button", title: tx("닫기"), onclick: closeColumnFilter }, "×")
    ),
    mk(
      "div",
      { class: "cf-tools" },
      tool(tx("전체 표시"), () => {
        view.hidden.clear();
        saveHiddenColumns();
        draw();
        renderGrid();
      })
    ),
    list
  );
  const rect = button.getBoundingClientRect();
  document.body.append(pop);
  const zoom = cssZoom(pop);
  pop.style.top = `${(rect.bottom + 4) / zoom}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 296 * zoom)) / zoom}px`;
  setTimeout(() => document.addEventListener("mousedown", closeOnOutside), 0);
}

// ---- Commission No 열 범위 선택 · 복사 ----
// 칸을 누른 채 끌거나 Shift+클릭하면 현재 페이지 안에서 범위가 잡히고, Ctrl+C 로 한 줄에 하나씩 복사한다.
// 검색창에 붙여넣으면 여러 건을 한 번에 찾는다. 그냥 클릭은 원래 동작(차량 상세, 편집 모드는 행 선택) 그대로다.
const range = { set: new Set(), anchor: "" };
const drag = { on: false, moved: false, anchor: "" };

const pageOrder = () => [...els.grid.querySelectorAll("tbody tr[data-comm]")].map((tr) => tr.dataset.comm);

function paintRange() {
  for (const tr of els.grid.querySelectorAll("tbody tr[data-comm]")) {
    tr.querySelector('td[data-key="commission_no"]')?.classList.toggle("rsel", range.set.has(tr.dataset.comm));
  }
}

function setRange(from, to) {
  const order = pageOrder();
  const i = order.indexOf(from);
  const j = order.indexOf(to);
  if (i < 0 || j < 0) return;
  range.set = new Set(order.slice(Math.min(i, j), Math.max(i, j) + 1));
  paintRange();
}

function clearRange() {
  if (!range.set.size && !range.anchor) return;
  range.set = new Set();
  range.anchor = "";
  if (els.grid?.isConnected) paintRange();
}

const commCell = (target) => target.closest?.('tbody td[data-key="commission_no"]');
const gridShown = () => Boolean(els.grid?.isConnected);

document.addEventListener("mouseup", () => {
  drag.on = false;
  // 끌기를 끝내는 클릭이 지나간 뒤에 푼다(표 밖에서 끝내도 다음 클릭을 삼키지 않게)
  setTimeout(() => {
    drag.moved = false;
  }, 0);
});
document.addEventListener("mousedown", (event) => {
  if (gridShown() && range.set.size && !commCell(event.target)) clearRange();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && gridShown()) clearRange();
});
document.addEventListener("copy", (event) => {
  if (!gridShown() || !range.set.size) return;
  // 입력칸에서 글자를 복사하는 중이면 건드리지 않는다
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const values = pageOrder().filter((comm) => range.set.has(comm));
  if (!values.length) return;
  event.clipboardData.setData("text/plain", values.join("\r\n"));
  event.preventDefault();
  toast(
    tx("Commission No {n}칸 복사", { n: num(values.length) }),
    tx("한 줄에 하나씩 복사됨 · 검색창에 붙여넣으면 여러 건을 한 번에 조회")
  );
});

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

  // 여러 줄(엑셀 열, Commission No 범위 복사)을 붙여넣으면 줄마다 쉼표로 이어 여러 건 검색이 되게 한다
  search.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    const joined = text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean).join(", ");
    search.setRangeText(joined, search.selectionStart, search.selectionEnd, "end");
    search.dispatchEvent(new Event("input"));
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

  // 편집: 입력 열을 셀에서 고친다. 다시 누르면(편집 종료) 저장한다.
  const editButton = mk("button", { class: "btn sm", type: "button" });
  editButton.addEventListener("click", () => {
    if (!edit.on) {
      edit.on = true;
      closeColumnFilter();
      renderGrid();
      return;
    }
    finishEdit(vehicles, {
      render: renderGrid,
      progress: (done, total) => {
        editButton.textContent = `${tx("저장 중...")} ${num(done)}/${num(total)}`;
      },
    });
  });

  // 열 설정: 숨길 열을 고른다. 편집 모드와 관계없이 쓸 수 있다
  const columnsButton = mk("button", { class: "btn sm cf", type: "button", title: tx("열 표시/숨김") }, tx("열 설정"));
  columnsButton.addEventListener("click", () => openColumnSettings(columnsButton));

  const createButton = mk("button", { class: "btn sm", type: "button" }, tx("오더 생성"));
  createButton.addEventListener("click", () => openOrderCreate(vehicles, { render: renderGrid }));

  els = {
    editButton,
    createButton,
    columnsButton,
    reloadButton: reload,
    editbar: mk("div", { class: "editbar", hidden: true }),
    count: mk("span", { class: "muted small" }),
    grid: mk("div", { class: "grid-wrap" }),
    pager: mk("div", { class: "pager" }),
  };

  // Commission No 칸을 누른 채 끌면 범위 선택
  els.grid.addEventListener("mousedown", (event) => {
    const td = commCell(event.target);
    if (!td || event.button !== 0 || event.target.tagName === "INPUT") return;
    event.preventDefault(); // 글자가 끌려 선택되지 않게
    Object.assign(drag, { on: true, moved: false, anchor: td.closest("tr").dataset.comm });
  });
  els.grid.addEventListener("mouseover", (event) => {
    const td = drag.on && commCell(event.target);
    if (!td) return;
    const comm = td.closest("tr").dataset.comm;
    if (!drag.moved && comm === drag.anchor) return;
    drag.moved = true;
    range.anchor = drag.anchor;
    setRange(drag.anchor, comm);
  });

  // 머리글 클릭: ▼ 는 열 필터, 그 외는 정렬
  els.grid.addEventListener("click", (event) => {
    // 끌기를 끝내는 클릭은 범위 선택으로 끝낸다(차량 상세를 열지 않는다)
    if (drag.moved) {
      drag.moved = false;
      return;
    }
    const rangeCell = commCell(event.target);
    if (rangeCell && event.shiftKey && event.target.tagName !== "INPUT") {
      const comm = rangeCell.closest("tr").dataset.comm;
      if (!range.anchor) range.anchor = comm;
      setRange(range.anchor, comm);
      return;
    }
    if (rangeCell) clearRange();
    const filter = event.target.closest("button.cf");
    if (filter) {
      openColumnFilter(filter, filter.dataset.filter);
      return;
    }
    // 편집 모드의 행 선택. 머리글 체크박스는 현재 페이지 전체를 고르거나 푼다.
    if (event.target.id === "selAll") {
      for (const box of els.grid.querySelectorAll("tbody input.rowsel")) {
        const comm = box.closest("tr").dataset.comm;
        if (event.target.checked) edit.selected.add(comm);
        else edit.selected.delete(comm);
      }
      renderGrid();
      return;
    }
    // 체크박스를 누르거나, Commission No 칸의 다른 곳을 눌러도 그 행을 고르거나 푼다.
    const selectCell = edit.on && event.target.closest('tbody td[data-key="commission_no"]');
    if (selectCell) {
      const box = selectCell.querySelector("input.rowsel");
      if (event.target !== box) box.checked = !box.checked;
      const tr = selectCell.closest("tr");
      if (box.checked) edit.selected.add(tr.dataset.comm);
      else edit.selected.delete(tr.dataset.comm);
      tr.classList.toggle("sel", box.checked);
      syncSelectAll();
      renderEditState();
      return;
    }
    // 행 클릭: 차량 상세. 편집 모드에서는 입력 열의 칸만 반응한다.
    const row = event.target.closest("tbody tr[data-comm]");
    if (row) {
      const vehicle = vehicles.find((v) => v.commission_no === row.dataset.comm);
      if (!vehicle) return;
      if (!edit.on) {
        openVehicle(vehicle, { onSaved: renderGrid });
        return;
      }
      const td = event.target.closest("td[data-key]");
      const column = td && COLUMNS.find((c) => c.key === td.dataset.key);
      if (!column || !isEditableCell(column.key) || edit.saving) return;
      // 입력이 끝나면 그 칸과 표시줄만 다시 그린다(표 전체를 다시 그리면 다음 칸 클릭이 끊긴다)
      const repaint = () => {
        fillCell(td, column, vehicle, searchTerms(), baseDate());
        renderEditState();
      };
      if (column.memo) openNoteEditor(td, vehicle, column.key, repaint);
      else startCellEdit(td, vehicle, column.key, repaint);
      return;
    }
    // 정렬은 머리글의 정렬 버튼으로만. 열 이름은 눌러도 바뀌지 않는다.
    const key = event.target.closest("button.sortbtn")?.closest("th[data-sort]")?.dataset.sort;
    if (!key) return;
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
    mk("span", { class: "muted" }, tx("· 열 {n}개 · 가로 스크롤 · Comm No. 고정", { n: COLUMNS.length })),
    // 머리글 색 점의 범례
    mk(
      "span",
      { class: "src-legend" },
      `${tx("출처")}:`,
      ["afab", "auto", "input"].map((cls, i) => [mk("span", { class: `src-dot ${cls}` }), tx(["AFAB", "자동", "입력"][i])])
    )
  );

  // Main 에만 있는 차량은 AFAB 에 아직 없는 오더(오더 생성)라 정상이다. AFAB 에만 있는 경우만 알린다.
  const mismatch = meta.onlyAfab
    ? mk("p", { class: "error small" }, `두 List 의 차량이 맞지 않습니다 — AFAB 에만 ${meta.onlyAfab}건`)
    : null;

  root.replaceChildren(
    mk(
      "div",
      { class: "card lg-screen" },
      mk(
        "div",
        { class: "card-h" },
        mk("h2", null, tx("Logistics 차량 마스터")),
        mk("div", { class: "filters" }, mk("label", null, tx("검색"), " ", search), reset, columnsButton, editButton, createButton, reload, els.count)
      ),
      mismatch,
      els.editbar,
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

// 다른 화면으로 옮겨 가면 열려 있던 열 필터와 Note 입력창을 닫는다.
window.addEventListener("hashchange", () => {
  closeColumnFilter();
  closeNoteEditor();
});

// 화면 위의 탭. [탭 id, 이름]. 주소는 #/logistics?tab=<id> 이고 첫 탭은 tab 이 없다
const TABS = [
  ["grid", "Logistics"],
  ["afab", "AFAB 업로드"],
  ["customs", "통관 완료 처리"],
  ["insurance", "보험 조회"],
];

export const logisticsPage = {
  render(root, params) {
    closeColumnFilter();
    const tab = TABS.some(([id]) => id === params.get("tab")) ? params.get("tab") : "grid";
    root.append(
      mk(
        "div",
        { class: "tabs", id: "lgTabs" },
        TABS.map(([id, label]) =>
          mk(
            "a",
            { class: `tab${id === tab ? " active" : ""}`, href: id === "grid" ? "#/logistics" : `#/logistics?tab=${id}` },
            tx(label)
          )
        )
      )
    );
    if (tab !== "grid") {
      const tabBox = mk("div");
      root.append(tabBox);
      if (tab === "afab") renderAfabTab(tabBox);
      else if (tab === "customs") renderCustomsTab(tabBox);
      else renderInsuranceTab(tabBox);
      return;
    }
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
