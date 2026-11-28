// 마스터 · 설정의 기준값 탭 — KUFRI 생산판매계획이 쓰는 값을 보고 고친다(저장은 data/settings-store.js, JSON 파일).
// 고친 칸은 저장 대기에 쌓고 "편집 종료"에서 한꺼번에 저장한다. 파일이 없으면 안내만 한다(만들지 않는다).
import { mk } from "../lib/dom.js";
import { ENV } from "../lib/config.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { countBy } from "../data/derive.js";
import { num } from "../app/charts.js";
import {
  PLAN_MONTHS, SALES_INIT, MAP_KEYS, optimusGroupsOf,
  parseSetting, checkSettings, applyPatch, loadSettings, saveSettings, settingsFileName, subcatCode, isSubcatCode,
} from "../data/settings-store.js";

// 편집 상태. 탭이나 화면을 옮겨도 유지한다.
//   patch : 저장 대기. 값 하나짜리 항목은 { 이름: 값 }, 표는 { 이름: { 키: 값 | null } }(null = 그 키를 지운다)
//   added : 편집 중 표에 더한 Sub cat 번호(분류를 고르지 않으면 저장되지 않는다)
const edit = { on: false, saving: false, patch: {}, added: [] };

const pendingCount = () =>
  Object.entries(edit.patch).reduce((n, [key, value]) => n + (MAP_KEYS.includes(key) ? Object.keys(value).length : 1), 0);

const SALES_INIT_LABEL = { avg6: "최근 6개월 실적 평균", avg3: "최근 3개월 실적 평균", zero: "0" };

// 값 하나짜리 항목. choices 가 있으면 고르는 칸, month 면 월 입력칸, 그 밖에는 숫자 입력칸
const ITEMS = [
  { key: "coverageMin", label: "재고월수 하한", help: "재고월수가 이 값보다 작으면 위험으로 표시합니다. 음수도 위험입니다." },
  { key: "coverageNormal", label: "재고월수 정상 ≤", help: "이 값 이하면 정상, 넘으면 주의로 표시합니다." },
  { key: "coverageWarn", label: "재고월수 주의 ≤", help: "이 값 이하면 주의, 넘으면 위험으로 표시합니다." },
  { key: "overstockLimit", label: "재고 과잉 알림 상한", help: "연말 재고월수가 이 값을 넘는 모델을 재고 과잉으로 알립니다." },
  { key: "defaultLeadMonths", label: "기본 리드타임(월)", help: "Model Master 에 리드타임(월)이 없는 모델에 씁니다(PM ~ 입고). KUFRI 계산에만 적용합니다." },
  {
    key: "salesInit", label: "판매 계획 초기값", help: "Sales 계획 칸을 비워 두었을 때 대신 쓰는 값입니다.",
    choices: SALES_INIT, text: (value) => tx(SALES_INIT_LABEL[value] ?? String(value)),
  },
  { key: "planStart", label: "계획 시작 월", help: "KUFRI 매트릭스의 첫 달입니다.", month: true },
  {
    key: "planMonths", label: "계획 개월 수", help: "계획 시작 월부터 보여 주는 개월 수입니다.",
    choices: PLAN_MONTHS, text: (value) => tx("{n}개월", { n: value }),
  },
  {
    key: "invoiceFromShippingUntil", label: "Invoice 대신 Shipping 을 쓰는 마지막 달", month: true,
    help: "Invoice 가 없는 차량 중 Shipping 이 이 달까지인 차량은 Shipping 월을 Invoice 월로 봅니다(Invoice 행, In Transit 실적). 비우면 쓰지 않습니다.",
  },
];
const LABELS = { ...Object.fromEntries(ITEMS.map((item) => [item.key, item.label])), optimusSubcat: "Optimus 분류", optimusGroups: "Optimus 분류" };

const ERROR_TEXT = {
  required: "비워 둘 수 없는 칸입니다.",
  number: "0 이상 99 이하의 숫자만 넣을 수 있습니다.",
  lead: "1 이상 24 이하의 정수만 넣을 수 있습니다.",
  choice: "목록에 있는 값만 고를 수 있습니다.",
  month: "월(YYYY-MM)을 입력하세요.",
  order: "재고월수는 하한 < 정상 ≤ 주의 순서여야 합니다.",
  map: "분류표의 값이 형식에 맞지 않습니다.",
  groups: "분류 목록이 형식에 맞지 않습니다.",
};
const describe = ({ key, error }) => `${tx(LABELS[key] ?? key)}: ${tx(ERROR_TEXT[error] ?? error)}`;

