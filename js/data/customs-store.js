// 통관 완료 처리 — 업로드한 표(Commission · 수리일 · 신고번호)를 차량에 넣는다.
//   1. parseCustomsBook : 엑셀에서 세 열을 찾아 행으로 읽는다
//   2. planCustoms      : 행마다 차량과 맞춰 판정한다(반영 대상 / 검토 필요 / 변경 없음 / 미등록 / 오류)
//   3. applyCustoms     : 고른 행만 저장한다. 통관일이 들어가는 Bonded Stock 차량은 OH Stock 으로 바꾼다
import { toIsoDate } from "../domain/dates.js";
import { STATUS } from "../domain/status.js";
import { checkInput, normalizeInput, saveVehicles, targetListNames } from "./store.js";

/** 이력에 남는 변경 경로 */
export const CUSTOMS_SOURCE = "통관 완료 처리";

/** 업로드 템플릿의 머리글. 이 세 열이 있는 줄을 머리글로 본다(열 순서는 상관없다). */
export const CUSTOMS_HEADERS = { commission: "Commission", date: "수리일", license: "신고번호" };
export const CUSTOMS_TEMPLATE_FILE = "Customs_Upload_Template.xlsx";

/** 차량에 넣는 열. 업로드 열 → 차량 열 */
export const CUSTOMS_FIELDS = [
  { column: "date", field: "customs_clearance_date" },
  { column: "license", field: "import_license" },
];

// 머리글을 찾아볼 줄 수(표 위에 제목 줄이 있는 파일을 받아 준다)
const HEADER_SCAN_ROWS = 20;

const cellText = (value) =>
  typeof value === "number" && Number.isInteger(value) ? String(value) : String(value ?? "").trim();
const headerKey = (value) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

// "2026-11-03" · "2026.11.03" · "2026/11/03" · "20261103" → "YYYY-MM-DD". 그 밖의 표기와 없는 날짜는 null
function parseDate(text) {
  const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  return m ? toIsoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

// 시트에서 머리글 줄과 세 열의 위치를 찾는다
function findHeader(sheet) {
  const wanted = Object.entries(CUSTOMS_HEADERS).map(([column, label]) => [column, headerKey(label)]);
  for (let r = 0; r < Math.min(sheet.text.length, HEADER_SCAN_ROWS); r++) {
    const keys = sheet.text[r].map(headerKey);
    const at = Object.fromEntries(wanted.map(([column, key]) => [column, keys.indexOf(key)]));
    if (Object.values(at).every((index) => index >= 0)) return { row: r, at };
  }
  return null;
}

/**
 * 읽은 통합 문서에서 통관 표를 꺼낸다. 머리글이 있는 첫 시트를 쓴다.
 * @param {{sheets: Array<{name, firstRow, values, text}>}} book readXlsxFile 의 결과
 * @returns {{sheet: string, rows: Array<{line: number, commission: string, date: string, license: string,
 *   error: null | "no_commission" | "date" | "empty"}>} | null} 머리글을 찾지 못하면 null.
 *   line 은 엑셀 행 번호, date 는 "YYYY-MM-DD"(읽지 못했으면 엑셀에 적힌 글자 그대로)
 */
export function parseCustomsBook(book) {
  for (const sheet of book.sheets) {
    const header = findHeader(sheet);
    if (!header) continue;
    const rows = [];
    for (let r = header.row + 1; r < sheet.values.length; r++) {
      const value = (column) => sheet.values[r][header.at[column]];
      const commission = cellText(value("commission"));
      const dateText = cellText(value("date"));
      const license = cellText(value("license"));
      if (!commission && !dateText && !license) continue;
      const date = dateText ? parseDate(dateText) : "";
      rows.push({
        line: sheet.firstRow + r,
        commission,
        date: date ?? dateText,
        license,
        error: !commission ? "no_commission" : date === null ? "date" : !dateText && !license ? "empty" : null,
      });
    }
    return { sheet: sheet.name, rows };
  }
  return null;
}

// Commission No 로 차량을 찾는다. 엑셀이 숫자로 바꿔 앞자리 0 이 빠진 값도 한 대로 좁혀지면 받아 준다.
function vehicleFinder(vehicles) {
  const exact = new Map(vehicles.map((v) => [v.commission_no, v]));
  const loose = new Map();
  const strip = (text) => text.replace(/^0+/, "");
  for (const v of vehicles) {
    const key = strip(String(v.commission_no ?? ""));
    loose.set(key, loose.has(key) ? null : v);
  }
  return (commission) => exact.get(commission) ?? loose.get(strip(commission)) ?? null;
}

/**
 * 행마다 차량과 맞춰 판정한다. 아무것도 쓰지 않는다.
 * @param {ReturnType<typeof parseCustomsBook>["rows"]} rows
 * @param {object[]} vehicles loadVehicles 의 차량 행
 * @param {string} today 기준일 "YYYY-MM-DD". 이보다 뒤의 통관일은 받지 않는다
 * @returns {Array<{
 *   line, commission, date, license, vehicle: object | null,
 *   kind: "ok" | "review" | "same" | "missing" | "error",
 *   error: null | "no_commission" | "date" | "empty" | "future" | "duplicate" | "too_long",
 *   fill: string[],        // 지금 비어 있어 채우는 차량 열
 *   overwrite: string[],   // 지금 값이 있어 덮어쓰게 되는 차량 열
 *   offStatus: boolean,    // 차량이 Bonded Stock 이 아니다
 * }>}
 *   ok = Bonded Stock 차량의 빈 칸만 채운다(그대로 반영). review = 사람이 반영 여부를 골라야 한다.
 */
export function planCustoms(rows, vehicles, today) {
  const find = vehicleFinder(vehicles);
  const seen = new Map();
  const items = rows.map((row) => {
    const item = { ...row, vehicle: null, kind: "error", fill: [], overwrite: [], offStatus: false };
    if (item.error) return item;
    if (item.date > today) return { ...item, error: "future" };
    if (checkInput("import_license", item.license)) return { ...item, error: "too_long" };
    const vehicle = find(item.commission);
    if (!vehicle) return { ...item, kind: "missing" };
    item.vehicle = vehicle;
    seen.set(vehicle, [...(seen.get(vehicle) ?? []), item]);
    for (const { column, field } of CUSTOMS_FIELDS) {
      const next = normalizeInput(item[column]);
      const now = normalizeInput(vehicle[field]);
      if (!next || next === now) continue;
      (now ? item.overwrite : item.fill).push(field);
    }
    item.offStatus = vehicle.current_status !== STATUS.BONDED_STOCK;
    if (!item.fill.length && !item.overwrite.length) item.kind = "same";
    else item.kind = item.offStatus || item.overwrite.length ? "review" : "ok";
    return item;
  });
  // 같은 차량이 두 번 이상 나오면 어느 줄이 맞는지 알 수 없으므로 모두 받지 않는다
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (const item of group) Object.assign(item, { kind: "error", error: "duplicate" });
  }
  return items;
}

