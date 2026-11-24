// 마스터 데이터 저장 — 모델 마스터와 색상 마스터의 수정·추가.
//   - 마스터는 바뀐 필드만 보내고, 읽은 뒤 다른 사람이 고친 행은 쓰지 않는다(충돌).
//   - 차량 행은 모델 속성과 색상 이름을 복사해 들고 있어, 마스터를 고치면 그 모델·색상의 차량에도 반영한다.
//     차량 반영은 store.js 의 saveVehicles 로 하고 차량 이력에 남는다.
//   - 마스터 자체의 변경 이력은 따로 두지 않는다(SharePoint 버전 기록).
import { findListId, readListItem, addListItems, updateListItems } from "../lib/splist.js";
import { LISTS } from "../etl/lists.js";
import { STATUS } from "../domain/status.js";
import { needsShippingCalc, shippingCalc } from "../domain/shipping-calc.js";
import { loadModelMaster, loadColorMaster } from "./masters.js";
import { loadVehicles } from "./vehicles.js";
import { saveVehicles } from "./store.js";

const MODEL_DEF = LISTS.find((def) => def.id === "modelMaster");
const COLOR_DEF = LISTS.find((def) => def.id === "colorMaster");

export const SOURCE_MODEL = "모델 마스터";
export const SOURCE_COLOR = "색상 마스터";

/** 모델 마스터에서 고칠 수 있는 열(키와 Spec 은 뺀다. Spec 은 속성에서 만든다) */
export const MODEL_EDIT_FIELDS = [
  "my", "bm", "vehicle", "model", "type", "axle", "cab", "cab_gen", "wheelbase", "pto", "emission", "gen",
  "lead_days", "lead", "is_rep", "active",
];
/** 색상 마스터에서 고칠 수 있는 열 */
export const COLOR_EDIT_FIELDS = ["color_name_mb", "color_name_molit"];

// 비워 둘 수 없는 열
const MODEL_REQUIRED = ["my", "bm", "vehicle", "model", "type"];
// 0 이상의 정수만 받는 열
const WHOLE_NUMBER = ["lead_days", "lead"];

// Spec 을 이루는 속성(이 순서로 잇는다). 빈 값은 "-" 로 둔다.
const SPEC_FIELDS = ["vehicle", "model", "type", "axle", "cab", "cab_gen", "pto", "wheelbase", "emission"];
const SPEC_JOIN = "|";
const SPEC_BLANK = "-";

// 마스터 열 → 차량 행의 열. 이름이 다른 것은 MY 하나다.
const VEHICLE_FIELD = {
  my: "model_year", bm: "bm", vehicle: "vehicle", model: "model", type: "type", axle: "axle", cab: "cab",
  cab_gen: "cab_gen", wheelbase: "wheelbase", pto: "pto", emission: "emission", gen: "gen",
};

// 리드타임(일)이 바뀌면 Shipping Calc 를 다시 계산하는 단계(아직 선적 전)
const BEFORE_SHIPMENT = [STATUS.ORDERED_CHANGEABLE, STATUS.ORDERED_FIXED, STATUS.IN_PRODUCTION];

const isBlank = (value) => value == null || value === "";
const isOk = (status) => status >= 200 && status < 300;
const typeOf = (def, field) => def.columns.find((c) => c.name === field)?.type;

/** 모델 속성으로 만든 Spec */
export const specOf = (model) =>
  SPEC_FIELDS.map((name) => (isBlank(model[name]) ? SPEC_BLANK : String(model[name]).trim())).join(SPEC_JOIN);

/**
 * 새 모델의 moma_no: 지금 있는 번호 중 가장 큰 것의 다음 번호. 앞 글자와 자릿수는 그 값에서 따온다.
 * @returns {string} 만들 수 없으면 ""
 */
export function nextMomaNo(models) {
  let best = null;
  for (const m of models) {
    const found = /^(.*?)(\d+)$/.exec(String(m.moma_no ?? ""));
    if (found && (!best || Number(found[2]) > Number(best[2]))) best = found;
  }
  return best ? best[1] + String(Number(best[2]) + 1).padStart(best[2].length, "0") : "";
}

/**
 * 화면이 넘긴 값을 열의 형식에 맞춘다.
 * @returns {{value: any} | {error: "required" | "number" | "whole" | "too_long"}}
 */
