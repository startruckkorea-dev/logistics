// Logistics 편집 모드의 일괄 입력 — 선택한 행의 입력 열에 같은 값을 넣는다.
// 값을 고르고 → 미리보기에서 바뀌는 건수를 확인하고 → 저장 대기에 올린다. 이 단계에서는 List 에 쓰지 않는다.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { COLUMNS } from "../data/columns.js";
import { INPUT_FIELDS, checkInput, normalizeInput, inputBlock } from "../data/store.js";
import { createInput, labelOf, invalidMessage } from "./input-controls.js";
import { shownRow, stageValue } from "./logistics-edit.js";

/** 한 번에 적용할 수 있는 차량 수 */
export const BULK_MAX = 50;

const OLD_VALUES_SHOWN = 5; // 미리보기에서 보여주는 기존 값의 종류 수
const OLD_VALUE_LENGTH = 30; // 미리보기에서 기존 값을 자르는 길이

const num = (n) => Number(n).toLocaleString("ko-KR");

// 긴 글은 한 줄로 줄여 보여준다
function short(value) {
  const line = value.replace(/\s+/g, " ");
  return line.length > OLD_VALUE_LENGTH ? `${line.slice(0, OLD_VALUE_LENGTH)}…` : line;
}

// 값별 대수를 많은 순으로 적은 글. 종류가 많으면 앞의 몇 개만 적는다.
function valueCounts(counts) {
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  return (
    sorted
      .slice(0, OLD_VALUES_SHOWN)
      .map(([value, n]) => `${value === "" ? tx("(빈칸)") : short(value)} ${tx("{n}대", { n: num(n) })}`)
      .join(" · ") +
    (sorted.length > OLD_VALUES_SHOWN ? ` · ${tx("외 {n}종", { n: num(sorted.length - OLD_VALUES_SHOWN) })}` : "")
  );
}

