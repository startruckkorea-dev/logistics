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

// 비교·저장용으로 맞춘 글자: 줄바꿈을 한 가지로, 앞뒤 공백 제거
const normalize = (value) => String(value ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * 화면이 넘긴 값 중 실제로 바뀐 것만. 저장하지 않은 입력이 있는지 볼 때도 쓴다.
 * @returns {Array<{field: string, old: string, new: string}>}
 */
export function changedFields(vehicle, inputs) {
  const changes = [];
  for (const field of INPUT_FIELDS) {
    if (inputs[field] === undefined) continue;
    const next = normalize(inputs[field]);
    const old = normalize(vehicle[field]);
    if (next !== old) changes.push({ field, old, new: next });
  }
  return changes;
}

// List 의 현재 값을 다시 읽어 차량 행에 반영한다. 반영하기 전의 서버 값을 돌려준다.
async function refreshSlot(vehicle, slot, def, listId) {
  const names = def.columns.map((c) => c.name);
  const item = await readListItem(listId, vehicle._items[slot], names);
  for (const name of names) vehicle[name] = item.fields[name] ?? "";
  vehicle._etags[slot] = item.etag;
  return item.fields;
}

// 한 List 의 한 항목을 저장한다.
// @returns {{ok: true} | {conflict: Array<{field, mine, theirs}>} | {status: number, code: string}}
async function saveSlot(vehicle, slot, def, changes) {
  const listId = await findListId(def.listName);
  const id = vehicle._items[slot];
  if (!id) return { status: 0, code: "no_item" };
  const fields = Object.fromEntries(changes.map((c) => [c.field, c.new === "" ? null : c.new]));
  const send = async () =>
    (await updateListItems(listId, [{ id, etag: vehicle._etags[slot], fields }]))[0];

  // 버전 표시가 없으면 먼저 다시 읽는다
  let res = vehicle._etags[slot] ? await send() : { status: 412 };
  if (res.status === 412) {
    const server = await refreshSlot(vehicle, slot, def, listId);
    const conflict = changes
      .filter((c) => normalize(server[c.field]) !== c.old)
      .map((c) => ({ field: c.field, mine: c.new, theirs: normalize(server[c.field]) }));
    if (conflict.length) return { conflict };
    // 다른 사람이 바꾼 것은 다른 필드다. 새 버전 표시로 한 번 더 보낸다.
    res = await send();
  }
  if (res.status < 200 || res.status >= 300) return { status: res.status, code: res.code };

  for (const c of changes) vehicle[c.field] = c.new;
  vehicle._etags[slot] = res.etag ?? (await readListItem(listId, id, [def.key])).etag;
  return { ok: true };
}

async function writeHistory(listId, vehicle, changes, source, batchId) {
  const outcome = await writeListItems(listId, [
    {
      kind: "add",
      fields: {
        commission_no: vehicle.commission_no,
        batch_id: batchId,
        source,
        changes: JSON.stringify(changes),
      },
    },
  ]);
  return outcome.failed.length === 0;
}

/**
 * 차량 1대의 입력 열을 저장한다. 차량 행(vehicle)은 저장 결과에 맞게 이 함수가 고친다.
 * @param {object} vehicle loadVehicles 가 돌려준 차량 행
 * @param {Record<string, string>} inputs { 열 이름: 값 }. INPUT_FIELDS 밖의 열은 무시한다
 * @param {string} [source] 변경 경로(이력에 남긴다)
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
  const changes = changedFields(vehicle, inputs);
  if (!changes.length) return { status: "unchanged" };
  for (const c of changes) {
    const reason = checkInput(c.field, c.new);
    if (reason) return { status: "invalid", field: c.field, reason };
  }

  // 이력을 남길 곳이 없으면 데이터도 쓰지 않는다
  const historyListId = await findListId(appList("vehicleHistory").listName);

  const applied = [];
  let stopped = null;
  for (const [slot, def] of SLOTS) {
    const slotChanges = changes.filter((c) => slotOf(c.field) === slot);
    if (!slotChanges.length) continue;
    const res = await saveSlot(vehicle, slot, def, slotChanges);
    if (!res.ok) {
      stopped = res;
      break;
    }
    applied.push(...slotChanges);
  }

  const historyOk = applied.length
    ? await writeHistory(historyListId, vehicle, applied, source, crypto.randomUUID())
    : true;

  if (!stopped) return { status: "saved", changes: applied, historyOk };
  if (stopped.conflict) return { status: "conflict", fields: stopped.conflict };
  if (stopped.status === 403) return { status: "denied" };
  return { status: "failed", code: `${stopped.status} ${stopped.code}` };
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
