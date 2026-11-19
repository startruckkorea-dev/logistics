// 차량 데이터 읽기 — Logistics 두 List(AFAB, Main)를 Commission No 로 합치고
// Model Master 에서 가져오는 값(Spec, 리드타임)을 붙인다.
// 화면 전용 계산값은 List 에 저장하지 않고 여기서 만든다.
import { findListId, readListItems } from "../lib/splist.js";
import { LISTS } from "../etl/lists.js";

const definition = (id) => LISTS.find((def) => def.id === id);

// List 한 개를 읽어 행 객체 배열로. 값이 없는 필드는 "" 로 맞춘다.
async function readList(id) {
  const def = definition(id);
  const names = def.columns.map((c) => c.name);
  const items = await readListItems(await findListId(def.listName), names);
  return items.map((item) => {
    const row = { _itemId: item.id };
    for (const name of names) row[name] = item.fields[name] ?? "";
    return row;
  });
}

let cache;

/**
 * @param {{refresh?: boolean}} [options] refresh: 다시 읽는다
 * @returns {Promise<{
 *   vehicles: object[],      // 차량 1대 = 1행. 두 List 의 열 + spec, lead_days
 *   onlyAfab: number,        // AFAB List 에만 있는 건수
 *   onlyMain: number,        // Main List 에만 있는 건수
 *   loadedAt: Date,
 * }>}
 */
export function loadVehicles(options = {}) {
  if (options.refresh) cache = undefined;
  cache ??= read().catch((err) => {
    cache = undefined; // 실패한 결과는 남기지 않는다
    throw err;
  });
  return cache;
}

async function read() {
  const [afab, main, models] = await Promise.all([
    readList("logisticsAfab"),
    readList("logisticsMain"),
    readList("modelMaster"),
  ]);

  const modelByKey = new Map(models.map((m) => [m.moma_no, m]));
  const mainByKey = new Map(main.map((row) => [row.commission_no, row]));
  const afabKeys = new Set();

  const merge = (afabRow, mainRow) => {
    const { _itemId: afabItemId, ...afabFields } = afabRow ?? {};
    const { _itemId: mainItemId, ...mainFields } = mainRow ?? {};
    const model = modelByKey.get(mainFields.moma_no);
    return {
      ...mainFields,
      ...afabFields,
      spec: model?.spec ?? "",
      lead_days: model?.lead_days ?? "",
      // 저장할 때 어느 List 의 어느 항목인지 찾는 데 쓴다
      _items: { afab: afabItemId ?? null, main: mainItemId ?? null },
    };
  };

  const vehicles = afab.map((row) => {
    afabKeys.add(row.commission_no);
    return merge(row, mainByKey.get(row.commission_no));
  });
  let onlyMain = 0;
  for (const row of main) {
    if (afabKeys.has(row.commission_no)) continue;
    vehicles.push(merge(null, row));
    onlyMain++;
  }
  const onlyAfab = afab.filter((row) => !mainByKey.has(row.commission_no)).length;

  return { vehicles, onlyAfab, onlyMain, loadedAt: new Date() };
}