export function parseMasterValue(kind, field, raw) {
  const def = kind === "model" ? MODEL_DEF : COLOR_DEF;
  const type = typeOf(def, field);
  if (type === "boolean") return { value: Boolean(raw) };
  const text = String(raw ?? "").trim();
  if (text === "") {
    return kind === "model" && MODEL_REQUIRED.includes(field) ? { error: "required" } : { value: "" };
  }
  if (type === "number") {
    if (WHOLE_NUMBER.includes(field) && !/^\d+$/.test(text)) return { error: "whole" };
    if (!/^\d+(\.\d+)?$/.test(text)) return { error: "number" };
    return { value: Number(text) };
  }
  if (text.length > 255) return { error: "too_long" };
  return { value: text };
}

// 비교용 값: 숫자·글자는 글자로, 예/아니오는 참/거짓으로
const comparable = (def, field, value) =>
  typeOf(def, field) === "boolean" ? Boolean(value) : isBlank(value) ? "" : String(value);
/** 저장된 값과 같은가(화면이 저장 대기에서 뺄지 정할 때 쓴다) */
export const sameMasterValue = (kind, field, a, b) => {
  const def = kind === "model" ? MODEL_DEF : COLOR_DEF;
  return comparable(def, field, a) === comparable(def, field, b);
};

// List 에 보낼 값: 빈 값은 지운다(null)
const toListFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === "" ? null : v]));

// 차량 한 대에 넣을 값. patch 는 마스터 행에서 고친 열.
function modelInputs(vehicle, merged, patch) {
  const inputs = {};
  for (const [field, target] of Object.entries(VEHICLE_FIELD)) {
    if (field in patch) inputs[target] = isBlank(merged[field]) ? "" : String(merged[field]);
  }
  if (
    "lead_days" in patch &&
    BEFORE_SHIPMENT.includes(vehicle.current_status) &&
    needsShippingCalc(vehicle.current_status, vehicle.shipping)
  ) {
    const value = shippingCalc(String(vehicle.pm ?? "").slice(0, 7), merged.lead_days);
    if (value) inputs.shipping_calc = value;
  }
  return inputs;
}

/**
 * 마스터 수정이 차량에 넣게 될 값. 저장 전 확인 창의 대수와 실제 저장이 같이 쓴다.
 * @param {object[]} vehicles 차량 행
 * @param {Array<{row: object, patch: object}>} models 모델 마스터 행과 고친 열
 * @param {Array<{row: object, patch: object}>} colors 색상 마스터 행과 고친 열
 * @returns {{model: Array<{vehicle, inputs, key: string}>, color: Array<{vehicle, inputs, key: string}>}}
 *   지금 값과 같은 것은 뺀다. key 는 그 차량이 따르는 마스터 행의 키
 */
export function planVehicleEdits(vehicles, models, colors) {
  const differs = (vehicle, inputs) =>
    Object.entries(inputs).some(([name, value]) => String(vehicle[name] ?? "").trim() !== String(value));
  const out = { model: [], color: [] };
  const modelByKey = new Map(models.map((m) => [m.row.moma_no, m]));
  const colorByKey = new Map(colors.filter((c) => "color_name_mb" in c.patch).map((c) => [c.row.color_code, c]));
  for (const vehicle of vehicles) {
    const m = modelByKey.get(vehicle.moma_no);
    if (m && !isBlank(vehicle.moma_no)) {
      const inputs = modelInputs(vehicle, { ...m.row, ...m.patch }, m.patch);
      if (differs(vehicle, inputs)) out.model.push({ vehicle, inputs, key: m.row.moma_no });
    }
    const c = colorByKey.get(vehicle.color_code);
    if (c && !isBlank(vehicle.color_code)) {
      const inputs = { color_name: String(c.patch.color_name_mb ?? "") };
      if (differs(vehicle, inputs)) out.color.push({ vehicle, inputs, key: c.row.color_code });
    }
  }
  return out;
}

// 마스터 행을 List 의 현재 값으로 맞춘다(충돌 뒤)
async function refreshRow(def, listId, row) {
  const names = def.columns.map((c) => c.name);
  const item = await readListItem(listId, row._itemId, names);
  for (const name of names) row[name] = item.fields[name] ?? "";
  row._etag = item.etag;
}