/** 검토 행에서 고를 수 있는 선택. skip = 반영 안 함, fill = 빈 칸만, all = 덮어쓰기 포함 전부 */
export function reviewChoices(item) {
  const choices = ["skip"];
  if (item.fill.length && item.overwrite.length) choices.push("fill");
  choices.push("all");
  return choices;
}

// 그 행이 차량에 넣을 값. 넣을 것이 없으면 null
function inputsOf(item, choice) {
  const fields = choice === "fill" ? item.fill : choice === "all" ? [...item.fill, ...item.overwrite] : [];
  if (!fields.length) return null;
  const inputs = {};
  for (const { column, field } of CUSTOMS_FIELDS) if (fields.includes(field)) inputs[field] = item[column];
  if (inputs.customs_clearance_date && item.vehicle.current_status === STATUS.BONDED_STOCK) {
    inputs.current_status = STATUS.OH_STOCK;
  }
  return inputs;
}

/** 그 행을 그 선택으로 반영하면 OH Stock 으로 바뀌는가 */
export const turnsToOhStock = (item, choice) => inputsOf(item, choice)?.current_status === STATUS.OH_STOCK;

/** 저장할 때 쓰는 List 이름(저장 전 확인 창에 보여준다) */
export const customsListNames = () => targetListNames(CUSTOMS_FIELDS.map((f) => f.field));

/**
 * 고른 행을 저장한다.
 * @param {Array<{item: object, choice: "fill" | "all"}>} picks ok 행은 choice "all" 로 넘긴다
 * @param {string} today 기준일. 이보다 뒤의 통관일은 저장하지 않는다
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{
 *   results: Map<object, "saved" | "unchanged" | "conflict" | "denied" | "invalid" | string>,  // item → 결과(그 밖은 오류 코드)
 *   saved: number, cleared: number,              // 저장한 차량 수, 그중 OH Stock 으로 바뀐 수
 *   historyFailed: number, historyCodes: string[],
 * }>}
 */
export async function applyCustoms(picks, today, onProgress) {
  const jobs = [];
  for (const { item, choice } of picks) {
    if (!item.vehicle || (item.kind !== "ok" && item.kind !== "review")) continue;
    if (item.date > today) continue;
    const inputs = inputsOf(item, item.kind === "ok" ? "all" : choice);
    if (inputs) jobs.push({ item, edit: { vehicle: item.vehicle, inputs, customs: true } });
  }
  const out = await saveVehicles(jobs.map((job) => job.edit), CUSTOMS_SOURCE, onProgress);

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
    cleared: out.saved.filter((s) => s.changes.some((c) => c.field === "current_status")).length,
    historyFailed: out.historyFailed,
    historyCodes: out.historyCodes,
  };
}
