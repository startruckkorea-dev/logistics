// 마스터 데이터 읽기 — Model Master, Color Master.
// 한 번 읽은 결과는 화면이 떠 있는 동안 다시 쓴다.
import { findListId, readListItems } from "../lib/splist.js";
import { LISTS } from "../etl/lists.js";

/** List 한 개를 읽어 행 객체 배열로. 값이 없는 필드는 "" 로 맞춘다.
 *  _itemId = SharePoint 항목 id, _etag = 읽은 시점의 버전 표시(저장할 때 충돌 확인에 쓴다) */
export async function readList(id) {
  const def = LISTS.find((d) => d.id === id);
  const names = def.columns.map((c) => c.name);
  const items = await readListItems(await findListId(def.listName), names);
  return items.map((item) => {
    const row = { _itemId: item.id, _etag: item.etag };
    for (const name of names) row[name] = item.fields[name] ?? "";
    return row;
  });
}

const cache = new Map();
function cached(id, refresh) {
  if (refresh) cache.delete(id);
  if (!cache.has(id)) {
    cache.set(
      id,
      readList(id).catch((err) => {
        cache.delete(id); // 실패한 결과는 남기지 않는다
        throw err;
      })
    );
  }
  return cache.get(id);
}

/** @returns {Promise<object[]>} Model Master 행 */
export const loadModelMaster = (options = {}) => cached("modelMaster", options.refresh);

/** @returns {Promise<object[]>} Color Master 행 */
export const loadColorMaster = (options = {}) => cached("colorMaster", options.refresh);