// 한 마스터 List 의 행들을 저장한다. 행마다 결과를 돌려준다: "saved" | "unchanged" | "conflict" | "denied" | 실패 코드
async function saveRows(def, edits, withSpec) {
  const results = new Map();
  const jobs = [];
  for (const { row, patch } of edits) {
    const fields = Object.fromEntries(
      Object.entries(patch).filter(([name, value]) => comparable(def, name, value) !== comparable(def, name, row[name]))
    );
    if (withSpec && Object.keys(fields).some((name) => SPEC_FIELDS.includes(name))) {
      const spec = specOf({ ...row, ...fields });
      if (spec !== String(row.spec ?? "")) fields.spec = spec;
    }
    if (Object.keys(fields).length) jobs.push({ row, fields });
    else results.set(row, "unchanged");
  }
  if (!jobs.length) return results;
  const listId = await findListId(def.listName);
  const responses = await updateListItems(
    listId,
    jobs.map((job) => ({ id: job.row._itemId, etag: job.row._etag, fields: toListFields(job.fields) }))
  );
  for (const [i, job] of jobs.entries()) {
    const res = responses[i];
    try {
      if (res.status === 412) {
        await refreshRow(def, listId, job.row);
        results.set(job.row, "conflict");
      } else if (res.status === 403) {
        results.set(job.row, "denied");
      } else if (!isOk(res.status)) {
        results.set(job.row, `${res.status} ${res.code}`);
      } else {
        Object.assign(job.row, job.fields);
        job.row._etag = res.etag ?? (await readListItem(listId, job.row._itemId, [def.key])).etag;
        results.set(job.row, "saved");
      }
    } catch (err) {
      results.set(job.row, `${err?.status ?? 0} ${err?.code ?? "request_failed"}`);
    }
  }
  return results;
}

// 차량 저장 결과에서 문제가 있었던 차량의 Commission No
const troubledOf = (out) =>
  new Set([...out.conflicts.map((c) => c.vehicle), ...out.denied, ...out.failed.map((f) => f.vehicle)].map((v) => v.commission_no));

/**
 * 마스터 수정을 저장하고 차량에 반영한다. 마스터 행(읽어 둔 객체)은 저장 결과에 맞게 이 함수가 고친다.
 * 이미 저장된 값과 같은 patch 는 마스터에 쓰지 않지만 차량 반영은 다시 시도한다(차량 반영이 일부 실패했을 때의 재시도).
 * @param {{models: Array<{row, patch}>, colors: Array<{row, patch}>}} edits
 * @returns {Promise<{
 *   rows: Map<object, string>,   // 마스터 행 → "saved" | "unchanged" | "conflict" | "denied" | 실패 코드
 *   pendingKeys: Set<string>,    // 차량 반영을 끝내지 못한 마스터 행의 키(moma_no 또는 color_code)
 *   vehicles: {saved: number, conflicts: number, denied: number, failed: number, codes: string[],
 *              historyFailed: number, historyCodes: string[]},
 * }>}
 */
export async function saveMasters({ models = [], colors = [] }) {
  const { vehicles } = await loadVehicles();
  const rows = new Map([
    ...(await saveRows(MODEL_DEF, models, true)),
    ...(await saveRows(COLOR_DEF, colors, false)),
  ]);
  // 마스터에 들어간 행만 차량에 반영한다
  const done = (edit) => ["saved", "unchanged"].includes(rows.get(edit.row));
  const plan = planVehicleEdits(vehicles, models.filter(done), colors.filter(done));

  const summary = { saved: 0, conflicts: 0, denied: 0, failed: 0, codes: [], historyFailed: 0, historyCodes: [] };
  const pendingKeys = new Set();
  for (const [list, source] of [[plan.model, SOURCE_MODEL], [plan.color, SOURCE_COLOR]]) {
    if (!list.length) continue;
    const out = await saveVehicles(list.map(({ vehicle, inputs }) => ({ vehicle, inputs, master: true })), source);
    const troubled = troubledOf(out);
    for (const item of list) if (troubled.has(item.vehicle.commission_no)) pendingKeys.add(item.key);
    summary.saved += out.saved.length;
    summary.conflicts += out.conflicts.length;
    summary.denied += out.denied.length;
    summary.failed += out.failed.length;
    summary.codes.push(...out.failed.map((f) => f.code));
    summary.historyFailed += out.historyFailed;
    summary.historyCodes.push(...out.historyCodes);
  }
  summary.codes = [...new Set(summary.codes)];
  summary.historyCodes = [...new Set(summary.historyCodes)];

  // 차량 행이 마스터에서 읽어 오는 값(Spec, 리드타임)을 맞춘다
  const saved = new Map(models.filter(done).map((m) => [m.row.moma_no, m.row]));
  for (const vehicle of vehicles) {
    const model = saved.get(vehicle.moma_no);
    if (!model) continue;
    vehicle.spec = model.spec ?? "";
    vehicle.lead_days = model.lead_days ?? "";
    vehicle.lead_months = model.lead ?? "";
  }
  return { rows, pendingKeys, vehicles: summary };
}