// 선택한 차량들이 한 열에 지금 갖고 있는 값(저장 대기 포함)
function currentValues(targets, key) {
  const counts = new Map();
  for (const v of targets) {
    const value = normalizeInput(shownRow(v)[key]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return valueCounts(counts);
}

// 긴 글 열(Note)은 기존 글 뒤에 이어 쓸 수 있다
const canAppend = (key) => Boolean(COLUMNS.find((c) => c.key === key)?.memo);

// 기존 글이 이미 이 글로 끝나는가(같은 일괄 입력을 두 번 해도 글이 겹치지 않게)
const endsWithText = (current, text) => current === text || current.endsWith(`\n${text}`);

/**
 * 한 열에 대한 계획: 어떤 차량이 어떻게 바뀌는지 나눈다.
 * @param {"replace" | "append"} mode replace: 넣을 값으로 바꾼다. append: 기존 글 뒤에 줄을 바꿔 이어 쓴다
 * @returns fill·change 는 { v, value }(그 차량에 들어갈 값)의 목록
 */
function planField(targets, key, next, mode, onlyEmpty) {
  const plan = { key, next, mode, fill: [], change: [], same: 0, skipped: 0, blocked: 0, oldValues: new Map() };
  for (const v of targets) {
    // 그 차량의 상태로는 입력할 수 없는 열(Sales Month 는 OH Stock · Sold 만)은 건드리지 않는다
    if (inputBlock(v, key)) {
      plan.blocked++;
      continue;
    }
    const current = normalizeInput(shownRow(v)[key]);
    if (mode === "append" ? current !== "" && endsWithText(current, next) : current === next) plan.same++;
    else if (current === "") plan.fill.push({ v, value: next });
    else {
      plan.oldValues.set(current, (plan.oldValues.get(current) ?? 0) + 1);
      // 지우기는 값이 있는 칸이 대상이므로 "빈 칸만 채우기"와 관계없이 적용한다
      if (onlyEmpty && next !== "") plan.skipped++;
      else plan.change.push({ v, value: mode === "append" ? `${current}\n${next}` : next });
    }
  }
  return plan;
}

function previewBlock(plan) {
  const oldText = valueCounts(plan.oldValues);
  const append = plan.mode === "append";
  const line = (label, n, note) =>
    mk("tr", null, mk("td", null, label), mk("td", { class: "num" }, tx("{n}대", { n: num(n) })), mk("td", { class: "muted small long-text" }, note ?? ""));
  // 이어 쓰기: 한 대를 골라 저장될 글을 그대로 보여준다
  const sample = append ? plan.change[0] : null;
  return [
    mk(
      "p",
      null,
      mk("b", null, tx(labelOf(plan.key))),
      append ? ` ← ${tx("뒤에 이어 쓰기")}: ` : " → ",
      plan.next === "" ? mk("span", { class: "pill danger" }, tx("지움")) : mk("b", { class: "long-text" }, short(plan.next))
    ),
    mk(
      "table",
      { class: "tbl bulk-preview" },
      mk(
        "tbody",
        null,
        plan.next === "" ? null : line(tx("빈 칸에 입력"), plan.fill.length),
        line(
          plan.next === "" ? tx("값을 지움") : append ? tx("기존 글 뒤에 이어 씀") : tx("기존 값을 바꿈"),
          plan.change.length,
          plan.change.length ? oldText : ""
        ),
        plan.skipped ? line(tx("값이 있어 건드리지 않음"), plan.skipped, oldText) : null,
        plan.blocked ? line(tx("입력할 수 없는 상태라 건드리지 않음"), plan.blocked, tx("Sales Month 는 OH Stock 차량에만 입력할 수 있습니다 (입력하면 Sold 가 됩니다).")) : null,
        line(append ? tx("이미 같은 글로 끝남") : tx("이미 같은 값"), plan.same)
      )
    ),
    sample
      ? mk(
          "div",
          { class: "bulk-sample" },
          mk("div", { class: "muted small" }, tx("예시 {c} — 저장될 글", { c: sample.v.commission_no })),
          mk("div", { class: "long-text" }, sample.value)
        )
      : null,
  ];
}

/**
 * 일괄 입력 창을 연다.
 * @param {object[]} targets 선택한 차량 행
 * @param {{render: () => void}} hooks render: 저장 대기에 올린 뒤 그리드를 다시 그린다
 */
export function openBulkInput(targets, hooks) {
  if (!targets.length) return;
  if (targets.length > BULK_MAX) {
    toast(tx("일괄 입력"), tx("한 번에 {n}대까지 적용할 수 있습니다.", { n: num(BULK_MAX) }));
    return;
  }
  const title = tx("일괄 입력 · 선택 {n}대", { n: num(targets.length) });

  // ---- 1단계: 값 입력 ----
  const rows = INPUT_FIELDS.map((key) => {
    const input = createInput(key);
    const clear = mk("input", { type: "checkbox" });
    // Note 열: 넣는 방식. 기본은 기존 글 뒤에 이어 쓰기
    const mode = canAppend(key)
      ? mk(
          "select",
          { class: "bulk-mode", title: tx("넣는 방식") },
          mk("option", { value: "append" }, tx("뒤에 이어 쓰기")),
          mk("option", { value: "replace" }, tx("바꾸기"))
        )
      : null;
    // 지우기를 켜면 값 칸은 쓰지 않는다
    clear.addEventListener("change", () => {
      input.disabled = clear.checked;
      if (mode) mode.disabled = clear.checked;
    });
    return { key, input, clear, mode };
  });
  const onlyEmpty = mk("input", { type: "checkbox" });
  const form = [
    mk("p", { class: "muted small" }, tx("값을 넣은 열만 적용합니다. 빈 칸으로 둔 열은 건드리지 않습니다. 값을 지우려면 그 열의 '지우기'를 체크하세요. Note 열은 기존 글 뒤에 줄을 바꿔 이어 씁니다(방식에서 '바꾸기'를 고를 수 있습니다).")),
    mk(
      "table",
      { class: "tbl bulk-form" },
      mk("thead", null, mk("tr", null, ["열", "현재 값", "넣을 값", "지우기"].map((h) => mk("th", null, tx(h))))),
      mk(
        "tbody",
        null,
        rows.map((r) =>
          mk(
            "tr",
            null,
            mk("td", null, tx(labelOf(r.key))),
            mk("td", { class: "muted small long-text current" }, currentValues(targets, r.key)),
            mk("td", null, r.mode, r.input),
            mk("td", null, r.clear)
          )
        )
      )
    ),
    mk("label", { class: "bulk-option" }, onlyEmpty, " ", tx("빈 칸만 채우기 (값이 있는 칸은 건드리지 않음)")),
  ];

  const showForm = () =>
    openModal(title, form, [
      mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")),
      mk("button", { class: "btn primary", type: "button", onclick: showPreview }, tx("미리보기")),
    ]);

  // ---- 2단계: 미리보기 ----
  function showPreview() {
    const plans = [];
    for (const r of rows) {
      const next = r.clear.checked ? "" : normalizeInput(r.input.value);
      if (!r.clear.checked && next === "") continue; // 적용하지 않는 열
      const reason = checkInput(r.key, next);
      if (reason) {
        const message = invalidMessage(r.key, reason);
        toast(message.title, message.detail);
        return;
      }
      const mode = !r.clear.checked && r.mode?.value === "append" ? "append" : "replace";
      plans.push(planField(targets, r.key, next, mode, onlyEmpty.checked));
    }
    if (!plans.length) {
      toast(tx("일괄 입력"), tx("넣을 값이 없습니다. 값을 입력하거나 '지우기'를 체크하세요."));
      return;
    }
    const cells = plans.reduce((n, p) => n + p.fill.length + p.change.length, 0);
    const apply = () => {
      for (const p of plans) {
        for (const { v, value } of [...p.fill, ...p.change]) stageValue(v, p.key, value, { source: "일괄 입력" });
      }
      closeModal();
      hooks.render();
      toast(tx("일괄 입력 {n}칸 (저장 대기)", { n: num(cells) }), tx("'편집 종료'를 눌러야 저장됩니다."));
    };
    openModal(
      title,
      [
        plans.map(previewBlock),
        mk(
          "p",
          { class: cells ? "muted small" : "error small" },
          cells
            ? tx("모두 {n}칸을 저장 대기에 올립니다. 아직 저장되지 않으며 '편집 종료'에서 저장합니다.", { n: num(cells) })
            : tx("바뀌는 칸이 없습니다.")
        ),
      ],
      [
        mk("button", { class: "btn", type: "button", onclick: showForm }, tx("뒤로")),
        mk("button", { class: "btn primary", type: "button", disabled: !cells, onclick: apply }, tx("저장 대기에 올리기")),
      ]
    );
  }

  showForm();
}
