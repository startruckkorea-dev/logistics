// KUFRI 생산판매계획 — 차량 데이터에서 월별 생산 · 입항 · 판매 · 재고를 계산해 매트릭스로 보여 준다(조회).
// 계산은 domain/kufri.js, 차량 → 모델 행은 data/kufri-source.js, 표는 kufri-matrix.js. 기준값(마스터·설정)이 있어야 연다.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { baseDate } from "../app/base-date.js";
import { loadVehicles } from "../data/vehicles.js";
import { loadModelMaster } from "../data/masters.js";
import { loadSettings, checkSettings, settingsFileName } from "../data/settings-store.js";
import { buildKufri, cellVehicles } from "../data/kufri-source.js";
import { stageClass } from "../data/columns.js";
import { num } from "../app/charts.js";
import { matrixTable, ROWS } from "./kufri-matrix.js";

// 화면 상태. 다른 화면에 다녀와도 유지한다.
//   year: 보여 줄 첫 해(그 해와 다음 해), vehicle: 차종 필터("" = 전체), q: 모델 검색,
//   inactive: 표의 기간에 움직임이 없는 모델도 보인다, open: 펼친 행, collapsed: 접은 묶음
const view = { year: "", vehicle: "", q: "", inactive: false, open: { prod: false, arr: false, it: false }, collapsed: new Set() };

const TOTAL_KEY = "__total";
const sectionKey = (vehicle) => `__vehicle|${vehicle}`;
const commLink = (list) => `#/logistics?comm=${list.map((v) => encodeURIComponent(v.commission_no)).join(",")}`;

const NOTE_LABEL = {
  prod: { actual: "실적", fixed: "확정", changeable: "Changeable" },
  arr: { actual: "실제 도착 정보", calc: "생산 + 리드타임 산출" },
  it: { actual: "실적 (Invoice)", calc: "산출" },
};

// 칸의 차량 목록 창
function openCell(model, group, rowId, month) {
  const items = cellVehicles(group, rowId, month, model.planFrom);
  const row = ROWS.find((r) => r.id === rowId);
  const vehicles = items.map((item) => item.v);
  const copy = mk("button", { class: "btn", type: "button" }, tx("Commission No 복사"));
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(vehicles.map((v) => v.commission_no).join("\n"));
      toast(tx("복사했습니다"), tx("{n}건", { n: num(vehicles.length) }));
    } catch (err) {
      console.error(err);
      toast(tx("복사하지 못했습니다"), "");
    }
  });
  openModal(
    `${group.label} · ${row.label.split(" (")[0]} · ${month}`,
    [
      mk("p", { class: "muted small" }, tx("{n}대", { n: num(items.length) })),
      mk(
        "table",
        { class: "tbl compact" },
        mk(
          "thead",
          null,
          mk("tr", null, mk("th", null, "Commission No"), mk("th", null, "Current Status"), mk("th", null, "MY"), mk("th", null, "PM"), mk("th", null, tx("입항월")), mk("th", null, tx("구분")))
        ),
        mk(
          "tbody",
          null,
          items.map((item) =>
            mk(
              "tr",
              null,
              mk("td", { class: "mono" }, item.v.commission_no),
              mk("td", null, mk("span", { class: `pill ${stageClass(item.v.current_status)}` }, item.v.current_status)),
              mk("td", null, item.v.model_year ?? ""),
              mk("td", { class: "mono" }, item.pm),
              mk("td", { class: "mono" }, item.arrival),
              mk("td", null, item.note ? tx(NOTE_LABEL[rowId]?.[item.note] ?? item.note) : "")
            )
          )
        )
      ),
    ],
    [
      copy,
      mk("a", { class: "btn primary", href: commLink(vehicles), onclick: closeModal }, tx("Logistics 에서 보기")),
      mk("button", { class: "btn", type: "button", onclick: closeModal }, tx("닫기")),
    ]
  );
}

