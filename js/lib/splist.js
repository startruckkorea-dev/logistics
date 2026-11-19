// SharePoint List 호출 — 조회, 생성, 열 추가, 항목 읽기·쓰기.
// 삭제 기능은 두지 않는다.
import { GRAPH, SHAREPOINT } from "./config.js";
import { gfetch, gfetchAll, gbatch, runPool, chunk } from "./graph.js";

let siteIdPromise;
export function getSiteId() {
  siteIdPromise ??= gfetch(
    `/sites/${SHAREPOINT.hostname}:${SHAREPOINT.sitePath}?$select=id`,
    { name: "site" }
  ).then((site) => site.id);
  return siteIdPromise;
}

const sitePath = async () => `/sites/${await getSiteId()}`;

/** 사이트의 List 목록. @returns {Promise<Array<{id, name, displayName}>>} */
export async function listLists() {
  const { items } = await gfetchAll(
    `${await sitePath()}/lists?$select=id,name,displayName&$top=200`,
    { name: "lists" }
  );
  return items;
}

// List 이름 → id. 한 번 조회한 목록을 화면이 떠 있는 동안 다시 쓴다.
let listIdsPromise;
export async function findListId(displayName) {
  listIdsPromise ??= listLists().then((lists) => new Map(lists.map((l) => [l.displayName, l.id])));
  const id = (await listIdsPromise).get(displayName);
  if (!id) {
    listIdsPromise = undefined; // 다음 호출에서 다시 조회한다(그사이 만들어졌을 수 있다)
    throw new Error(`List 를 찾을 수 없습니다: ${displayName}`);
  }
  return id;
}

// Graph 가 돌려준 열 정의 → 우리 타입 이름
function typeOf(column) {
  if (column.boolean) return "boolean";
  if (column.number) return "number";
  if (column.text) return column.text.allowMultipleLines ? "note" : "text";
  return "other";
}

/** List 의 열. @returns {Promise<Array<{name, type, indexed, unique}>>} */
export async function listColumns(listId) {
  const { items } = await gfetchAll(
    `${await sitePath()}/lists/${listId}/columns` +
      "?$select=name,text,number,boolean,indexed,enforceUniqueValues",
    { name: "list.columns" }
  );
  return items.map((c) => ({
    name: c.name,
    type: typeOf(c),
    indexed: c.indexed === true,
    unique: c.enforceUniqueValues === true,
  }));
}

// 우리 정의 → Graph columnDefinition
function columnDefinition(column, def) {
  const isKey = column.name === def.key;
  const body = { name: column.name, displayName: column.name };
  if (column.type === "text") body.text = { allowMultipleLines: false, maxLength: 255 };
  else if (column.type === "note") body.text = { allowMultipleLines: true, textType: "plain" };
  else if (column.type === "number") body.number = {};
  else if (column.type === "boolean") body.boolean = {};
  if (isKey || def.indexed.includes(column.name)) body.indexed = true;
  if (isKey) body.enforceUniqueValues = true;
  return body;
}

/** 정의대로 List 를 만든다. @returns {Promise<{id}>} */
export async function createList(def) {
  return gfetch(`${await sitePath()}/lists`, {
    method: "POST",
    name: "list.create",
    body: {
      displayName: def.listName,
      list: { template: "genericList" },
      columns: def.columns.map((column) => columnDefinition(column, def)),
    },
  });
}

/** List 에 열 하나를 추가한다. */
export async function addListColumn(listId, column, def) {
  return gfetch(`${await sitePath()}/lists/${listId}/columns`, {
    method: "POST",
    name: "list.addColumn",
    body: columnDefinition(column, def),
  });
}

/**
 * List 의 모든 항목. 필요한 필드만 가져온다.
 * @returns {Promise<Array<{id: string, fields: object}>>}
 */
export async function readListItems(listId, fieldNames) {
  const { items } = await gfetchAll(
    `${await sitePath()}/lists/${listId}/items` +
      `?$select=id,eTag&$expand=fields($select=${fieldNames.join(",")})&$top=500`,
    { name: "list.items" }
  );
  return items.map((item) => ({ id: item.id, etag: etagOf(item), fields: item.fields ?? {} }));
}

// 항목의 버전 표시. 저장할 때 If-Match 로 돌려보내 그사이 바뀌었는지 확인한다.
const etagOf = (obj) => obj?.["@odata.etag"] ?? obj?.eTag ?? null;

/** 항목 하나를 다시 읽는다. @returns {Promise<{id, etag, fields}>} */
export async function readListItem(listId, itemId, fieldNames) {
  const item = await gfetch(
    `${await sitePath()}/lists/${listId}/items/${itemId}` +
      `?$select=id,eTag&$expand=fields($select=${fieldNames.join(",")})`,
    { name: "list.item" }
  );
  return { id: item.id, etag: etagOf(item), fields: item.fields ?? {} };
}

