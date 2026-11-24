// AFAB 업로드 — 올린 AFAB 엑셀을 차량의 AFAB 열에 넣는다.
//   1. loadAfabRules : SharePoint 의 AFAB 규칙 파일을 읽고 검사한다(머리글·열 대응·변환은 그 파일에만 있다)
//   2. readAfabTable : 올린 통합 문서에 규칙을 적용해 AFAB 표(차량 1대 = 1행)를 만든다
//   3. planAfab      : 행마다 차량과 맞춰 판정한다(반영 대상 / 검토 필요 / 변경 없음 / 미등록 / 오류)
//   4. applyAfab     : 고른 행만 저장한다. AFAB List 에 행이 없는 차량은 행을 만든다
// Current Status 는 두 가지만 바꾼다(statusChange): Rejected, Shipment scheduled.
// 차량 마스터에 없는 Commission 은 만들지 않는다.
import { readTextFile } from "../lib/sharepoint.js";
import { SHAREPOINT, ENV_NAME } from "../lib/config.js";
import { validateRules } from "../etl/rules-validate.js";
import { runRules } from "../etl/transform.js";
import { LISTS } from "../etl/lists.js";
import { addDays, ISO_DATE, ISO_MONTH, monthOf } from "../domain/dates.js";
import { needsShippingCalc, shippingCalc } from "../domain/shipping-calc.js";
import { STATUS, isShipmentScheduled } from "../domain/status.js";
import { commissionFinder } from "./vehicles.js";
import {
  AFAB_FIELDS, AFAB_DERIVED_FIELDS, checkInput, normalizeInput, saveVehicles, targetListNames,
} from "./store.js";

/** 이력에 남는 변경 경로 */
export const AFAB_SOURCE = "AFAB 업로드";

const AFAB_DEF = LISTS.find((def) => def.id === "logisticsAfab");
const KEY = AFAB_DEF.key;
// ETA From TDD = TDD Calc + 75일
const ETA_FROM_TDD_DAYS = 75;
// 날짜("YYYY-MM-DD")가 들어가는 열. PM 은 날짜 또는 월("YYYY-MM")이다
const DATE_COLUMNS = ["changeability_date", "tdd_calc", "dispatch", "shipping", "invoice", "planned_arrival"];

// 결과 표에 둘 수 있는 확인용 열(List 에는 넣지 않는다). Vin No 가 파일의 두 열에 올 때 다른 쪽 열의 값을 여기에 싣는다.
// 값이 있고 vin_no 와 다르면 그 행은 받지 않는다
const VIN_CHECK = "vin_no_check";
// 결과 표에 둘 수 있는 표시 열(List 에는 넣지 않는다). 규칙 파일이 Rejected 로 판정한 행에 값을 넣는다.
// 무엇을 Rejected 로 보는지는 규칙 파일에만 있다. 이 열이 없으면 Rejected 전환을 하지 않는다
const REJECT_FLAG = "status_rejected";
// Rejected 로 바뀔 수 있는 상태
const REJECTABLE = [STATUS.ORDERED_DUMMY, STATUS.ORDERED_CHANGEABLE, STATUS.ORDERED_FIXED];

/** 규칙 파일 경로(오류 안내에 보여준다) */
export const afabRulesPath = () => SHAREPOINT.afabRulesFile;

/**
 * 규칙 파일을 쓸 수 없을 때의 오류.
 * code: "missing"(파일이 없다) | "unreadable"(읽지 못했다) | "json" | "invalid"(형식 오류. errors 에 내용)
 */
export class AfabRulesError extends Error {
  constructor(code, { status = null, errors = [] } = {}) {
    super(`afab_rules_${code}`);
    this.code = code;
    this.status = status;
    this.errors = errors;
  }
}