// Rejected 구역: 계산에 넣지 않는 차량을 모델 × PM 월로 보여 준다
function rejectedCard(model) {
  const months = [...new Set(model.rejected.flatMap((group) => Object.keys(group.byMonth)))].sort();
  const hasNoPm = model.rejected.some((group) => group.noPm.length);
  const total = model.rejected.reduce((n, group) => n + group.count, 0);
  const cell = (list) => (list?.length ? mk("td", { class: "num lnk", "data-href": commLink(list) }, num(list.length)) : mk("td", { class: "num muted" }, "·"));
  return mk(
    "div",
    { class: "card" },
    mk(
      "div",
      { class: "card-h" },
      mk("h2", null, "Rejected"),
      mk("span", { class: "desc" }, tx("위 표의 계산에 넣지 않는 차량 · 모델 × PM 월 · {n}대 · 칸 클릭 → Logistics 목록", { n: num(total) }))
    ),
    total
      ? mk(
          "div",
          { class: "tbl-wrap" },
          mk(
            "table",
            { class: "tbl compact" },
            mk(
              "thead",
              null,
              mk(
                "tr",
                null,
                mk("th", null, "Vehicle"),
                mk("th", null, "Model"),
                months.map((month) => mk("th", { class: "num" }, month)),
                hasNoPm ? mk("th", { class: "num" }, tx("PM 없음")) : null,
                mk("th", { class: "num" }, tx("합계"))
              )
            ),
            mk(
              "tbody",
              null,
              model.rejected.map((group) =>
                mk(
                  "tr",
                  null,
                  mk("td", null, group.vehicle),
                  mk("td", null, group.label),
                  months.map((month) => cell(group.byMonth[month])),
                  hasNoPm ? cell(group.noPm) : null,
                  cell([...Object.values(group.byMonth).flat(), ...group.noPm])
                )
              )
            )
          )
        )
      : mk("p", { class: "muted" }, tx("Rejected 차량이 없습니다."))
  );
}

function legend() {
  const chip = (row) => mk("span", { class: `kp-chip kp-${row.cls}` }, row.label.split(" (")[0]);
  const shown = ROWS.filter((row) => !row.cover);
  return mk(
    "div",
    { class: "kp-legend" },
    mk("div", null, shown.map(chip), mk("span", { class: "kp-chip kp-cov" }, tx("재고월수"))),
    mk(
      "ul",
      null,
      mk("li", null, tx("Production 은 PM 월 기준입니다. 실적 = In Production 이후 상태, 확정 = Ordered(Fixed), Changeable = Ordered(Changeable). Ordered(Dummy) · Cancelled · Rejected 와 PM 이 없는 차량은 세지 않습니다.")),
      mk("li", null, tx("Production 합계: 다음 달까지 = 실적 + 확정 + Changeable, 다다음 달부터 = 실적 + 확정 + 계획. 다다음 달부터의 Changeable 은 계획 값에 포함된 수량이라 참고로만 보여 줍니다.")),
      mk("li", null, tx("Arrival 과 OH Stock 은 입항(ATA) 기준입니다. TSC 입고일이나 Current Status 의 OH Stock(통관 후)과 다릅니다. 입항월 = ATA → ETA 선사 → Pl. arrival, 없으면 PM + 리드타임.")),
      mk("li", null, tx("In Transit(월말): Invoice 가 있는 차량은 Invoice 월부터, 없는 차량과 계획 수량은 생산월 다음 달부터 입항 전 달까지.")),
      mk("li", null, tx("Sales: 전달까지 실적, 당월부터 계획(값이 없으면 기준값의 초기값). OH Stock = 전월 OH + Arrival − Sales. 재고월수 = 재고 ÷ 최근 3개월 평균 Sales."))
    )
  );
}

