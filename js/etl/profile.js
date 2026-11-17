// 전처리 1단계 — 열 프로필.
// 시트의 첫 행을 헤더로 보고, 열마다 값의 종류·빈칸 수·고유값 수를 센다.
// List 의 열 타입과 키 열을 정하는 근거로 쓴다. 값 자체는 결과에 담지 않는다.

// 엑셀에 표시된 문자열이 날짜 모양인지. 원시 값이 숫자(일련번호)일 때만 본다.
const DATE_TEXT =
  /^(\d{4}[-./]\d{1,2}([-./]\d{1,2})?|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{1,2}[-/ ]?[A-Za-z]{3,9}[-/ ]?\d{2,4}|[A-Za-z]{3,9}[-/ ]\d{2,4})(\s+\d{1,2}:\d{2}(:\d{2})?)?$/;

// 헤더의 줄바꿈·연속 공백·앞뒤 공백을 정리한다. "Current\nStatus" → "Current Status"
export const cleanHeader = (text) =>
  String(text ?? "").replace(/\s+/g, " ").trim();

function kindOf(value, text) {
  if (value == null || value === "") return "empty";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    return DATE_TEXT.test(String(text ?? "").trim()) ? "date" : "number";
  }
  return "text";
}

/**
 * @param {{values: any[][], text: string[][], columnCount: number}} sheet
 * @returns {Array<{index, header, filled, empty, number, date, text, boolean,
 *                   distinct, maxLength, unique}>}
 *   unique = 빈칸이 없고 값이 모두 다르다(키 열로 쓸 수 있다)
 */
export function profileSheet(sheet) {
  const headerRow = sheet.text[0] ?? [];
  const dataRows = sheet.values.length - 1;

  return Array.from({ length: sheet.columnCount }, (_, c) => {
    const counts = { empty: 0, number: 0, date: 0, text: 0, boolean: 0 };
    const seen = new Set();
    let maxLength = 0;

    for (let r = 1; r < sheet.values.length; r++) {
      const value = sheet.values[r]?.[c];
      const text = sheet.text[r]?.[c];
      const kind = kindOf(value, text);
      counts[kind]++;
      if (kind === "empty") continue;
      seen.add(typeof value === "string" ? value.trim() : value);
      maxLength = Math.max(maxLength, String(text ?? value).length);
    }

    const filled = dataRows - counts.empty;
    return {
      index: c,
      header: cleanHeader(headerRow[c]),
      filled,
      ...counts,
      distinct: seen.size,
      maxLength,
      unique: dataRows > 0 && counts.empty === 0 && seen.size === dataRows,
    };
  });
}

const KIND_LABEL = { number: "숫자", date: "날짜", text: "문자", boolean: "참거짓" };

// "날짜 1980 · 문자 3" 처럼 값이 있는 종류만 많은 순서로 적는다.
export function describeKinds(column) {
  const parts = Object.keys(KIND_LABEL)
    .filter((kind) => column[kind] > 0)
    .sort((a, b) => column[b] - column[a])
    .map((kind) => `${KIND_LABEL[kind]} ${column[kind]}`);
  return parts.length ? parts.join(" · ") : "값 없음";
}