// 규칙 파일이 AFAB 업로드에 쓸 수 있는 모양인지: 결과 표가 AFAB 표 하나이고 열이 AFAB List 의 열이다
function checkAfabOutput(rules) {
  const errors = [];
  const add = (item, message) => errors.push({ where: "outputs", item, message });
  const outputs = rules.outputs.filter((o) => o.name === AFAB_DEF.table);
  if (outputs.length !== 1 || rules.outputs.length !== 1) {
    add("name", `결과 표는 ${AFAB_DEF.table} 하나여야 합니다`);
    return errors;
  }
  const [output] = outputs;
  const names = output.columns.map((c) => c.name);
  if (output.columns.find((c) => c.from === output.key)?.name !== KEY) add("key", `키 열의 이름은 ${KEY} 여야 합니다`);
  const known = new Set([...AFAB_DEF.columns.map((c) => c.name), VIN_CHECK, REJECT_FLAG]);
  const unknown = names.filter((name) => !known.has(name));
  if (unknown.length) add("columns", `AFAB List 에 없는 열입니다: ${unknown.join(", ")}`);
  return errors;
}

/**
 * AFAB 규칙 파일을 읽는다.
 * @returns {Promise<object>} validateRules 를 통과한 규칙
 * @throws {AfabRulesError}
 */
export async function loadAfabRules() {
  let file;
  try {
    file = await readTextFile(SHAREPOINT.afabRulesFile);
  } catch (err) {
    throw new AfabRulesError(err?.status === 404 ? "missing" : "unreadable", { status: err?.status ?? null });
  }
  let rules;
  try {
    rules = JSON.parse(file.text);
  } catch {
    // JSON.parse 의 오류 문구에는 파일 내용 일부가 섞일 수 있어 넘기지 않는다
    throw new AfabRulesError("json");
  }
  const errors = validateRules(rules, ENV_NAME);
  if (!errors.length) errors.push(...checkAfabOutput(rules));
  if (errors.length) throw new AfabRulesError("invalid", { errors });
  return rules;
}

// 결과 표의 칸 → 비교·저장용 글자
const cellText = (value) => (value == null ? "" : normalizeInput(String(value)));

/**
 * 올린 통합 문서에 규칙을 적용해 AFAB 표를 만든다.
 * @param {object} workbook readXlsxWorkbook 의 결과
 * @param {object} rules loadAfabRules 의 결과
 * @returns {{fields: string[],
 *   rows: Array<{line: number, commission: string, values: Record<string, string>, vinCheck: string, rejected: boolean}>}}
 *   fields 는 파일이 주는 AFAB 열(키 제외). line 은 엑셀 행 번호. vinCheck 는 확인용 열의 값(없으면 "").
 *   rejected 는 규칙 파일이 그 행을 Rejected 로 판정했는지
 * @throws {RuleError} 규칙 실행 중 오류(시트·머리글이 다르다 등)
 */
export function readAfabTable(workbook, rules) {
  const table = runRules(workbook, rules).tables.find((t) => t.name === AFAB_DEF.table);
  const keyAt = table.columns.indexOf(KEY);
  const fields = table.columns.filter((name) => ![KEY, VIN_CHECK, REJECT_FLAG].includes(name));
  const checkAt = table.columns.indexOf(VIN_CHECK);
  const rejectAt = table.columns.indexOf(REJECT_FLAG);
  const rows = table.rows.map((row, i) => ({
    line: table.lines[i],
    // Commission No 에는 공백이 없다. 파일에 섞여 들어온 공백(앞뒤와 가운데)은 모두 뺀다
    commission: cellText(row[keyAt]).replace(/\s+/g, ""),
    values: Object.fromEntries(table.columns.map((name, c) => [name, cellText(row[c])]).filter(([name]) => fields.includes(name))),
    vinCheck: checkAt < 0 ? "" : cellText(row[checkAt]),
    rejected: rejectAt >= 0 && cellText(row[rejectAt]) !== "",
  }));
  return { fields, rows };
}

const isDateLike = (field, value) =>
  field === "pm" ? ISO_DATE.test(value) || ISO_MONTH.test(value) : !DATE_COLUMNS.includes(field) || ISO_DATE.test(value);

