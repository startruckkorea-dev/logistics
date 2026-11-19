// 차량 목록에서 만드는 집계 — 화면 전용 계산값. List 에 저장하지 않는다.
import { tx } from "../app/i18n.js";
import { addMonths } from "../domain/dates.js";
import { STATUS } from "../domain/status.js";
import { MY_KEYS, MY_OTHER, MY_COLORS } from "./stages.js";

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

/** 입항 표의 모델 행 이름: Vehicle · Model · Type · Axle · Cab · 옵션 표시 */
export function arrivalModelLabel(v) {
  return [v.vehicle, v.model, v.type, v.axle, v.cab, modelOptionTag(v)].filter(Boolean).join(" ");
}

/** 차량에 나오는 Vehicle 값(대수 많은 순) */
export function vehicleTypes(vehicles) {
  const counts = countBy(vehicles, (v) => v.vehicle);
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : 1));
}

// ---- 입항 ----

const DEFAULT_LEAD_MONTHS = 3;

/** 입항 예정월: ATA → ETA(선사) → Planned Arrival → PM + 리드타임(월) */
export function expectedArrivalMonth(v) {
  if (v.ata) return v.ata.slice(0, 7);
  if (v.eta_from_eukor_pirt) return v.eta_from_eukor_pirt.slice(0, 7);
  if (v.planned_arrival) return v.planned_arrival.slice(0, 7);
  if (v.pm) return addMonths(v.pm, Number(v.lead_months) || DEFAULT_LEAD_MONTHS);
  return "";
}

const ON_VESSEL = [STATUS.IN_TRANSIT, STATUS.SHIPMENT_SCHEDULED];
const ARRIVED = [STATUS.BONDED_STOCK, STATUS.OH_STOCK, STATUS.SOLD];
const NOT_SHIPPED = [STATUS.ORDERED_CHANGEABLE, STATUS.ORDERED_FIXED, STATUS.IN_PRODUCTION];
export const UNASSIGNED = "미배정";

// 가장 이른 날짜
const earliest = (dates) => dates.filter(Boolean).sort()[0] ?? "";

/**
 * 운송 중·선적 예정 차량을 선박별로 묶은 항차 목록. 선박 단위 List 가 없어 차량에서 만든다.
 * @returns {Array<{vessel, kind: "transit"|"scheduled", count, shipping, pl, eta_carrier, eta_final, bl}>}
 *   pl = Planned Arrival, eta_carrier = ETA(선사), eta_final = ATA. 선박 안에서 가장 이른 날짜를 쓴다.
 */
export function deriveVoyages(vehicles) {
  const byVessel = new Map();
  for (const v of vehicles) {
    if (!v.vessel || !ON_VESSEL.includes(v.current_status)) continue;
    if (!byVessel.has(v.vessel)) byVessel.set(v.vessel, []);
    byVessel.get(v.vessel).push(v);
  }
  return [...byVessel.entries()].map(([vessel, list]) => ({
    vessel,
    kind: list.some((v) => v.current_status === STATUS.IN_TRANSIT) ? "transit" : "scheduled",
    count: list.length,
    shipping: earliest(list.map((v) => v.shipping)),
    pl: earliest(list.map((v) => v.planned_arrival)),
    eta_carrier: earliest(list.map((v) => v.eta_from_eukor_pirt)),
    eta_final: earliest(list.map((v) => v.ata)),
    bl: [...new Set(list.map((v) => v.bl_no).filter(Boolean))].join(", "),
  }));
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
 *            grand: Record<string, number>, total: number}}
 *   열 key = 선박 이름. 실적 열은 "YYYY-MM|선박", 미배정 열은 "YYYY-MM|미배정"
 */
export function arrivalSchedule(vehicles, baseMonth, options = {}) {
  const { onlyMonth, range, unassigned } = options;
  const inRange = (month) => !range || (month >= range.from && month <= range.to);
  const voyagesByMonth = {};
  if (range) for (let m = range.from; m <= range.to; m = addMonths(m, 1)) voyagesByMonth[m] = [];

  for (const voyage of deriveVoyages(vehicles)) {
    const month = voyageMonth(voyage);
    if (!month || (onlyMonth && month !== onlyMonth) || !inRange(month)) continue;
    (voyagesByMonth[month] ??= []).push(voyage);
  }
  const vessels = new Set(Object.values(voyagesByMonth).flat().map((voyage) => voyage.vessel));
  const items = vehicles
    .filter((v) => ON_VESSEL.includes(v.current_status) && vessels.has(v.vessel))
    .map((v) => ({ v, key: v.vessel }));

  if (range) {
    for (const v of vehicles) {
      if (!v.ata || !v.vessel || !ARRIVED.includes(v.current_status)) continue;
      const month = v.ata.slice(0, 7);
      if (month >= baseMonth || !inRange(month)) continue;
      const key = `${month}|${v.vessel}`;
      if (!voyagesByMonth[month].some((voyage) => voyage.key === key)) {
        voyagesByMonth[month].push({ vessel: v.vessel, key, shipping: "", arrived: true });
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
  for (const { v, key } of items) {
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
  return { months: Object.keys(voyagesByMonth).sort(), voyagesByMonth, groups, grand, total: items.length };
}
