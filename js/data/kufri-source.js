// KUFRI 생산판매계획의 입력 — 차량과 Model Master 를 모델 행으로 묶어 계산(domain/kufri.js)에 넘긴다.
// 모델 행은 다른 화면과 같은 묶음이다(구분 > 차종 > 모델, derive.js 의 arrivalModelLabel).
import { STATUS } from "../domain/status.js";
import { computeModel, computeTotals, monthList, firstPlanMonth, placeVehicle, inTransitAt } from "../domain/kufri.js";
import { arrivalModelLabel, vehicleTypes } from "./derive.js";

// 날짜나 월로 시작하는 글의 월 "YYYY-MM". 그 밖의 글은 빈 글
const monthOfText = (value) => (/^\d{4}-(0[1-9]|1[0-2])/.test(String(value ?? "")) ? String(value).slice(0, 7) : "");

/** 실제 도착 정보가 있는 차량의 입항월: ATA → ETA(선사) → Planned Arrival. 없으면 빈 글 */
export const arrivalInfoMonth = (v) => monthOfText(v.ata) || monthOfText(v.eta_from_eukor_pirt) || monthOfText(v.planned_arrival);

// 차량 → 계산이 받는 모양. v 는 원래 차량(목록과 링크에 쓴다)
const toInput = (v, defaultLead) => ({
  status: v.current_status,
  pm: monthOfText(v.pm),
  arrival: arrivalInfoMonth(v),
  invoice: monthOfText(v.invoice),
  sales: monthOfText(v.sales_month),
  lead: Number(v.lead_months) || defaultLead,
  v,
});

/**
 * 매트릭스에 필요한 것을 모두 계산한다.
 * @param {object} source
 * @param {object[]} source.vehicles 차량 목록(loadVehicles)
 * @param {object[]} source.models Model Master 행(loadModelMaster)
 * @param {object} source.settings 기준값(planStart · planMonths · defaultLeadMonths · salesInit)
 * @param {string} source.today 기준일 "YYYY-MM-DD"
 * @param {{prod?: Record<string, Record<string, number>>, sales?: Record<string, Record<string, number>>}} [source.plan] 모델 행 key → 월 → 계획 값
 * @returns {{
 *   months: string[], current: string, planFrom: string,
 *   groups: Array<{key, gen, vehicle, label, lead, leadYear, active, inputs, result}>,
 *   sections: Array<{vehicle, groups, total}>, total: object,
 *   rejected: Array<{key, vehicle, label, byMonth: Record<string, object[]>, noPm: object[], count: number}>,
 *   skipped: {noPm: number, noArrival: number},
 * }}
 *   groups 는 차종(정해 둔 순서) > 구분 > 모델 이름 순. active = 표에 보여 줄 모델(판매되지 않은 차량이 있거나 표의 기간에 생산 · 입항 · 판매가 있다).
 *   합계는 active 가 아닌 모델도 포함한다. rejected = Rejected 차량(계산에 넣지 않는다)
 */