// OData 문자열 값으로 그대로 넣어도 되는 글자만 허용한다(그 밖의 값은 조회하지 않는다).
const SAFE_FILTER_VALUE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * 한 열의 값이 같은 항목만 읽는다. 그 열에는 인덱스가 있어야 한다.
 * 만든 사람과 시각(SharePoint 가 기록)을 같이 돌려준다.
 * @returns {Promise<Array<{id, createdAt: string, createdBy: string, fields: object}>>}
 */
export async function readListItemsBy(listId, fieldNames, filterField, value) {
  if (!SAFE_FILTER_VALUE.test(String(value))) throw new Error("조회할 수 없는 값입니다.");
  const { items } = await gfetchAll(
    `${await sitePath()}/lists/${listId}/items` +
      `?$select=id,createdDateTime,createdBy&$expand=fields($select=${fieldNames.join(",")})` +
      `&$filter=fields/${filterField} eq '${value}'&$top=500`,
    { name: "list.itemsBy" }
  );
  return items.map((item) => ({
    id: item.id,
    createdAt: item.createdDateTime ?? "",
    createdBy: item.createdBy?.user?.displayName ?? "",
    fields: item.fields ?? {},
  }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY_STATUS = [429, 503, 504];

// 요청들을 $batch 묶음으로 보내고, 요청 순서대로 응답을 돌려준다.
// 스로틀·일시 장애 응답은 Retry-After 만큼 기다렸다가 그 요청만 다시 보낸다.
// 묶음 자체가 실패하면(네트워크 오류 등) 그 묶음의 요청은 status 0 으로 채운다.
async function sendBatched(requests, onProgress) {
  const responses = new Array(requests.length);
  let done = 0;

  const runChunk = async (indexes) => {
    let pending = indexes;
    try {
      for (let attempt = 0; pending.length; attempt++) {
        const answers = await gbatch(
          pending.map((i) => ({ ...requests[i], id: i })),
          "list.write"
        );
        const byId = new Map(answers.map((r) => [String(r.id), r]));
        const retry = [];
        let waitSeconds = 0;
        for (const i of pending) {
          const res = byId.get(String(i));
          const status = res?.status ?? 0;
          if (RETRY_STATUS.includes(status) && attempt < GRAPH.maxRetry) {
            retry.push(i);
            waitSeconds = Math.max(waitSeconds, Number(res.headers?.["Retry-After"]) || 2 ** attempt);
          } else {
            responses[i] = { status, code: res?.body?.error?.code ?? "unknown", body: res?.body ?? null };
          }
        }
        pending = retry;
        if (pending.length) await sleep(waitSeconds * 1000);
      }
    } catch (error) {
      for (const i of pending) {
        responses[i] = { status: error?.status ?? 0, code: error?.code ?? "request_failed", body: null };
      }
    }
    done += indexes.length;
    onProgress?.(done, requests.length);
  };

  await runPool(
    chunk(requests.map((_, i) => i), GRAPH.batchSize).map((indexes) => () => runChunk(indexes)),
    GRAPH.concurrency
  );
  return responses;
}

const isOk = (status) => status >= 200 && status < 300;

/**
 * 항목 추가·변경을 $batch 로 실행한다. 부하는 동시성(GRAPH.concurrency)으로 조절한다.
 * @param {string} listId
 * @param {Array<{kind: "add", fields: object} | {kind: "update", id: string, fields: object}>} ops
 * @param {(done: number, total: number) => void} onProgress
 * @returns {Promise<{ok: number, failed: Array<{status: number, code: string}>}>}
 *   failed 에는 상태 코드와 오류 코드만 담는다(값은 담지 않는다).
 */
export async function writeListItems(listId, ops, onProgress) {
  const base = `${await sitePath()}/lists/${listId}/items`;
  const responses = await sendBatched(
    ops.map((op) =>
      op.kind === "add"
        ? { method: "POST", url: base, body: { fields: op.fields } }
        : { method: "PATCH", url: `${base}/${op.id}/fields`, body: op.fields }
    ),
    onProgress
  );
  const failed = responses
    .filter((r) => !isOk(r.status))
    .map((r) => ({ status: r.status, code: r.code }));
  return { ok: responses.length - failed.length, failed };
}

/**
 * 항목을 변경한다. 읽은 뒤 다른 사람이 바꾼 항목은 쓰지 않고 412 로 돌려준다.
 * @param {string} listId
 * @param {Array<{id: string, etag: string, fields: object}>} updates fields 는 바뀐 필드만
 * @returns {Promise<Array<{status: number, code: string, etag: string|null}>>} updates 와 같은 순서.
 *   etag 는 성공한 항목의 새 버전 표시.
 */
export async function updateListItems(listId, updates, onProgress) {
  const base = `${await sitePath()}/lists/${listId}/items`;
  const responses = await sendBatched(
    updates.map((u) => ({
      method: "PATCH",
      url: `${base}/${u.id}/fields`,
      headers: { "If-Match": u.etag },
      body: u.fields,
    })),
    onProgress
  );
  return responses.map((r) => ({
    status: r.status,
    code: r.code,
    etag: isOk(r.status) ? etagOf(r.body) : null,
  }));
}
