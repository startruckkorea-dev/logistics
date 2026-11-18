// Shipping Calc — 전처리(이관)와 앱이 같이 쓰는 계산.
// Shipping Calc = PM 의 1일 + 모델 리드타임(일, PM~Shipping)
import { addDays, ISO_MONTH } from "./dates.js";
import { STATUS } from "./status.js";

// Ordered(Changeable) 이후 단계. Dummy·Rejected·Cancelled 는 대상이 아니다.
const SHIPPING_CALC_STATUSES = new Set([
  STATUS.ORDERED_CHANGEABLE,
  STATUS.ORDERED_FIXED,
  STATUS.IN_PRODUCTION,
  STATUS.SHIPMENT_SCHEDULED,
  STATUS.IN_TRANSIT,
  STATUS.BONDED_STOCK,
  STATUS.OH_STOCK,
  STATUS.SOLD,
]);

// 대상 단계이고 Shipping 이 비어 있는 건만 계산한다.
export const needsShippingCalc = (status, shipping) =>
  SHIPPING_CALC_STATUSES.has(status) && !shipping;

/**
 * @param {string} pm "YYYY-MM"
 * @param {number} leadDays 리드타임(일)
 * @returns {string} "YYYY-MM-DD", 계산할 수 없으면 ""
 */
export function shippingCalc(pm, leadDays) {
  if (!ISO_MONTH.test(pm ?? "")) return "";
  const days = Number(leadDays);
  if (leadDays == null || leadDays === "" || !Number.isFinite(days)) return "";
  return addDays(`${pm}-01`, days) ?? "";
}
