// Logistics 의 오더 생성과 오더 변경.
//   오더 생성: Model Master 에서 모델을 골라 새 차량 행을 만든다(바로 저장).
//   오더 변경: 편집 모드에서 고른 행의 모델·Original PM 을 바꾼다(저장 대기에 올리고 "편집 종료"에서 저장).
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { baseDate } from "../app/base-date.js";
import { addMonths, monthOf } from "../domain/dates.js";
import { STATUS } from "../domain/status.js";
import { loadModelMaster } from "../data/masters.js";
import { modelOptionTag, countBy } from "../data/derive.js";
import {
  ORDER_STATUSES, ORDER_MAX, isMonth, createOrders, orderChangeValues, targetListNames,
} from "../data/store.js";
import { shownRow, stageValue } from "./logistics-edit.js";

const TYPE_DIGITS_MIN = 3; // Type 을 찾을 때 넣어야 하는 숫자 수
const SOURCE_MAX = 100; // 출처 글자 수
const PM_MONTHS_AHEAD = 3; // 오더 생성 창의 Original PM 시작값: 기준월 + 3개월

const num = (n) => Number(n).toLocaleString("ko-KR");
const field = (label, control, wide) =>
  mk("div", { class: `f ${wide ? "wide" : ""}` }, mk("div", { class: "k" }, label), mk("div", { class: "v" }, control));

// "값 n건 · 값 n건" 형식의 분포
function distribution(list, keyOf) {
  const counts = countBy(list, keyOf);
  return (
    Object.keys(counts)
      .sort()
      .map((key) => `${key === "" ? tx("(빈칸)") : key} ${tx("{n}건", { n: num(counts[key]) })}`)
      .join(" · ") || tx("(빈칸)")
  );
}

const modelLine = (m) => [m.vehicle, m.model, m.type, m.axle, m.cab, modelOptionTag(m)].filter(Boolean).join(" · ");

/**
 * 모델 고르기: Type 숫자 검색 → Type → MY → 모델(Model Master 행). 오더 생성과 오더 변경이 같이 쓴다.
 * @param {object[]} models 쓸 수 있는 Model Master 행
 */
function modelPicker(models) {
  const search = mk("input", { type: "text", maxlength: 4, placeholder: tx("Type 숫자 3~4자리 (예: 2863)") });
  const typeSelect = mk("select", { disabled: true }, mk("option", { value: "" }, tx("검색어를 입력하세요")));
  const years = [...new Set(models.map((m) => String(m.my)))].sort();
  const yearSelect = mk("select", null, years.map((y) => mk("option", { value: y }, y)));
  if (years.length) yearSelect.value = years[years.length - 1];
  const modelSelect = mk("select", { disabled: true }, mk("option", { value: "" }, tx("Type을 먼저 선택하세요")));
  const attrs = mk("dl", { class: "kv small order-attrs" });

  const current = () => (modelSelect.value === "" ? null : models[Number(modelSelect.value)] ?? null);
  const drawAttrs = () => {
    const m = current();
    if (!m) {
      attrs.replaceChildren(mk("dt", { class: "muted" }, tx("모델을 선택하면 속성이 표시됩니다.")));
      return;
    }
    const pairs = [
      ["BM", m.bm], ["Vehicle", m.vehicle], ["Model", m.model], ["Type", m.type], ["Axle", m.axle], ["Cab", m.cab],
      ["Cab Gen", m.cab_gen], ["Wheelbase", m.wheelbase], ["PTO", m.pto], ["Emission", m.emission],
      [tx("리드타임(일)"), m.lead_days], [tx("리드타임(월)"), m.lead], ["MY", m.my],
    ];
    attrs.replaceChildren(
      ...pairs.flatMap(([k, v]) => [mk("dt", null, k), mk("dd", { class: "mono" }, v === "" || v == null ? "—" : String(v))])
    );
  };
  const drawModels = () => {
    const type = typeSelect.value;
    const rows = models.map((m, i) => ({ m, i })).filter((x) => x.m.type === type && String(x.m.my) === yearSelect.value);
    const hint = !type
      ? tx("Type을 먼저 선택하세요")
      : rows.length
        ? tx("모델 선택 ({n})", { n: num(rows.length) })
        : tx("선택한 MY에 해당 모델 없음");
    modelSelect.replaceChildren(
      mk("option", { value: "" }, hint),
      ...rows.map((x) => mk("option", { value: String(x.i) }, modelLine(x.m)))
    );
    modelSelect.disabled = !rows.length;
    if (rows.length === 1) modelSelect.value = String(rows[0].i);
    drawAttrs();
  };
  const drawTypes = () => {
    const digits = search.value.replace(/\D/g, "");
    search.value = digits;
    const enough = digits.length >= TYPE_DIGITS_MIN;
    const types = enough ? [...new Set(models.filter((m) => String(m.type).includes(digits)).map((m) => m.type))].sort() : [];
    const hint = !enough
      ? tx("숫자 3~4자리를 입력하세요")
      : types.length
        ? tx("Type 선택 ({n})", { n: num(types.length) })
        : tx("일치하는 Type 없음");
    typeSelect.replaceChildren(mk("option", { value: "" }, hint), ...types.map((t) => mk("option", { value: t }, t)));
    typeSelect.disabled = !types.length;
    if (types.length === 1) typeSelect.value = types[0];
    drawModels();
  };
  search.addEventListener("input", drawTypes);
  typeSelect.addEventListener("change", drawModels);
  yearSelect.addEventListener("change", drawModels);
  modelSelect.addEventListener("change", drawAttrs);
  drawAttrs();

  // 시작값: Type 의 숫자로 찾고, 같은 MY·BM 의 행이 있으면 고른다
  const preset = (type, year, bm) => {
    if (years.includes(String(year))) yearSelect.value = String(year);
    search.value = String(type ?? "").replace(/\D/g, "").slice(0, 4);
    drawTypes();
    if ([...typeSelect.options].some((o) => o.value === type)) {
      typeSelect.value = type;
      drawModels();
    }
    const i = models.findIndex((m) => m.type === type && String(m.my) === yearSelect.value && m.bm === bm);
    if (i >= 0 && [...modelSelect.options].some((o) => o.value === String(i))) {
      modelSelect.value = String(i);
      drawAttrs();
    }
  };

  return { search, typeSelect, yearSelect, modelSelect, attrs, current, preset };
}

