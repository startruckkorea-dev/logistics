// Logistics 그리드의 월말 마감.
//   "월말 마감" → 마감할 달을 고르고 마감 대상을 확인한다 → "마감하기": 그 순간의 재고(Bonded Stock · OH Stock)를
//   그 달의 마감으로 저장하고 재고현황의 월말 마감 탭으로 간다.
// 판매된 차량은 마감하기 전에 편집 기능으로 Sales Month 를 넣어 둔다(넣으면 Sold 로 바뀐다 — js/data/store.js).
// 이미 마감한 달을 다시 마감하면 덮어쓴다.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { baseDate } from "../app/base-date.js";
import { addMonths, monthOf } from "../domain/dates.js";
import {
  closingTargets, saveClosing, listClosings, loadClosing, closingFileNames, closingFolders,
} from "../data/closing-store.js";

const num = (n) => Number(n).toLocaleString("ko-KR");

let running = false;

/**
 * "월말 마감" — 마감할 달과 마감 대상을 보여주고, 확인하면 마감한다.
 * @param {object[]} vehicles 화면의 차량 행 전체
 * @param {{busy: (on: boolean) => void}} hooks busy: 저장하는 동안 버튼을 막는 데 쓴다
 */
export function openClosing(vehicles, hooks) {
  if (running) return;
  const thisMonth = monthOf(baseDate());
  const lastMonth = addMonths(thisMonth, -1);
  const select = mk(
    "select",
    null,
    mk("option", { value: thisMonth }, tx("{m} (이번 달)", { m: thisMonth })),
    mk("option", { value: lastMonth }, tx("{m} (지난달)", { m: lastMonth }))
  );
  const targets = closingTargets(vehicles);
  const cleared = targets.filter((x) => x.cleared).length;
  const [modify, readDownload] = closingFolders();

  // 고른 달에 따라 바뀌는 안내: 이미 마감한 달인지, 쓰는 파일 이름
  const about = mk("div");
  let turn = 0;
  const describe = async () => {
    const mine = ++turn;
    const month = select.value;
    const files = mk("p", { class: "muted small" }, `${tx("마감 파일")}(${ENV.label}): ${closingFileNames(month).join(", ")}`);
    about.replaceChildren(files);
    let before = null;
    let unknown = false;
    try {
      if ((await listClosings({ refresh: true })).includes(month)) before = await loadClosing(month);
    } catch (err) {
      console.error(err);
      unknown = true;
    }
    if (mine !== turn) return;
    about.replaceChildren(
      ...[
        before
          ? mk(
              "div",
              { class: "callout warn" },
              tx("이미 마감한 달입니다. 앞의 마감({d}, {n}대)을 덮어씁니다. 지금 시점의 재고로 다시 찍으므로 마감 직후의 정정에만 쓰세요.", {
                d: before.closedAt || "-",
                n: num(before.vehicles.length),
              })
            )
          : null,
        unknown ? mk("p", { class: "error small" }, tx("이 달을 이미 마감했는지 확인하지 못했습니다. 마감했다면 덮어씁니다.")) : null,
        files,
      ].filter(Boolean)
    );
  };
  select.addEventListener("change", describe);

  openModal(
    tx("월말 마감"),
    [
      mk("p", null, mk("label", null, tx("마감할 달"), " ", select)),
      mk(
        "p",
        null,
        mk("b", null, tx("마감 대상 {n}대", { n: num(targets.length) })),
        ` — ${tx("보세(Bonded) {b} · 통관(OH) {c}", { b: num(targets.length - cleared), c: num(cleared) })}`
      ),
      mk(
        "p",
        { class: "muted small" },
        tx("지금 Current Status 가 Bonded Stock · OH Stock 인 차량을 이 달의 마감으로 저장합니다. 판매된 차량은 먼저 Sales Month 를 입력해 두세요(입력하면 Sold 로 바뀝니다).")
      ),
      about,
      mk("p", { class: "muted small" }, `${tx("저장 폴더")}: ${modify} → ${readDownload}`),
    ],
    [
      mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")),
      mk(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () => {
            const month = select.value;
            closeModal();
            run(vehicles, month, hooks);
          },
        },
        tx("마감하기")
      ),
    ]
  );
  describe();
}

async function run(vehicles, month, hooks) {
  if (running) return;
  running = true;
  hooks.busy(true);
  try {
    const result = await saveClosing(month, vehicles, baseDate());
    if (!result.ok) {
      toast(tx("마감 파일을 저장하지 못했습니다"), result.code);
      return;
    }
    if (!result.copied) {
      toast(
        tx("마감 파일을 R-Download 폴더에 복사하지 못했습니다"),
        `${result.code} · ${tx("Modify 폴더에는 저장되었습니다. 복사되지 않으면 월말 마감 탭에 나오지 않습니다. 다시 마감하세요.")}`
      );
      return;
    }
    toast(tx("{m} 월말 마감 완료", { m: month }), tx("마감 대상 {n}대", { n: num(result.count) }));
    window.location.hash = `#/stock?view=closing&m=${month}`;
  } catch (err) {
    console.error(err);
    toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
  } finally {
    running = false;
    hooks.busy(false);
  }
}
