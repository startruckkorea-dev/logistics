// 차량 상세 드로어 — 마일스톤 타임라인, 기본 정보, 그룹별 필드, 입력 열 저장, 변경 이력.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { openDrawer, closeDrawer, openModal, closeModal, toast } from "../app/ui.js";
import { STATUS } from "../domain/status.js";
import { COLUMNS, GROUPS, sourceBadge, stageClass } from "../data/columns.js";
import { INPUT_FIELDS, changedFields, saveVehicleInputs, loadVehicleHistory } from "../data/store.js";
import { createInput, labelOf, invalidMessage } from "./input-controls.js";

const isEmpty = (v) => v == null || v === "";
const dash = () => mk("span", { class: "muted" }, "—");

// 타임라인에서 현재 위치(완료한 칸 수). Current Status 로 정한다.
function doneCount(v) {
  switch (v.current_status) {
    case STATUS.SOLD: return 7;
    case STATUS.OH_STOCK: return 6;
    case STATUS.BONDED_STOCK: return 5;
    case STATUS.IN_TRANSIT: return 4;
    case STATUS.SHIPMENT_SCHEDULED: return 3;
    case STATUS.IN_PRODUCTION: return v.dispatch ? 3 : 2;
    default: return 0;
  }
}

function timeline(v) {
  const milestones = [
    ["PM", v.pm],
    ["TDD", v.tdd_calc],
    ["Dispatch", v.dispatch],
    ["Shipping", v.shipping],
    // 도착일은 확정된 값부터: ATA → ETA(선사) → Planned Arrival → ETA From TDD
    ["ETA·ATA", v.ata || v.eta_from_eukor_pirt || v.planned_arrival || v.eta_from_tdd],
    ["Customs", v.customs_clearance_date],
    ["Sales", v.sales_month],
  ];
  const done = doneCount(v);
  return mk(
    "div",
    { class: "timeline" },
    milestones.map(([label, date], i) =>
      mk(
        "div",
        { class: `ms ${i < done ? "done" : ""} ${i === done ? "cur" : ""}` },
        mk("div", { class: "dot" }),
        mk("div", { class: "l" }, label),
        mk("div", { class: "d" }, isEmpty(date) ? "—" : date)
      )
    )
  );
}

function card(title, ...children) {
  return mk("div", { class: "card" }, mk("div", { class: "card-h" }, mk("h2", null, title)), children);
}

// 기본 그룹은 "Vehicle : Tractor" 형식의 5줄로 보여준다.
function basicCard(v) {
  // 연식은 이 줄에서만 "MY26" 형식으로 보여준다. 데이터와 그리드는 "26" 그대로다.
  const modelYear = isEmpty(v.model_year) ? "" : `MY${v.model_year}`;
  const model = [modelYear, v.model, v.type, v.axle, v.cab, v.cab_gen, v.wheelbase, v.pto, v.emission]
    .filter((x) => !isEmpty(x))
    .join(" ");
  const lines = [
    ["Model", model],
    ["Vehicle", v.vehicle],
    ["BM", v.bm],
    ["VIN No", v.vin_no],
    ["Engine", v.engine_no],
  ];
  return card(
    tx("기본"),
    mk(
      "div",
      { class: "lines" },
      lines.map(([label, value]) =>
        mk(
          "div",
          { class: "line" },
          mk("span", { class: "k" }, label),
          mk("span", { class: "c" }, ":"),
          isEmpty(value) ? mk("span", { class: "v muted" }, "—") : mk("span", { class: "v" }, String(value))
        )
      )
    )
  );
}

// 그룹의 열. drawerAfter 가 있는 열은 지정한 열 바로 뒤로 옮긴다(그리드 순서는 그대로).
function groupColumns(group) {
  const columns = COLUMNS.filter((c) => c.group === group);
  for (const column of columns.filter((c) => c.drawerAfter)) {
    columns.splice(columns.indexOf(column), 1);
    const at = columns.findIndex((c) => c.key === column.drawerAfter);
    columns.splice(at < 0 ? columns.length : at + 1, 0, column);
  }
  return columns;
}

// 입력 열의 입력칸. data-field 로 열 이름을 달아 두고 저장할 때 모아 읽는다.
function inputControl(column, value) {
  const node = createInput(column.key, isEmpty(value) ? "" : String(value));
  node.dataset.field = column.key;
  if (node.type !== "date" && node.type !== "month") return node;
  // 날짜·월 선택 칸은 한 번에 지우는 버튼을 옆에 둔다
  const clear = mk("button", { class: "btn sm", type: "button", title: tx("값 지우기") }, "×");
  clear.addEventListener("click", () => {
    node.value = "";
    node.focus();
  });
  return mk("span", { class: "clearable" }, node, clear);
}

