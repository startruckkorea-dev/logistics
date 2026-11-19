// Logistics 그리드의 편집 모드 — 셀 입력, Note 팝업, 저장 대기, "편집 종료" 때 저장.
// 편집 중 바꾼 값은 저장 대기(pending)에만 쌓고, 편집 종료 때 한꺼번에 저장한다.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import {
  INPUT_FIELDS, checkInput, normalizeInput, changedFields, saveVehicles, targetListNames,
} from "../data/store.js";
import { createInput, labelOf, invalidMessage } from "./input-controls.js";

// 편집 상태. 다른 화면에 다녀와도 유지한다(저장 대기를 잃지 않게).
//   pending  : Commission No → { 열 이름: 새 값 }
//   selected : 일괄 입력 대상으로 고른 Commission No. 화면에 보이는 행만 담는다
//   bulk     : 저장 대기에 일괄 입력으로 올린 값이 있는 Commission No(이력의 출처를 구분한다)
export const edit = { on: false, saving: false, pending: new Map(), selected: new Set(), bulk: new Set() };

// 편집 모드를 끝낸다
function leaveEdit() {
  edit.on = false;
  edit.selected.clear();
}

const num = (n) => Number(n).toLocaleString("ko-KR");
const isEmpty = (v) => v == null || v === "";

/** 편집 모드에서 입력할 수 있는 칸인가 */
export const isEditableCell = (key) => edit.on && INPUT_FIELDS.includes(key);

/** 저장 대기 값이 있는 칸인가 */
export const isPending = (v, key) => key in (edit.pending.get(v.commission_no) ?? {});

/** 화면에 보여줄 차량 행: 저장 대기 값이 있으면 그 값을 덮어쓴 사본 */
export function shownRow(v) {
  const p = edit.pending.get(v.commission_no);
  return p ? { ...v, ...p } : v;
}

/** 저장 대기 중인 필드 수 */
export function pendingCount() {
  let n = 0;
  for (const p of edit.pending.values()) n += Object.keys(p).length;
  return n;
}

/**
 * 값을 저장 대기에 올린다. 저장된 값과 같아지면 대기에서 뺀다. 형식 검사는 부르는 쪽이 한다.
 * @param {{bulk?: boolean}} [options] bulk: 일괄 입력으로 올린 값
 */
export function stageValue(v, key, value, options = {}) {
  const comm = v.commission_no;
  const next = normalizeInput(value);
  const p = edit.pending.get(comm) ?? {};
  if (next === normalizeInput(v[key])) delete p[key];
  else p[key] = next;
  if (Object.keys(p).length) {
    edit.pending.set(comm, p);
    if (options.bulk) edit.bulk.add(comm);
  } else {
    edit.pending.delete(comm);
    edit.bulk.delete(comm);
  }
}

// 형식이 맞으면 저장 대기에 올리고 참을 돌려준다. 틀리면 알리고 거짓.
function stageChecked(v, key, value) {
  const reason = checkInput(key, normalizeInput(value));
  if (reason) {
    const message = invalidMessage(key, reason);
    toast(message.title, message.detail);
    return false;
  }
  stageValue(v, key, value);
  return true;
}

/**
 * 셀 안에서 바로 입력한다(한 줄 열). Enter·다른 곳 클릭 = 저장 대기에 올림, Esc = 취소.
 * @param {HTMLTableCellElement} td
 * @param {object} v 차량 행
 * @param {string} key 열 이름
 * @param {() => void} onDone 입력이 끝난 뒤(칸을 다시 그리는 데 쓴다)
 */
export function startCellEdit(td, v, key, onDone) {
  if (td.querySelector("input, select")) return;
  const before = normalizeInput(shownRow(v)[key]);
  const input = createInput(key, before);
  input.classList.add("cell-in");

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save && normalizeInput(input.value) !== before) stageChecked(v, key, input.value);
    onDone();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") finish(true);
    else if (event.key === "Escape") finish(false);
    event.stopPropagation();
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  if (key === "co") input.addEventListener("change", () => finish(true));

  // 날짜·월 선택 칸은 한 번에 지우는 버튼을 둔다(선택 칸은 연·월·일을 따로 지워야 해서)
  let clear = null;
  if (input.type === "date" || input.type === "month") {
    clear = mk("button", { class: "cell-clear", type: "button", title: tx("값 지우기") }, "×");
    // 누르는 동안 입력칸이 포커스를 잃지 않게 한다(잃으면 그 순간 입력이 끝난다)
    clear.addEventListener("mousedown", (event) => event.preventDefault());
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      input.value = "";
      finish(true);
    });
  }

  // 원래 내용은 보이지 않게 남겨 칸 크기를 잡아 두고, 입력칸은 그 위에 겹쳐 놓는다(줄 높이가 변하지 않게).
  td.replaceChildren(
    mk("span", { class: "cell-hold" }, [...td.childNodes]),
    mk("span", { class: "cell-edit" }, input, clear)
  );
  td.classList.add("editing");
  input.focus();
  input.select?.();
}

