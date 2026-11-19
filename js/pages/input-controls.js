// 입력 열의 입력칸 — 차량 상세, 그리드 셀, 일괄 입력이 같이 쓴다.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { COLUMNS } from "../data/columns.js";
import { isDate, isMonth } from "../data/store.js";

// C/O 열에서 고르는 값
const CO_VALUES = ["Requested", "Received", "N/A"];

/** 열 이름 → 화면 열 이름 */
export const labelOf = (key) => COLUMNS.find((c) => c.key === key)?.label ?? key;

// 형식 검사(checkInput)의 결과 → 안내 문구
const INVALID_MESSAGES = {
  date: "YYYY-MM-DD 형식으로 입력하세요 (예: 2026-11-09).",
  month: "YYYY-MM 형식으로 입력하세요 (예: 2026-11).",
  too_long: "255자를 넘을 수 없습니다.",
};

/** 형식 오류 알림의 제목과 내용 */
export const invalidMessage = (key, reason) => ({
  title: `${tx(labelOf(key))} ${tx("형식 오류")}`,
  detail: tx(INVALID_MESSAGES[reason]),
});

/**
 * 열에 맞는 입력칸을 만든다.
 *   긴 글 열 = 여러 줄, C/O = 목록, B1 Factory Order = 날짜 선택, Sales Month = 월 선택, 그 밖 = 글자
 * @param {string} key 열 이름
 * @param {string} [text] 처음 넣을 값
 */
export function createInput(key, text = "") {
  const column = COLUMNS.find((c) => c.key === key);
  let node;
  if (column?.memo) {
    node = mk("textarea", { rows: 3 });
  } else if (key === "co") {
    // 목록에 없는 기존 값은 선택지에 더해 그대로 둘 수 있게 한다
    const values = CO_VALUES.includes(text) || text === "" ? CO_VALUES : [...CO_VALUES, text];
    node = mk("select", null, mk("option", { value: "" }, tx("(빈칸)")), values.map((x) => mk("option", { value: x }, x)));
  } else {
    // 날짜·월 선택 칸은 형식이 맞는 값만 담을 수 있다. 형식이 다른 기존 값은 글자 칸으로 보여준다.
    let type = "text";
    if (key === "b1_factory_order" && (text === "" || isDate(text))) type = "date";
    if (key === "sales_month" && (text === "" || isMonth(text))) type = "month";
    node = mk("input", { type });
  }
  node.value = text;
  return node;
}