export function buildKufri(source) {
  const { vehicles, models, settings, today } = source;
  const plan = source.plan ?? {};
  const months = monthList(settings.planStart, settings.planMonths);
  const current = today.slice(0, 7);
  const planFrom = firstPlanMonth(current);
  const first = months[0];
  const last = months[months.length - 1];
  const inPeriod = (month) => Boolean(month) && month >= first && month <= last;
  const defaultLead = settings.defaultLeadMonths;
  const modelByNo = new Map(models.map((m) => [m.moma_no, m]));

  const byKey = new Map();
  const groupOf = (v) => {
    const label = arrivalModelLabel(v);
    const key = `${v.gen ?? ""}|${v.vehicle ?? ""}|${label}`;
    if (!byKey.has(key)) byKey.set(key, { key, gen: v.gen ?? "", vehicle: v.vehicle ?? "", label, inputs: [], rejected: [], momaNos: new Set() });
    return byKey.get(key);
  };
  for (const v of vehicles) {
    if (v.current_status === STATUS.CANCELLED) continue;
    const group = groupOf(v);
    if (v.current_status === STATUS.REJECTED) group.rejected.push(v);
    else {
      group.inputs.push(toInput(v, defaultLead));
      if (v.moma_no) group.momaNos.add(v.moma_no);
    }
  }

  const types = vehicleTypes(vehicles.filter((v) => v.vehicle));
  const rank = (vehicle) => {
    const i = types.indexOf(vehicle);
    return i < 0 ? types.length : i;
  };
  const text = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
  const all = [...byKey.values()].sort((a, b) => rank(a.vehicle) - rank(b.vehicle) || text(a.gen, b.gen) || text(a.label, b.label));

  const skipped = { noPm: 0, noArrival: 0 };
  const groups = [];
  for (const group of all) {
    if (!group.inputs.length) continue;
    // 계획 수량의 리드타임: 이 모델 행에 연결된 Model Master 행 중 가장 최신 연식의 값
    const latest = [...group.momaNos]
      .map((no) => modelByNo.get(no))
      .filter((m) => m && Number(m.lead) > 0)
      .sort((a, b) => text(String(b.my ?? ""), String(a.my ?? "")))[0];
    const lead = latest ? Number(latest.lead) : defaultLead;
    const result = computeModel({
      months,
      current,
      vehicles: group.inputs,
      planLead: lead,
      prodPlan: plan.prod?.[group.key],
      salesPlan: plan.sales?.[group.key],
      salesInitRule: settings.salesInit,
    });
    skipped.noPm += result.skipped.noPm;
    skipped.noArrival += result.skipped.noArrival;
    const active = group.inputs.some((x) => {
      const place = placeVehicle(x, planFrom);
      if (!place) return false;
      return x.status !== STATUS.SOLD || inPeriod(x.pm) || inPeriod(place.arrival) || inPeriod(x.sales);
    });
    groups.push({ key: group.key, gen: group.gen, vehicle: group.vehicle, label: group.label, lead, leadYear: latest?.my ?? "", active, inputs: group.inputs, result });
  }

  const sections = [...new Set(groups.map((g) => g.vehicle))].map((vehicle) => {
    const own = groups.filter((g) => g.vehicle === vehicle);
    return { vehicle, groups: own, total: computeTotals(own.map((g) => g.result), months.length) };
  });

  const rejected = all
    .filter((group) => group.rejected.length)
    .map((group) => {
      const byMonth = {};
      const noPm = [];
      for (const v of group.rejected) {
        const month = monthOfText(v.pm);
        if (month) (byMonth[month] ??= []).push(v);
        else noPm.push(v);
      }
      return { key: group.key, vehicle: group.vehicle, label: group.label, byMonth, noPm, count: group.rejected.length };
    });

  return {
    months, current, planFrom, groups, sections,
    total: computeTotals(groups.map((g) => g.result), months.length),
    rejected, skipped,
  };
}

/**
 * 매트릭스 한 칸에 들어간 차량.
 * @param {{inputs: object[]}} group buildKufri 의 모델 행
 * @param {"prod"|"invoice"|"arr"|"sales"|"it"} row
 * @param {string} month
 * @param {string} planFrom 계획 구간이 시작하는 달
 * @returns {Array<{v: object, kind: string, pm: string, arrival: string, note: string}>}
 *   note: Production 은 구분(actual · fixed · changeable), Arrival 은 actual(실제 도착 정보) · calc(산출), In Transit 은 actual(Invoice) · calc
 */
export function cellVehicles(group, row, month, planFrom) {
  const out = [];
  for (const x of group.inputs) {
    const place = placeVehicle(x, planFrom);
    if (!place) continue;
    const item = (note) => out.push({ v: x.v, kind: place.kind, pm: x.pm, arrival: place.arrival, note });
    if (row === "prod") {
      if (x.pm === month) item(place.kind);
      continue;
    }
    if (!place.counted) continue;
    if (row === "invoice" && x.invoice === month) item("");
    else if (row === "sales" && x.sales === month) item("");
    else if (row === "arr" && place.arrival === month) item(place.arrivalActual ? "actual" : "calc");
    else if (row === "it" && inTransitAt(place.transit, place.arrival, month)) item(place.transit.actual ? "actual" : "calc");
  }
  return out;
}