function field(column, v) {
  const value = v[column.key];
  const badge = sourceBadge(column.src);
  let content;
  if (column.key === "current_status") content = mk("span", { class: `pill ${stageClass(value)}` }, value);
  else if (INPUT_FIELDS.includes(column.key)) content = inputControl(column, value);
  else content = isEmpty(value) ? dash() : mk("span", null, String(value));
  return mk(
    "div",
    { class: `f ${column.memo ? "wide" : ""}` },
    mk(
      "div",
      { class: "k" },
      tx(column.label),
      " ",
      mk("span", { class: `badge ${badge.cls}`, title: badge.tip }, tx(column.src)),
      column.src === "입력" ? null : mk("span", { class: "lock", title: badge.tip }, "🔒")
    ),
    // 긴 글은 줄바꿈을 살려 여러 줄로 보여준다
    mk("div", { class: column.memo ? "v long-text" : "v" }, content)
  );
}

// ISO 시각 → 이 PC 시간의 "YYYY-MM-DD HH:mm"
function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const valueCell = (value, strong) =>
  mk("td", { class: "long-text" }, isEmpty(value) ? dash() : strong ? mk("b", null, value) : value);

// 저장 한 번이 여러 필드를 바꿨으면 일시·사용자·출처 칸을 묶어 보여준다.
function historyTable(entries) {
  const rows = entries.flatMap((entry) =>
    entry.changes.map((change, i) => {
      const span = (content, cls) =>
        i === 0 ? mk("td", { class: cls, rowspan: entry.changes.length }, content) : null;
      return mk(
        "tr",
        null,
        span(localTime(entry.at), "mono"),
        mk("td", null, tx(labelOf(change.field))),
        valueCell(change.old, false),
        valueCell(change.new, true),
        span(entry.by),
        span(mk("span", { class: "pill neutral" }, tx(entry.source)))
      );
    })
  );
  return mk(
    "table",
    { class: "tbl" },
    mk("thead", null, mk("tr", null, ["일시", "필드", "이전", "이후", "사용자", "출처"].map((h) => mk("th", null, tx(h))))),
    mk("tbody", null, rows)
  );
}

function historyCard(v) {
  const box = mk("div", { class: "muted small" }, tx("변경 이력을 불러오는 중..."));
  loadVehicleHistory(v.commission_no)
    .then((entries) => {
      const shown = entries.filter((entry) => entry.changes.length);
      if (shown.length) box.replaceWith(historyTable(shown));
      else box.textContent = tx("변경 이력이 없습니다.");
    })
    .catch((err) => {
      console.error(err);
      box.textContent = `${tx("변경 이력을 불러오지 못했습니다.")} ${err.status ?? ""}`.trim();
    });
  return card(tx("변경 이력"), box);
}

// 드로어의 입력칸 값을 모은다
function readInputs() {
  const inputs = {};
  for (const node of document.getElementById("drawer-body").querySelectorAll("[data-field]")) {
    inputs[node.dataset.field] = node.value;
  }
  return inputs;
}

// 같은 필드를 다른 사람이 먼저 바꿨을 때. 저장된 값과 내 입력을 나란히 보여주고 고르게 한다.
function showConflict(v, inputs, fields, options, closeAfter) {
  const table = mk(
    "table",
    { class: "tbl" },
    mk("thead", null, mk("tr", null, ["필드", "저장된 값", "내 입력"].map((h) => mk("th", null, tx(h))))),
    mk(
      "tbody",
      null,
      fields.map((f) => mk("tr", null, mk("td", null, tx(labelOf(f.field))), valueCell(f.theirs, false), valueCell(f.mine, true)))
    )
  );
  const discard = () => {
    closeModal();
    options.onSaved?.();
    openVehicle(v, options);
  };
  const overwrite = () => {
    closeModal();
    save(v, inputs, options, closeAfter);
  };
  openModal(
    tx("다른 사용자가 먼저 수정했습니다"),
    [mk("p", null, tx("불러온 뒤에 아래 필드가 바뀌었습니다. 내 입력으로 저장하면 저장된 값이 바뀝니다.")), table],
    [
      mk("button", { class: "btn", type: "button", onclick: discard }, tx("내 입력 버리기")),
      mk("button", { class: "btn primary", type: "button", onclick: overwrite }, tx("내 입력으로 저장")),
    ]
  );
}

