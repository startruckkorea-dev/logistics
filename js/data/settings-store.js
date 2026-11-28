// 기준값 — KUFRI 생산판매계획이 쓰는 값. List 가 아니라 JSON 파일(Modify 폴더)에 둔다.
// 마스터·설정의 "기준값" 탭에서 고친다. 파일은 사람이 올려 두며, 없으면 만들지 않는다.
// Optimus 분류의 이름과 분류표의 값은 코드에 두지 않고 이 파일에만 둔다. 형식은 schema/settings.schema.json.
import { ENV_NAME, SHAREPOINT } from "../lib/config.js";
import { readJsonFile, writeJsonFile } from "../lib/sharepoint.js";

/** 판매 계획 초기값 규칙: 최근 6개월 실적 평균 / 최근 3개월 실적 평균 / 0 */
export const SALES_INIT = ["avg6", "avg3", "zero"];
/** 계획 개월 수로 고를 수 있는 값 */
export const PLAN_MONTHS = [12, 24, 36, 48];

// 값 하나짜리 항목과 그 형식
const SCALARS = {
  coverageMin: "decimal",
  coverageNormal: "decimal",
  coverageWarn: "decimal",
  overstockLimit: "decimal",
  defaultLeadMonths: "lead",
  salesInit: "salesInit",
  planStart: "month",
  planMonths: "planMonths",
  invoiceFromShippingUntil: "monthOptional",
};
// 비워 둘 수 있는 항목(파일에 없어도 된다)
const OPTIONAL = ["invoiceFromShippingUntil"];
/** 값 하나짜리 항목의 이름(화면에 놓는 순서) */
export const SCALAR_KEYS = Object.keys(SCALARS);
/** 표로 두는 항목(키 → 값). optimusSubcat: Sub cat 번호 → Optimus 분류(optimusGroups 의 이름). 표에 없는 번호는 미분류다 */
export const MAP_KEYS = ["optimusSubcat"];

const MAX_DECIMAL = 99;
const MAX_LEAD = 24;
const isMonth = (text) => /^\d{4}-(0[1-9]|1[0-2])$/.test(text);

/** 차량의 Sub cat 번호: sub_cat 값의 앞 두 자리 숫자. 없으면 "" */
export const subcatCode = (value) => /^\d{2}/.exec(String(value ?? "").trim())?.[0] ?? "";

/**
 * Optimus 가 차량을 나누는 분류의 이름 목록(파일의 optimusGroups). 형식이 맞지 않으면 빈 목록.
 * 차량의 Model 값과는 다른 묶음이다 — 여러 Model 이 한 분류에 들어갈 수 있고, 어느 분류인지는 Sub cat 번호로만 정한다.
 */
export function optimusGroupsOf(data) {
  const list = data?.optimusGroups;
  const ok = Array.isArray(list) && list.every((name) => typeof name === "string" && name.trim()) && new Set(list).size === list.length;
  return ok ? list : [];
}

/** Sub cat 번호로 쓸 수 있는 글(숫자 두 자리)인지 */
export const isSubcatCode = (text) => /^\d{2}$/.test(text);

/**
 * 입력한 글을 항목의 값으로 바꾼다.
 * @param {string} key 값 하나짜리 항목의 이름
 * @param {string|number} raw
 * @returns {{value: any}|{error: "required"|"number"|"lead"|"choice"|"month"}} 비워 둘 수 있는 항목을 비우면 value 가 빈 글이다
 */
export function parseSetting(key, raw) {
  const kind = SCALARS[key];
  const text = String(raw ?? "").trim();
  if (!text) return OPTIONAL.includes(key) ? { value: "" } : { error: "required" };
  if (kind === "decimal") {
    const value = Number(text);
    return Number.isFinite(value) && value >= 0 && value <= MAX_DECIMAL ? { value } : { error: "number" };
  }
  if (kind === "lead") {
    const value = Number(text);
    return Number.isInteger(value) && value >= 1 && value <= MAX_LEAD ? { value } : { error: "lead" };
  }
  if (kind === "planMonths") {
    const value = Number(text);
    return PLAN_MONTHS.includes(value) ? { value } : { error: "choice" };
  }
  if (kind === "salesInit") return SALES_INIT.includes(text) ? { value: text } : { error: "choice" };
  return isMonth(text) ? { value: text } : { error: "month" };
}

/**
 * 기준값 전체를 검사한다. 저장하기 전에 부른다.
 * @param {object} data
 * @returns {Array<{key: string, error: string}>} 문제가 없으면 빈 목록.
 *   error: parseSetting 의 값, "order"(재고월수 하한 < 정상 ≤ 주의가 아니다), "groups"(분류 목록이 형식에 맞지 않는다),
 *   "map"(표의 번호가 두 자리 숫자가 아니거나 분류가 목록에 없다)
 */
