// 차량 데이터 저장 — 화면은 이 파일의 함수로만 데이터를 바꾼다.
//   - 바뀐 필드만 보낸다.
//   - 읽은 뒤 다른 사람이 같은 필드를 바꿨으면 쓰지 않고 충돌로 돌려준다.
//   - 저장에 성공하면 변경 이력을 차량당 1행 남긴다(데이터 → 이력 순).
import {
  findListId, readListItem, readListItems, readListItemsBy, addListItems, updateListItems, writeListItems,
} from "../lib/splist.js";
import { LISTS, appList } from "../etl/lists.js";
import { STATUS } from "../domain/status.js";
import { COLUMNS } from "./columns.js";
import { loadModelMaster } from "./masters.js";
import { loadVehicles, mergeVehicle } from "./vehicles.js";

/** 사람이 직접 입력하는 열(출처 "입력"). 이 밖의 열은 저장 요청을 받지 않는다. */
export const INPUT_FIELDS = COLUMNS.filter((c) => c.src === "입력").map((c) => c.key);

// 차량 행의 _items / _etags 칸 이름 → List 정의. 저장은 이 순서로 한다.
const SLOTS = [
  ["main", LISTS.find((def) => def.id === "logisticsMain")],
  ["afab", LISTS.find((def) => def.id === "logisticsAfab")],
];
const slotOf = (field) =>
  SLOTS.find(([, def]) => field !== def.key && def.columns.some((c) => c.name === field))?.[0] ?? null;

/** 저장할 때 쓰는 List 이름(저장 전 확인 창에 보여준다). */
export function targetListNames(fields) {
  const slots = new Set(fields.map(slotOf));
  return SLOTS.filter(([slot]) => slots.has(slot)).map(([, def]) => def.listName);
}

// ---- 오더 생성·변경이 다루는 열 ----

// Model Master 행에서 차량 행으로 옮겨 적는 열(차량 행의 이름)
const MODEL_FIELDS = [
  "moma_no", "model_year", "bm", "vehicle", "model", "type", "axle", "cab", "cab_gen", "wheelbase", "pto", "emission",
];
// 오더 변경이 바꿀 수 있는 열. model_classification 은 이관 때만 채우는 값이라 모델이 바뀌면 비운다.
const ORDER_FIELDS = [...MODEL_FIELDS, "model_classification", "original_pm", "current_status", "order_update_date"];
// 오더 생성·변경이 이력에 남기는 열. 여기에 Spec(모델 정보)을 더해 남긴다.
const ORDER_HISTORY_FIELDS = ["original_pm", "model_year", "bm"];

// 선적·입항에서 선박 단위로 넣어 그 선박의 차량 전체에 반영하는 열. TSC 확정은 상태도 같이 바꾼다.
const VOYAGE_FIELDS = ["bl_no", "eta_from_eukor_pirt", "ata", "tsc_arrival_date", "current_status"];
const DATE_FIELDS = ["b1_factory_order", "eta_from_eukor_pirt", "ata", "tsc_arrival_date"];

/** 편집 모드에서 저장 대기에 오를 수 있는 열 전체(입력 열 + 오더 변경 열) */
export const EDIT_FIELDS = [...INPUT_FIELDS, ...ORDER_FIELDS];

/** 오더를 만들 때 고를 수 있는 상태이자, 오더 변경의 대상이 되는 상태 */
export const ORDER_STATUSES = [STATUS.ORDERED_DUMMY, STATUS.ORDERED_CHANGEABLE];

/** 한 번에 만들 수 있는 오더 수 */
export const ORDER_MAX = 100;

// Model Master 행 → 차량 행에 들어갈 모델 속성
function modelFields(model) {
  const { my, ...rest } = Object.fromEntries(
    ["moma_no", "my", "bm", "vehicle", "model", "type", "axle", "cab", "cab_gen", "wheelbase", "pto", "emission"].map(
      (name) => [name, model[name] ?? ""]
    )
  );
  return { ...rest, model_year: my };
}