// 저장하지 않은 입력이 있는 채로 닫으려 할 때. 저장할지 묻는다.
// @returns {boolean} 참이면 바로 닫아도 된다
function confirmClose(v, options) {
  const inputs = readInputs();
  const changes = changedFields(v, inputs);
  if (!changes.length) return true;
  const keepEditing = () => closeModal();
  const discard = () => {
    closeModal();
    closeDrawer(true);
  };
  const saveAndClose = () => {
    closeModal();
    save(v, inputs, options, true);
  };
  openModal(
    tx("저장하지 않은 입력이 있습니다"),
    mk("p", null, tx("입력한 내용을 저장할까요?"), " ", changes.map((c) => tx(labelOf(c.field))).join(" · ")),
    [
      mk("button", { class: "btn", type: "button", onclick: keepEditing }, tx("계속 편집")),
      mk("button", { class: "btn", type: "button", onclick: discard }, tx("저장하지 않고 닫기")),
      mk("button", { class: "btn primary", type: "button", onclick: saveAndClose }, tx("저장")),
    ]
  );
  return false;
}

let saving = false;

// closeAfter: 저장에 성공하면 드로어를 닫는다(닫기 확인 창에서 저장을 골랐을 때)
async function save(v, inputs, options, closeAfter = false) {
  if (saving) return;
  saving = true;
  const button = document.getElementById("drawer-save");
  if (button) button.disabled = true;
  try {
    const result = await saveVehicleInputs(v, inputs);
    if (result.status === "unchanged") {
      toast(tx("저장"), tx("변경된 입력 필드가 없습니다."));
    } else if (result.status === "invalid") {
      const message = invalidMessage(result.field, result.reason);
      toast(message.title, message.detail);
    } else if (result.status === "conflict") {
      showConflict(v, inputs, result.fields, options, closeAfter);
    } else if (result.status === "denied") {
      toast(tx("저장 실패"), tx("편집 권한이 없습니다."));
    } else if (result.status === "failed") {
      toast(tx("저장 실패"), result.code);
    } else {
      toast(tx("저장"), `${v.commission_no} · ${result.changes.map((c) => tx(labelOf(c.field))).join(" · ")}`);
      if (!result.historyOk) {
        toast(
          tx("변경 이력 기록 실패"),
          `${tx("값은 저장되었습니다. 이력만 기록되지 않았습니다.")} (${result.historyCodes.join(", ")})`
        );
      }
      options.onSaved?.();
      if (closeAfter) {
        closeDrawer(true);
      } else {
        // 저장된 값과 새 이력으로 다시 그린다. 보던 위치는 유지한다.
        const body = document.getElementById("drawer-body");
        const top = body.scrollTop;
        openVehicle(v, options);
        body.scrollTop = top;
      }
    }
  } catch (err) {
    console.error(err);
    toast(tx("저장 실패"), `${err.status ?? ""} ${err.message ?? ""}`.trim());
  } finally {
    saving = false;
    const current = document.getElementById("drawer-save");
    if (current) current.disabled = false;
  }
}

/**
 * 차량 1대의 상세를 드로어로 연다.
 * @param {object} v 차량 행
 * @param {{onSaved?: () => void}} [options] onSaved: 차량 행의 값이 바뀐 뒤(저장·충돌 반영) 부른다
 */
export function openVehicle(v, options = {}) {
  const head = mk(
    "div",
    null,
    mk("h2", null, v.commission_no, " ", mk("span", { class: `pill ${stageClass(v.current_status)}` }, v.current_status)),
    mk(
      "div",
      { class: "meta" },
      [v.model_classification, v.vehicle, `VIN ${isEmpty(v.vin_no) ? tx("미부여") : v.vin_no}`]
        .filter((x) => !isEmpty(x))
        .join(" · ")
    ),
    mk(
      "div",
      { class: "btn-group drawer-actions" },
      mk(
        "button",
        { class: "btn primary sm", type: "button", id: "drawer-save", onclick: () => save(v, readInputs(), options) },
        tx("저장")
      )
    )
  );
  const groups = GROUPS.filter((group) => group !== "기본").map((group) =>
    card(tx(group), mk("div", { class: "fields" }, groupColumns(group).map((column) => field(column, v))))
  );
  openDrawer(head, [card(tx("마일스톤 타임라인"), timeline(v)), basicCard(v), ...groups, historyCard(v)], {
    beforeClose: () => confirmClose(v, options),
  });
}