function pickerFields(picker) {
  return [
    field(tx("① Type 검색 *"), picker.search),
    field("② Type *", picker.typeSelect),
    field("③ MY *", picker.yearSelect),
    field(tx("④ 모델 (Model Master) *"), picker.modelSelect),
    field(tx("매칭된 모델 속성"), picker.attrs, true),
  ];
}

// 이력의 출처 입력칸. 비우면 기본값을 쓴다.
function sourceInput(defaultText) {
  const input = mk("input", { type: "text", maxlength: SOURCE_MAX });
  input.value = defaultText;
  return { input, value: () => input.value.trim() || defaultText };
}

async function activeModels() {
  const models = (await loadModelMaster()).filter((m) => m.active);
  if (!models.length) toast(tx("Model Master"), tx("쓸 수 있는(Active) 모델이 없습니다."));
  return models;
}

// 숫자로만 된 Commission No 중 가장 큰 것
function lastCommissionNo(vehicles) {
  let last = null;
  for (const v of vehicles) {
    const c = String(v.commission_no);
    if (/^\d+$/.test(c) && (last == null || Number(c) > Number(last))) last = c;
  }
  return last;
}
const nextNumber = (start, k) => String(Number(start) + k).padStart(start.length, "0");

/**
 * 오더 생성 창.
 * @param {object[]} vehicles 화면의 차량 행 전체(번호가 겹치는지 보는 데 쓴다)
 * @param {{render: () => void}} hooks render: 만든 뒤 그리드를 다시 그린다
 */