function build(root, data) {
  const model = buildKufri({ vehicles: data.vehicles, models: data.models, settings: data.settings, today: baseDate() });
  const years = [...new Set(model.months.map((month) => month.slice(0, 4)))];
  if (!years.includes(view.year)) view.year = years.includes(model.current.slice(0, 4)) ? model.current.slice(0, 4) : years[0];
  const vehicles = model.sections.map((section) => section.vehicle);
  if (!vehicles.includes(view.vehicle)) view.vehicle = "";
  const box = mk("div", { class: "kp" });
  let showLegend = false;

  const draw = () => {
    const nextYear = String(Number(view.year) + 1);
    const months = model.months.filter((month) => month.startsWith(view.year) || month.startsWith(nextYear));
    const term = view.q.trim().toLowerCase();
    const match = (group) => (view.inactive || group.active) && (!term || `${group.label} ${group.gen}`.toLowerCase().includes(term));
    const cards = [{ key: TOTAL_KEY, title: tx("전체 합계"), meta: tx("모델 {n}개", { n: num(model.groups.length) }), result: model.total, drill: false }];
    let shownModels = 0;
    for (const section of model.sections) {
      if (view.vehicle && section.vehicle !== view.vehicle) continue;
      const own = section.groups.filter(match);
      cards.push({
        key: sectionKey(section.vehicle),
        title: tx("{v} 합계", { v: section.vehicle || tx("(차종 없음)") }),
        meta: tx("모델 {n}개", { n: num(section.groups.length) }),
        result: section.total,
        drill: false,
      });
      for (const group of own) {
        shownModels++;
        cards.push({
          key: group.key,
          title: group.label || tx("(모델 없음)"),
          meta: [group.gen, tx("리드타임 {n}개월", { n: group.lead }) + (group.leadYear ? ` (MY ${group.leadYear})` : ""), tx("차량 {n}대", { n: num(group.inputs.length) })]
            .filter(Boolean)
            .join(" · "),
          result: group.result,
          drill: true,
        });
      }
    }

    const tab = (label, active, onclick) => mk("button", { class: `kp-tab${active ? " on" : ""}`, type: "button", onclick }, label);
    const search = mk("input", { class: "st-search", placeholder: tx("모델 검색"), value: view.q });
    search.addEventListener("input", () => {
      view.q = search.value;
      draw();
      // 다시 그린 뒤에도 이어서 입력할 수 있게 한다
      const again = box.querySelector(".st-search");
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    });
    const inactive = mk("input", { type: "checkbox" });
    inactive.checked = view.inactive;
    inactive.addEventListener("change", () => {
      view.inactive = inactive.checked;
      draw();
    });
    const loaded = data.loadedAt instanceof Date ? data.loadedAt.toLocaleTimeString() : "";

    box.replaceChildren(
      mk(
        "div",
        { class: "card" },
        mk(
          "div",
          { class: "card-h" },
          mk("h2", null, tx("KUFRI 생산판매계획")),
          mk("span", { class: "desc" }, tx("당월 {m} · 차량 데이터에서 계산한 값입니다(계획 입력은 아직 없습니다)", { m: model.current })),
          mk("span", { class: "spacer" }),
          mk("span", { class: "muted small" }, loaded ? tx("List 를 읽은 시각 {t}", { t: loaded }) : ""),
          mk("button", { class: "btn sm", type: "button", onclick: () => load(root, true) }, tx("새로 고침")),
          mk(
            "button",
            {
              class: `btn sm${showLegend ? " primary" : ""}`,
              type: "button",
              onclick: () => {
                showLegend = !showLegend;
                draw();
              },
            },
            tx("범례 · 계산 규칙")
          )
        ),
        showLegend ? legend() : null,
        mk(
          "div",
          { class: "kp-bar" },
          mk("span", { class: "kp-tabs" }, years.map((year) => tab(`${year} ~ ${Number(year) + 1}`, year === view.year, () => { view.year = year; draw(); }))),
          mk(
            "span",
            { class: "kp-tabs" },
            tab(tx("전체"), !view.vehicle, () => { view.vehicle = ""; draw(); }),
            vehicles.map((vehicle) => tab(vehicle || tx("(차종 없음)"), vehicle === view.vehicle, () => { view.vehicle = vehicle; draw(); }))
          ),
          mk("label", { class: "muted small" }, tx("검색"), " ", search),
          mk("label", { class: "muted small" }, inactive, " ", tx("움직임이 없는 모델도 보기")),
          mk("span", { class: "muted small" }, tx("모델 {n}개 표시", { n: num(shownModels) }))
        ),
        matrixTable(model, { months, cards, limits: data.settings, open: view.open, collapsed: view.collapsed }),
        mk(
          "p",
          { class: "muted small kp-foot" },
          tx("계산 대상 차량 중 PM 이 없는 차량 {a}대(Production 에 없음) · 입항월을 정할 수 없는 차량 {b}대(Arrival · In Transit 에 없음).", {
            a: num(model.skipped.noPm),
            b: num(model.skipped.noArrival),
          })
        )
      ),
      rejectedCard(model)
    );
  };

  box.addEventListener("click", (event) => {
    const linked = event.target.closest("td.lnk[data-href]");
    if (linked) {
      window.location.hash = linked.dataset.href;
      return;
    }
    const toggle = event.target.closest("td[data-tog]");
    if (toggle) {
      view.open[toggle.dataset.tog] = !view.open[toggle.dataset.tog];
      draw();
      return;
    }
    const cell = event.target.closest("td.drill");
    if (cell) {
      const group = model.groups.find((g) => g.key === cell.closest("tbody").dataset.key);
      if (group) openCell(model, group, cell.dataset.row, cell.dataset.month);
      return;
    }
    const card = event.target.closest("tr.card-row");
    if (card) {
      const key = card.dataset.card;
      if (view.collapsed.has(key)) view.collapsed.delete(key);
      else view.collapsed.add(key);
      draw();
    }
  });

  root.replaceChildren(box);
  draw();
}