/**
 * 모델을 추가한다. moma_no 와 Spec 은 여기서 만든다.
 * @param {object} values 화면이 parseMasterValue 로 맞춘 값(MODEL_EDIT_FIELDS)
 * @returns {Promise<{ok: true, row: object, models: object[]} | {ok: false, code: string}>}
 *   models 는 다시 읽은 모델 마스터(추가한 행 포함)
 */
export async function addModel(values) {
  // 그사이 다른 사람이 추가했을 수 있어 번호를 정하기 전에 다시 읽는다
  const models = await loadModelMaster({ refresh: true });
  const momaNo = nextMomaNo(models);
  if (!momaNo) return { ok: false, code: "no_number" };
  const row = { moma_no: momaNo };
  for (const name of MODEL_EDIT_FIELDS) row[name] = values[name] ?? "";
  row.spec = specOf(row);
  const sent = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ""));
  const [res] = await addListItems(await findListId(MODEL_DEF.listName), [sent]);
  if (!isOk(res.status)) return { ok: false, code: `${res.status} ${res.code}` };
  for (const column of MODEL_DEF.columns) row[column.name] ??= "";
  Object.assign(row, { _itemId: res.id, _etag: res.etag });
  models.push(row);
  return { ok: true, row, models };
}

/**
 * 색상을 추가한다. 그 Color Code 를 이미 가진 차량이 있으면 Color Name 을 채운다.
 * @param {{color_code: string, color_name_mb: string, color_name_molit: string}} values
 * @returns {Promise<{ok: true, row: object, vehicles: number, colors: object[]} | {ok: false, code: string}>}
 *   vehicles 는 Color Name 을 채운 차량 수, colors 는 다시 읽은 색상 마스터(추가한 행 포함)
 */
export async function addColor(values) {
  const colors = await loadColorMaster({ refresh: true });
  const code = String(values.color_code ?? "").trim();
  if (!code) return { ok: false, code: "required" };
  if (colors.some((c) => String(c.color_code) === code)) return { ok: false, code: "duplicate" };
  const row = {
    no: colors.reduce((max, c) => Math.max(max, Number(c.no) || 0), 0) + 1,
    color_code: code,
    color_name_mb: values.color_name_mb ?? "",
    color_name_molit: values.color_name_molit ?? "",
  };
  const sent = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ""));
  const [res] = await addListItems(await findListId(COLOR_DEF.listName), [sent]);
  if (!isOk(res.status)) return { ok: false, code: `${res.status} ${res.code}` };
  Object.assign(row, { _itemId: res.id, _etag: res.etag });
  colors.push(row);

  let count = 0;
  if (row.color_name_mb) {
    const { vehicles } = await loadVehicles();
    const plan = planVehicleEdits(vehicles, [], [{ row, patch: { color_name_mb: row.color_name_mb } }]);
    if (plan.color.length) {
      const out = await saveVehicles(plan.color.map(({ vehicle, inputs }) => ({ vehicle, inputs, master: true })), SOURCE_COLOR);
      count = out.saved.length;
    }
  }
  return { ok: true, row, vehicles: count, colors };
}

/** 저장할 때 쓰는 List 이름(저장 전 확인 창에 보여준다) */
export const masterListName = (kind) => (kind === "model" ? MODEL_DEF : COLOR_DEF).listName;