export async function openOrderCreate(vehicles, hooks) {
  const models = await activeModels();
  if (!models.length) return;
  const picker = modelPicker(models);

  const pmInput = mk("input", { type: "month" });
  pmInput.value = addMonths(monthOf(baseDate()), PM_MONTHS_AHEAD);
  const qtyInput = mk("input", { type: "number", min: 1, max: ORDER_MAX });
  qtyInput.value = "1";
  const statusSelect = mk("select", null, ORDER_STATUSES.map((s) => mk("option", { value: s }, s)));
  statusSelect.value = STATUS.ORDERED_DUMMY;
  const source = sourceInput("오더 생성");

  // Commission No: 마지막 번호에 이어서 / 새 번호로 시작
  const last = lastCommissionNo(vehicles);
  const continueRadio = mk("input", { type: "radio", name: "commMode", value: "continue" });
  const newRadio = mk("input", { type: "radio", name: "commMode", value: "new" });
  const startInput = mk("input", { type: "text", class: "order-start", placeholder: tx("시작 번호 (숫자)") });
  if (last) {
    continueRadio.checked = true;
    startInput.value = nextNumber(last, 1);
    startInput.disabled = true;
  } else {
    // 이어 붙일 번호가 없으면 시작 번호를 직접 넣는다
    continueRadio.disabled = true;
    newRadio.checked = true;
  }
  const preview = mk("div", { class: "muted small" });
  const error = mk("div", { class: "error small", hidden: true });

  const quantity = () => Math.floor(Number(qtyInput.value) || 0);
  const numbers = () => {
    const n = quantity();
    const start = continueRadio.checked ? nextNumber(last, 1) : startInput.value.trim();
    if (!/^\d+$/.test(start) || n < 1 || n > ORDER_MAX) return [];
    return Array.from({ length: n }, (_, i) => nextNumber(start, i));
  };
  const drawPreview = () => {
    const list = numbers();
    preview.textContent = list.length
      ? tx("생성될 Commission No: {range} ({n}건) · 마지막 번호 {last}", {
          range: list.length > 1 ? `${list[0]} ~ ${list[list.length - 1]}` : list[0],
          n: num(list.length),
          last: last ?? "—",
        })
      : tx("시작 번호는 숫자만, 수량은 1~{max} 사이로 입력하세요.", { max: num(ORDER_MAX) });
  };
  const setMode = () => {
    startInput.disabled = !newRadio.checked;
    drawPreview();
  };
  continueRadio.addEventListener("change", setMode);
  newRadio.addEventListener("change", setMode);
  startInput.addEventListener("input", drawPreview);
  qtyInput.addEventListener("input", drawPreview);
  drawPreview();

  const fail = (text) => {
    error.textContent = text;
    error.hidden = false;
  };
  const createButton = mk("button", { class: "btn primary", type: "button" }, tx("생성"));
  createButton.addEventListener("click", async () => {
    error.hidden = true;
    const model = picker.current();
    if (!model) return fail(tx("Type과 모델을 선택하세요."));
    const originalPm = pmInput.value.trim();
    if (!isMonth(originalPm)) return fail(tx("Original PM(생산월)은 YYYY-MM 형식으로 입력하세요."));
    const list = numbers();
    if (!list.length) return fail(tx("시작 번호는 숫자만, 수량은 1~{max} 사이로 입력하세요.", { max: num(ORDER_MAX) }));
    const taken = new Set(vehicles.map((v) => String(v.commission_no)));
    const duplicates = list.filter((c) => taken.has(c));
    if (duplicates.length) {
      return fail(tx("이미 있는 Commission No 가 {n}건 있습니다. 시작 번호를 바꾸세요.", { n: num(duplicates.length) }));
    }

    createButton.disabled = true;
    try {
      const out = await createOrders({
        model,
        originalPm,
        status: statusSelect.value,
        commissionNos: list,
        source: source.value(),
        today: baseDate(),
      });
      hooks.render();
      if (out.created.length) {
        const first = out.created[0].commission_no;
        const lastMade = out.created[out.created.length - 1].commission_no;
        toast(
          tx("오더 생성 {n}건", { n: num(out.created.length) }),
          `${out.created.length > 1 ? `${first} ~ ${lastMade}` : first} · ${modelLine(model)} · Original PM ${originalPm} · ${statusSelect.value}`
        );
      }
      if (out.historyFailed) {
        toast(
          tx("변경 이력 기록 실패 {n}건", { n: num(out.historyFailed) }),
          `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${out.historyCodes.join(", ")})`
        );
      }
      if (out.failed.length) {
        const codes = [...new Set(out.failed.map((f) => f.code))].join(", ");
        fail(
          tx("{n}건을 만들지 못했습니다. 번호가 이미 있을 수 있습니다. '새로 고침' 후 다시 시도하세요.", { n: num(out.failed.length) }) +
            ` (${codes})`
        );
        return;
      }
      closeModal();
    } catch (err) {
      console.error(err);
      fail(`${tx("오더 생성 실패")}: ${err.status ?? ""} ${err.message ?? ""}`.trim());
    } finally {
      createButton.disabled = false;
    }
  });

  openModal(
    tx("오더 생성"),
    [
      mk(
        "div",
        { class: "callout" },
        tx("AFAB 에 아직 없는 오더를 등록합니다. 모델 속성은 고른 Model Master 행에서 채우고, 생산월은 Original PM 에 기록합니다(PM 은 AFAB 반영 때 채워집니다). Order Update Date 는 생성일입니다.")
      ),
      mk(
        "div",
        { class: "fields" },
        pickerFields(picker),
        field(tx("⑤ Original PM (생산월) *"), pmInput),
        field(tx("수량 * (최대 {max})", { max: num(ORDER_MAX) }), qtyInput),
        field("Current Status *", statusSelect),
        field(tx("출처 (변경 이력에 남는 글)"), source.input),
        field(
          tx("⑥ Commission No 생성 방식 *"),
          mk(
            "div",
            { class: "order-comm" },
            mk("label", null, continueRadio, " ", tx("마지막 번호에 이어서 생성")),
            mk("label", null, newRadio, " ", tx("새 번호로 시작"), " ", startInput)
          ),
          true
        ),
        field("", preview, true)
      ),
      mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${targetListNames(["original_pm"]).join(", ")}`),
      error,
    ],
    [mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")), createButton]
  );
}

/**
 * 오더 변경 창. 선택한 행 가운데 Ordered(Dummy)·Ordered(Changeable) 만 바꾼다.
 * 바꾼 값은 저장 대기에 올린다(List 에는 "편집 종료"에서 쓴다).
 * @param {object[]} selected 선택한 차량 행
 * @param {{render: () => void}} hooks
 */
export async function openOrderChange(selected, hooks) {
  if (!selected.length) return;
  const models = await activeModels();
  if (!models.length) return;

  const statusOf = (v) => shownRow(v).current_status;
  const targets = selected.filter((v) => ORDER_STATUSES.includes(statusOf(v)));
  const excluded = selected.filter((v) => !targets.includes(v));

  const picker = modelPicker(models);
  if (targets.length) {
    const first = shownRow(targets[0]);
    picker.preset(first.type, first.model_year, first.bm);
  }
  const pmInput = mk("input", { type: "month" });
  const source = sourceInput("오더 변경");
  const error = mk("div", { class: "error small", hidden: true });
  const fail = (text) => {
    error.textContent = text;
    error.hidden = false;
  };

  const apply = () => {
    error.hidden = true;
    const model = picker.current();
    if (!model) return fail(tx("Type과 모델을 선택하세요."));
    const originalPm = pmInput.value.trim();
    if (originalPm && !isMonth(originalPm)) return fail(tx("Original PM(생산월)은 YYYY-MM 형식으로 입력하세요."));
    const values = orderChangeValues(model, originalPm, baseDate());
    for (const v of targets) {
      for (const [key, value] of Object.entries(values)) stageValue(v, key, value, { source: source.value() });
    }
    closeModal();
    hooks.render();
    toast(
      tx("오더 변경 {n}건 (저장 대기)", { n: num(targets.length) }),
      `→ ${modelLine(model)} · MY ${model.my}${originalPm ? ` · Original PM ${originalPm}` : ""} · ${STATUS.ORDERED_CHANGEABLE} · ${tx("'편집 종료'를 눌러야 저장됩니다.")}`
    );
  };

  openModal(
    tx("오더 변경 — 모델·Original PM 일괄 변경"),
    [
      mk(
        "div",
        { class: "callout" },
        tx("선택한 오더 {n}건의 모델 속성을 Model Master 에서 고른 모델로 바꿉니다. Original PM 을 비워 두면 모델만 바뀝니다. Current Status 는 Ordered(Changeable) 가 되고 Order Update Date 에 변경일이 기록됩니다. 변경 이력은 Original PM·Spec·MY·BM 만 남습니다.", { n: num(targets.length) })
      ),
      excluded.length
        ? mk(
            "div",
            { class: "callout warn" },
            tx("선택 {n}건 중 {m}건은 Ordered(Dummy)·Ordered(Changeable) 가 아니라 제외됩니다", { n: num(selected.length), m: num(excluded.length) }),
            ` (${distribution(excluded, statusOf)})`
          )
        : null,
      mk(
        "div",
        { class: "fields" },
        field(tx("현재 BM"), distribution(targets, (v) => String(shownRow(v).bm ?? "")), true),
        field(tx("현재 모델 분포"), distribution(targets, (v) => String(shownRow(v).type ?? "")), true),
        pickerFields(picker),
        field(tx("현재 Original PM 분포"), distribution(targets, (v) => String(shownRow(v).original_pm ?? "")), true),
        field(tx("변경할 Original PM (생산월, 비우면 변경 없음)"), pmInput),
        field(tx("출처 (변경 이력에 남는 글)"), source.input)
      ),
      error,
    ],
    [
      mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")),
      mk("button", { class: "btn primary", type: "button", disabled: !targets.length, onclick: apply }, tx("변경")),
    ]
  );
}
