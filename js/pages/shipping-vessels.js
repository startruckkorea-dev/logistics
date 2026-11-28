// 선적·입항의 "선박별 현황" — 선박(항차) 단위 값 보기와 편집.
//   차량에 반영하는 값: B/L No, ETA 선사, ATA, TSC 입고일(확정)  → 그 선박의 차량 전체(Main List)
//   선박에만 두는 값  : 총중량, TSC 입고일(예정)                 → 선박 단위 List
//   공지(자유 입력 한 칸)                                        → JSON 파일
// 편집 중 바꾼 값은 저장 대기에 쌓고 "편집 종료"에서 한꺼번에 저장한다. TSC 확정과 행 나누기는 창에서 바로 저장한다.
// 한 행 = 선박 이름 + Shipping 날짜 + 입항일 + B/L No 가 같은 차량(derive.js 의 listVoyages).
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { baseDate } from "../app/base-date.js";
import { STATUS } from "../domain/status.js";
import { stageClass } from "../data/columns.js";
import { STAGES } from "../data/stages.js";
import { countBy, listVoyages, voyageLink } from "../data/derive.js";
import {
  isDate, saveVehicles, saveVoyageNote, targetListNames, voyageListName, saveShippingNotice, noticeFileName,
} from "../data/store.js";
import { num } from "../app/charts.js";

const SOURCE = "선적·입항";
const SOURCE_TSC = "선적·입항 (TSC 확정)";
const SOURCE_SPLIT = "선적·입항 (행 나누기)";

// 편집 상태. 다른 화면에 다녀와도 유지한다.
//   pending : 선박 key → { bl?, eta?, ata?, tsc?, gw? } (바꾼 칸만)
//   notice  : 고친 공지 글. 고치지 않았으면 undefined
const edit = { on: false, saving: false, pending: new Map(), notice: undefined };

// 입력 칸 → 차량 행의 열
const VEHICLE_FIELD = { bl: "bl_no", eta: "eta_from_eukor_pirt", ata: "ata" };

const dash = () => mk("span", { class: "muted" }, "—");

function pendingCount() {
  let n = 0;
  for (const p of edit.pending.values()) n += Object.keys(p).length;
  return n + (edit.notice === undefined ? 0 : 1);
}

/**
 * @param {object[]} vehicles 차량 행 전체
 * @param {Map<string, {gw: any, tsc_planned: string}>} notes 선박 단위 List 의 값(선박 key 로 찾는다)
 * @param {{text: string}|null} notice 공지. 읽지 못했으면 null(그때는 고칠 수 없다)
 * @param {{rerender: () => void}} hooks rerender: 화면을 다시 그린다(저장 뒤 지표와 표를 맞춘다)
 * @returns {{cardEl: HTMLElement, table: HTMLTableElement}}
 */