// ---- Note 열: 여러 줄 팝업 ----

let notePop = null;

function noteOutside(event) {
  if (notePop && !event.target.closest("#notepop")) notePop.finish(true);
}

export function closeNoteEditor() {
  notePop?.node.remove();
  notePop = null;
  document.removeEventListener("mousedown", noteOutside);
}

/**
 * Note 열 입력창을 셀 아래에 띄운다. Ctrl+Enter·바깥 클릭·적용 = 저장 대기에 올림, Esc·취소 = 버림.
 */
export function openNoteEditor(td, v, key, onDone) {
  closeNoteEditor();
  const before = normalizeInput(shownRow(v)[key]);
  const textarea = mk("textarea", { rows: 6, placeholder: tx("여러 줄 입력 가능 (Enter = 줄바꿈)") });
  textarea.value = before;

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    closeNoteEditor();
    if (save && normalizeInput(textarea.value) !== before) stageChecked(v, key, textarea.value);
    onDone();
  };
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) finish(true);
    else if (event.key === "Escape") finish(false);
    event.stopPropagation();
  });

  const node = mk(
    "div",
    { class: "colfilter note-pop", id: "notepop" },
    mk(
      "div",
      { class: "cf-h" },
      mk("b", null, tx(labelOf(key))),
      mk("span", { class: "muted small mono" }, v.commission_no),
      mk("button", { class: "x", type: "button", title: tx("취소"), onclick: () => finish(false) }, "×")
    ),
    textarea,
    mk("div", { class: "muted small" }, tx("Enter = 줄바꿈 · Ctrl+Enter = 적용 · Esc = 취소")),
    mk(
      "div",
      { class: "cf-foot" },
      mk("button", { class: "btn sm", type: "button", onclick: () => finish(false) }, tx("취소")),
      mk("button", { class: "btn sm primary", type: "button", onclick: () => finish(true) }, tx("적용"))
    )
  );
  notePop = { node, finish };

  const rect = td.getBoundingClientRect();
  node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 436))}px`;
  document.body.append(node);
  // 아래 공간이 없으면 셀 위에 띄운다
  const height = node.offsetHeight;
  const below = rect.bottom + 4 + height <= window.innerHeight - 8;
  node.style.top = `${below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - height)}px`;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  setTimeout(() => document.addEventListener("mousedown", noteOutside), 0);
}

// ---- 편집 종료: 저장 ----

const valueCell = (value, strong) =>
  mk("td", { class: "long-text" }, isEmpty(value) ? mk("span", { class: "muted" }, "—") : strong ? mk("b", null, value) : value);

// 같은 필드를 다른 사람이 먼저 바꾼 차량들. 남겨둘지, 버릴지, 내 입력으로 저장할지 고른다.
function showConflicts(conflicts, vehicles, hooks) {
  const rows = conflicts.flatMap(({ vehicle, fields }) =>
    fields.map((f) =>
      mk(
        "tr",
        null,
        mk("td", { class: "mono" }, vehicle.commission_no),
        mk("td", null, tx(labelOf(f.field))),
        valueCell(f.theirs, false),
        valueCell(f.mine, true)
      )
    )
  );
  const keep = () => closeModal();
  const discard = () => {
    for (const { vehicle } of conflicts) {
      edit.pending.delete(vehicle.commission_no);
      edit.bulk.delete(vehicle.commission_no);
    }
    closeModal();
    if (!pendingCount()) leaveEdit();
    hooks.render();
  };
  const overwrite = () => {
    closeModal();
    save(vehicles, hooks);
  };
  openModal(
    tx("저장 충돌 {n}건", { n: num(conflicts.length) }),
    [
      mk("p", null, tx("불러온 뒤에 아래 필드가 바뀌었습니다. 내 입력으로 저장하면 저장된 값이 바뀝니다.")),
      mk(
        "table",
        { class: "tbl" },
        mk("thead", null, mk("tr", null, ["Commission No", "필드", "저장된 값", "내 입력"].map((h) => mk("th", null, tx(h))))),
        mk("tbody", null, rows)
      ),
    ],
    [
      mk("button", { class: "btn", type: "button", onclick: keep }, tx("남겨두기")),
      mk("button", { class: "btn", type: "button", onclick: discard }, tx("내 입력 버리기")),
      mk("button", { class: "btn primary", type: "button", onclick: overwrite }, tx("내 입력으로 저장")),
    ]
  );
}

async function save(vehicles, hooks) {
  if (edit.saving) return;
  edit.saving = true;
  hooks.render();
  const byComm = new Map(vehicles.map((v) => [v.commission_no, v]));
  const edits = [...edit.pending]
    .map(([comm, inputs]) => ({
      vehicle: byComm.get(comm),
      inputs,
      source: edit.bulk.has(comm) ? "일괄 입력" : "입력",
    }))
    .filter((e) => e.vehicle);
  try {
    const out = await saveVehicles(edits, "입력", hooks.progress);
    const settle = (comm) => {
      edit.pending.delete(comm);
      edit.bulk.delete(comm);
    };
    for (const { vehicle } of out.saved) settle(vehicle.commission_no);
    // 그사이 저장된 값과 같아진 것은 더 보낼 것이 없다
    for (const { vehicle, inputs } of edits) {
      if (!changedFields(vehicle, inputs).length) settle(vehicle.commission_no);
    }

    const fields = out.saved.reduce((n, s) => n + s.changes.length, 0);
    const problems = [
      out.conflicts.length ? tx("충돌 {n}건", { n: num(out.conflicts.length) }) : "",
      out.invalid.length ? tx("형식 오류 {n}건", { n: num(out.invalid.length) }) : "",
      out.denied.length ? tx("권한 없음 {n}건", { n: num(out.denied.length) }) : "",
      out.failed.length ? `${tx("실패 {n}건", { n: num(out.failed.length) })} (${[...new Set(out.failed.map((f) => f.code))].join(", ")})` : "",
    ].filter(Boolean);
    if (out.saved.length || problems.length) {
      toast(
        tx("저장 {n}대 · 필드 {m}개", { n: num(out.saved.length), m: num(fields) }),
        problems.length ? `${tx("저장하지 못한 것")}: ${problems.join(" · ")}` : null
      );
    }
    if (out.historyFailed) {
      toast(
        tx("변경 이력 기록 실패 {n}건", { n: num(out.historyFailed) }),
        `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${out.historyCodes.join(", ")})`
      );
    }
    if (!pendingCount()) leaveEdit();
    edit.saving = false;
    hooks.render();
    if (out.conflicts.length) showConflicts(out.conflicts, vehicles, hooks);
  } catch (err) {
    console.error(err);
    toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
    edit.saving = false;
    hooks.render();
  }
}

/**
 * "편집 종료" — 저장 대기가 없으면 바로 끝내고, 있으면 대상을 보여준 뒤 저장한다.
 * @param {object[]} vehicles 화면의 차량 행 전체
 * @param {{render: () => void, progress: (done: number, total: number) => void}} hooks
 */
export function finishEdit(vehicles, hooks) {
  closeNoteEditor();
  if (!pendingCount()) {
    leaveEdit();
    hooks.render();
    return;
  }
  const fields = [...new Set([...edit.pending.values()].flatMap((p) => Object.keys(p)))];
  const start = () => {
    closeModal();
    save(vehicles, hooks);
  };
  openModal(
    tx("편집 내용 저장"),
    [
      mk("p", null, tx("{n}대 · 필드 {m}개를 저장합니다.", { n: num(edit.pending.size), m: num(pendingCount()) })),
      mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${targetListNames(fields).join(", ")}`),
      mk("p", { class: "muted small" }, fields.map((key) => tx(labelOf(key))).join(" · ")),
    ],
    [
      mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")),
      mk("button", { class: "btn primary", type: "button", onclick: start }, tx("저장")),
    ]
  );
}

/**
 * "변경 취소" — 저장 대기를 버리고 편집 모드를 끝낸다.
 * 편집 중 바꾼 값은 아직 저장되지 않았으므로 List 에는 아무것도 쓰지 않는다. 이미 저장된 값은 그대로다.
 * @param {{render: () => void}} hooks
 */
export function cancelEdit(hooks) {
  closeNoteEditor();
  const leave = () => {
    edit.pending.clear();
    edit.bulk.clear();
    leaveEdit();
    hooks.render();
  };
  if (!pendingCount()) {
    leave();
    return;
  }
  const discard = () => {
    closeModal();
    leave();
  };
  openModal(
    tx("변경 취소"),
    mk("p", null, tx("저장 대기 {n}건을 버리고 편집을 끝냅니다. 저장된 값은 바뀌지 않습니다.", { n: num(pendingCount()) })),
    [
      mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("계속 편집")),
      mk("button", { class: "btn primary", type: "button", onclick: discard }, tx("변경 버리기")),
    ]
  );
}

// 저장 대기가 있는 채로 창을 닫거나 새로 고치면 브라우저가 한 번 묻는다.
window.addEventListener("beforeunload", (event) => {
  if (!pendingCount()) return;
  event.preventDefault();
  event.returnValue = "";
});
