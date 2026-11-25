// Logistics · Current Status 업데이트 — 날짜가 지난 차량을 전환별로 묶어 보여주고, 체크한 차량만 다음 단계로 바꾼다.
// 창에서 "반영"을 누르면 바로 저장한다. 한 번에 한 단계만 바꾸므로 이어지는 전환은 다시 열어 반영한다.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { baseDate } from "../app/base-date.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { monthOf } from "../domain/dates.js";
import { stageClass } from "../data/columns.js";
import { statusCandidates, applyStatusUpdate, statusListNames } from "../data/status-store.js";

const num = (n) => Number(n).toLocaleString("ko-KR");
const stagePill = (stage) => mk("span", { class: `pill ${stageClass(stage)}` }, stage);

// 전환 순서와 조건 설명
const RULES = [
  ["changeability", "Changeability Date 경과"],
  ["pm", "PM(생산월) 도래"],
  ["vessel", "Vessel · Shipping 확정"],
  ["shipped", "Shipping 날짜 경과"],
];

// 그 차량이 대상이 된 값
function reasonOf({ vehicle: v, rule }) {
  if (rule === "changeability") return `Changeability Date ${v.changeability_date}`;
  if (rule === "pm") return `PM ${monthOf(String(v.pm))}`;
  if (rule === "vessel") return `${v.vessel} · Shipping ${v.shipping}`;
  return `Shipping ${v.shipping}`;
}

/** 지금 상태를 바꿀 차량 수(버튼에 보여준다) */
export const statusUpdateCount = (vehicles) => statusCandidates(vehicles, baseDate()).length;

/**
 * @param {object[]} vehicles 차량 행 전체
 * @param {{render: () => void}} hooks render: 저장 뒤 그리드를 다시 그린다
 */
export function openStatusUpdate(vehicles, hooks) {
  const today = baseDate();
  const items = statusCandidates(vehicles, today);
  const title = tx("Current Status 업데이트");
  if (!items.length) {
    openModal(title, mk("p", { class: "muted" }, tx("상태를 바꿀 차량이 없습니다.")));
    return;
  }

  const off = new Set(); // 체크를 푼 차량
  let saving = false;
  const picked = () => items.filter((item) => !off.has(item));
  const info = mk("span", { class: "muted small su-info" });
  const applyButton = mk("button", { class: "btn primary", type: "button" });
  const closeButton = mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("닫기"));
  const headSyncs = [];
  const sync = () => {
    const n = picked().length;
    info.textContent = tx("선택 {n}건 / 대상 {a}건", { n: num(n), a: num(items.length) });
    if (!saving) applyButton.textContent = tx("반영 ({n}건)", { n: num(n) });
    applyButton.disabled = !n || saving;
    for (const fn of headSyncs) fn();
  };

  const group = ([rule, text]) => {
    const rows = items.filter((item) => item.rule === rule);
    if (!rows.length) return null;
    const boxes = [];
    const all = mk("input", { type: "checkbox", title: tx("전체 선택") });
    headSyncs.push(() => {
      const on = rows.filter((item) => !off.has(item)).length;
      all.checked = on === rows.length;
      all.indeterminate = on > 0 && on < rows.length;
    });
    const row = (item) => {
      const box = mk("input", { type: "checkbox", class: "rowsel", checked: true });
      const tr = mk(
        "tr",
        null,
        mk("td", { class: "su-pick" }, box),
        mk("td", { class: "mono" }, item.vehicle.commission_no),
        mk("td", null, item.vehicle.model ?? ""),
        mk("td", null, item.vehicle.type ?? ""),
        mk("td", null, stagePill(item.from)),
        mk("td", null, stagePill(item.to)),
        mk("td", { class: "small" }, reasonOf(item))
      );
      const set = (on) => {
        box.checked = on;
        if (on) off.delete(item);
        else off.add(item);
        tr.classList.toggle("su-off", !on);
      };
      box.addEventListener("change", () => {
        set(box.checked);
        sync();
      });
      boxes.push(set);
      return tr;
    };
    const body = mk("tbody", null, rows.map(row));
    all.addEventListener("change", () => {
      for (const set of boxes) set(all.checked);
      sync();
    });
    return mk(
      "div",
      { class: "su-group" },
      mk(
        "div",
        { class: "section-h" },
        stagePill(rows[0].from),
        "→",
        stagePill(rows[0].to),
        mk("span", { class: "sub" }, `${tx("{n}건", { n: num(rows.length) })} · ${tx(text)}`)
      ),
      mk(
        "div",
        { class: "tbl-wrap" },
        mk(
          "table",
          { class: "tbl compact su-tbl" },
          mk(
            "thead",
            null,
            mk(
              "tr",
              null,
              mk("th", { class: "su-pick" }, all),
              ["Commission No", "Model", "Type"].map((h) => mk("th", null, h)),
              [tx("변경 전"), tx("변경 후"), tx("사유")].map((h) => mk("th", null, h))
            )
          ),
          body
        )
      )
    );
  };

  applyButton.addEventListener("click", async () => {
    const picks = picked();
    if (!picks.length || saving) return;
    saving = true;
    closeButton.disabled = true;
    applyButton.textContent = tx("저장 중...");
    sync();
    try {
      const out = await applyStatusUpdate(picks, today, (done, total) => {
        applyButton.textContent = `${tx("저장 중...")} ${num(done)}/${num(total)}`;
      });
      closeModal();
      const troubles = [
        out.conflicts ? tx("충돌 {n}건", { n: num(out.conflicts) }) : null,
        out.denied ? tx("권한 없음 {n}건", { n: num(out.denied) }) : null,
        out.failed ? `${tx("실패 {n}건", { n: num(out.failed) })} (${out.failedCodes.join(", ")})` : null,
      ].filter(Boolean);
      toast(
        tx("Current Status 업데이트 {n}대 반영", { n: num(out.saved) }),
        [
          [...out.by].map(([key, n]) => `${key} ${num(n)}`).join(" · "),
          troubles.length ? `${tx("저장하지 못한 것")}: ${troubles.join(" · ")}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      );
      if (out.historyFailed) {
        toast(
          tx("변경 이력 기록 실패 {n}건", { n: num(out.historyFailed) }),
          `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${out.historyCodes.join(", ")})`
        );
      }
    } catch (err) {
      console.error(err);
      closeModal();
      toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
    } finally {
      hooks.render();
    }
  });

  const groups = RULES.map(group);
  sync();
  openModal(
    title,
    [
      mk(
        "div",
        { class: "callout" },
        tx("오늘({d}) 기준으로 날짜가 지난 차량의 Current Status 를 다음 단계로 바꿉니다. 한 번에 한 단계만 바꾸므로, 반영한 뒤 대상이 다시 나오면 한 번 더 반영하세요. 체크를 푼 차량은 바꾸지 않습니다. '반영'을 누르면 바로 저장되고 변경 이력에 남습니다.", { d: today })
      ),
      groups,
      mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${statusListNames().join(", ")}`),
    ],
    [info, closeButton, applyButton]
  );
}
