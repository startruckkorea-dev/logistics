// KUFRI 생산판매계획의 계산 — 화면·저장과 무관한 순수 함수.
// 모델 한 행의 차량과 계획 값을 받아 월별 Production · Invoice · Arrival · Sales · OH Stock · In Transit · 재고월수를 낸다.
//
// 용어: 여기서 Arrival 과 OH Stock 은 입항(ATA) 기준이다. TSC 입고나 Current Status 의 "OH Stock"(통관 후)과 뜻이 다르다.
//
// 차량의 구분(Current Status)
//   실적       : In Production 이후(생산됨). PM 월의 Production 실적이다
//   확정       : Ordered(Fixed)
//   Changeable : Ordered(Changeable). 계획 값이 이 수량을 포함하므로 계획 구간에서는 참고로만 보여 준다
//   그 밖      : Ordered(Dummy) 는 세지 않는다. Cancelled · Rejected 는 부르는 쪽이 미리 뺀다
//
// 구간(Production)
//   확정 구간 : 당월의 다음 달까지.  합계 = 실적 + 확정 + Changeable (계획 값은 쓰지 않는다)
//   계획 구간 : 다다음 달부터.       합계 = 실적 + 확정 + 계획 값
// Sales 는 전달까지 실적, 당월부터 계획(비어 있으면 초기값).
//
// 지난 달에는 실적만 남긴다: 선적 기록(Invoice)이 없는 차량의 In Transit 과, 아직 들어오지 않은 차량의 추정 입항은
// 지난 달에 두지 않고 당월 이후로 넘긴다(placeVehicle).
import { addMonths } from "./dates.js";
import { STATUS } from "./status.js";

const PRODUCED = [STATUS.IN_PRODUCTION, STATUS.SHIPMENT_SCHEDULED, STATUS.IN_TRANSIT, STATUS.BONDED_STOCK, STATUS.OH_STOCK, STATUS.SOLD];
// 이미 들어온 차량의 상태. 이 상태가 아닌 차량의 추정 입항월은 당월보다 앞에 두지 않는다
const ARRIVED = [STATUS.BONDED_STOCK, STATUS.OH_STOCK, STATUS.SOLD];

/** 계획 구간이 시작하는 달: 당월의 다다음 달 */
export const firstPlanMonth = (current) => addMonths(current, 2);

/**
 * 차량의 구분.
 * @returns {"actual"|"fixed"|"changeable"|null} null = 계산에 넣지 않는 차량
 */
export function vehicleKind(status) {
  if (PRODUCED.includes(status)) return "actual";
  if (status === STATUS.ORDERED_FIXED) return "fixed";
  if (status === STATUS.ORDERED_CHANGEABLE) return "changeable";
  return null;
}

/**
 * 차량 한 대가 표의 어디에 들어가는지. 계산과 칸의 차량 목록이 같이 쓴다.
 * @param {{status, pm, arrival, estimate, invoice, lead}} v computeModel 의 차량
 * @param {string} planFrom 계획 구간이 시작하는 달
 * @param {string} current 당월
 * @returns {null|{kind, counted: boolean, arrival: string, arrivalActual: boolean, transit: null|{from: string, includeFrom: boolean, actual: boolean, notBefore?: string}}}
 *   null = 계산에 넣지 않는 차량. counted = Arrival · In Transit · Invoice · Sales 에 넣는다(계획 구간의 Changeable 과 PM 없는 Changeable 은 넣지 않는다).
 *   arrival = 입항월. 실제 도착 정보가 있으면 그 달(arrivalActual), 없으면 추정한다: 추정 입항월(estimate, ETA From TDD) → 생산월 + 리드타임.
 *     아직 들어오지 않은 차량의 추정 입항월이 당월보다 앞이면 당월로 본다(들어왔어야 할 달에 들어오지 못한 차량은 당월로 넘어온다).
 *   transit = 운송 구간의 시작. Invoice 가 있으면 그 달부터(실적), 없으면 생산월 다음 달부터(산출) —
 *     Invoice 가 없는 차량은 지난 달에는 세지 않고 당월부터만 센다(notBefore). 선적되지 못한 채 달이 넘어가면 당월로 넘어온다.
 */
