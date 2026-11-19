// 공용 부품 — 알림(Toast), 모달, 드로어, 풍선 도움말.
// 내용은 문자열 HTML 이 아니라 DOM 노드(또는 텍스트)로 받는다.
import { mk } from "../lib/dom.js";
import { tx } from "./i18n.js";

const $ = (id) => document.getElementById(id);
const TOAST_MS = 3800;

/** 화면 아래에 잠깐 뜨는 알림. */
export function toast(title, detail) {
  const node = mk("div", { class: "toast" }, mk("b", null, title), detail ? mk("span", { class: "t2" }, detail) : null);
  $("toast").append(node);
  setTimeout(() => node.remove(), TOAST_MS);
}

/**
 * @param {string} title
 * @param {Node|string|Array} body
 * @param {Node|string|Array} [footer] 없으면 닫기 버튼 하나
 */
export function openModal(title, body, footer) {
  $("modal-title").textContent = title;
  $("modal-body").replaceChildren(...[body].flat(Infinity).filter((n) => n != null));
  const foot = footer ?? mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("닫기"));
  $("modal-foot").replaceChildren(...[foot].flat(Infinity).filter((n) => n != null));
  document.body.classList.add("modal-open");
}

export function closeModal() {
  document.body.classList.remove("modal-open");
}

// 드로어를 닫기 전에 묻는 함수. 거짓을 돌려주면 닫지 않는다.
let drawerGuard = null;

/**
 * @param {Node|string|Array} head
 * @param {Node|string|Array} body
 * @param {{beforeClose?: () => boolean}} [options] beforeClose: 닫기 전에 부른다. 거짓이면 닫지 않는다
 *   (저장하지 않은 입력을 확인할 때 쓴다. 확인이 끝나면 closeDrawer(true) 로 닫는다)
 */
export function openDrawer(head, body, options = {}) {
  drawerGuard = options.beforeClose ?? null;
  $("drawer-head").replaceChildren(
    ...[head].flat(Infinity).filter((n) => n != null),
    mk("button", { class: "x", type: "button", title: tx("닫기"), onclick: () => closeDrawer() }, "×")
  );
  const bodyEl = $("drawer-body");
  bodyEl.replaceChildren(...[body].flat(Infinity).filter((n) => n != null));
  bodyEl.scrollTop = 0;
  document.body.classList.add("drawer-open");
}

/** @param {boolean} [force] 참이면 묻지 않고 닫는다 */
export function closeDrawer(force = false) {
  if (!document.body.classList.contains("drawer-open")) return;
  if (!force && drawerGuard && !drawerGuard()) return;
  drawerGuard = null;
  document.body.classList.remove("drawer-open");
}

/** 닫기 동작 연결. 앱 시작 때 한 번 부른다. */
export function initUi() {
  $("modal-close").addEventListener("click", closeModal);
  $("drawer-bg").addEventListener("click", () => closeDrawer());
  $("modal-bg").addEventListener("click", (event) => {
    if (event.target === $("modal-bg")) closeModal();
  });
  const tip = $("tip");
  document.addEventListener("mousemove", (event) => {
    const target = event.target.closest?.("[data-tip]");
    if (!target) {
      tip.style.display = "none";
      return;
    }
    tip.textContent = target.getAttribute("data-tip");
    tip.style.display = "block";
    tip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${event.clientY + 12}px`;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // 모달이 떠 있으면 모달만 닫는다(드로어의 닫기 확인 창이 바로 다시 뜨지 않게)
    if (document.body.classList.contains("modal-open")) closeModal();
    else closeDrawer();
  });
}