const isEmpty = (value) => value == null || value === "";
const dash = () => mk("span", { class: "muted" }, "—");

/**
 * 기준값 탭을 그린다.
 * @param {HTMLElement} body 탭 내용이 들어가는 상자
 * @param {{vehicles: object[]}} data Sub cat 번호를 차량에서 찾는다
 */
export function baseTab(body, data) {
  const box = mk("div");
  body.replaceChildren(box);
  load(box, data, false);
}

const head = (...nodes) => mk("div", { class: "card-h" }, mk("h2", null, tx("기준값")), ...nodes);

function message(box, text, isError, retry) {
  box.replaceChildren(
    head(),
    mk("p", { class: isError ? "error" : "muted" }, text),
    ...(retry ? [mk("button", { class: "btn", type: "button", onclick: retry }, tx("다시 시도"))] : [])
  );
}

async function load(box, source, refresh) {
  message(box, tx("기준값을 불러오는 중..."));
  const retry = () => load(box, source, true);
  let state;
  try {
    state = await loadSettings({ refresh });
  } catch (err) {
    console.error(err);
    if (box.isConnected) message(box, `${tx("기준값을 불러오지 못했습니다.")} ${err.status ?? ""} ${err.message ?? ""}`, true, retry);
    return;
  }
  if (!box.isConnected) return; // 불러오는 동안 다른 탭이나 화면으로 옮겨 갔다
  render(box, source, state, retry);
}

