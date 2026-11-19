// 차량 데이터 읽기 — Logistics 두 List(AFAB, Main)를 Commission No 로 합치고
// Model Master 에서 가져오는 값(Spec, 리드타임)을 붙인다.
// 화면 전용 계산값은 List 에 저장하지 않고 여기서 만든다.
import { readList, loadModelMaster } from "./masters.js";

let cache;

/**
 * @param {{refresh?: boolean}} [options] refresh: 다시 읽는다
 * @returns {Promise<{
 *   vehicles: object[],      // 차량 1대 = 1행. 두 List 의 열 + spec, lead_days, lead_months
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
    loadModelMaster(),
  ]);

  const modelByKey = new Map(models.map((m) => [m.moma_no, m]));
  const mainByKey = new Map(main.map((row) => [row.commission_no, row]));
  const afabKeys = new Set();

  const merge = (afabRow, mainRow) => {
    const { _itemId: afabItemId, _etag: afabEtag, ...afabFields } = afabRow ?? {};
    const { _itemId: mainItemId, _etag: mainEtag, ...mainFields } = mainRow ?? {};
    const model = modelByKey.get(mainFields.moma_no);
    return {
      ...mainFields,
      ...afabFields,
      spec: model?.spec ?? "",
      lead_days: model?.lead_days ?? "",
      lead_months: model?.lead ?? "",
      // 저장할 때 어느 List 의 어느 항목인지 찾는 데 쓴다
      _items: { afab: afabItemId ?? null, main: mainItemId ?? null },
      // 읽은 시점의 버전 표시. 저장할 때 그사이 다른 사람이 바꿨는지 확인한다
      _etags: { afab: afabEtag ?? null, main: mainEtag ?? null },
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