export function vesselsCard(vehicles, notes, notice, hooks) {
  const today = baseDate();
  const voyages = listVoyages(vehicles, today);
  const byKey = new Map(voyages.map((y) => [y.key, y]));

  // 저장된 값. TSC 입고일은 확정이면 차량의 날짜, 아니면 선박에 둔 예정일이다.
  const saved = (y, name) => {
    if (name === "bl") return y.bls.length === 1 ? y.bls[0] : "";
    if (name === "eta") return y.eta_carrier;
    if (name === "ata") return y.eta_final;
    if (name === "tsc") return y.confirmed ? y.tsc : String(notes.get(y.voyage)?.tsc_planned ?? "");
    const gw = notes.get(y.voyage)?.gw;
    return gw === "" || gw == null ? "" : String(gw);
  };
  const shown = (y, name) => {
    const p = edit.pending.get(y.key);
    return p && name in p ? p[name] : saved(y, name);
  };
  const stage = (y, name, value) => {
    const p = edit.pending.get(y.key) ?? {};
    if (value === saved(y, name)) delete p[name];
    else p[name] = value;
    if (Object.keys(p).length) edit.pending.set(y.key, p);
    else edit.pending.delete(y.key);
  };

  const bar = mk("span", { class: "muted small" });
  const drawBar = () => {
    bar.textContent = edit.on ? tx("저장 대기 {n}건 → '편집 종료' 시 저장", { n: num(pendingCount()) }) : "";
  };

  // 입력칸. 값이 바뀌면 저장 대기에 올린다.
  const input = (y, name, type, extra = {}) => {
    const node = mk("input", { type, class: "tsc-in", ...extra });
    node.value = shown(y, name);
    node.classList.toggle("pend", name in (edit.pending.get(y.key) ?? {}));
    node.addEventListener("click", (event) => event.stopPropagation());
    node.addEventListener("change", () => {
      const value = node.value.trim();
      if (type === "date" && value && !isDate(value)) {
        node.value = shown(y, name);
        return;
      }
      // ATA 는 실제 입항일이라 기준일 이후 날짜는 받지 않는다
      if (name === "ata" && value > today) {
        toast(tx("ATA 입력 불가"), tx("ATA 는 실제 입항일이라 오늘({d}) 이후 날짜는 넣을 수 없습니다. 입항 예정일은 ETA 선사에 넣으세요.", { d: today }));
        node.value = shown(y, name);
        return;
      }
      // 확정된 TSC 입고일도 실제 입고일이다. 예정일은 앞날이어도 된다.
      if (name === "tsc" && y.confirmed && value > today) {
        toast(tx("TSC 입고일 확정"), tx("확정하는 TSC 입고일은 실제 입고일이라 오늘({d}) 이후 날짜는 넣을 수 없습니다.", { d: today }));
        node.value = shown(y, name);
        return;
      }
      stage(y, name, value);
      node.classList.toggle("pend", name in (edit.pending.get(y.key) ?? {}));
      // TSC 예정일이 생기거나 없어지면 배지가 달라진다
      if (name === "tsc") hooks.rerender();
      else drawBar();
    });
    return node;
  };
  const cell = (y, name, type, empty, extra) =>
    mk("td", { class: "mono" }, edit.on ? input(y, name, type, extra) : shown(y, name) || empty);

  // 단계 칸: 그 선박 차량의 Current Status. 여러 단계면 단계별 대수를 같이 적는다.
  const stageCell = (list) => {
    const counts = countBy(list, (v) => v.current_status);
    const stages = Object.keys(counts).sort((a, b) => STAGES.indexOf(a) - STAGES.indexOf(b));
    return mk(
      "td",
      null,
      stages.map((s) => mk("span", { class: `pill ${stageClass(s)} gap` }, stages.length > 1 ? `${s} ${num(counts[s])}` : s))
    );
  };

  const blCell = (y) => {
    // 차량마다 B/L 이 다르게 들어 있는 선박: 지금 값을 보여주고, 입력하면 하나로 맞춘다
    const mixed = y.bls.length > 1 ? y.bls.join(", ") : "";
    if (!edit.on) return mk("td", { class: "mono" }, y.bl || mk("span", { class: "muted" }, tx("미확정")));
    return mk("td", { class: "mono" }, input(y, "bl", "text", { placeholder: mixed || tx("미확정"), title: mixed }));
  };

  const gwCell = (y) => {
    if (edit.on) return mk("td", { class: "num gw" }, input(y, "gw", "number", { min: 0, step: 1, placeholder: "kg", class: "tsc-in gw-in" }));
    const gw = shown(y, "gw");
    return mk("td", { class: "num gw" }, gw === "" ? mk("span", { class: "gw-v muted" }, tx("미입력")) : mk("span", { class: "gw-v" }, num(Number(gw))));
  };

  // 예정/확정 배지. 편집 모드에서 "예정"을 누르면 확정 창이 뜬다.
  const tscBadge = (y) => {
    if (y.confirmed) return mk("span", { class: "pill ok" }, tx("확정"));
    if (!shown(y, "tsc")) return null;
    if (!edit.on) return mk("span", { class: "pill warn" }, tx("예정"));
    return mk(
      "button",
      {
        class: "pill warn pill-btn",
        type: "button",
        title: tx("클릭 → TSC 입고일 확정"),
        onclick: (event) => {
          event.stopPropagation();
          openTscConfirm(y);
        },
      },
      tx("예정")
    );
  };

  // ---- TSC 입고일 확정: 차량에 날짜를 넣고 In Transit 을 Bonded Stock 으로 바꾼다 ----
  function openTscConfirm(y) {
    const transit = y.vehicles.filter((v) => v.current_status === STATUS.IN_TRANSIT).length;
    const dateInput = mk("input", { type: "date", class: "tsc-in", max: today });
    dateInput.value = shown(y, "tsc");
    const confirm = mk("button", { class: "btn primary", type: "button" }, tx("확정"));
    confirm.addEventListener("click", async () => {
      const date = dateInput.value.trim();
      if (!isDate(date)) {
        toast(tx("TSC 입고일 확정"), tx("날짜를 입력하세요."));
        return;
      }
      if (date > today) {
        toast(tx("TSC 입고일 확정"), tx("확정하는 TSC 입고일은 실제 입고일이라 오늘({d}) 이후 날짜는 넣을 수 없습니다.", { d: today }));
        return;
      }
      confirm.disabled = true;
      try {
        const out = await saveVehicles(
          y.vehicles.map((v) => ({
            vehicle: v,
            voyage: true,
            inputs: {
              tsc_arrival_date: date,
              ...(v.current_status === STATUS.IN_TRANSIT ? { current_status: STATUS.BONDED_STOCK } : {}),
            },
          })),
          SOURCE_TSC
        );
        // 확정했으니 이 선박의 예정일 대기 값은 더 쓰지 않는다
        const p = edit.pending.get(y.key);
        if (p) {
          delete p.tsc;
          if (!Object.keys(p).length) edit.pending.delete(y.key);
        }
        closeModal();
        report(out, tx("TSC 입고일 확정 · {v}", { v: y.vessel }));
        hooks.rerender();
      } catch (err) {
        console.error(err);
        toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
        confirm.disabled = false;
      }
    });
    openModal(
      tx("TSC 입고일 확정 — {v}", { v: y.vessel }),
      [
        mk(
          "div",
          { class: "callout" },
          tx("확정하면 이 선박 차량 {n}대의 TSC Arrival 에 날짜가 들어가고, In Transit {m}대가 Bonded Stock 으로 바뀝니다. 바로 저장됩니다.", {
            n: num(y.vehicles.length),
            m: num(transit),
          })
        ),
        mk("p", null, tx("TSC 입고일"), " ", dateInput),
        mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${targetListNames(["tsc_arrival_date"]).join(", ")}`),
      ],
      [mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")), confirm]
    );
  }

  // ---- 행 나누기: 고른 차량에 다른 B/L No 를 넣어 한 행을 둘로 나눈다(환적, 같은 배에 B/L 이 다른 경우) ----
  const splitButton = (y) =>
    mk(
      "button",
      {
        class: "btn sm split-btn",
        type: "button",
        disabled: edit.saving,
        title: tx("클릭 → Commission 을 골라 행 나누기"),
        onclick: (event) => {
          event.stopPropagation();
          if (edit.pending.has(y.key)) {
            toast(tx("행 나누기"), tx("이 행에 저장 대기 중인 입력이 있습니다. 먼저 '편집 종료'로 저장하거나 변경을 취소하세요."));
            return;
          }
          openSplit(y);
        },
      },
      tx("나누기")
    );

  function openSplit(y) {
    const fail = (text) => toast(tx("행 나누기"), text);
    const items = [...y.vehicles]
      .sort((a, b) => (String(a.commission_no) < String(b.commission_no) ? -1 : 1))
      .map((v) => ({ v, box: mk("input", { type: "checkbox" }) }));
    const picked = () => items.filter((item) => item.box.checked).map((item) => item.v);
    const counter = mk("span", { class: "muted small" });
    const drawCounter = () => {
      counter.textContent = tx("선택 {n}대 / 전체 {m}대", { n: num(picked().length), m: num(items.length) });
    };
    for (const item of items) item.box.addEventListener("change", drawCounter);
    drawCounter();
    const blInput = mk("input", { type: "text", class: "tsc-in", maxlength: 255 });
    const etaInput = mk("input", { type: "date", class: "tsc-in" });
    const ataInput = mk("input", { type: "date", class: "tsc-in", max: today });
    const apply = mk("button", { class: "btn primary", type: "button" }, tx("나누기"));
    apply.addEventListener("click", async () => {
      const chosen = picked();
      const rest = items.filter((item) => !item.box.checked).map((item) => item.v);
      const bl = blInput.value.trim();
      const eta = etaInput.value.trim();
      const ata = ataInput.value.trim();
      if (!chosen.length || !rest.length) return fail(tx("나눌 차량을 고르세요. 모든 차량을 고를 수는 없습니다."));
      if (!bl) return fail(tx("나눌 차량의 B/L No 를 입력하세요."));
      if (rest.some((v) => String(v.bl_no ?? "") === bl)) return fail(tx("남는 차량과 같은 B/L No 로는 나눌 수 없습니다."));
      if ((eta && !isDate(eta)) || (ata && !isDate(ata))) return fail(tx("날짜를 입력하세요."));
      if (ata > today) {
        return fail(tx("ATA 는 실제 입항일이라 오늘({d}) 이후 날짜는 넣을 수 없습니다. 입항 예정일은 ETA 선사에 넣으세요.", { d: today }));
      }
      const inputs = { bl_no: bl, ...(eta ? { eta_from_eukor_pirt: eta } : {}), ...(ata ? { ata } : {}) };
      apply.disabled = true;
      try {
        const out = await saveVehicles(chosen.map((v) => ({ vehicle: v, voyage: true, inputs })), SOURCE_SPLIT);
        closeModal();
        report(out, tx("행 나누기 · {v}", { v: y.vessel }));
        hooks.rerender();
      } catch (err) {
        console.error(err);
        toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
        apply.disabled = false;
      }
    });
    openModal(
      tx("행 나누기 — {v}", { v: y.vessel }),
      [
        mk("div", { class: "callout" }, tx("고른 차량에 다른 B/L No 를 넣어 이 행을 둘로 나눕니다(환적, 같은 배에 B/L 이 다른 경우). 바로 저장됩니다.")),
        mk(
          "div",
          { class: "split-list" },
          items.map(({ v, box }) =>
            mk(
              "label",
              { class: "split-item" },
              box,
              mk("span", { class: "mono" }, v.commission_no),
              mk("span", { class: `pill ${stageClass(v.current_status)}` }, v.current_status)
            )
          )
        ),
        mk("p", null, counter),
        mk(
          "div",
          { class: "split-fields" },
          mk("label", null, tx("나눌 차량의 B/L No"), " ", blInput),
          mk("label", null, tx("ETA 선사 (선택)"), " ", etaInput),
          mk("label", null, tx("ATA (선택)"), " ", ataInput)
        ),
        mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${targetListNames(["bl_no"]).join(", ")}`),
      ],
      [mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")), apply]
    );
  }

  // ---- 공지: 보기 모드는 3줄 상자, 편집 모드는 입력칸 ----
  const noticeBox = (text) => mk("div", { class: "notice-box clamp" }, text || mk("span", { class: "muted" }, tx("공지 없음")));
  const noticeArea = () => {
    if (!notice) return mk("div", { class: "notice-box" }, mk("span", { class: "muted" }, tx("공지를 불러오지 못했습니다.")));
    if (!edit.on) return noticeBox(notice.text);
    const area = mk("textarea", {
      class: `notice-ta${edit.notice === undefined ? "" : " pend"}`,
      rows: 4,
      placeholder: tx("접안·하역 안내 · 첫 주문·인증 필요차 · AFAB 미반영 변동 등"),
    });
    area.value = edit.notice ?? notice.text;
    area.addEventListener("change", () => {
      const text = area.value.trim();
      edit.notice = text === notice.text ? undefined : text;
      area.classList.toggle("pend", edit.notice !== undefined);
      drawBar();
    });
    return area;
  };

  // 공지 저장. 그사이 다른 사람이 고쳤으면 두 글을 보여주고 고르게 한다.
  async function saveNotice() {
    const res = await saveShippingNotice(edit.notice);
    if (res.ok) {
      edit.notice = undefined;
      return;
    }
    if (!res.conflict) {
      toast(tx("저장 실패"), `${noticeFileName()}: ${res.code}`);
      return;
    }
    openModal(
      tx("공지 충돌"),
      [
        mk("p", null, tx("그사이 다른 사람이 공지를 고쳤습니다. 지금 저장되어 있는 글:")),
        noticeBox(notice.text),
        mk("p", null, tx("내가 쓴 글:")),
        noticeBox(edit.notice),
      ],
      [
        mk(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: () => {
              edit.notice = undefined;
              if (!pendingCount()) edit.on = false;
              closeModal();
              hooks.rerender();
            },
          },
          tx("저장된 글 사용")
        ),
        mk(
          "button",
          {
            class: "btn primary",
            type: "button",
            onclick: async () => {
              closeModal();
              await saveNotice();
              if (edit.notice === undefined) toast(tx("공지 저장"), noticeFileName());
              if (!pendingCount()) edit.on = false;
              hooks.rerender();
            },
          },
          tx("내 글로 저장")
        ),
      ]
    );
  }

  // 저장 결과 알림. 저장하지 못한 차량 수를 같이 알린다.
  function report(out, title) {
    const problems = [
      out.conflicts.length ? tx("충돌 {n}건", { n: num(out.conflicts.length) }) : "",
      out.denied.length ? tx("권한 없음 {n}건", { n: num(out.denied.length) }) : "",
      out.failed.length ? `${tx("실패 {n}건", { n: num(out.failed.length) })} (${[...new Set(out.failed.map((f) => f.code))].join(", ")})` : "",
    ].filter(Boolean);
    toast(
      title,
      tx("차량 {n}대에 반영", { n: num(out.saved.length) }) + (problems.length ? ` · ${tx("저장하지 못한 것")}: ${problems.join(" · ")}` : "")
    );
    if (out.historyFailed) {
      toast(
        tx("변경 이력 기록 실패 {n}건", { n: num(out.historyFailed) }),
        `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${out.historyCodes.join(", ")})`
      );
    }
  }

  // ---- 편집 종료: 저장 ----
  async function save() {
    if (edit.saving) return;
    edit.saving = true;
    hooks.rerender();
    try {
      // 차량에 반영할 값
      const edits = [];
      const noteJobs = [];
      for (const [key, p] of edit.pending) {
        const y = byKey.get(key);
        if (!y) continue; // 그사이 목록에서 빠진 선박
        const inputs = {};
        for (const [name, field] of Object.entries(VEHICLE_FIELD)) if (name in p) inputs[field] = p[name];
        if ("tsc" in p && y.confirmed) inputs.tsc_arrival_date = p.tsc;
        if (Object.keys(inputs).length) for (const v of y.vehicles) edits.push({ vehicle: v, inputs, voyage: true });
        const note = {};
        if ("gw" in p) note.gw = p.gw;
        if ("tsc" in p && !y.confirmed) note.tsc_planned = p.tsc;
        if (Object.keys(note).length) noteJobs.push({ y, note });
      }

      const out = await saveVehicles(edits, SOURCE);
      const troubled = new Set(
        [...out.conflicts.map((c) => c.vehicle), ...out.denied, ...out.failed.map((f) => f.vehicle)].map((v) => v.commission_no)
      );
      const noteFailures = [];
      const failedKeys = new Set();
      for (const { y, note } of noteJobs) {
        const res = await saveVoyageNote(y, note);
        if (!res.ok) {
          noteFailures.push(res.code);
          failedKeys.add(y.key);
        }
      }
      // 문제가 없는 선박만 저장 대기에서 뺀다. 남은 것은 다시 "편집 종료"로 저장할 수 있다.
      for (const key of [...edit.pending.keys()]) {
        const y = byKey.get(key);
        if (!y) continue;
        if (!failedKeys.has(key) && !y.vehicles.some((v) => troubled.has(v.commission_no))) edit.pending.delete(key);
      }
      if (edits.length || noteJobs.length) report(out, tx("선적·입항 저장"));
      if (noteFailures.length) {
        toast(tx("저장 실패"), `${voyageListName()}: ${[...new Set(noteFailures)].join(", ")}`);
      }
      if (edit.notice !== undefined) {
        await saveNotice();
        if (edit.notice === undefined) toast(tx("공지 저장"), noticeFileName());
      }
      if (!pendingCount()) edit.on = false;
    } catch (err) {
      console.error(err);
      toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
    } finally {
      edit.saving = false;
      hooks.rerender();
    }
  }

  function finish() {
    if (!pendingCount()) {
      edit.on = false;
      hooks.rerender();
      return;
    }
    const keys = [...edit.pending.keys()].filter((key) => byKey.has(key));
    const cars = keys.reduce((n, key) => n + byKey.get(key).vehicles.length, 0);
    const hasNotice = edit.notice !== undefined;
    const targets = [...(keys.length ? [...targetListNames(["bl_no"]), voyageListName()] : []), ...(hasNotice ? [noticeFileName()] : [])];
    openModal(
      tx("선적·입항 저장"),
      [
        keys.length
          ? mk("p", null, tx("선박 {n}척의 입력 {m}건을 저장합니다. 차량에 반영하는 값은 그 선박의 차량 전체에 들어갑니다(해당 차량 {c}대).", {
              n: num(keys.length),
              m: num(pendingCount() - (hasNotice ? 1 : 0)),
              c: num(cars),
            }))
          : null,
        hasNotice ? mk("p", null, tx("공지를 저장합니다.")) : null,
        mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${targets.join(", ")}`),
      ],
      [
        mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")),
        mk(
          "button",
          {
            class: "btn primary",
            type: "button",
            onclick: () => {
              closeModal();
              save();
            },
          },
          tx("저장")
        ),
      ]
    );
  }

  function cancel() {
    const leave = () => {
      edit.pending.clear();
      edit.notice = undefined;
      edit.on = false;
      hooks.rerender();
    };
    if (!pendingCount()) {
      leave();
      return;
    }
    openModal(
      tx("변경 취소"),
      mk("p", null, tx("저장 대기 {n}건을 버리고 편집을 끝냅니다. 저장된 값은 바뀌지 않습니다.", { n: num(pendingCount()) })),
      [
        mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("계속 편집")),
        mk(
          "button",
          {
            class: "btn primary",
            type: "button",
            onclick: () => {
              closeModal();
              leave();
            },
          },
          tx("변경 버리기")
        ),
      ]
    );
  }

  const editButton = mk(
    "button",
    { class: `btn sm ${edit.on ? "primary" : ""}`, type: "button", disabled: edit.saving },
    edit.saving ? tx("저장 중...") : edit.on ? tx("편집 종료") : tx("편집")
  );
  editButton.addEventListener("click", () => {
    if (!edit.on) {
      edit.on = true;
      hooks.rerender();
    } else finish();
  });
  const cancelButton = edit.on
    ? mk("button", { class: "btn sm", type: "button", disabled: edit.saving, onclick: cancel }, tx("변경 취소"))
    : null;

  const heads = [
    mk("th", null, tx("Vessel")),
    mk("th", null, tx("단계")),
    mk("th", { class: "num" }, tx("대수")),
    mk("th", { class: "num" }, tx("총중량 (kg)")),
    mk("th", null, tx("B/L No")),
    mk("th", null, tx("Shipping")),
    mk("th", null, tx("Planned Arrival")),
    mk("th", null, tx("ETA 선사 (EUKOR/MOL)")),
    mk("th", null, tx("ATA")),
    mk("th", null, tx("TSC 입고일 (TSC Arrival)")),
    mk("th", { class: "tscst" }),
  ];
  const table = mk(
    "table",
    { class: `tbl compact even ${edit.on ? "" : "clickable"}` },
    mk("thead", null, mk("tr", null, heads)),
    mk(
      "tbody",
      null,
      voyages.length
        ? voyages.map((y) =>
            mk(
              "tr",
              // 편집 모드에서는 행을 눌러도 이동하지 않는다
              { "data-href": edit.on ? null : voyageLink(y) },
              mk("td", null, mk("b", null, y.vessel)),
              stageCell(y.vehicles),
              mk("td", { class: "num" }, mk("b", null, y.count), edit.on && y.count > 1 ? splitButton(y) : null),
              gwCell(y),
              blCell(y),
              mk("td", { class: "mono" }, y.shipping || dash(), y.kind === "scheduled" ? [" ", mk("span", { class: "muted small" }, tx("예정"))] : null),
              mk("td", { class: "mono" }, y.pl || dash()),
              cell(y, "eta", "date", dash()),
              cell(y, "ata", "date", mk("span", { class: "muted" }, tx("미입력")), { max: today }),
              cell(y, "tsc", "date", mk("span", { class: "muted" }, tx("미입력"))),
              mk("td", { class: "tscst" }, tscBadge(y))
            )
          )
        : mk("tr", null, mk("td", { colspan: heads.length, class: "muted", style: "text-align:center" }, tx("운송 중이거나 선적 예정인 선박이 없습니다.")))
    )
  );
  drawBar();
  const cardEl = mk(
    "div",
    { class: "card" },
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, tx("선박별 현황")),
      mk("span", { class: "desc" }, tx("선박 = 선박 이름 + Shipping 날짜 · ATA = 실제 입항일 · TSC 입고일은 예정으로 두었다가 확정하면 차량에 반영되고 In Transit 이 Bonded Stock 으로 바뀝니다 · 확정 후 {n}일까지, 당월 입항 선박은 월말까지 표시", { n: 5 })),
      mk("span", { class: "spacer" }),
      bar,
      editButton,
      cancelButton
    ),
    mk("div", { class: "notice-wrap" }, noticeArea()),
    mk("div", { class: "tbl-wrap" }, table),
    mk("div", { class: "muted small", style: "margin-top:6px" }, `${tx("행 클릭 → 해당 선박의 차량 Logistics 목록. 입력은 편집 모드에서.")} ${tx("공지는 편집 모드에서 입력.")}`)
  );
  return { cardEl, table };
}

// 저장 대기가 있는 채로 창을 닫거나 새로 고치면 브라우저가 한 번 묻는다.
window.addEventListener("beforeunload", (event) => {
  if (!pendingCount()) return;
  event.preventDefault();
  event.returnValue = "";
});
