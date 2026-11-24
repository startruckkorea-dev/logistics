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

/**
 * 두 List 의 행과 Model Master 행으로 차량 행 하나를 만든다.
 * @param {object|null} afabRow AFAB List 의 행(없으면 null — AFAB 에 아직 없는 오더)
 * @param {object|null} mainRow Main List 의 행
 * @param {object} [model] Model Master 행
 */
export function mergeVehicle(afabRow, mainRow, model) {
  const { _itemId: afabItemId, _etag: afabEtag, ...afabFields } = afabRow ?? {};
  const { _itemId: mainItemId, _etag: mainEtag, ...mainFields } = mainRow ?? {};
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

  const merge = (afabRow, mainRow) => mergeVehicle(afabRow, mainRow, modelByKey.get(mainRow?.moma_no));

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

/**
 * Commission No 로 차량을 찾는 함수를 만든다.
 * 엑셀이 숫자로 바꿔 앞자리 0 이 빠진 값도 차량 한 대로 좁혀지면 받아 준다.
 * @param {object[]} vehicles
 * @returns {(commission: string) => object | null}
 */
export function commissionFinder(vehicles) {
  const exact = new Map(vehicles.map((v) => [v.commission_no, v]));
  const loose = new Map();
  const strip = (text) => text.replace(/^0+/, "");
  for (const v of vehicles) {
    const key = strip(String(v.commission_no ?? ""));
    loose.set(key, loose.has(key) ? null : v);
  }
  return (commission) => exact.get(commission) ?? loose.get(strip(commission)) ?? null;
}
