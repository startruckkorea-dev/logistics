// 통관일 상태 정리 — 이관 때 통관일(Customs Clearance Date)이 들어왔는데 Bonded Stock 으로 남은 차량을 OH Stock 으로 바꾼다.
// 이관 직후 한 번 쓰는 정리다. 그 뒤로는 통관 완료 처리가 통관일과 상태를 같이 바꾼다.
// 화면에는 건수만 보여준다.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { STATUS } from "../domain/status.js";
import { baseDate } from "../app/base-date.js";
import { loadVehicles } from "../data/vehicles.js";
import { saveVehicles, targetListNames } from "../data/store.js";
import { prodConfirm } from "./lists-ui.js";

const SOURCE = "상태 정리 (통관일)";

/** "통관일 상태 정리" 화면. 대상 건수를 보여주고, 확인하면 상태를 바꾼다. */
export async function renderCustomsStatusFix(container, setStatus) {
  container.hidden = false;
  container.replaceChildren(
    mk("h2", null, `통관일 상태 정리 — ${ENV.label}`),
    mk(
      "p",
      { class: "hint" },
      "통관일이 있는데 Bonded Stock 인 차량을 OH Stock 으로 바꿉니다. 오늘 이후 날짜의 통관일은 바꾸지 않습니다."
    )
  );

  let vehicles;
  try {
    setStatus("차량 데이터를 읽는 중...");
    ({ vehicles } = await loadVehicles({ refresh: true }));
  } catch (err) {
    console.error(err);
    setStatus(`통관일 상태 정리 실패: ${err?.status ?? ""} ${err?.message ?? ""}`.trim(), true);
    return;
  }

  const today = baseDate();
  const bonded = vehicles.filter((v) => v.current_status === STATUS.BONDED_STOCK && v.customs_clearance_date);
  const targets = bonded.filter((v) => String(v.customs_clearance_date) <= today);
  const future = bonded.length - targets.length;
  container.append(
    mk("p", null, `대상 ${targets.length}대` + (future ? ` · 오늘 이후 날짜라 제외 ${future}대` : "")),
    mk("p", { class: "hint" }, `대상 List: ${targetListNames(["current_status"]).join(", ")}`)
  );
  setStatus(`통관일 상태 정리: 대상 ${targets.length}대`);
  if (!targets.length) return;

  const confirm = prodConfirm();
  const button = mk("button", { type: "button" }, `OH Stock 으로 바꾸기 (${targets.length}대)`);
  button.addEventListener("click", async () => {
    if (!confirm.isConfirmed()) {
      setStatus("확인 문구가 맞지 않습니다.", true);
      return;
    }
    button.disabled = true;
    try {
      const out = await saveVehicles(
        targets.map((vehicle) => ({ vehicle, inputs: { current_status: STATUS.OH_STOCK }, status: true })),
        SOURCE,
        (done, total) => setStatus(`저장하는 중... ${done}/${total}`)
      );
      const troubled = out.conflicts.length + out.denied.length + out.failed.length;
      const codes = [...new Set(out.failed.map((f) => f.code))];
      setStatus(
        `통관일 상태 정리: ${out.saved.length}대 변경` +
          (troubled
            ? ` · 저장하지 못한 것 — 충돌 ${out.conflicts.length}건, 권한 없음 ${out.denied.length}건, 실패 ${out.failed.length}건` +
              (codes.length ? ` (${codes.join(", ")})` : "")
            : "") +
          (out.historyFailed ? ` · 이력 기록 실패 ${out.historyFailed}건 (${out.historyCodes.join(", ")})` : ""),
        troubled > 0 || out.historyFailed > 0
      );
      await renderCustomsStatusFix(container, () => {});
    } catch (err) {
      console.error(err);
      setStatus(`통관일 상태 정리 실패: ${err?.status ?? ""} ${err?.message ?? ""}`.trim(), true);
      button.disabled = false;
    }
  });
  container.append(confirm.node ?? "", mk("p", null, button));
}