function message(root, text, isError, retry, link) {
  root.replaceChildren(
    mk(
      "div",
      { class: "card notice-card" },
      mk("p", { class: isError ? "error" : null }, text),
      link ? mk("p", null, mk("a", { href: "#/settings?tab=base" }, tx("마스터 · 설정의 기준값 탭 →"))) : null,
      retry ? mk("button", { class: "btn", type: "button", onclick: retry }, tx("다시 시도")) : null
    )
  );
}

async function load(root, refresh) {
  message(root, tx("차량 데이터를 불러오는 중..."));
  const retry = () => load(root, true);
  try {
    const [vehicleData, models, settings] = await Promise.all([loadVehicles({ refresh }), loadModelMaster({ refresh }), loadSettings({ refresh })]);
    if (!root.isConnected) return; // 불러오는 동안 다른 화면으로 옮겨 갔다
    // 기준값이 없거나 형식이 맞지 않으면 계산하지 않는다
    if (settings.missing) {
      message(root, tx("기준값 파일이 없습니다. Modify 폴더에 {f} 파일을 올린 뒤 다시 시도하세요.", { f: settingsFileName() }), true, retry);
      return;
    }
    if (!settings.data || settings.wrongEnv || checkSettings(settings.data).length) {
      message(root, tx("기준값에 형식이 맞지 않는 항목이 있어 계산할 수 없습니다. 기준값 탭에서 확인하세요."), true, retry, true);
      return;
    }
    build(root, { vehicles: vehicleData.vehicles, loadedAt: vehicleData.loadedAt, models, settings: settings.data });
  } catch (err) {
    console.error(err);
    if (!root.isConnected) return;
    message(root, `${tx("차량 데이터를 불러오지 못했습니다.")} ${err.status ?? ""} ${err.message ?? ""}`, true, retry);
  }
}

export const kufriPage = {
  render(root) {
    const box = mk("div");
    root.append(box);
    load(box, false);
  },
};
