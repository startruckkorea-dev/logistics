// KUFRI 생산판매계획 — 차량 데이터에서 월별 생산 · 입항 · 판매 · 재고를 계산해 매트릭스로 보여 준다(조회).
// 계산은 domain/kufri.js, 차량 → 모델 행은 data/kufri-source.js, 표는 kufri-matrix.js. 기준값(마스터·설정)이 있어야 연다.
import { mk, cssZoom } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { openModal, closeModal, toast } from "../app/ui.js";
import { baseDate } from "../app/base-date.js";
import { loadVehicles } from "../data/vehicles.js";
import { loadModelMaster } from "../data/masters.js";
import { loadSettings, checkSettings, settingsFileName } from "../data/settings-store.js";
import { buildKufri, cellVehicles } from "../data/kufri-source.js";
import { stageClass } from "../data/columns.js";
import { num } from "../app/charts.js";
import { matrixTable, modelBody, itemBody, ROWS, EXPANDABLE } from "./kufri-matrix.js";

// 화면 상태. 다른 화면에 다녀와도 유지한다.
//   layout: 보기(model = 모델별, item = 항목별), year: 보여 줄 첫 해(그 해와 다음 해), vehicle: 차종 필터("" = 전체), q: 모델 검색,
//   inactive: 보이는 기간에 생산·판매가 없는 모델도 보인다, open: 펼친 세부 행(두 보기가 같이 쓴다), collapsed: 접은 묶음
const view = { layout: "model", year: "", vehicle: "", q: "", inactive: false, open: {}, collapsed: new Set() };

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
  const items = cellVehicles(group, rowId, month, model.planFrom, model.current);
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
      mk("li", null, tx("Arrival 과 OH Stock 은 입항(ATA) 기준입니다. TSC 입고일이나 Current Status 의 OH Stock(통관 후)과 다릅니다. 입항월 = ATA → ETA 선사 → Pl. arrival(실제 도착 정보), 없으면 ETA From TDD → PM + 리드타임(산출).")),
      mk("li", null, tx("In Transit(월말): Invoice 가 있는 차량은 Invoice 월부터(실적), 없는 차량과 계획 수량은 생산월 다음 달부터(산출) 입항 전 달까지. Invoice 가 없는 차량은 기준값이 정한 달까지 Shipping 월을 Invoice 월로 봅니다.")),
      mk("li", null, tx("Sales: 전달까지 실적, 당월부터 계획(값이 없으면 기준값의 초기값). OH Stock = 전월 OH + Arrival − Sales. 재고월수 = 재고 ÷ 최근 3개월 평균 Sales.")),
      mk("li", null, tx("지난 달에는 실적만 남깁니다. Invoice 가 없는 차량의 In Transit 과, 아직 들어오지 않은 차량의 추정 입항월이 지난 달이면 당월로 넘깁니다.")),
      mk("li", null, tx("OH Stock 의 실적 = 지난 달 말에 실제 도착 정보가 있고 판매되지 않은 차량. 지난 달의 산출에 값이 남으면 입항 정보가 없는 차량이 있다는 뜻입니다. 당월부터는 전부 산출입니다."))
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

  // 다시 그려도 표와 화면의 스크롤 위치를 그대로 둔다. toTop = 보기 · 연도 · 차종을 바꿔 표의 내용이 달라질 때는 표를 맨 위로
  const draw = (toTop) => {
    const before = box.querySelector(".kp-wrap");
    const keep = { top: toTop ? 0 : before?.scrollTop ?? 0, left: before?.scrollLeft ?? 0, x: window.scrollX, y: window.scrollY };
    const nextYear = String(Number(view.year) + 1);
    const months = model.months.filter((month) => month.startsWith(view.year) || month.startsWith(nextYear));
    const term = view.q.trim().toLowerCase();
    // 보이는 기간(고른 두 해)에 Production 과 Sales 가 모두 0 인 모델은 숨긴다. 합계에는 숨긴 모델도 들어 있다
    const shownIndexes = months.map((month) => model.months.indexOf(month));
    const live = (group) => group.active && shownIndexes.some((i) => group.result.prod[i] || group.result.sales[i]);
    const found = (group) => !term || `${group.label} ${group.gen}`.toLowerCase().includes(term);
    const match = (group) => (view.inactive || live(group)) && found(group);
    let hiddenModels = 0;
    const cards = [{ key: TOTAL_KEY, title: tx("전체 합계"), meta: tx("모델 {n}개", { n: num(model.groups.length) }), result: model.total, drill: false }];
    let shownModels = 0;
    for (const section of model.sections) {
      if (view.vehicle && section.vehicle !== view.vehicle) continue;
      const own = section.groups.filter(match);
      hiddenModels += section.groups.filter((group) => found(group) && !live(group)).length;
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

    // 묶음: 모델별 보기는 합계 · 모델마다, 항목별 보기는 행(Production 등)마다
    const bodies =
      view.layout === "item"
        ? ROWS.map((row) =>
            itemBody(
              row,
              cards.map((card) => ({ label: card.title, result: card.result, group: card.drill ? card.key : undefined, strong: !card.drill })),
              view.open
            )
          )
        : cards.map((card) => modelBody(card, view.open));
    const setCollapsed = (on) => {
      const anchor = firstVisible();
      for (const body of bodies) {
        if (on) view.collapsed.add(body.key);
        else view.collapsed.delete(body.key);
      }
      drawKeeping(anchor);
    };
    const setOpen = (on) => {
      const anchor = firstVisible();
      for (const id of EXPANDABLE) view.open[id] = on;
      drawKeeping(anchor);
    };
    // 항목별 보기의 바로 가기: 그 행의 묶음이 표의 맨 위에 오게 한다
    const jump = (key) => {
      if (view.collapsed.has(key)) {
        view.collapsed.delete(key);
        draw();
      }
      const wrap = box.querySelector(".kp-wrap");
      const target = [...wrap.querySelectorAll("tr.card-row")].find((tr) => tr.dataset.card === key);
      if (target) wrap.scrollTop = target.offsetTop - wrap.querySelector("thead").offsetHeight;
    };

    const tab = (label, active, onclick) => mk("button", { class: `kp-tab${active ? " on" : ""}`, type: "button", onclick }, label);
    const pair = (label, onOpen, onClose) =>
      mk("span", { class: "kp-pair" }, mk("span", { class: "muted small" }, label), mk("span", { class: "kp-tabs" }, tab(tx("모두 펼치기"), false, onOpen), tab(tx("모두 접기"), false, onClose)));
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
          mk(
            "span",
            { class: "kp-tabs" },
            tab(tx("모델별 보기"), view.layout === "model", () => { view.layout = "model"; draw(true); }),
            tab(tx("항목별 보기"), view.layout === "item", () => { view.layout = "item"; draw(true); })
          ),
          mk("span", { class: "kp-tabs" }, years.map((year) => tab(`${year} ~ ${Number(year) + 1}`, year === view.year, () => { view.year = year; draw(true); }))),
          mk(
            "span",
            { class: "kp-tabs" },
            tab(tx("전체"), !view.vehicle, () => { view.vehicle = ""; draw(true); }),
            vehicles.map((vehicle) => tab(vehicle || tx("(차종 없음)"), vehicle === view.vehicle, () => { view.vehicle = vehicle; draw(true); }))
          ),
          mk("label", { class: "muted small" }, tx("검색"), " ", search),
          mk(
            "label",
            { class: "muted small", title: tx("보이는 기간에 Production 과 Sales 가 모두 0 인 모델입니다. 숨겨도 합계에는 들어 있습니다.") },
            inactive,
            " ",
            tx("생산·판매 계획 없는 모델 표시"),
            hiddenModels && !view.inactive ? ` ${tx("(숨김 {n})", { n: num(hiddenModels) })}` : ""
          ),
          mk("span", { class: "muted small" }, tx("모델 {n}개 표시", { n: num(shownModels) }))
        ),
        mk(
          "div",
          { class: "kp-bar" },
          pair(tx("묶음"), () => setCollapsed(false), () => setCollapsed(true)),
          pair(tx("세부 행"), () => setOpen(true), () => setOpen(false)),
          view.layout === "item"
            ? mk(
                "span",
                { class: "kp-pair" },
                mk("span", { class: "muted small" }, tx("바로 가기")),
                ROWS.map((row) => mk("button", { class: `kp-chip kp-jump kp-${row.cls}`, type: "button", onclick: () => jump(`__item|${row.id}`) }, tx(row.label).split(" (")[0]))
              )
            : null
        ),
        matrixTable(model, { months, bodies, limits: data.settings, collapsed: view.collapsed }),
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
    const wrap = box.querySelector(".kp-wrap");
    wrap.scrollTop = keep.top;
    wrap.scrollLeft = keep.left;
    window.scrollTo(keep.x, keep.y);
  };

  // ---- 펼치거나 접을 때 기준 줄을 화면의 같은 자리에 둔다 ----
  // 위쪽 묶음의 줄 수가 달라지면 스크롤 값이 같아도 보던 줄이 밀려난다. 그래서 기준 줄(누른 줄, 버튼이면 표에서 맨 위에 보이는 줄)이
  // 다시 그린 뒤에도 같은 높이에 오도록 표의 스크롤을 맞춘다.
  // 줄을 가리키는 값: 묶음의 key + 그 묶음 안에서 몇 번째 값 줄인지(펼침 행은 세지 않는다. 제목 줄은 -1)
  const describe = (tr) => {
    const tbody = tr.closest("tbody");
    return {
      card: tbody.querySelector("tr.card-row").dataset.card,
      index: [...tbody.querySelectorAll("tr.kp-row")].indexOf(tr),
      top: tr.getBoundingClientRect().top,
    };
  };
  const locate = (anchor) => {
    const title = [...box.querySelectorAll("tr.card-row")].find((tr) => tr.dataset.card === anchor.card);
    if (!title) return null;
    // 묶음이 접혀 값 줄이 없으면 제목 줄을 기준으로 삼는다
    return (anchor.index >= 0 && title.closest("tbody").querySelectorAll("tr.kp-row")[anchor.index]) || title;
  };
  // 표에서 머리글 바로 아래에 보이는 첫 줄
  const firstVisible = () => {
    const wrap = box.querySelector(".kp-wrap");
    if (!wrap) return null;
    const limit = wrap.getBoundingClientRect().top + wrap.querySelector("thead").offsetHeight;
    const tr = [...wrap.querySelectorAll("tr.card-row, tr.kp-row")].find((row) => row.getBoundingClientRect().bottom > limit + 1);
    return tr ? describe(tr) : null;
  };
  function drawKeeping(anchor) {
    draw();
    const now = anchor && locate(anchor);
    if (!now) return;
    const wrap = box.querySelector(".kp-wrap");
    // 줄의 위치는 창 좌표, 스크롤 값은 배율(CSS zoom)이 걸리기 전의 값이라 배율로 나눠 맞춘다
    const zoom = cssZoom(wrap) || 1;
    wrap.scrollTop += (now.getBoundingClientRect().top - anchor.top) / zoom;
    // 표의 스크롤만으로 다 맞추지 못하면(표의 맨 위나 맨 아래) 화면을 움직여 맞춘다
    const rest = now.getBoundingClientRect().top - anchor.top;
    if (Math.abs(rest) > 1) window.scrollBy(0, rest);
  }

  box.addEventListener("click", (event) => {
    const linked = event.target.closest("td.lnk[data-href]");
    if (linked) {
      window.location.hash = linked.dataset.href;
      return;
    }
    const toggle = event.target.closest("td[data-tog]");
    if (toggle) {
      const anchor = describe(toggle.closest("tr"));
      view.open[toggle.dataset.tog] = !view.open[toggle.dataset.tog];
      drawKeeping(anchor);
      return;
    }
    const cell = event.target.closest("td.drill");
    if (cell) {
      const group = model.groups.find((g) => g.key === cell.closest("tr").dataset.key);
      if (group) openCell(model, group, cell.dataset.row, cell.dataset.month);
      return;
    }
    const card = event.target.closest("tr.card-row");
    if (card) {
      const key = card.dataset.card;
      const anchor = describe(card);
      if (view.collapsed.has(key)) view.collapsed.delete(key);
      else view.collapsed.add(key);
      drawKeeping(anchor);
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