// AFAB 값이 바뀌면 같이 맞추는 Main List 의 값. changes 는 그 차량의 AFAB 변경
function derivedChanges(vehicle, changes, colorByCode) {
  const next = new Map(changes.map((c) => [c.field, c.new]));
  const after = (field) => (next.has(field) ? next.get(field) : normalizeInput(vehicle[field]));
  const out = [];
  const set = (field, value) => {
    const old = normalizeInput(vehicle[field]);
    if (value !== old) out.push({ field, old, new: value });
  };
  // PM → Shipping Calc: 대상 단계이고 Shipping 이 비어 있을 때만. 계산할 수 없으면 그대로 둔다
  if (next.has("pm") && needsShippingCalc(vehicle.current_status, after("shipping"))) {
    const value = shippingCalc(monthOf(next.get("pm")), vehicle.lead_days);
    if (value) set("shipping_calc", value);
  }
  // TDD Calc → ETA From TDD. 날짜가 아닌 값이면 그대로 둔다
  if (next.has("tdd_calc")) {
    const value = addDays(next.get("tdd_calc"), ETA_FROM_TDD_DAYS);
    if (value) set("eta_from_tdd", value);
  }
  // Color Code → Color Name. 색상 마스터에 없는 코드면 이름을 비운다(이전 색상의 이름이 남지 않게)
  if (next.has("color_code")) {
    set("color_name", normalizeInput(colorByCode.get(next.get("color_code"))?.color_name_mb));
  }
  return out;
}

// 이 업로드로 바뀌는 Current Status. 바뀌지 않으면 null. changes 는 그 차량의 AFAB 변경
//   - Rejected          : 파일이 Rejected 로 판정한 행이고 차량이 Ordered 3종일 때
//   - Shipment scheduled: 차량이 In Production 이고, 이 업로드로 Vessel 이나 Shipping 이 바뀌어 둘 다 있게 될 때
// Rejected 를 푸는 것은 여기서 하지 않는다(사람이 Current Status 를 직접 고친다).
function statusChange(vehicle, changes, row) {
  const now = vehicle.current_status;
  const next = new Map(changes.map((c) => [c.field, c.new]));
  const after = (field) => (next.has(field) ? next.get(field) : normalizeInput(vehicle[field]));
  if (row.rejected && REJECTABLE.includes(now)) return STATUS.REJECTED;
  if (
    now === STATUS.IN_PRODUCTION &&
    (next.has("vessel") || next.has("shipping")) &&
    isShipmentScheduled(after("vessel"), after("shipping")) &&
    ISO_DATE.test(after("shipping"))
  ) {
    return STATUS.SHIPMENT_SCHEDULED;
  }
  return null;
}

/**
 * 행마다 차량과 맞춰 판정한다. 아무것도 쓰지 않는다.
 * @param {ReturnType<typeof readAfabTable>} table
 * @param {object[]} vehicles loadVehicles 의 차량 행
 * @param {object[]} colors loadColorMaster 의 행
 * @returns {{
 *   items: Array<{
 *     line, commission, vehicle: object | null,
 *     kind: "ok" | "review" | "same" | "missing" | "error",
 *     error: null | "no_commission" | "duplicate" | "too_long" | "vin_mismatch",  // vin_mismatch: 파일의 두 Vin No 열 값이 다르다
 *     changes: Array<{field, old, new}>,   // AFAB List 의 열
 *     derived: Array<{field, old, new}>,   // 같이 맞추는 Main List 의 열
 *     status: {old, new} | null,           // 바뀌는 Current Status
 *     creates: boolean,      // AFAB List 에 행이 없어 새로 만든다
 *     oddDates: string[],    // 날짜 열인데 날짜가 아닌 값이 들어가는 열
 *     unknownColor: boolean, // 새 Color Code 가 색상 마스터에 없다
 *   }>,
 *   absent: object[],        // 파일에 없는 차량(아무것도 바꾸지 않는다)
 * }}
 *   ok = 그대로 반영해도 되는 행. review = 날짜 열에 날짜가 아닌 값이 들어가는 행(사람이 확인할 행).
 *   파일의 빈 칸은 기존 값을 지우지 않는다(바뀌는 값으로 보지 않는다).
 */
