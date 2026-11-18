// 날짜 계산 공용 함수. 날짜는 "YYYY-MM-DD", 월은 "YYYY-MM" 문자열로 다룬다.
// 시간대의 영향을 받지 않도록 모든 계산을 UTC 로 한다.

const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, "0");

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_MONTH = /^\d{4}-\d{2}$/;

// 연·월·일이 실제로 있는 날짜면 "YYYY-MM-DD", 아니면 null (13월, 2월 30일 등)
export function toIsoDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const valid =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;
  return valid ? `${year}-${pad2(month)}-${pad2(day)}` : null;
}

// 엑셀 날짜 일련번호 → "YYYY-MM-DD". 시각(소수부)은 버린다.
export function serialToIsoDate(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * DAY_MS);
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  if (!ISO_DATE.test(isoDate ?? "") || !Number.isFinite(days)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d) + Math.round(days) * DAY_MS);
  return out.toISOString().slice(0, 10);
}

export const monthOf = (isoDate) => (isoDate ? isoDate.slice(0, 7) : "");

// 브라우저 현지 날짜 기준 오늘
export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