export function placeVehicle(v, planFrom, current) {
  const kind = vehicleKind(v.status);
  if (!kind) return null;
  const counted = !(kind === "changeable" && (!v.pm || v.pm >= planFrom));
  let arrival = "";
  if (counted) {
    arrival = v.arrival || v.estimate || (v.pm ? addMonths(v.pm, v.lead) : "");
    if (!v.arrival && arrival && arrival < current && !ARRIVED.includes(v.status)) arrival = current;
  }
  let transit = null;
  if (arrival && v.invoice) transit = { from: v.invoice, includeFrom: true, actual: true };
  else if (arrival && v.pm) transit = { from: v.pm, includeFrom: false, actual: false, notBefore: current };
  return { kind, counted, arrival, arrivalActual: Boolean(counted && v.arrival), transit };
}

/** 그 달 말에 운송 중인지: 시작한 뒤이고 입항월 전이다 */
export const inTransitAt = (transit, arrival, month) =>
  Boolean(transit) &&
  (transit.includeFrom ? transit.from <= month : transit.from < month) &&
  (!transit.notBefore || month >= transit.notBefore) &&
  month < arrival;

/** 시작 월부터 n 개월의 목록 */
export const monthList = (start, count) => Array.from({ length: count }, (_, i) => addMonths(start, i));

/**
 * 판매 계획의 초기값: 당월 직전 n 개월 판매 실적의 평균(반올림).
 * @param {Array<{sales: string}>} vehicles
 * @param {string} current 당월 "YYYY-MM"
 * @param {"avg6"|"avg3"|"zero"} rule
 */
export function salesInitOf(vehicles, current, rule) {
  if (rule === "zero") return 0;
  const n = rule === "avg3" ? 3 : 6;
  const from = addMonths(current, -n);
  const count = vehicles.filter((v) => v.sales && v.sales >= from && v.sales < current).length;
  return Math.round(count / n);
}

const zeros = (n) => new Array(n).fill(0);
const sum = (list) => list.reduce((a, b) => a + b, 0);

// 최근 3개월(표 안에서) 평균 판매로 나눈 재고월수. 평균 판매가 0 이하면 null
function coverage(stock, sales) {
  return stock.map((value, i) => {
    const window = sales.slice(Math.max(0, i - 2), i + 1);
    const average = sum(window) / window.length;
    return average > 0 ? value / average : null;
  });
}

/**
 * 모델 한 행의 계산.
 * @param {object} input
 * @param {string[]} input.months 표의 달 "YYYY-MM"(이어진 달, 오름차순)
 * @param {string} input.current 당월 "YYYY-MM"
 * @param {Array<{status: string, pm: string, arrival: string, estimate?: string, invoice: string, sales: string, lead: number}>} input.vehicles
 *   invoice = 운송이 시작된 달(Invoice 월. 부르는 쪽이 Invoice 가 없는 차량에 Shipping 월을 대신 넣을 수 있다)
 *   pm · arrival · estimate · invoice · sales 는 월("YYYY-MM") 또는 빈 글. arrival = 실제 도착 정보가 있는 차량의 입항월(없으면 빈 글),
 *   estimate = 실제 도착 정보가 없을 때 먼저 쓰는 추정 입항월(ETA From TDD),
 *   lead = 그 차량의 리드타임(월, PM ~ 입항). Cancelled · Rejected 는 넣지 않는다
 * @param {number} input.planLead 계획 수량에 쓰는 리드타임(월)
 * @param {Record<string, number>} [input.prodPlan] 월 → Production 계획 값
 * @param {Record<string, number>} [input.salesPlan] 월 → Sales 계획 값
 * @param {"avg6"|"avg3"|"zero"} [input.salesInitRule]
 * @returns {object} 월별 배열(months 와 같은 길이):
 *   prodActual · prodFixed · prodChangeable · prodPlan(계획 구간의 계획 값) · prodPlanLeft(확정 구간에 남아 있는 계획 값, 계산에 쓰지 않는다) · prod(합계),
 *   invoice, arrActual(실제 도착 정보) · arrCalc(생산월 + 리드타임 산출) · arr,
 *   salesActual · salesPast(전달까지의 실적) · salesPlanned(당월부터의 계획) · sales,
 *   ohActual(지난 달 말에 실제로 있던 재고: 실제 도착 정보가 있고 그 달 말까지 판매되지 않은 차량) · ohCalc(나머지) · oh,
 *   itActual(Invoice 실적) · itCalc(산출) · it, cover · coverIT · coverAll,
 *   그리고 open(표 시작 전의 재고 = 시작 전 입항 − 시작 전 판매), salesInit, skipped{noPm, noArrival}
 */
