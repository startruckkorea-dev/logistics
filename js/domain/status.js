// Current Status 판정 — 전처리(이관)와 앱이 같이 쓰는 조건 함수.
// 날짜는 "YYYY-MM-DD", PM 은 "YYYY-MM" 문자열이다. 값이 없으면 조건에 맞지 않는 것으로 본다.
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
  Boolean(pm) && pm <= monthOf(baseDate);

// Vessel, Shipping Date 확정
export const isShipmentScheduled = (vessel, shippingDate) =>
  Boolean(vessel) && Boolean(shippingDate);

// Shipping Date 경과
export const isShipped = (shippingDate, baseDate) =>
  Boolean(shippingDate) && shippingDate <= baseDate;

// 더미 오더: Order Note 에 marker 가 있고 exclude 가 없다
export function isDummyOrder(orderNote, marker, exclude) {
  const note = String(orderNote ?? "");
  if (!marker || !note.includes(marker)) return false;
  return !(exclude && note.includes(exclude));
}

/**
 * 이관용 — 원본에서 한 가지 상태로만 적혀 있던 오더를 현재 단계로 나눈다.
 * 위에서부터 처음 맞는 조건으로 정한다.
 * @param {{shipping?: string, vessel?: string, pm?: string, changeability?: string,
 *          orderNote?: string, cancelled?: boolean}} v
 * @param {string} baseDate "YYYY-MM-DD"
 * @param {{dummyMarker?: string, dummyExclude?: string}} options
 */
export function classifyOrdered(v, baseDate, options = {}) {
  if (v.cancelled) return STATUS.CANCELLED;
  if (isShipped(v.shipping, baseDate)) return STATUS.IN_TRANSIT;
  if (isShipmentScheduled(v.vessel, v.shipping)) return STATUS.SHIPMENT_SCHEDULED;
  if (isProductionMonthReached(v.pm, baseDate)) return STATUS.IN_PRODUCTION;
  if (isDummyOrder(v.orderNote, options.dummyMarker, options.dummyExclude)) {
    return STATUS.ORDERED_DUMMY;
  }
  if (isChangeabilityPassed(v.changeability, baseDate)) return STATUS.ORDERED_FIXED;
  return STATUS.ORDERED_CHANGEABLE;
}