export function checkSettings(data) {
  const errors = [];
  for (const key of SCALAR_KEYS) {
    const parsed = parseSetting(key, data?.[key]);
    if (OPTIONAL.includes(key) && !parsed.error && parsed.value === "") continue;
    // 숫자 항목에 글로 적힌 숫자가 들어 있으면 형식 오류다
    const wrongType = !parsed.error && typeof parsed.value !== typeof data[key];
    if (parsed.error || wrongType) errors.push({ key, error: parsed.error ?? "number" });
  }
  if (!errors.length && !(data.coverageMin < data.coverageNormal && data.coverageNormal <= data.coverageWarn)) {
    errors.push({ key: "coverageNormal", error: "order" });
  }
  const groups = optimusGroupsOf(data);
  if (data?.optimusGroups != null && !groups.length) errors.push({ key: "optimusGroups", error: "groups" });
  const map = data?.optimusSubcat;
  const isObject = map != null && typeof map === "object" && !Array.isArray(map);
  const ok = map == null || (isObject && Object.entries(map).every(([code, group]) => isSubcatCode(code) && groups.includes(group)));
  if (!ok) errors.push({ key: "optimusSubcat", error: "map" });
  return errors;
}

/**
 * 기준값에 변경분을 얹은 새 객체를 돌려준다(원래 객체는 그대로).
 * @param {object} data
 * @param {object} patch 값 하나짜리 항목은 { 이름: 값 }, 표는 { 이름: { 키: 값 | null } } — null 은 그 키를 지운다
 */
export function applyPatch(data, patch) {
  const out = { ...data };
  for (const [key, value] of Object.entries(patch)) {
    if (!MAP_KEYS.includes(key)) {
      out[key] = value;
      continue;
    }
    const map = { ...(data?.[key] ?? {}) };
    for (const [name, entry] of Object.entries(value)) {
      if (entry == null) delete map[name];
      else map[name] = entry;
    }
    out[key] = map;
  }
  return out;
}

/** 기준값 파일 이름(저장 전 확인 창과 안내에 보여준다) */
export const settingsFileName = () => SHAREPOINT.settingsFile.split("/").pop();

let settings;

// 읽은 파일을 화면이 쓰는 모양으로
const stateOf = (file) => {
  const isObject = file?.data != null && typeof file.data === "object" && !Array.isArray(file.data);
  return {
    data: isObject ? file.data : null,
    etag: file?.etag ?? "",
    missing: !file,
    invalid: Boolean(file) && !isObject,
    wrongEnv: isObject && file.data.environment !== ENV_NAME,
  };
};

/**
 * 기준값을 읽는다.
 * @param {{refresh?: boolean}} [options]
 * @returns {Promise<{data: object|null, etag: string, missing: boolean, invalid: boolean, wrongEnv: boolean}>}
 *   missing = 파일이 없다, invalid = 내용이 객체가 아니다, wrongEnv = 파일의 environment 가 접속한 환경과 다르다.
 *   저장하면 이 객체의 값이 바뀐다
 */
export function loadSettings(options = {}) {
  if (options.refresh) settings = undefined;
  settings ??= (async () => stateOf(await readJsonFile(SHAREPOINT.settingsFile)))().catch((err) => {
    settings = undefined; // 실패한 결과는 남기지 않는다
    throw err;
  });
  return settings;
}

/**
 * 기준값의 변경분을 저장한다. 읽어 둔 내용에 변경분을 얹어 파일 전체를 쓴다.
 * 읽은 뒤 다른 사람이 고쳤으면 쓰지 않고 충돌로 돌려준다(그때 최신 내용을 다시 읽어 둔다).
 * @param {object} patch applyPatch 의 변경분
 * @returns {Promise<{ok: boolean, conflict: boolean, code: string, errors: Array<{key, error}>}>}
 *   code: "unavailable" = 파일이 없거나 쓸 수 없는 상태, "invalid" = 검사에 걸렸다(errors), 그 밖에는 Graph 의 오류
 */
export async function saveSettings(patch) {
  const current = await loadSettings();
  const fail = (code, errors = []) => ({ ok: false, conflict: false, code, errors });
  if (!current.data || current.wrongEnv) return fail("unavailable");
  const next = applyPatch(current.data, patch);
  const errors = checkSettings(next);
  if (errors.length) return fail("invalid", errors);
  try {
    const res = await writeJsonFile(SHAREPOINT.settingsFile, next, current.etag);
    current.data = next;
    current.etag = res.etag;
    // 응답에 ETag 가 없으면 다음 저장을 위해 다시 읽는다
    if (!current.etag) current.etag = (await readJsonFile(SHAREPOINT.settingsFile))?.etag ?? "";
    return { ok: true, conflict: false, code: "", errors: [] };
  } catch (err) {
    if (err.status !== 412 && err.status !== 409) return fail(`${err.status ?? ""} ${err.code ?? err.message ?? ""}`.trim());
    Object.assign(current, stateOf(await readJsonFile(SHAREPOINT.settingsFile)));
    return { ok: false, conflict: true, code: "", errors: [] };
  }
}