export function computeModel(input) {
  const { months, current, vehicles, planLead } = input;
  const prodPlanIn = input.prodPlan ?? {};
  const salesPlanIn = input.salesPlan ?? {};
  const n = months.length;
  const first = months[0];
  const planFrom = firstPlanMonth(current);
  const index = Object.fromEntries(months.map((month, i) => [month, i]));

  const prodActual = zeros(n);
  const prodFixed = zeros(n);
  const prodChangeable = zeros(n);
  const invoice = zeros(n);
  const arrActual = zeros(n);
  const arrCalc = zeros(n);
  const salesActual = zeros(n);
  let openArrival = 0;
  let openSales = 0;
  // 운송 구간: [시작(placeVehicle 의 transit), 입항월, 수량]
  const pipes = [];
  const skipped = { noPm: 0, noArrival: 0 };

  const addArrival = (month, quantity, target) => {
    if (month < first) openArrival += quantity;
    else if (index[month] != null) target[index[month]] += quantity;
  };

  for (const v of vehicles) {
    const place = placeVehicle(v, planFrom, current);
    if (!place) continue;

    if (v.pm && index[v.pm] != null) {
      if (place.kind === "actual") prodActual[index[v.pm]]++;
      else if (place.kind === "fixed") prodFixed[index[v.pm]]++;
      else prodChangeable[index[v.pm]]++;
    }
    if (!v.pm) skipped.noPm++;
    if (!place.counted) continue;

    if (v.invoice && index[v.invoice] != null) invoice[index[v.invoice]]++;
    if (v.sales) {
      if (v.sales < first) openSales++;
      else if (index[v.sales] != null) salesActual[index[v.sales]]++;
    }
    if (!place.arrival) {
      skipped.noArrival++;
      continue;
    }
    addArrival(place.arrival, 1, place.arrivalActual ? arrActual : arrCalc);
    if (place.transit) pipes.push([place.transit, place.arrival, 1]);
  }

  // 계획 값: 계획 구간의 것만 쓴다. 확정 구간에 남은 값은 따로 돌려준다(전환 차이 표시용)
  const prodPlan = zeros(n);
  const prodPlanLeft = zeros(n);
  months.forEach((month, i) => {
    const quantity = Number(prodPlanIn[month]) || 0;
    if (!quantity) return;
    if (month < planFrom) {
      prodPlanLeft[i] = quantity;
      return;
    }
    prodPlan[i] = quantity;
    const arrival = addMonths(month, planLead);
    addArrival(arrival, quantity, arrCalc);
    pipes.push([{ from: month, includeFrom: false, actual: false }, arrival, quantity]);
  });

  const prod = months.map((month, i) => prodActual[i] + prodFixed[i] + (month < planFrom ? prodChangeable[i] : prodPlan[i]));
  const arr = arrActual.map((value, i) => value + arrCalc[i]);

  const salesInit = salesInitOf(vehicles, current, input.salesInitRule ?? "zero");
  const sales = months.map((month, i) => (month < current ? salesActual[i] : salesPlanIn[month] != null ? Number(salesPlanIn[month]) || 0 : salesInit));

  // Sales 를 값의 성격으로 나눈다: 전달까지 = 실적, 당월부터 = 계획
  const salesPast = months.map((month, i) => (month < current ? sales[i] : 0));
  const salesPlanned = months.map((month, i) => (month < current ? 0 : sales[i]));

  const open = openArrival - openSales;
  const oh = [];
  let stock = open;
  for (let i = 0; i < n; i++) {
    stock += arr[i] - sales[i];
    oh.push(stock);
  }

  // OH Stock 의 실적: 지난 달 말에 실제로 있던 차량(실제 도착 정보의 입항월이 그 달까지이고, 그 달 말까지 판매되지 않았다).
  // 당월부터는 아직 지나지 않은 월말이라 전부 산출이다. 산출 = 합계 − 실적(지난 달에 남는 값은 입항 정보가 없는 차량에서 온다)
  const ohActual = months.map((month) => {
    if (month >= current) return 0;
    let count = 0;
    for (const v of vehicles) {
      const place = placeVehicle(v, planFrom, current);
      if (place?.counted && place.arrivalActual && place.arrival <= month && !(v.sales && v.sales <= month)) count++;
    }
    return count;
  });
  const ohCalc = oh.map((value, i) => value - ohActual[i]);

  const inTransit = (actual) =>
    months.map((month) =>
      pipes.reduce((total, [transit, to, quantity]) => total + (transit.actual === actual && inTransitAt(transit, to, month) ? quantity : 0), 0)
    );
  const itActual = inTransit(true);
  const itCalc = inTransit(false);
  const it = itActual.map((value, i) => value + itCalc[i]);

  return {
    prodActual, prodFixed, prodChangeable, prodPlan, prodPlanLeft, prod,
    invoice, arrActual, arrCalc, arr, salesActual, salesPast, salesPlanned, sales, ohActual, ohCalc, oh, itActual, itCalc, it,
    cover: coverage(oh, sales),
    coverIT: coverage(it, sales),
    coverAll: coverage(oh.map((value, i) => value + it[i]), sales),
    open, salesInit, skipped,
  };
}