function render(box, source, state, retry) {
  const { vehicles } = source;
  const draw = () => render(box, source, state, retry);
  const file = settingsFileName();
  // 파일을 쓸 수 없는 상태면 저장 대기를 들고 있을 이유가 없다
  if (!state.data || state.wrongEnv) Object.assign(edit, { on: false, patch: {}, added: [] });
  if (state.missing) {
    message(box, tx("기준값 파일이 없습니다. Modify 폴더에 {f} 파일을 올린 뒤 다시 시도하세요.", { f: file }), true, retry);
    return;
  }
  if (state.invalid) {
    message(box, tx("기준값 파일({f})의 형식이 맞지 않습니다.", { f: file }), true, retry);
    return;
  }
  if (state.wrongEnv) {
    message(box, tx("기준값 파일({f})의 environment 가 접속한 환경({e})과 다릅니다.", { f: file, e: ENV.label }), true, retry);
    return;
  }

  const data = state.data;
  const bar = mk("span", { class: "muted small" });
  const drawBar = () => {
    bar.textContent = edit.on ? tx("저장 대기 {n}건 → '편집 종료' 시 저장", { n: num(pendingCount()) }) : "";
  };
  drawBar();

  // ---- 값 하나짜리 항목 ----
  const shown = (key) => (key in edit.patch ? edit.patch[key] : data[key]);
  const valueText = (item, value) => (isEmpty(value) ? dash() : item.text ? item.text(value) : String(value));

  const scalarControl = (item) => {
    const { key } = item;
    const node = item.choices
      ? mk(
          "select",
          { class: "mst-in" },
          // 파일에 값이 없거나 목록 밖이면 빈 선택지를 둔다
          item.choices.includes(data[key]) ? null : mk("option", { value: "" }, "—"),
          item.choices.map((choice) => mk("option", { value: String(choice) }, item.text(choice)))
        )
      : mk("input", item.month ? { type: "month", class: "mst-in" } : { type: "text", class: "mst-in num", inputmode: "decimal" });
    const show = () => {
      const value = shown(key);
      node.value = isEmpty(value) || (item.choices && !item.choices.includes(value)) ? "" : String(value);
      node.classList.toggle("pend", key in edit.patch);
    };
    show();
    node.addEventListener("change", () => {
      const parsed = parseSetting(key, node.value);
      if (parsed.error) {
        toast(tx("입력 불가"), describe({ key, error: parsed.error }));
        show();
        return;
      }
      // 비워 둘 수 있는 항목은 빈 글과 "파일에 없음"을 같은 값으로 본다
      if (parsed.value === (data[key] ?? (parsed.value === "" ? "" : undefined))) delete edit.patch[key];
      else edit.patch[key] = parsed.value;
      show();
      drawBar();
    });
    return node;
  };

  const scalarTable = mk(
    "table",
    { class: "tbl base-tbl" },
    mk("thead", null, mk("tr", null, mk("th", null, tx("항목")), mk("th", null, tx("값")), mk("th", null, tx("설명")))),
    mk(
      "tbody",
      null,
      ITEMS.map((item) =>
        mk(
          "tr",
          { "data-key": item.key },
          mk("td", null, tx(item.label)),
          mk("td", { class: "val" }, edit.on ? scalarControl(item) : valueText(item, data[item.key])),
          mk("td", { class: "muted small" }, tx(item.help))
        )
      )
    )
  );

  // ---- 분류표: Sub cat 번호 → Optimus 분류. base 는 표에 값이 없을 때의 분류(미분류). 분류의 이름은 파일의 목록에서 온다 ----
  const groups = optimusGroupsOf(data);
  const groupText = (value) => (value === "" ? tx("미분류") : String(value));
  const mapValue = (mapKey, name, base) => {
    const patch = edit.patch[mapKey];
    if (patch && name in patch) return patch[name] ?? base;
    return data[mapKey]?.[name] ?? base;
  };
  const mapControl = (mapKey, name, options, base) => {
    const saved = data[mapKey]?.[name] ?? base;
    // 저장된 값이 분류 목록에 없으면 그 값도 보여 준다(고쳐야 저장된다)
    const shownOptions = options.includes(saved) ? options : [...options, saved];
    const node = mk("select", { class: "mst-in" }, shownOptions.map((value) => mk("option", { value }, groupText(value))));
    const show = () => {
      node.value = mapValue(mapKey, name, base);
      node.classList.toggle("pend", name in (edit.patch[mapKey] ?? {}));
    };
    show();
    node.addEventListener("change", () => {
      const patch = edit.patch[mapKey] ?? {};
      if (node.value === saved) delete patch[name];
      else patch[name] = node.value === base ? null : node.value;
      if (Object.keys(patch).length) edit.patch[mapKey] = patch;
      else delete edit.patch[mapKey];
      show();
      drawBar();
    });
    return node;
  };
  const groupCell = (mapKey, name, options, base) =>
    mk("td", { class: "val" }, edit.on ? mapControl(mapKey, name, options, base) : groupText(mapValue(mapKey, name, base)));

  // Sub cat 번호: 파일에 있는 번호 + 차량에 있는 번호 + 편집 중 더한 번호
  const codeOf = vehicles.map((v) => subcatCode(v.sub_cat));
  const codeCount = countBy(codeOf.filter(Boolean), (code) => code);
  const codes = [...new Set([...Object.keys(data.optimusSubcat ?? {}), ...Object.keys(codeCount), ...edit.added])].sort();
  const noCode = codeOf.filter((code) => !code).length;
  const subcatTable = mk(
    "table",
    { class: "tbl base-tbl" },
    mk("thead", null, mk("tr", null, mk("th", null, "Sub cat"), mk("th", { class: "num" }, tx("차량 수")), mk("th", null, tx("Optimus 분류")))),
    mk(
      "tbody",
      null,
      codes.map((code) =>
        mk(
          "tr",
          { "data-code": code },
          mk("td", { class: "mono" }, code),
          mk("td", { class: "num" }, num(codeCount[code] ?? 0)),
          groupCell("optimusSubcat", code, [...groups, ""], "")
        )
      ),
      mk(
        "tr",
        null,
        mk("td", { class: "muted" }, tx("(Sub cat 없음)")),
        mk("td", { class: "num" }, num(noCode)),
        mk("td", { class: "muted" }, tx("미분류"))
      )
    )
  );

  // 편집 중: 차량에 아직 없는 Sub cat 번호를 표에 더한다
  const addRow = () => {
    const input = mk("input", { type: "text", class: "mst-in base-code", maxlength: 2, inputmode: "numeric", placeholder: "00" });
    const add = () => {
      const code = input.value.trim();
      if (!isSubcatCode(code)) {
        toast(tx("입력 불가"), tx("Sub cat 번호는 숫자 두 자리입니다."));
        return;
      }
      if (codes.includes(code)) {
        toast(tx("입력 불가"), tx("이미 표에 있는 번호입니다."));
        return;
      }
      edit.added.push(code);
      draw();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") add();
    });
    return mk(
      "div",
      { class: "base-add" },
      mk("label", { class: "muted small" }, tx("Sub cat 번호 추가"), " ", input),
      mk("button", { class: "btn sm", type: "button", onclick: add }, tx("추가"))
    );
  };

  // ---- 저장 ----
  const leave = () => {
    Object.assign(edit, { on: false, patch: {}, added: [] });
    draw();
  };

  function openConflict() {
    openModal(
      tx("기준값 충돌"),
      [
        mk("p", null, tx("그사이 다른 사람이 기준값 파일을 저장했습니다. 최신 내용을 불러왔습니다.")),
        mk("p", { class: "muted small" }, tx("'내 변경으로 저장'은 최신 내용 위에 내가 고친 {n}건만 덮어씁니다.", { n: num(pendingCount()) })),
      ],
      [
        mk(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: () => {
              closeModal();
              leave();
            },
          },
          tx("최신본 불러오기")
        ),
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
          tx("내 변경으로 저장")
        ),
      ]
    );
  }

  async function save() {
    if (edit.saving) return;
    edit.saving = true;
    draw();
    try {
      const res = await saveSettings(edit.patch);
      if (res.ok) {
        Object.assign(edit, { on: false, patch: {}, added: [] });
        toast(tx("기준값 저장"), file);
      } else if (res.conflict) {
        if (state.data && !state.wrongEnv) openConflict();
      } else if (res.code === "invalid") toast(tx("저장 불가"), describe(res.errors[0]));
      else toast(tx("저장 실패"), `${file}: ${res.code}`);
    } catch (err) {
      console.error(err);
      toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
    } finally {
      edit.saving = false;
      draw();
    }
  }

  function finish() {
    if (!pendingCount()) {
      leave();
      return;
    }
    const errors = checkSettings(applyPatch(data, edit.patch));
    if (errors.length) {
      toast(tx("저장 불가"), describe(errors[0]));
      return;
    }
    openModal(
      tx("기준값 저장"),
      [
        mk("p", null, tx("기준값 {n}건의 수정을 저장합니다.", { n: num(pendingCount()) })),
        mk("p", { class: "muted small" }, `${tx("대상")}(${ENV.label}): ${file}`),
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
    if (edit.on) finish();
    else {
      edit.on = true;
      draw();
    }
  });
  const cancelButton = edit.on
    ? mk("button", { class: "btn sm", type: "button", disabled: edit.saving, onclick: cancel }, tx("변경 취소"))
    : null;

  // 파일에 형식이 맞지 않는 항목이 있으면 알린다(편집해서 고친다)
  const problems = checkSettings(data);

  box.replaceChildren(
    head(mk("span", { class: "desc" }, tx("KUFRI 생산판매계획이 쓰는 값 · {f}", { f: file })), mk("span", { class: "spacer" }), bar, editButton, cancelButton),
    ...(problems.length
      ? [mk("p", { class: "error small" }, `${tx("형식이 맞지 않는 항목 {n}건", { n: num(problems.length) })} — ${problems.map(describe).join(" · ")}`)]
      : []),
    scalarTable,
    mk(
      "div",
      { class: "base-sec" },
      mk("h3", null, tx("Optimus 분류 (Sub cat 앞 두 자리)")),
      mk(
        "p",
        { class: "muted small" },
        tx("Sub cat 번호 = 차량 Sub cat 값의 앞 두 자리 숫자. 차량의 Model 값과 관계없이 이 번호로만 나눕니다. 미분류 = 어느 쪽에도 넣지 않습니다. Sub cat 이 없는 차량도 미분류입니다."),
        ` ${tx("분류 목록(파일의 optimusGroups)")}: ${groups.join(" · ") || "—"}`
      ),
      subcatTable,
      edit.on ? addRow() : null
    )
  );
}

// 저장 대기가 있는 채로 창을 닫거나 새로 고치면 브라우저가 한 번 묻는다.
window.addEventListener("beforeunload", (event) => {
  if (!pendingCount()) return;
  event.preventDefault();
  event.returnValue = "";
});
