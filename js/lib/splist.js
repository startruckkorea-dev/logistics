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
      `?$select=id&$expand=fields($select=${fieldNames.join(",")})&$top=500`,
    { name: "list.items" }
  );
  return items.map((item) => ({ id: item.id, fields: item.fields ?? {} }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY_STATUS = [429, 503, 504];

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
  const toRequest = (op, id) =>
    op.kind === "add"
      ? { id, method: "POST", url: base, body: { fields: op.fields } }
      : { id, method: "PATCH", url: `${base}/${op.id}/fields`, body: op.fields };

  let ok = 0;
  let done = 0;
  const failed = [];

  const runChunk = async (group) => {
    let pending = group.map((op, i) => toRequest(op, i));
    for (let attempt = 0; pending.length; attempt++) {
      const responses = await gbatch(pending, "list.write");
      const byId = new Map(responses.map((r) => [String(r.id), r]));
      const retry = [];
      let waitSeconds = 0;
      for (const request of pending) {
        const res = byId.get(String(request.id));
        const status = res?.status ?? 0;
        if (status >= 200 && status < 300) ok++;
        else if (RETRY_STATUS.includes(status) && attempt < GRAPH.maxRetry) {
          retry.push(request);
          waitSeconds = Math.max(waitSeconds, Number(res.headers?.["Retry-After"]) || 2 ** attempt);
        } else failed.push({ status, code: res?.body?.error?.code ?? "unknown" });
      }
      pending = retry;
      if (pending.length) await sleep(waitSeconds * 1000);
    }
    done += group.length;
    onProgress?.(done, ops.length);
  };

  const results = await runPool(
    chunk(ops, GRAPH.batchSize).map((group) => () => runChunk(group)),
    GRAPH.concurrency
  );
  // 묶음 자체가 실패한 경우(네트워크 오류 등)
  for (const r of results) {
    if (!r.ok) failed.push({ status: r.error?.status ?? 0, code: r.error?.code ?? "request_failed" });
  }
  return { ok, failed };
}