export function planAfab(table, vehicles, colors) {
  const find = commissionFinder(vehicles);
  const colorByCode = new Map(colors.map((c) => [String(c.color_code), c]));
  const seen = new Map();
  const items = table.rows.map((row) => {
    const item = {
      line: row.line, commission: row.commission, vehicle: null, kind: "error", error: null,
      changes: [], derived: [], status: null, creates: false, oddDates: [], unknownColor: false,
    };
    if (!row.commission) return { ...item, error: "no_commission" };
    const vehicle = find(row.commission);
    if (!vehicle) return { ...item, kind: "missing" };
    item.vehicle = vehicle;
    seen.set(vehicle, [...(seen.get(vehicle) ?? []), item]);
    // (seen 에 넣은 객체를 그대로 돌려준다. 아래의 중복 판정이 같은 객체를 고친다)
    if (row.vinCheck && row.vinCheck !== (row.values.vin_no ?? "")) {
      item.error = "vin_mismatch";
      return item;
    }
    if (table.fields.some((field) => checkInput(field, row.values[field]))) {
      item.error = "too_long";
      return item;
    }

    for (const field of table.fields) {
      const next = row.values[field];
      const old = normalizeInput(vehicle[field]);
      // 파일의 빈 칸은 기존 값을 지우지 않는다
      if (!next || next === old) continue;
      item.changes.push({ field, old, new: next });
      if (!isDateLike(field, next)) item.oddDates.push(field);
    }
    item.creates = item.changes.length > 0 && !vehicle._items.afab;
    // Main List 에 행이 없는 차량은 상태와 같이 맞출 값을 쓸 곳이 없다
    if (vehicle._items.main) {
      const status = statusChange(vehicle, item.changes, row);
      if (status) item.status = { old: vehicle.current_status, new: status };
      item.derived = derivedChanges(vehicle, item.changes, colorByCode);
    }
    if (!item.changes.length && !item.status) {
      item.kind = "same";
      return item;
    }
    const color = item.changes.find((c) => c.field === "color_code")?.new;
    item.unknownColor = Boolean(color) && !colorByCode.has(color);
    item.kind = item.oddDates.length ? "review" : "ok";
    return item;
  });
  // 같은 차량이 두 번 이상 나오면 어느 줄이 맞는지 알 수 없으므로 모두 받지 않는다
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const item of group) Object.assign(item, { kind: "error", error: "duplicate" });
  }
  return { items, absent: vehicles.filter((v) => !seen.has(v)) };
}

/** 저장할 때 쓰는 List 이름(저장 전 확인 창에 보여준다) */
export const afabListNames = () => targetListNames([...AFAB_FIELDS, ...AFAB_DERIVED_FIELDS]);

/** 그 행이 바꾸는 상태의 종류: "rejected" | "scheduled" | null */
export const statusKind = (item) =>
  !item.status ? null : item.status.new === STATUS.REJECTED ? "rejected" : "scheduled";

/**
 * 고른 행을 저장한다.
 * @param {object[]} picks planAfab 이 돌려준 행 중 반영할 것(ok · review). 그 밖의 행은 무시한다
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{
 *   results: Map<object, "saved" | "unchanged" | "conflict" | "denied" | "invalid" | string>,  // item → 결과(그 밖은 오류 코드)
 *   saved: number, created: number,              // 저장한 차량 수, 그중 AFAB List 에 행을 만든 수
 *   historyFailed: number, historyCodes: string[],
 * }>}
 */
export async function applyAfab(picks, onProgress) {
  const jobs = picks
    .filter((item) => item.vehicle && (item.kind === "ok" || item.kind === "review"))
    .map((item) => ({
      item,
      creates: item.creates,
      edit: {
        vehicle: item.vehicle,
        inputs: {
          ...Object.fromEntries([...item.changes, ...item.derived].map((c) => [c.field, c.new])),
          ...(item.status ? { current_status: item.status.new } : {}),
        },
        afab: true,
      },
    }));
  const out = await saveVehicles(jobs.map((job) => job.edit), AFAB_SOURCE, onProgress);

  const byVehicle = new Map();
  for (const s of out.saved) byVehicle.set(s.vehicle, "saved");
  for (const c of out.conflicts) byVehicle.set(c.vehicle, "conflict");
  for (const v of out.denied) byVehicle.set(v, "denied");
  for (const i of out.invalid) byVehicle.set(i.vehicle, "invalid");
  for (const f of out.failed) byVehicle.set(f.vehicle, f.code);
  const results = new Map(jobs.map((job) => [job.item, byVehicle.get(job.item.vehicle) ?? "unchanged"]));
  return {
    results,
    saved: out.saved.length,
    created: jobs.filter((job) => job.creates && results.get(job.item) === "saved").length,
    historyFailed: out.historyFailed,
    historyCodes: out.historyCodes,
  };
}
