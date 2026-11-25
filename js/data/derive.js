// 차량 목록에서 만드는 집계 — 화면 전용 계산값. List 에 저장하지 않는다.
import { tx } from "../app/i18n.js";
import { addMonths, diffDays, monthEnd } from "../domain/dates.js";
import { STATUS } from "../domain/status.js";
import { MY_KEYS, MY_OTHER, MY_COLORS, STAGES } from "./stages.js";
import { VEHICLE_ORDER } from "./columns.js";

const isEmpty = (v) => v == null || v === "";

/** 값별 건수. 빈 값은 세지 않는다. */
export function countBy(list, keyOf) {
  const counts = {};
  for (const item of list) {
    const key = keyOf(item);
    if (isEmpty(key)) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** 날짜·월 필드의 연-월별 건수 */
export function countByMonth(vehicles, field, filter) {
  return countBy(filter ? vehicles.filter(filter) : vehicles, (v) => String(v[field] ?? "").slice(0, 7));
}

// ---- 연식 ----

/** 차량의 연식 표시 키("MY26"). 데이터는 "26" 처럼 숫자만 있다. 목록에 없으면 "기타" */
export function modelYearKey(v) {
  if (isEmpty(v.model_year)) return MY_OTHER;
  const text = String(v.model_year);
  const key = /^MY/i.test(text) ? text.toUpperCase() : `MY${text}`;
  return MY_KEYS.includes(key) ? key : MY_OTHER;
}

/** 연식별 대수. 0 인 연식도 포함한다(그리는 쪽에서 거른다). */
export function mySegments(vehicles) {
  const counts = countBy(vehicles, modelYearKey);
  return [...MY_KEYS, MY_OTHER].map((key) => ({ name: key, color: MY_COLORS[key], value: counts[key] ?? 0 }));
}

/** "MY26 12 · MY27 3" 형식 */
export function myCountText(vehicles) {
  return mySegments(vehicles)
    .filter((s) => s.value)
    .map((s) => `${tx(s.name)} ${s.value.toLocaleString("ko-KR")}`)
    .join(" · ");
}

// ---- 모델 표시 ----

// 모델 이름 뒤에 붙이는 옵션 표시. 기본 사양(Cab Gen SFTP, Emission Euro6)은 생략한다.
const DEFAULT_CAB_GEN = "SFTP";
const DEFAULT_EMISSION = "Euro6";
export function modelOptionTag(v) {
  return [
    v.cab_gen && v.cab_gen !== DEFAULT_CAB_GEN ? v.cab_gen : "",
    v.pto || "",
    v.emission && v.emission !== DEFAULT_EMISSION ? v.emission : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 입항 표의 모델 행 이름: Model · Type · Axle · Cab · 옵션 표시. Vehicle 은 바로 위 차종 행에 있어 뺀다 */
export function arrivalModelLabel(v) {
  return [v.model, v.type, v.axle, v.cab, modelOptionTag(v)].filter(Boolean).join(" ");
}

/** 차량에 나오는 Vehicle 값. 정해 둔 순서(VEHICLE_ORDER)로, 목록에 없는 값은 그 뒤에 글자 순 */
export function vehicleTypes(vehicles) {
  const rank = (value) => {
    const i = VEHICLE_ORDER.indexOf(value);
    return i < 0 ? VEHICLE_ORDER.length : i;
  };
  return Object.keys(countBy(vehicles, (v) => v.vehicle)).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
}

// ---- Changeability Date ----

// AFAB 수정 가능 값: J = 수정 가능, N = 불가, B = 그 외
const AFAB_EDITABLE = "J";
// Changeability Date 가 아직 남아 있을 수 있는 단계. Ordered(Fixed) 는 그 날짜가 지나서 넘어온 단계라 제외한다.
const BEFORE_FIXED = [STATUS.ORDERED_DUMMY, STATUS.ORDERED_CHANGEABLE];

/**
 * Changeability Date 까지 남은 일수. Ordered(Dummy)·Ordered(Changeable) 이고 AFAB 수정 가능 값이 J 이며
 * 날짜가 기준일 이후(당일 포함)일 때만 값이 있다. 그 외는 null
 */
export function changeabilityDday(v, baseDate) {
  if (!BEFORE_FIXED.includes(v.current_status) || v.afab_editable !== AFAB_EDITABLE) return null;
  const days = diffDays(v.changeability_date, baseDate);
  return days == null || days < 0 ? null : days;
}

// ---- 입항 ----

const DEFAULT_LEAD_MONTHS = 3;

/** 입항 예정월: ATA → ETA(선사) → Planned Arrival → PM + 리드타임(월) */
export function expectedArrivalMonth(v) {
  if (v.ata) return v.ata.slice(0, 7);
  if (v.eta_from_eukor_pirt) return v.eta_from_eukor_pirt.slice(0, 7);
  if (v.planned_arrival) return v.planned_arrival.slice(0, 7);
  if (v.pm) return addMonths(v.pm.slice(0, 7),Number(v.lead_months) || DEFAULT_LEAD_MONTHS);
  return "";
}

const ON_VESSEL = [STATUS.IN_TRANSIT, STATUS.SHIPMENT_SCHEDULED];
const ARRIVED = [STATUS.BONDED_STOCK, STATUS.OH_STOCK, STATUS.SOLD];
const NOT_SHIPPED = [STATUS.ORDERED_CHANGEABLE, STATUS.ORDERED_FIXED, STATUS.IN_PRODUCTION];
export const UNASSIGNED = "미배정";

// 가장 이른 날짜
const earliest = (dates) => dates.filter(Boolean).sort()[0] ?? "";

/** TSC 입고일을 확정한 선박을 목록에 남겨 두는 일수(대시보드와 선적·입항이 같이 쓴다) */
export const TSC_KEEP_DAYS = 5;

/** 선박(항차)을 가리키는 값: 선박 이름 + Shipping 날짜 */
export const voyageKey = (vessel, shipping) => `${vessel}|${shipping ?? ""}`;

/**
 * 선박(항차) 목록 — 선박 이름과 Shipping 날짜가 같은 차량을 한 척으로 묶는다(취소된 차량은 뺀다).
 * 보여주는 선박: 운송 중·선적 예정 차량이 있는 선박, 그리고 TSC 입고일이 기준일에서 TSC_KEEP_DAYS 일 안인 선박.
 * @param {object[]} vehicles
 * @param {string} today 기준일 "YYYY-MM-DD"
 * @returns {Array<{key, vessel, shipping, kind: "transit"|"scheduled"|"arrived", count, pl, eta_carrier, eta_final,
 *                   bl, bls: string[], tsc, confirmed: boolean, vehicles}>}
 *   날짜는 선박 안에서 가장 이른 값. bls = 차량들에 들어 있는 B/L(보통 하나), bl = 그것을 이은 글.
 *   confirmed = TSC 입고일이 차량에 들어가 있다(확정). vehicles = 그 선박의 차량.
 *   Shipping 날짜 > 선박 이름 순으로 정렬해 돌려준다
 */
export function listVoyages(vehicles, today) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!v.vessel || v.current_status === STATUS.CANCELLED) continue;
    const key = voyageKey(v.vessel, v.shipping);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  const out = [];
  for (const [key, list] of groups) {
    const onVessel = list.some((v) => ON_VESSEL.includes(v.current_status));
    const tsc = earliest(list.map((v) => v.tsc_arrival_date));
    const recent = Boolean(tsc) && (diffDays(today, tsc) ?? Infinity) <= TSC_KEEP_DAYS;
    if (!onVessel && !recent) continue;
    const bls = [...new Set(list.map((v) => v.bl_no).filter(Boolean))];
    out.push({
      key,
      vessel: list[0].vessel,
      shipping: list[0].shipping ?? "",
      kind: list.some((v) => v.current_status === STATUS.IN_TRANSIT) ? "transit" : onVessel ? "scheduled" : "arrived",
      count: list.length,
      pl: earliest(list.map((v) => v.planned_arrival)),
      eta_carrier: earliest(list.map((v) => v.eta_from_eukor_pirt)),
      eta_final: earliest(list.map((v) => v.ata)),
      bl: bls.join(", "),
      bls,
      tsc,
      confirmed: Boolean(tsc),
      vehicles: list,
    });
  }
  // 순서: Shipping 날짜(없으면 맨 뒤) > 선박 이름. 대시보드와 선적·입항이 같은 순서로 보여준다
  const when = (y) => y.shipping || "9";
  return out.sort((a, b) => (when(a) !== when(b) ? (when(a) < when(b) ? -1 : 1) : a.vessel < b.vessel ? -1 : 1));
}

/**
 * 운송 중·선적 예정 차량만 선박(이름 + Shipping 날짜)별로 묶는다. 월별 입항 집계의 선박 열이 된다.
 * 날짜는 선박 안에서 가장 이른 값.
 */
function voyagesOnVessel(vehicles) {
  const groups = new Map();
  for (const v of vehicles) {
    if (!v.vessel || !ON_VESSEL.includes(v.current_status)) continue;
    const key = voyageKey(v.vessel, v.shipping);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  return [...groups.entries()].map(([key, list]) => ({
    key,
    vessel: list[0].vessel,
    shipping: list[0].shipping ?? "",
    pl: earliest(list.map((v) => v.planned_arrival)),
    eta_carrier: earliest(list.map((v) => v.eta_from_eukor_pirt)),
    eta_final: earliest(list.map((v) => v.ata)),
  }));
}

/** 선박 행의 링크: 그 선박 이름과 Shipping 월의 차량 목록 */
export function voyageLink(voyage) {
  return `#/logistics?vessel=${encodeURIComponent(voyage.vessel)}&shipping=${encodeURIComponent(voyage.shipping.slice(0, 7))}`;
}

/** 항차의 입항월: ATA → ETA(선사) → Planned Arrival. 날짜가 없으면 "" */
export const voyageMonth = (voyage) => (voyage.eta_final || voyage.eta_carrier || voyage.pl || "").slice(0, 7);

/**
 * 월별 입항 예정 집계. 대시보드 "당월 도착 예정"과 선적·입항 "월별 입항 예정"이 같이 쓴다.
 * 대상은 선박에 실린 운송 중·선적 예정 차량이다.
 * @param {object[]} vehicles
 * @param {string} baseMonth 기준월 "YYYY-MM"
 * @param {{onlyMonth?: string, range?: {from: string, to: string}, unassigned?: boolean}} [options]
 *   onlyMonth : 그 달만 집계
 *   range     : 기간 안의 모든 달을 열로 두고, 기준월 이전 달은 이미 입항한 차량(ATA 월)을 실적으로 집계
 *   unassigned: 선박 없이 ETA From TDD 만 있는 오더를 그 달의 "미배정" 열로 집계
 * @returns {{months: string[], voyagesByMonth: Record<string, object[]>,
 *            groups: Array<{gen, vehicles: Array<{vehicle, rows: Array<{label, attrs, by, total}>}>}>,
 *            grand: Record<string, number>, commissions: Record<string, string[]>, total: number}}
 *   열 key = 선박 key(선박 이름 + Shipping 날짜). 실적 열은 "YYYY-MM|선박 key", 미배정 열은 "YYYY-MM|미배정"
 */
export function arrivalSchedule(vehicles, baseMonth, options = {}) {
  const { onlyMonth, range, unassigned } = options;
  const inRange = (month) => !range || (month >= range.from && month <= range.to);
  const voyagesByMonth = {};
  if (range) for (let m = range.from; m <= range.to; m = addMonths(m, 1)) voyagesByMonth[m] = [];

  for (const voyage of voyagesOnVessel(vehicles)) {
    const month = voyageMonth(voyage);
    if (!month || (onlyMonth && month !== onlyMonth) || !inRange(month)) continue;
    (voyagesByMonth[month] ??= []).push(voyage);
  }
  const listed = new Set(Object.values(voyagesByMonth).flat().map((voyage) => voyage.key));
  const items = vehicles
    .filter((v) => v.vessel && ON_VESSEL.includes(v.current_status) && listed.has(voyageKey(v.vessel, v.shipping)))
    .map((v) => ({ v, key: voyageKey(v.vessel, v.shipping) }));

  if (range) {
    for (const v of vehicles) {
      if (!v.ata || !v.vessel || !ARRIVED.includes(v.current_status)) continue;
      const month = v.ata.slice(0, 7);
      if (month >= baseMonth || !inRange(month)) continue;
      const key = `${month}|${voyageKey(v.vessel, v.shipping)}`;
      if (!voyagesByMonth[month].some((voyage) => voyage.key === key)) {
        voyagesByMonth[month].push({ vessel: v.vessel, key, shipping: v.shipping ?? "", arrived: true });
      }
      items.push({ v, key });
    }
  }
  const months = Object.keys(voyagesByMonth).sort();
  for (const month of months) {
    voyagesByMonth[month].sort((a, b) =>
      a.shipping !== b.shipping ? (a.shipping < b.shipping ? -1 : 1) : a.vessel < b.vessel ? -1 : 1
    );
  }
  if (unassigned) {
    for (const v of vehicles) {
      if (v.vessel || !v.eta_from_tdd || !NOT_SHIPPED.includes(v.current_status)) continue;
      const month = v.eta_from_tdd.slice(0, 7);
      if (month < baseMonth || !inRange(month) || (onlyMonth && month !== onlyMonth)) continue;
      const key = `${month}|${UNASSIGNED}`;
      const column = (voyagesByMonth[month] ??= []);
      // 미배정 열은 정렬 뒤에 넣어 그 달의 마지막 열이 된다
      if (!column.some((voyage) => voyage.key === key)) column.push({ vessel: UNASSIGNED, key, shipping: "", unassigned: true });
      items.push({ v, key });
    }
  }

  const byModel = new Map();
  const grand = {};
  const commissions = {}; // 열 key → 그 열에 집계된 차량의 Commission No
  for (const { v, key } of items) {
    (commissions[key] ??= []).push(v.commission_no);
    const label = arrivalModelLabel(v);
    const id = `${v.gen}|${v.vehicle}|${label}`;
    if (!byModel.has(id)) {
      byModel.set(id, {
        gen: v.gen, vehicle: v.vehicle, label,
        attrs: { vehicle: v.vehicle, model: v.model, type: v.type, axle: v.axle, cab: v.cab, cab_gen: v.cab_gen, pto: v.pto, emission: v.emission },
        by: {}, total: 0,
      });
    }
    const row = byModel.get(id);
    row.by[key] = (row.by[key] ?? 0) + 1;
    row.total++;
    grand[key] = (grand[key] ?? 0) + 1;
  }
  const rows = [...byModel.values()];
  // 정렬: 구분(Gen) > 차종 > 모델 이름
  const types = vehicleTypes(vehicles);
  const groups = [...new Set(rows.map((r) => r.gen))].sort().map((gen) => ({
    gen,
    vehicles: types
      .filter((type) => rows.some((r) => r.gen === gen && r.vehicle === type))
      .map((type) => ({
        vehicle: type,
        rows: rows.filter((r) => r.gen === gen && r.vehicle === type).sort((a, b) => (a.label < b.label ? -1 : 1)),
      })),
  }));
  return { months: Object.keys(voyagesByMonth).sort(), voyagesByMonth, groups, grand, commissions, total: items.length };
}

// ---- 재고 ----

/**
 * 재고 대상 차량.
 * @param {object[]} vehicles
 * @param {string} month "current" 또는 "YYYY-MM"(그 달 말일 마감)
 * @param {"stock"|"pipe"} scope stock = 센터 재고(Bonded + OH), pipe = Ordered(Fixed) ~ OH Stock(현재 기준만)
 * @returns {Array<{v: object, cleared: boolean}>} cleared = 통관 완료 여부(월말 마감이면 그 달 말일까지)
 */
export function closingStock(vehicles, month, scope) {
  const cleared = (v) => Boolean(v.customs_clearance_date);
  if (month === "current") {
    const stages = scope === "pipe" ? STAGES.slice(3, 9) : [STATUS.BONDED_STOCK, STATUS.OH_STOCK];
    return vehicles.filter((v) => stages.includes(v.current_status)).map((v) => ({ v, cleared: cleared(v) }));
  }
  // 월말 마감: Cancelled 제외, 입고일(ATA)이 그 달 말일 이전이고 아직 팔리지 않은 차량
  const end = monthEnd(month);
  return vehicles
    .filter((v) => v.current_status !== STATUS.CANCELLED && v.ata && v.ata <= end && (!v.sales_month || v.sales_month > month))
    .map((v) => ({ v, cleared: cleared(v) && v.customs_clearance_date <= end }));
}

/**
 * 입항 표와 같은 모델 묶음: 구분(Gen) > 차종 > 모델.
 * @returns {Array<{gen, vehicles: Array<{vehicle, rows: Array<{label, vs: object[]}>}>}>}
 */
export function modelGroups(vehicles) {
  const byModel = new Map();
  for (const v of vehicles) {
    const label = arrivalModelLabel(v);
    const id = `${v.gen}|${v.vehicle}|${label}`;
    if (!byModel.has(id)) byModel.set(id, { gen: v.gen, vehicle: v.vehicle, label, vs: [] });
    byModel.get(id).vs.push(v);
  }
  const rows = [...byModel.values()];
  const types = vehicleTypes(vehicles);
  return [...new Set(rows.map((r) => r.gen))].sort().map((gen) => ({
    gen,
    vehicles: types
      .filter((type) => rows.some((r) => r.gen === gen && r.vehicle === type))
      .map((type) => ({
        vehicle: type,
        rows: rows.filter((r) => r.gen === gen && r.vehicle === type).sort((a, b) => (a.label < b.label ? -1 : 1)),
      })),
  }));
}
