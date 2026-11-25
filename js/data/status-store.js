// 상태 자동 갱신 — 날짜가 지난 차량의 Current Status 를 다음 단계로 바꾼다.
//   statusCandidates  : 바꿀 차량을 찾는다(쓰지 않는다). 판정은 js/domain/status.js 의 nextStatus
//   applyStatusUpdate : 고른 차량만 저장한다. 한 번에 한 단계만 바꾼다
import { nextStatus } from "../domain/status.js";
import { saveVehicles, targetListNames } from "./store.js";

/** 변경 이력에 남기는 출처 */
export const STATUS_SOURCE = "상태 자동 갱신";

const candidateOf = (vehicle, today) => {
  const next = nextStatus(
    {
      status: vehicle.current_status,
      changeability: vehicle.changeability_date,
      pm: vehicle.pm,
      vessel: vehicle.vessel,
      shipping: vehicle.shipping,
    },
    today
  );
  return next ? { vehicle, from: vehicle.current_status, to: next.to, rule: next.rule } : null;
};

/**
 * @param {object[]} vehicles loadVehicles 가 돌려준 차량 행
 * @param {string} today 기준일 "YYYY-MM-DD"
 * @returns {Array<{vehicle: object, from: string, to: string, rule: "changeability" | "pm" | "vessel" | "shipped"}>}
 */
export const statusCandidates = (vehicles, today) => vehicles.map((v) => candidateOf(v, today)).filter(Boolean);

/** 저장할 때 쓰는 List 이름(저장 전에 보여준다) */
export const statusListNames = () => targetListNames(["current_status"]);

/**
 * 고른 차량의 상태를 바꾼다. 창을 연 뒤 값이 달라져 더는 대상이 아닌 차량은 건너뛴다.
 * @param {ReturnType<typeof statusCandidates>} items
 * @param {string} today 기준일
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{
 *   saved: number, by: Map<string, number>,       // 바꾼 차량 수, "앞 상태 → 뒤 상태" 별 수
 *   conflicts: number, denied: number, failed: number, failedCodes: string[],
 *   historyFailed: number, historyCodes: string[],
 * }>}
 */
export async function applyStatusUpdate(items, today, onProgress) {
  const valid = items.filter((item) => {
    const now = candidateOf(item.vehicle, today);
    return now && now.from === item.from && now.to === item.to;
  });
  const fromOf = new Map(valid.map((item) => [item.vehicle, item.from]));
  const out = await saveVehicles(
    valid.map((item) => ({ vehicle: item.vehicle, inputs: { current_status: item.to }, status: true })),
    STATUS_SOURCE,
    onProgress
  );
  const by = new Map();
  for (const { vehicle } of out.saved) {
    const key = `${fromOf.get(vehicle)} → ${vehicle.current_status}`;
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  return {
    saved: out.saved.length,
    by,
    conflicts: out.conflicts.length,
    denied: out.denied.length,
    failed: out.failed.length,
    failedCodes: [...new Set(out.failed.map((f) => f.code))],
    historyFailed: out.historyFailed,
    historyCodes: out.historyCodes,
  };
}
