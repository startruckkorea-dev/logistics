// 마스터 · 설정의 편집 — 모델 마스터와 색상 마스터의 칸 수정, 모델 추가, 색상 추가.
// 고친 칸은 저장 대기에 쌓고 "편집 종료"에서 한꺼번에 저장한다. 모델·색상 추가는 창에서 바로 저장한다.
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { targetListNames } from "../data/store.js";
import {
  MODEL_EDIT_FIELDS, parseMasterValue, sameMasterValue, specOf, nextMomaNo, planVehicleEdits,
  saveMasters, addModel, addColor, masterListName,
} from "../data/master-store.js";
import { num } from "../app/charts.js";

// 편집 상태. 탭이나 화면을 옮겨도 유지한다.
//   model / color : 행의 키(moma_no / color_code) → { 열: 값 } (고친 칸만)
export const edit = { on: false, saving: false, model: new Map(), color: new Map() };

const KEY = { model: "moma_no", color: "color_code" };

const pendingCount = () =>
  [...edit.model.values(), ...edit.color.values()].reduce((n, patch) => n + Object.keys(patch).length, 0);

const ERROR_TEXT = {
  required: "비워 둘 수 없는 칸입니다.",
  number: "숫자만 넣을 수 있습니다.",
  whole: "0 이상의 정수만 넣을 수 있습니다.",
  too_long: "255자를 넘을 수 없습니다.",
};

/** 지금 보여줄 값(저장 대기 값이 있으면 그것) */
export function shownValue(kind, row, field) {
  const patch = edit[kind].get(row[KEY[kind]]);
  return patch && field in patch ? patch[field] : row[field];
}

/**
 * 편집 모드의 입력칸.
 * @param {"model"|"color"} kind
 * @param {object} row 마스터 행
 * @param {{key: string, edit: "text"|"number"|"check"}} column
 * @param {(node: HTMLElement) => void} onChange 저장 대기가 바뀐 뒤 부른다(그 입력칸을 넘긴다)
 */
export function editControl(kind, row, column, onChange) {
  const field = column.key;
  const key = row[KEY[kind]];
  const isCheck = column.edit === "check";
  const node = isCheck
    ? mk("input", { type: "checkbox" })
    : mk("input", { type: "text", class: `mst-in${column.edit === "number" ? " num" : ""}`, inputmode: column.edit === "number" ? "numeric" : null });
  const show = () => {
    const value = shownValue(kind, row, field);
    if (isCheck) node.checked = Boolean(value);
    else node.value = value == null ? "" : String(value);
    node.classList.toggle("pend", field in (edit[kind].get(key) ?? {}));
  };
  show();
  node.addEventListener("change", () => {
    const parsed = parseMasterValue(kind, field, isCheck ? node.checked : node.value);
    if (parsed.error) {
      toast(tx("입력 불가"), tx(ERROR_TEXT[parsed.error]));
      show();
      return;
    }
    const patch = edit[kind].get(key) ?? {};
    if (sameMasterValue(kind, field, parsed.value, row[field])) delete patch[field];
    else patch[field] = parsed.value;
    if (Object.keys(patch).length) edit[kind].set(key, patch);
    else edit[kind].delete(key);
    show();
    onChange(node);
  });
  return node;
}

// 저장 대기를 { row, patch } 목록으로
const editsOf = (kind, rows) =>
  rows.filter((row) => edit[kind].has(row[KEY[kind]])).map((row) => ({ row, patch: edit[kind].get(row[KEY[kind]]) }));

/**
 * 제목 줄에 놓는 편집 버튼들.
 * @param {{models: object[], colors: object[], vehicles: object[]}} data
 * @param {"model"|"color"} tab 지금 보고 있는 탭
 * @param {() => void} rerender 화면을 다시 그린다
 * @returns {{nodes: Node[], drawBar: () => void}}
 */