/**
 * 오더 변경이 차량에 넣는 값. 저장 대기에 올릴 때 쓴다.
 * @param {object} model Model Master 행
 * @param {string} originalPm "YYYY-MM". 빈 값이면 Original PM 은 바꾸지 않는다
 * @param {string} today 변경일 "YYYY-MM-DD"
 */
export function orderChangeValues(model, originalPm, today) {
  return {
    ...modelFields(model),
    model_classification: "",
    ...(originalPm ? { original_pm: originalPm } : {}),
    current_status: STATUS.ORDERED_CHANGEABLE,
    order_update_date: today,
  };
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TEXT_MAX = 255;

export const isDate = (value) => DATE.test(value);
export const isMonth = (value) => MONTH.test(value);

/**
 * 입력값 형식 검사. 빈 값은 통과한다.
 * @returns {null | "date" | "month" | "too_long"}
 */
export function checkInput(field, value) {
  if (value === "") return null;
  if (DATE_FIELDS.includes(field) && !isDate(value)) return "date";
  if ((field === "sales_month" || field === "original_pm") && !isMonth(value)) return "month";
  const type = SLOTS.flatMap(([, def]) => def.columns).find((c) => c.name === field)?.type;
  if (type === "text" && value.length > TEXT_MAX) return "too_long";
  return null;
}

/** 비교·저장용으로 맞춘 글자: 줄바꿈을 한 가지로, 앞뒤 공백 제거 */
export const normalizeInput = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * 화면이 넘긴 값 중 실제로 바뀐 것만. 저장하지 않은 입력이 있는지 볼 때도 쓴다.
 * @param {string[]} [fields] 살펴볼 열. 이 밖의 열은 무시한다
 * @returns {Array<{field: string, old: string, new: string}>}
 */
export function changedFields(vehicle, inputs, fields = INPUT_FIELDS) {
  const changes = [];
  for (const field of fields) {
    if (inputs[field] === undefined) continue;
    const next = normalizeInput(inputs[field]);
    const old = normalizeInput(vehicle[field]);
    if (next !== old) changes.push({ field, old, new: next });
  }
  return changes;
}

const isOk = (status) => status >= 200 && status < 300;
const columnType = (field) => SLOTS.flatMap(([, def]) => def.columns).find((c) => c.name === field)?.type;
// List 에 보낼 값: 빈 값은 지우고(null), 숫자 열은 숫자로
const toListValue = (field, value) =>
  value === "" ? null : columnType(field) === "number" ? Number(value) : value;
const toFields = (changes) => Object.fromEntries(changes.map((c) => [c.field, toListValue(c.field, c.new)]));

// 차량 행의 모델 파생값(Spec, 리드타임)을 지금의 moma_no 에 맞춘다
function syncModel(vehicle, modelByKey) {
  const model = modelByKey.get(vehicle.moma_no);
  vehicle.spec = model?.spec ?? "";
  vehicle.lead_days = model?.lead_days ?? "";
  vehicle.lead_months = model?.lead ?? "";
}

// 이력에 남길 변경. 오더 변경은 입력 열과 Original PM·MY·BM, 그리고 Spec 만 남긴다.
function historyChanges(job) {
  if (!job.order) return job.applied;
  const kept = job.applied.filter(
    (c) => INPUT_FIELDS.includes(c.field) || ORDER_HISTORY_FIELDS.includes(c.field)
  );
  const spec = normalizeInput(job.vehicle.spec);
  if (spec !== job.specBefore) kept.push({ field: "spec", old: job.specBefore, new: spec });
  return kept;
}

// List 의 현재 값을 다시 읽어 차량 행에 반영한다. 반영하기 전의 서버 값을 돌려준다.
async function refreshSlot(vehicle, slot, def, listId) {
  const names = def.columns.map((c) => c.name);
  const item = await readListItem(listId, vehicle._items[slot], names);
  for (const name of names) vehicle[name] = item.fields[name] ?? "";
  vehicle._etags[slot] = item.etag;
  return item.fields;
}

// 412 를 받은 항목: 다시 읽어, 내가 고치려는 필드가 그대로면 한 번 더 보낸다.
// @returns 저장 응답({status, code, etag}) 또는 {conflict: [...]}
async function retryAfterRefresh(vehicle, slot, def, listId, changes) {
  const server = await refreshSlot(vehicle, slot, def, listId);
  const conflict = changes
    .filter((c) => normalizeInput(server[c.field]) !== c.old)
    .map((c) => ({ field: c.field, mine: c.new, theirs: normalizeInput(server[c.field]) }));
  if (conflict.length) return { conflict };
  const [res] = await updateListItems(listId, [
    { id: vehicle._items[slot], etag: vehicle._etags[slot], fields: toFields(changes) },
  ]);
  return res;
}

// 한 List 에 대한 저장. jobs 의 각 항목에 결과를 적는다(applied 에 더하거나 problem 을 채운다).
async function saveSlot(slot, def, jobs, onProgress) {
  const targets = jobs
    .map((job) => ({ job, changes: job.changes.filter((c) => slotOf(c.field) === slot) }))
    .filter((t) => !t.job.problem && t.changes.length);
  if (!targets.length) return;
  const listId = await findListId(def.listName);

  for (const t of targets) {
    if (!t.job.vehicle._items[slot]) t.job.problem = { status: 0, code: "no_item" };
  }
  const ready = targets.filter((t) => !t.job.problem);
  // 버전 표시가 있는 항목은 한꺼번에 보내고, 없는 항목은 412 를 받은 것처럼 다시 읽는다
  const sendable = ready.filter((t) => t.job.vehicle._etags[slot]);
  const responses = await updateListItems(
    listId,
    sendable.map((t) => ({
      id: t.job.vehicle._items[slot],
      etag: t.job.vehicle._etags[slot],
      fields: toFields(t.changes),
    })),
    onProgress
  );
  const responseOf = new Map(sendable.map((t, i) => [t, responses[i]]));

  for (const t of ready) {
    const { vehicle } = t.job;
    let res = responseOf.get(t) ?? { status: 412 };
    try {
      if (res.status === 412) res = await retryAfterRefresh(vehicle, slot, def, listId, t.changes);
      if (res.conflict) {
        t.job.problem = { conflict: res.conflict };
        continue;
      }
      if (!isOk(res.status)) {
        t.job.problem = { status: res.status, code: res.code };
        continue;
      }
      for (const c of t.changes) vehicle[c.field] = c.new;
      vehicle._etags[slot] = res.etag ?? (await readListItem(listId, vehicle._items[slot], [def.key])).etag;
      t.job.applied.push(...t.changes);
    } catch (err) {
      t.job.problem = { status: err?.status ?? 0, code: err?.code ?? "request_failed" };
    }
  }
}

/**
 * 여러 차량의 입력 열을 저장한다. 차량 행은 저장 결과에 맞게 이 함수가 고친다.
 * @param {Array<{vehicle: object, inputs: Record<string, string>, source?: string, order?: boolean}>} edits
 *   vehicle 은 loadVehicles 가 돌려준 차량 행, inputs 는 { 열 이름: 값 }(INPUT_FIELDS 밖의 열은 무시),
 *   source 는 그 차량만의 변경 경로(없으면 아래 source),
 *   order 가 참이면 오더 변경이다: 모델·Original PM·상태 열도 받고, 이력에는 Original PM·Spec·MY·BM 만 남긴다.
 *   voyage 가 참이면 선적·입항의 선박 단위 입력이다: B/L·ETA 선사·ATA·TSC 입고일·상태 열을 받는다
 * @param {string} [source] 변경 경로(이력에 남긴다)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{
 *   saved: Array<{vehicle, changes: Array<{field, old, new}>}>,
 *   invalid: Array<{vehicle, field: string, reason: string}>,   // 형식 오류. 저장하지 않았다
 *   conflicts: Array<{vehicle, fields: Array<{field, mine, theirs}>}>,  // 차량 행은 서버 값으로 바뀌어 있다
 *   denied: object[],                                            // 권한 없음(403)인 차량
 *   failed: Array<{vehicle, code: string}>,
 *   historyFailed: number,                                       // 값은 저장했지만 이력을 남기지 못한 차량 수
 *   historyCodes: string[],                                      // 이력 쓰기가 실패한 응답의 상태·오류 코드
 * }>}
 */
export async function saveVehicles(edits, source = "입력", onProgress) {
  const out = {
    saved: [], invalid: [], conflicts: [], denied: [], failed: [], historyFailed: 0, historyCodes: [],
  };
  const jobs = [];
  for (const { vehicle, inputs, source: own, order = false, voyage = false } of edits) {
    const changes = changedFields(vehicle, inputs, order ? EDIT_FIELDS : voyage ? VOYAGE_FIELDS : INPUT_FIELDS);
    if (!changes.length) continue;
    const bad = changes.map((c) => [c, checkInput(c.field, c.new)]).find(([, reason]) => reason);
    if (bad) out.invalid.push({ vehicle, field: bad[0].field, reason: bad[1] });
    else {
      jobs.push({
        vehicle, changes, order, source: own ?? source, specBefore: normalizeInput(vehicle.spec), applied: [], problem: null,
      });
    }
  }
  if (!jobs.length) return out;

  // 이력을 남길 곳이 없으면 데이터도 쓰지 않는다
  const historyListId = await findListId(appList("vehicleHistory").listName);
  const orderJobs = jobs.filter((job) => job.order);
  const modelByKey = orderJobs.length ? new Map((await loadModelMaster()).map((m) => [m.moma_no, m])) : null;

  for (const [slot, def] of SLOTS) await saveSlot(slot, def, jobs, onProgress);
  for (const job of orderJobs) syncModel(job.vehicle, modelByKey);

  for (const job of jobs) job.history = job.applied.length ? historyChanges(job) : [];
  const changed = jobs.filter((job) => job.history.length);
  if (changed.length) {
    const batchId = crypto.randomUUID();
    const outcome = await writeListItems(
      historyListId,
      changed.map((job) => ({
        kind: "add",
        fields: {
          commission_no: job.vehicle.commission_no,
          batch_id: batchId,
          source: job.source,
          changes: JSON.stringify(job.history),
        },
      }))
    );
    out.historyFailed = outcome.failed.length;
    out.historyCodes = [...new Set(outcome.failed.map((f) => `${f.status} ${f.code}`))];
  }

  for (const job of jobs) {
    const { vehicle, problem } = job;
    if (!problem) out.saved.push({ vehicle, changes: job.applied });
    else if (problem.conflict) out.conflicts.push({ vehicle, fields: problem.conflict });
    else if (problem.status === 403) out.denied.push(vehicle);
    else out.failed.push({ vehicle, code: `${problem.status} ${problem.code}` });
  }
  return out;
}

/**
 * 차량 1대의 입력 열을 저장한다.
 * @returns {Promise<
 *   | {status: "unchanged"}
 *   | {status: "invalid", field: string, reason: string}
 *   | {status: "saved", changes: Array<{field, old, new}>, historyOk: boolean, historyCodes: string[]}
 *   | {status: "conflict", fields: Array<{field, mine, theirs}>}   // 차량 행은 서버 값으로 바뀌어 있다
 *   | {status: "denied"}
 *   | {status: "failed", code: string}
 * >}
 */
export async function saveVehicleInputs(vehicle, inputs, source = "입력") {
  const out = await saveVehicles([{ vehicle, inputs }], source);
  if (out.invalid.length) return { status: "invalid", field: out.invalid[0].field, reason: out.invalid[0].reason };
  if (out.conflicts.length) return { status: "conflict", fields: out.conflicts[0].fields };
  if (out.denied.length) return { status: "denied" };
  if (out.failed.length) return { status: "failed", code: out.failed[0].code };
  if (out.saved.length) {
    return {
      status: "saved",
      changes: out.saved[0].changes,
      historyOk: out.historyFailed === 0,
      historyCodes: out.historyCodes,
    };
  }
  return { status: "unchanged" };
}

/**
 * 오더를 만든다. Main List 에 차량 행을 추가하고, 읽어 둔 차량 목록에도 더한다.
 * @param {{model: object, originalPm: string, status: string, commissionNos: string[], source: string, today: string}} order
 *   model: Model Master 행, originalPm: "YYYY-MM", status: ORDER_STATUSES 중 하나,
 *   commissionNos: 만들 번호(숫자), source: 이력에 남길 출처, today: 생성일 "YYYY-MM-DD"
 * @returns {Promise<{
 *   created: object[],                                   // 만든 차량 행
 *   failed: Array<{commission_no: string, code: string}>, // 만들지 못한 번호(번호가 이미 있는 경우 등)
 *   historyFailed: number, historyCodes: string[],
 * }>}
 */
export async function createOrders({ model, originalPm, status, commissionNos, source, today }) {
  if (!model?.moma_no) throw new Error("모델을 고르지 않았습니다.");
  if (!isMonth(originalPm)) throw new Error("Original PM 형식이 맞지 않습니다.");
  if (!ORDER_STATUSES.includes(status)) throw new Error("고를 수 없는 상태입니다.");
  if (!commissionNos.length || commissionNos.length > ORDER_MAX) throw new Error("수량이 범위를 벗어났습니다.");
  if (!commissionNos.every((c) => /^\d+$/.test(c)) || new Set(commissionNos).size !== commissionNos.length) {
    throw new Error("Commission No 가 맞지 않습니다.");
  }
  const data = await loadVehicles();
  const taken = new Set(data.vehicles.map((v) => String(v.commission_no)));
  if (commissionNos.some((c) => taken.has(c))) throw new Error("이미 있는 Commission No 입니다.");

  // 이력을 남길 곳이 없으면 만들지 않는다
  const historyListId = await findListId(appList("vehicleHistory").listName);
  const def = SLOTS.find(([slot]) => slot === "main")[1];
  const listId = await findListId(def.listName);

  const values = {
    current_status: status,
    ...modelFields(model),
    original_pm: originalPm,
    order_update_date: today,
  };
  const names = def.columns.map((c) => c.name);
  // 값이 없는 열은 보내지 않는다
  const fieldsOf = (commissionNo) =>
    Object.fromEntries(
      Object.entries({ commission_no: commissionNo, ...values })
        .filter(([name, value]) => names.includes(name) && value !== "" && value != null)
        .map(([name, value]) => [name, columnType(name) === "number" ? Number(value) : value])
    );

  const responses = await addListItems(listId, commissionNos.map(fieldsOf));
  const out = { created: [], failed: [], historyFailed: 0, historyCodes: [] };
  commissionNos.forEach((commissionNo, i) => {
    const res = responses[i];
    if (!isOk(res.status)) {
      out.failed.push({ commission_no: commissionNo, code: `${res.status} ${res.code}` });
      return;
    }
    const mainRow = { _itemId: res.id, _etag: res.etag };
    const sent = fieldsOf(commissionNo);
    for (const name of names) mainRow[name] = sent[name] ?? "";
    const vehicle = mergeVehicle(null, mainRow, model);
    data.vehicles.push(vehicle);
    out.created.push(vehicle);
  });

  if (out.created.length) {
    const batchId = crypto.randomUUID();
    const changes = [
      { field: "original_pm", old: "", new: originalPm },
      { field: "spec", old: "", new: normalizeInput(model.spec) },
      { field: "model_year", old: "", new: normalizeInput(model.my) },
      { field: "bm", old: "", new: normalizeInput(model.bm) },
    ].filter((c) => c.new !== "");
    const outcome = await writeListItems(
      historyListId,
      out.created.map((vehicle) => ({
        kind: "add",
        fields: { commission_no: vehicle.commission_no, batch_id: batchId, source, changes: JSON.stringify(changes) },
      }))
    );
    out.historyFailed = outcome.failed.length;
    out.historyCodes = [...new Set(outcome.failed.map((f) => `${f.status} ${f.code}`))];
  }
  return out;
}

// ---- 선박 단위 List: 총중량, TSC 입고일 예정 ----

const voyageDef = () => appList("voyages");
const VOYAGE_NOTE_FIELDS = ["gw", "tsc_planned"];

/** 선박 단위 List 의 이름(저장 전 확인 창과 오류 알림에 보여준다) */
export const voyageListName = () => voyageDef().listName;

let voyageNotes;

/**
 * 선박 단위 값. 선박 key(선박 이름 + Shipping 날짜)로 찾는다.
 * @returns {Promise<Map<string, {gw: number|string, tsc_planned: string, _itemId: string, _etag: string}>>}
 */
export function loadVoyageNotes(options = {}) {
  if (options.refresh) voyageNotes = undefined;
  voyageNotes ??= (async () => {
    const def = voyageDef();
    const items = await readListItems(await findListId(def.listName), def.columns.map((c) => c.name));
    return new Map(
      items
        .filter((item) => item.fields.voyage_key)
        .map((item) => [
          item.fields.voyage_key,
          { gw: item.fields.gw ?? "", tsc_planned: item.fields.tsc_planned ?? "", _itemId: item.id, _etag: item.etag },
        ])
    );
  })().catch((err) => {
    voyageNotes = undefined; // 실패한 결과는 남기지 않는다
    throw err;
  });
  return voyageNotes;
}

/**
 * 선박 단위 값을 저장한다. 그 선박의 행이 없으면 만든다.
 * @param {{key: string, vessel: string, shipping: string}} voyage
 * @param {{gw?: string, tsc_planned?: string}} patch 바꿀 값만. 빈 글은 값을 지운다
 * @returns {Promise<{ok: boolean, code: string}>}
 */
export async function saveVoyageNote(voyage, patch) {
  const notes = await loadVoyageNotes();
  const def = voyageDef();
  const listId = await findListId(def.listName);
  const fields = Object.fromEntries(
    VOYAGE_NOTE_FIELDS.filter((name) => patch[name] !== undefined).map((name) => [
      name,
      patch[name] === "" ? null : name === "gw" ? Number(patch[name]) : patch[name],
    ])
  );
  const apply = (note) => {
    for (const [name, value] of Object.entries(fields)) note[name] = value ?? "";
  };
  const existing = notes.get(voyage.key);

  if (!existing) {
    const row = { voyage_key: voyage.key, vessel: voyage.vessel, shipping: voyage.shipping };
    for (const [name, value] of Object.entries(fields)) if (value != null) row[name] = value;
    const [res] = await addListItems(listId, [Object.fromEntries(Object.entries(row).filter(([, v]) => v !== ""))]);
    if (!isOk(res.status)) return { ok: false, code: `${res.status} ${res.code}` };
    const note = { gw: "", tsc_planned: "", _itemId: res.id, _etag: res.etag };
    apply(note);
    notes.set(voyage.key, note);
    return { ok: true, code: "" };
  }

  const send = async () => (await updateListItems(listId, [{ id: existing._itemId, etag: existing._etag, fields }]))[0];
  let res = existing._etag ? await send() : { status: 412 };
  if (res.status === 412) {
    // 그사이 다른 사람이 바꿨다. 선박 단위 값은 칸이 둘뿐이라 최신 값 위에 내 값을 쓴다.
    existing._etag = (await readListItem(listId, existing._itemId, [def.key])).etag;
    res = await send();
  }
  if (!isOk(res.status)) return { ok: false, code: `${res.status} ${res.code}` };
  apply(existing);
  existing._etag = res.etag ?? (await readListItem(listId, existing._itemId, [def.key])).etag;
  return { ok: true, code: "" };
}

function parseChanges(text) {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * 차량 1대의 변경 이력. 최근 것이 먼저다.
 * @returns {Promise<Array<{at: string, by: string, source: string, changes: Array<{field, old, new}>}>>}
 *   at 은 SharePoint 가 기록한 시각(ISO), by 는 저장한 사람의 표시 이름
 */
export async function loadVehicleHistory(commissionNo) {
  const def = appList("vehicleHistory");
  const items = await readListItemsBy(
    await findListId(def.listName),
    ["source", "changes"],
    "commission_no",
    commissionNo
  );
  return items
    .map((item) => ({
      at: item.createdAt,
      by: item.createdBy,
      source: item.fields.source ?? "",
      changes: parseChanges(item.fields.changes),
    }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}
