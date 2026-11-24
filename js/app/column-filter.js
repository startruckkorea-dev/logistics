// 열 필터 창 — 머리글의 ▼ 버튼 아래에 그 열의 값 목록을 띄우고 체크로 고른다.
// 차량 그리드의 열 필터와 같은 모양(.colfilter)을 쓴다. 값 목록만 다루고, 연·월 묶음은 다루지 않는다.
import { cssZoom, mk } from "../lib/dom.js";
import { tx } from "./i18n.js";

const POPUP_WIDTH = 296; // 창 너비(px) + 여유. 화면 오른쪽을 넘지 않게 할 때 쓴다

const num = (n) => Number(n).toLocaleString("ko-KR");

export function closeValueFilter() {
  document.getElementById("colfilter")?.remove();
  document.removeEventListener("mousedown", closeOnOutside);
}

function closeOnOutside(event) {
  if (!event.target.closest("#colfilter") && !event.target.closest(".cf")) closeValueFilter();
}

// 화면을 옮기면 닫는다
window.addEventListener("hashchange", closeValueFilter);

/**
 * @param {HTMLElement} button 누른 ▼ 버튼(이 바로 아래에 띄운다)
 * @param {object} options
 * @param {string} options.title 창 제목
 * @param {Array<{value: string, text: string, count: number}>} options.values 고를 수 있는 값(나열할 순서대로)
 * @param {Set<string>|null} options.chosen 지금 고른 값. null 이면 전체
 * @param {(chosen: Set<string>|null) => void} options.onApply 적용. 전체를 골랐거나 필터를 풀면 null
 */
export function openValueFilter(button, { title, values, chosen, onApply }) {
  closeValueFilter();
  const checked = new Set(chosen ?? values.map((v) => v.value));
  const search = mk("input", { type: "text", placeholder: tx("값 검색") });
  const list = mk("div", { class: "cf-list" });
  const shown = () => {
    const term = search.value.trim().toLowerCase();
    return values.filter((v) => !term || v.text.toLowerCase().includes(term));
  };
  const draw = () => {
    list.replaceChildren(
      ...shown().map((v) => {
        const box = mk("input", { type: "checkbox" });
        box.checked = checked.has(v.value);
        box.addEventListener("change", () => {
          if (box.checked) checked.add(v.value);
          else checked.delete(v.value);
        });
        return mk("label", null, box, mk("span", null, v.text), mk("span", { class: "muted small" }, num(v.count)));
      })
    );
    if (!list.childElementCount) list.append(mk("div", { class: "muted small" }, tx("일치하는 값이 없습니다.")));
  };
  search.addEventListener("input", draw);
  draw();

  const apply = (clear) => {
    closeValueFilter();
    onApply(clear || values.every((v) => checked.has(v.value)) ? null : new Set(checked));
  };
  const tool = (label, action) => mk("button", { class: "btn sm", type: "button", onclick: action }, label);
  const applyButton = tool(tx("적용"), () => apply(false));
  applyButton.classList.add("primary");

  const pop = mk(
    "div",
    { class: "colfilter", id: "colfilter" },
    mk(
      "div",
      { class: "cf-h" },
      mk("b", null, title),
      mk("button", { class: "x", type: "button", title: tx("닫기"), onclick: closeValueFilter }, "×")
    ),
    search,
    mk(
      "div",
      { class: "cf-tools" },
      tool(tx("표시된 값 전체 선택"), () => {
        for (const v of shown()) checked.add(v.value);
        draw();
      }),
      tool(tx("표시된 값 해제"), () => {
        for (const v of shown()) checked.delete(v.value);
        draw();
      })
    ),
    list,
    mk("div", { class: "cf-foot" }, tool(tx("필터 해제"), () => apply(true)), applyButton)
  );
  // 버튼 바로 아래에 띄운다. 화면 오른쪽을 넘지 않게 한다. 창 좌표는 화면 배율로 나눠 넣는다.
  const rect = button.getBoundingClientRect();
  document.body.append(pop);
  const zoom = cssZoom(pop);
  pop.style.top = `${(rect.bottom + 4) / zoom}px`;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH * zoom)) / zoom}px`;
  search.focus();
  setTimeout(() => document.addEventListener("mousedown", closeOnOutside), 0);
}
