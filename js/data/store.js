// 차량 데이터 저장 — 화면은 이 파일의 함수로만 데이터를 바꾼다.
//   - 바뀐 필드만 보낸다.
//   - 읽은 뒤 다른 사람이 같은 필드를 바꿨으면 쓰지 않고 충돌로 돌려준다.
//   - 저장에 성공하면 변경 이력을 차량당 1행 남긴다(데이터 → 이력 순).
import {
  findListId, readListItem, readListItemsBy, updateListItems, writeListItems,
} from "../lib/splist.js";
import { LISTS, appList } from "../etl/lists.js";
import { COLUMNS } from "./columns.js";

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
  if (field === "b1_factory_order" && !isDate(value)) return "date";
  if (field === "sales_month" && !isMonth(value)) return "month";
  const type = SLOTS.flatMap(([, def]) => def.columns).find((c) => c.name === field)?.type;
  if (type === "text" && value.length > TEXT_MAX) return "too_long";
  return null;
}

/** 비교·저장용으로 맞춘 글자: 줄바꿈을 한 가지로, 앞뒤 공백 제거 */
export const normalizeInput = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * 화면이 넘긴 값 중 실제로 바뀐 것만. 저장하지 않은 입력이 있는지 볼 때도 쓴다.
 * @returns {Array<{field: string, old: string, new: string}>}
 */
export function changedFields(vehicle, inputs) {
  const changes = [];
  for (const field of INPUT_FIELDS) {
    if (inputs[field] === undefined) continue;
    const next = normalizeInput(inputs[field]);
    const old = normalizeInput(vehicle[field]);
    if (next !== old) changes.push({ field, old, new: next });
  }
  return changes;
}

const isOk = (status) => status >= 200 && status < 300;
const toFields = (changes) =>
  Object.fromEntries(changes.map((c) => [c.field, c.new === "" ? null : c.new]));

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
 * @param {Array<{vehicle: object, inputs: Record<string, string>}>} edits
 *   vehicle 은 loadVehicles 가 돌려준 차량 행, inputs 는 { 열 이름: 값 }(INPUT_FIELDS 밖의 열은 무시)
 * @param {string} [source] 변경 경로(이력에 남긴다)
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{
 *   saved: Array<{vehicle, changes: Array<{field, old, new}>}>,
 *   invalid: Array<{vehicle, field: string, reason: string}>,   // 형식 오류. 저장하지 않았다
 *   conflicts: Array<{vehicle, fields: Array<{field, mine, theirs}>}>,  // 차량 행은 서버 값으로 바뀌어 있다
 *   denied: object[],                                            // 권한 없음(403)인 차량
 *   failed: Array<{vehicle, code: string}>,
 *   historyFailed: number,                                       // 값은 저장했지만 이력을 남기지 못한 차량 수
 * }>}
 */
export async function saveVehicles(edits, source = "입력", onProgress) {
  const out = { saved: [], invalid: [], conflicts: [], denied: [], failed: [], historyFailed: 0 };
  const jobs = [];
  for (const { vehicle, inputs } of edits) {
    const changes = changedFields(vehicle, inputs);
    if (!changes.length) continue;
    const bad = changes.map((c) => [c, checkInput(c.field, c.new)]).find(([, reason]) => reason);
    if (bad) out.invalid.push({ vehicle, field: bad[0].field, reason: bad[1] });
    else jobs.push({ vehicle, changes, applied: [], problem: null });
  }
  if (!jobs.length) return out;

  // 이력을 남길 곳이 없으면 데이터도 쓰지 않는다
  const historyListId = await findListId(appList("vehicleHistory").listName);

  for (const [slot, def] of SLOTS) await saveSlot(slot, def, jobs, onProgress);

  const changed = jobs.filter((job) => job.applied.length);
  if (changed.length) {
    const batchId = crypto.randomUUID();
    const outcome = await writeListItems(
      historyListId,
      changed.map((job) => ({
        kind: "add",
        fields: {
          commission_no: job.vehicle.commission_no,
          batch_id: batchId,
          source,
          changes: JSON.stringify(job.applied),
        },
      }))
    );
    out.historyFailed = outcome.failed.length;
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
 *   | {status: "saved", changes: Array<{field, old, new}>, historyOk: boolean}
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
    return { status: "saved", changes: out.saved[0].changes, historyOk: out.historyFailed === 0 };
  }
  return { status: "unchanged" };
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
