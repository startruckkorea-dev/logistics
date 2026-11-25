// Current Status 판정 — 전처리(이관)와 앱이 같이 쓰는 조건 함수.
// 날짜는 "YYYY-MM-DD", PM 은 "YYYY-MM-DD" 또는 "YYYY-MM" 문자열이고 월까지만 본다. 값이 없으면 조건에 맞지 않는 것으로 본다.
import { monthOf } from "./dates.js";

export const STATUS = {
  ORDERED_DUMMY: "Ordered(Dummy)",
  ORDERED_CHANGEABLE: "Ordered(Changeable)",
  ORDERED_FIXED: "Ordered(Fixed)",
  REJECTED: "Rejected",
  IN_PRODUCTION: "In Production",
  SHIPMENT_SCHEDULED: "Shipment scheduled",
  IN_TRANSIT: "In Transit",
  BONDED_STOCK: "Bonded Stock",
  OH_STOCK: "OH Stock",
  SOLD: "Sold",
  CANCELLED: "Cancelled",
};

// ---- 조건 (기준일 당일 포함) ----

// Changeability Date 경과
export const isChangeabilityPassed = (changeabilityDate, baseDate) =>
  Boolean(changeabilityDate) && changeabilityDate <= baseDate;

// 생산월 도래
export const isProductionMonthReached = (pm, baseDate) =>
  Boolean(pm) && monthOf(pm) <= monthOf(baseDate);

// Vessel, Shipping Date 확정
export const isShipmentScheduled = (vessel, shippingDate) =>
  Boolean(vessel) && Boolean(shippingDate);

// Shipping Date 경과
export const isShipped = (shippingDate, baseDate) =>
  Boolean(shippingDate) && shippingDate <= baseDate;

/**
 * 날짜가 지나 다음 단계로 넘어갈 차량이면 그 단계를 돌려준다. 한 번에 한 단계만이다
 * (이어지는 전환은 반영한 뒤 다시 판정한다).
 * In Production 은 Vessel 과 Shipping 이 정해져야 넘어간다. Shipping 이 지났어도 In Transit 으로 바로 가지 않는다.
 * @param {{status?: string, changeability?: string, pm?: string, vessel?: string, shipping?: string}} v
 * @param {string} baseDate "YYYY-MM-DD"
 * @returns {null | {to: string, rule: "changeability" | "pm" | "vessel" | "shipped"}}
 */
export function nextStatus(v, baseDate) {
  switch (v.status) {
    case STATUS.ORDERED_CHANGEABLE:
      return isChangeabilityPassed(v.changeability, baseDate) ? { to: STATUS.ORDERED_FIXED, rule: "changeability" } : null;
    case STATUS.ORDERED_FIXED:
      return isProductionMonthReached(v.pm, baseDate) ? { to: STATUS.IN_PRODUCTION, rule: "pm" } : null;
    case STATUS.IN_PRODUCTION:
      return isShipmentScheduled(v.vessel, v.shipping) ? { to: STATUS.SHIPMENT_SCHEDULED, rule: "vessel" } : null;
    case STATUS.SHIPMENT_SCHEDULED:
      return isShipped(v.shipping, baseDate) ? { to: STATUS.IN_TRANSIT, rule: "shipped" } : null;
    default:
      return null;
  }
}

// 더미 오더: Order Note 에 marker 가 있고 exclude 가 없다
export function isDummyOrder(orderNote, marker, exclude) {
  const note = String(orderNote ?? "");
  if (!marker || !note.includes(marker)) return false;
  return !(exclude && note.includes(exclude));
}

// Order Note 에 pattern 이 minCount 번 이상 나오면 더미 오더로 보지 않는다
export function isNotDummyNote(orderNote, pattern, minCount = 1) {
  if (!pattern) return false;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const found = String(orderNote ?? "").match(new RegExp(pattern.source, flags));
  return (found?.length ?? 0) >= minCount;
}

/**
 * 이관용 — 원본에서 한 가지 상태로만 적혀 있던 오더를 현재 단계로 나눈다.
 * 위에서부터 처음 맞는 조건으로 정한다.
 * @param {{shipping?: string, vessel?: string, pm?: string, changeability?: string,
 *          orderNote?: string, cancelled?: boolean}} v
 * @param {string} baseDate "YYYY-MM-DD"
 * @param {{dummyMarker?: string, dummyExclude?: string,
 *          notDummyPattern?: RegExp, notDummyCount?: number}} options
 */
export function classifyOrdered(v, baseDate, options = {}) {
  if (v.cancelled) return STATUS.CANCELLED;
  if (isShipped(v.shipping, baseDate)) return STATUS.IN_TRANSIT;
  if (isShipmentScheduled(v.vessel, v.shipping)) return STATUS.SHIPMENT_SCHEDULED;
  if (isProductionMonthReached(v.pm, baseDate)) return STATUS.IN_PRODUCTION;
  if (
    !isNotDummyNote(v.orderNote, options.notDummyPattern, options.notDummyCount) &&
    isDummyOrder(v.orderNote, options.dummyMarker, options.dummyExclude)
  ) {
    return STATUS.ORDERED_DUMMY;
  }
  if (isChangeabilityPassed(v.changeability, baseDate)) return STATUS.ORDERED_FIXED;
  return STATUS.ORDERED_CHANGEABLE;
}