export function editToolbar(data, tab, rerender) {
  const bar = mk("span", { class: "muted small" });
  const drawBar = () => {
    bar.textContent = edit.on ? tx("저장 대기 {n}건 → '편집 종료' 시 저장", { n: num(pendingCount()) }) : "";
  };
  drawBar();

  async function save() {
    if (edit.saving) return;
    edit.saving = true;
    rerender();
    try {
      const models = editsOf("model", data.models);
      const colors = editsOf("color", data.colors);
      const out = await saveMasters({ models, colors });
      // 마스터에 들어갔고 차량 반영도 끝난 행만 저장 대기에서 뺀다. 남은 것은 다시 "편집 종료"로 저장할 수 있다.
      const counts = { saved: 0, conflict: 0, denied: 0, failed: [] };
      for (const [kind, list] of [["model", models], ["color", colors]]) {
        for (const { row } of list) {
          const result = out.rows.get(row);
          const key = row[KEY[kind]];
          if (result === "saved" || result === "unchanged") {
            if (result === "saved") counts.saved++;
            if (!out.pendingKeys.has(key)) edit[kind].delete(key);
          } else if (result === "conflict") counts.conflict++;
          else if (result === "denied") counts.denied++;
          else counts.failed.push(result);
        }
      }
      const v = out.vehicles;
      const problems = [
        counts.conflict ? tx("마스터 충돌 {n}건", { n: num(counts.conflict) }) : "",
        counts.denied ? tx("권한 없음 {n}건", { n: num(counts.denied) }) : "",
        counts.failed.length ? `${tx("실패 {n}건", { n: num(counts.failed.length) })} (${[...new Set(counts.failed)].join(", ")})` : "",
        v.conflicts ? tx("차량 충돌 {n}건", { n: num(v.conflicts) }) : "",
        v.denied ? tx("차량 권한 없음 {n}건", { n: num(v.denied) }) : "",
        v.failed ? `${tx("차량 실패 {n}건", { n: num(v.failed) })} (${v.codes.join(", ")})` : "",
      ].filter(Boolean);
      toast(
        tx("마스터 저장"),
        tx("마스터 {n}건 저장 · 차량 {m}대에 반영", { n: num(counts.saved), m: num(v.saved) }) +
          (problems.length ? ` · ${tx("저장하지 못한 것")}: ${problems.join(" · ")}` : "")
      );
      if (counts.conflict) {
        toast(tx("마스터 충돌 {n}건", { n: num(counts.conflict) }), tx("그사이 다른 사람이 고친 행입니다. 최신 값을 불러왔으니 확인한 뒤 다시 '편집 종료'를 누르세요."));
      }
      if (v.historyFailed) {
        toast(
          tx("변경 이력 기록 실패 {n}건", { n: num(v.historyFailed) }),
          `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${v.historyCodes.join(", ")})`
        );
      }
      if (!pendingCount()) edit.on = false;
    } catch (err) {
      console.error(err);
      toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
    } finally {
      edit.saving = false;
      rerender();
    }
  }

  function finish() {
    if (!pendingCount()) {
      edit.on = false;
      rerender();
      return;
    }
    const models = editsOf("model", data.models);
    const colors = editsOf("color", data.colors);
    const plan = planVehicleEdits(data.vehicles, models, colors);
    const cars = new Set([...plan.model, ...plan.color].map((x) => x.vehicle.commission_no)).size;
    const targets = [
      models.length ? masterListName("model") : null,
      colors.length ? masterListName("color") : null,
      ...(cars ? targetListNames(["bm"]) : []),
    ].filter(Boolean);
    openModal(
      tx("마스터 저장"),
      [
        mk("p", null, tx("모델 {a}건, 색상 {b}건의 수정 {m}칸을 저장합니다.", { a: num(models.length), b: num(colors.length), m: num(pendingCount()) })),
        mk("p", null, cars ? tx("이 모델·색상의 차량 {c}대에도 같은 값을 넣고 차량 이력에 남깁니다.", { c: num(cars) }) : tx("같이 고칠 차량은 없습니다.")),
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
      edit.model.clear();
      edit.color.clear();
      edit.on = false;
      rerender();
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
      rerender();
    } else finish();
  });
  const cancelButton = edit.on
    ? mk("button", { class: "btn sm", type: "button", disabled: edit.saving, onclick: cancel }, tx("변경 취소"))
    : null;
  // 추가는 창에서 바로 저장한다. 편집 중에는 저장 대기와 섞이지 않게 막는다.
  const addButton = mk(
    "button",
    {
      class: "btn sm primary",
      type: "button",
      disabled: edit.on,
      title: edit.on ? tx("편집을 끝낸 뒤 추가하세요.") : null,
      onclick: () => (tab === "model" ? openAddModel(data, rerender) : openAddColor(data, rerender)),
    },
    tab === "model" ? tx("＋ 모델 추가") : tx("＋ 색상 추가")
  );
  return { nodes: [mk("span", { class: "spacer" }), bar, editButton, cancelButton, addButton], drawBar };
}