const SUM_KEYS = [
  "prodActual", "prodFixed", "prodChangeable", "prodPlan", "prodPlanLeft", "prod",
  "invoice", "arrActual", "arrCalc", "arr", "salesActual", "salesPast", "salesPlanned", "sales", "ohActual", "ohCalc", "oh", "itActual", "itCalc", "it",
];

/**
 * 여러 모델 행의 합계. 재고월수는 모델 값의 평균이 아니라 합계 판매로 다시 계산한다.
 * @param {object[]} results computeModel 의 결과들
 * @param {number} count 달 수
 */
export function computeTotals(results, count) {
  const total = Object.fromEntries(SUM_KEYS.map((key) => [key, zeros(count)]));
  total.open = 0;
  for (const result of results) {
    for (const key of SUM_KEYS) for (let i = 0; i < count; i++) total[key][i] += result[key][i] || 0;
    total.open += result.open;
  }
  total.cover = coverage(total.oh, total.sales);
  total.coverIT = coverage(total.it, total.sales);
  total.coverAll = coverage(total.oh.map((value, i) => value + total.it[i]), total.sales);
  return total;
}

/**
 * 재고월수의 등급.
 * @param {number|null} value
 * @param {{coverageMin: number, coverageNormal: number, coverageWarn: number}} limits 기준값
 * @returns {"none"|"good"|"warn"|"crit"} 음수 · 하한 미만 · 주의 초과 = crit, 정상 초과 = warn, 그 밖 = good, 값 없음 = none
 */
export function coverageLevel(value, limits) {
  if (value == null) return "none";
  if (value < 0 || value < limits.coverageMin || value > limits.coverageWarn) return "crit";
  return value > limits.coverageNormal ? "warn" : "good";
}
