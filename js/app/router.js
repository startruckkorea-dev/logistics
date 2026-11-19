// 화면 전환 — 상단 메뉴와 해시 주소(#/logistics?tab=...)로 화면을 고른다.
import { mk } from "../lib/dom.js";
import { tx } from "./i18n.js";
import { closeDrawer, closeModal } from "./ui.js";

// 상단 메뉴 순서. [화면 id, 메뉴 이름]
const MENU = [
  ["dashboard", "대시보드"],
  ["logistics", "Logistics 차량 마스터"],
  ["shipping", "선적 · 입항"],
  ["stock", "재고현황"],
  ["kufri", "KUFRI 생산판매계획"],
  ["settings", "마스터 · 설정"],
  ["admin", "관리"],
];
const DEFAULT_PAGE = "dashboard";

// 화면 id → { render(root, params) }
const pages = new Map();

/** 화면을 등록한다. render 는 root 를 비운 상태로 받아 화면을 그린다. */
export function registerPage(id, page) {
  pages.set(id, page);
}

function parseHash() {
  const hash = (window.location.hash || `#/${DEFAULT_PAGE}`).slice(2);
  const [path, query] = hash.split("?");
  return { page: path || DEFAULT_PAGE, params: new URLSearchParams(query ?? "") };
}

function renderNav(current) {
  document.getElementById("nav").replaceChildren(
    ...MENU.map(([id, label]) =>
      mk("a", { href: `#/${id}`, class: id === current ? "active" : null }, tx(label))
    )
  );
}

// 아직 옮기지 않은 화면에 보여주는 안내
function renderPending(root) {
  root.append(
    mk(
      "div",
      { class: "card notice-card" },
      mk("h2", null, tx("준비 중인 화면입니다")),
      mk("p", null, tx("화면을 옮기는 중입니다. 준비되면 이 자리에 표시됩니다."))
    )
  );
}

/** 현재 주소에 맞는 화면을 그린다. */
export function route() {
  const { page, params } = parseHash();
  const id = MENU.some(([menuId]) => menuId === page) ? page : DEFAULT_PAGE;
  renderNav(id);
  // 화면이 이미 바뀌었으므로 묻지 않고 닫는다
  closeDrawer(true);
  closeModal();
  const root = document.getElementById("app");
  root.replaceChildren();
  const target = pages.get(id);
  if (target) target.render(root, params);
  else renderPending(root);
  window.scrollTo(0, 0);
}

/** 주소가 바뀔 때마다 화면을 다시 그리도록 연결한다. */
export function startRouter() {
  window.addEventListener("hashchange", route);
  route();
}