const field = (label, control, wide) =>
  mk("div", { class: `f ${wide ? "wide" : ""}` }, mk("div", { class: "k" }, label), mk("div", { class: "v" }, control));

// 지금 있는 값들을 고를 수 있게 붙이는 목록(새 값도 넣을 수 있다)
let listSeq = 0;
function withChoices(input, values) {
  const id = `mst-list-${++listSeq}`;
  input.setAttribute("list", id);
  return [input, mk("datalist", { id }, values.map((value) => mk("option", { value })))];
}

// ---- 모델 추가 ----
function openAddModel(data, rerender) {
  const distinct = (key) => [...new Set(data.models.map((m) => m[key]).filter((x) => x != null && x !== "").map(String))].sort();
  const text = (key, choices) => {
    const input = mk("input", { type: "text" });
    return { input, node: choices ? withChoices(input, distinct(key)) : input };
  };
  const controls = {
    bm: text("bm"), my: text("my", true), vehicle: text("vehicle", true), model: text("model", true),
    type: text("type"), axle: text("axle", true), cab: text("cab", true), cab_gen: text("cab_gen", true),
    wheelbase: text("wheelbase"), pto: text("pto", true), emission: text("emission", true),
    lead_days: text("lead_days"), lead: text("lead"),
  };
  const isRep = mk("input", { type: "checkbox" });
  const active = mk("input", { type: "checkbox" });
  active.checked = true;
  const labels = {
    bm: "BM", my: "MY", vehicle: "Vehicle", model: "Model", type: "Type", axle: "Axle", cab: "Cab", cab_gen: "Cab Gen",
    wheelbase: "Wheelbase", pto: "PTO", emission: "Emission", lead_days: tx("리드타임(일)"), lead: tx("리드타임(월)"),
  };
  const error = mk("div", { class: "small error", hidden: true });
  const specLine = mk("span", { class: "mono" });
  const read = () => {
    const values = {};
    for (const name of MODEL_EDIT_FIELDS) {
      const raw = name === "is_rep" ? isRep.checked : name === "active" ? active.checked : controls[name].input.value;
      const parsed = parseMasterValue("model", name, raw);
      if (parsed.error) return { error: `${labels[name]}: ${tx(ERROR_TEXT[parsed.error])}` };
      values[name] = parsed.value;
    }
    return { values };
  };
  const drawSpec = () => {
    const values = Object.fromEntries(Object.entries(controls).map(([name, c]) => [name, c.input.value.trim()]));
    specLine.textContent = specOf(values);
  };
  for (const c of Object.values(controls)) c.input.addEventListener("input", drawSpec);
  drawSpec();

  const add = mk("button", { class: "btn primary", type: "button" }, tx("추가"));
  add.addEventListener("click", async () => {
    error.hidden = true;
    const { values, error: message } = read();
    if (message) {
      error.textContent = message;
      error.hidden = false;
      return;
    }
    add.disabled = true;
    try {
      const res = await addModel(values);
      if (!res.ok) {
        error.textContent = res.code === "no_number" ? tx("moma_no 를 만들 수 없습니다.") : `${tx("저장 실패")} (${res.code})`;
        error.hidden = false;
        add.disabled = false;
        return;
      }
      // addModel 이 마스터를 다시 읽었다. 화면이 들고 있는 목록도 그것으로 바꾼다
      data.models = res.models;
      closeModal();
      toast(tx("모델 추가"), `${res.row.moma_no} · ${masterListName("model")}`);
      rerender({ added: res.row.moma_no });
    } catch (err) {
      console.error(err);
      error.textContent = `${tx("저장 실패")} ${err.status ?? ""} ${err.message ?? ""}`.trim();
      error.hidden = false;
      add.disabled = false;
    }
  });

  openModal(
    tx("모델 추가"),
    [
      mk(
        "div",
        { class: "fields" },
        field("BM", controls.bm.node, true),
        ["my", "vehicle", "model", "type", "axle", "cab", "cab_gen", "pto", "wheelbase", "emission", "lead_days", "lead"].map((name) =>
          field(labels[name], controls[name].node)
        ),
        field(tx("대표"), mk("label", null, isRep, " Y")),
        field("Active", mk("label", null, active, " Y")),
        field("Spec", specLine, true)
      ),
      mk(
        "p",
        { class: "muted small" },
        tx("moma_no 는 저장할 때 다음 번호로 자동으로 붙습니다(지금 기준 {n}). 추가한 모델은 Active 이면 오더 생성·오더 변경의 모델 목록에 나옵니다.", {
          n: nextMomaNo(data.models) || "—",
        })
      ),
      mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${masterListName("model")}`),
      error,
    ],
    [mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")), add]
  );
}

// ---- 색상 추가 ----
function openAddColor(data, rerender) {
  const code = mk("input", { type: "text", maxlength: 50 });
  const nameMb = mk("input", { type: "text", maxlength: 255 });
  const nameMolit = mk("input", { type: "text", maxlength: 255 });
  const error = mk("div", { class: "small error", hidden: true });
  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  const add = mk("button", { class: "btn primary", type: "button" }, tx("추가"));
  add.addEventListener("click", async () => {
    error.hidden = true;
    const values = { color_code: code.value.trim(), color_name_mb: nameMb.value.trim(), color_name_molit: nameMolit.value.trim() };
    if (!values.color_code) {
      fail(`Color Code: ${tx(ERROR_TEXT.required)}`);
      return;
    }
    add.disabled = true;
    try {
      const res = await addColor(values);
      if (!res.ok) {
        fail(res.code === "duplicate" ? tx("이미 있는 Color Code 입니다.") : `${tx("저장 실패")} (${res.code})`);
        add.disabled = false;
        return;
      }
      data.colors = res.colors;
      closeModal();
      toast(
        tx("색상 추가"),
        `${masterListName("color")}${res.vehicles ? ` · ${tx("차량 {n}대에 반영", { n: num(res.vehicles) })}` : ""}`
      );
      rerender({});
    } catch (err) {
      console.error(err);
      fail(`${tx("저장 실패")} ${err.status ?? ""} ${err.message ?? ""}`.trim());
      add.disabled = false;
    }
  });
  openModal(
    tx("색상 추가"),
    [
      mk(
        "div",
        { class: "fields" },
        field("Color Code", code, true),
        field("Color Name (MB)", nameMb, true),
        field(tx("Color Name (국토부)"), nameMolit, true)
      ),
      mk("p", { class: "muted small" }, tx("이 Color Code 를 이미 가진 차량이 있으면 Color Name 을 채우고 차량 이력에 남깁니다.")),
      mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${masterListName("color")}`),
      error,
    ],
    [mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("취소")), add]
  );
}

// 저장 대기가 있는 채로 창을 닫거나 새로 고치면 브라우저가 한 번 묻는다.
window.addEventListener("beforeunload", (event) => {
  if (!pendingCount()) return;
  event.preventDefault();
  event.returnValue = "";
});
