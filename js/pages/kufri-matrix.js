// KUFRI 생산판매계획의 매트릭스 — 전체 합계 · 차종 합계 · 모델마다 한 묶음(행 9종), 열은 월.
// 값만 그린다. 계산은 domain/kufri.js, 화면의 조건(연도 · 차종 · 검색)은 kufri.js 가 정한다.
import { mk } from "../lib/dom.js";
import { tx } from "../app/i18n.js";
import { coverageLevel } from "../domain/kufri.js";
import { num } from "../app/charts.js";

// 행 정의. key = 계산 결과의 배열 이름, cls = 행 색(css/kufri.css), flow = 연간 열에 합계를 낸다(아니면 연말 값),
// drill = 칸을 누르면 차량 목록(past = 실적인 달만), subs = 펼침 행
export const ROWS = [
  {
    id: "prod", cls: "prod", label: "Production", key: "prod", flow: true, drill: true,
    subs: [["prodActual", "실적"], ["prodFixed", "확정"], ["prodChangeable", "Changeable"], ["prodPlan", "계획"]],
  },
  { id: "invoice", cls: "inv", label: "Invoice", key: "invoice", flow: true, drill: true },
  { id: "arr", cls: "arr", label: "Arrival", key: "arr", flow: true, drill: true, subs: [["arrActual", "실제 도착 정보"], ["arrCalc", "생산 + 리드타임 산출"]] },
  { id: "sales", cls: "sal", label: "Sales", key: "sales", flow: true, drill: "past" },
  { id: "oh", cls: "oh", label: "OH Stock (월말 · 입항일 기준)", key: "oh" },
  { id: "it", cls: "it", label: "In Transit (월말)", key: "it", drill: true, subs: [["itActual", "실적 (Invoice)"], ["itCalc", "산출"]] },
  { id: "cover", cls: "cov", label: "재고월수 OH", key: "cover", cover: true },
  { id: "coverIT", cls: "cov", label: "재고월수 In Transit", key: "coverIT", cover: true },
  { id: "coverAll", cls: "cov", label: "전체 재고월수", key: "coverAll", cover: true },
];

const monthLabel = (month) => `${Number(month.slice(5))}`;

/**
 * @param {object} model buildKufri 의 결과
 * @param {object} options
 * @param {string[]} options.months 보여 줄 달(연도 탭으로 고른 두 해)
 * @param {Array<{key, title, meta?, result, drill: boolean}>} options.cards 보여 줄 묶음(위에서부터)
 * @param {{coverageMin, coverageNormal, coverageWarn}} options.limits 재고월수 등급의 기준값
 * @param {Record<string, boolean>} options.open 펼친 행(prod · arr · it)
 * @param {Set<string>} options.collapsed 접은 묶음의 key
 * @returns {HTMLElement} 표가 든 상자
 */
export function matrixTable(model, options) {
  const { months, cards, limits, open, collapsed } = options;
  const indexOf = Object.fromEntries(model.months.map((month, i) => [month, i]));
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  // 열: 달, 그리고 해마다 마지막 달 뒤에 연간 열
  const columns = [];
  for (const year of years) {
    const own = months.filter((month) => month.startsWith(year));
    for (const month of own) columns.push({ month });
    columns.push({ year, months: own });
  }
  const monthClass = (month) =>
    [month === model.current ? "cur" : "", month >= model.planFrom ? "planz" : "", month.endsWith("-01") ? "jan" : ""].filter(Boolean).join(" ");

  const head = mk(
    "thead",
    null,
    mk(
      "tr",
      null,
      mk("th", { class: "lbl", rowspan: 2 }, tx("항목")),
      years.map((year) => mk("th", { class: "yr-h", colspan: columns.filter((c) => c.month?.startsWith(year)).length + 1 }, year))
    ),
    mk(
      "tr",
      null,
      columns.map((column) =>
        column.month
          ? mk(
              "th",
              {
                class: monthClass(column.month),
                title: column.month === model.current ? tx("당월") : column.month === model.planFrom ? tx("Production 계획 구간이 시작하는 달") : null,
              },
              tx("{m}월", { m: monthLabel(column.month) })
            )
          : mk("th", { class: "yr" }, tx("연간 · 연말"))
      )
    )
  );

  const coverNode = (value) =>
    value == null ? mk("span", { class: "faint" }, "—") : mk("span", { class: `kp-cov ${coverageLevel(value, limits)}` }, value.toFixed(1));
  const valueNode = (value) => (value ? num(value) : mk("span", { class: "faint" }, "·"));

  // 한 행. values = 표 전체 달의 배열
  const dataRow = (row, values, card, sub) => {
    const key = sub ? sub[0] : row.key;
    const isPlanRow = key === "prodPlan";
    const cells = columns.map((column) => {
      if (!column.month) {
        const picked = column.months.map((month) => values[indexOf[month]]);
        if (row.cover) return mk("td", { class: "yr" }, coverNode(picked[picked.length - 1]));
        const value = row.flow ? picked.reduce((a, b) => a + (b || 0), 0) : picked[picked.length - 1];
        return mk("td", { class: `yr${value < 0 ? " neg" : ""}` }, valueNode(value));
      }
      const month = column.month;
      const value = values[indexOf[month]];
      if (row.cover) return mk("td", { class: monthClass(month) }, coverNode(value));
      // 계획 값이 들어가는 칸: Sales 는 당월부터, Production 의 계획 행은 계획 구간
      const planned = (row.id === "sales" && !sub && month >= model.current) || (isPlanRow && month >= model.planFrom);
      // 참고로만 보여 주는 칸: 계획 구간의 Changeable
      const reference = key === "prodChangeable" && month >= model.planFrom;
      const canDrill = card.drill && !sub && value && (row.drill === true || (row.drill === "past" && month < model.current));
      return mk(
        "td",
        {
          class: [monthClass(month), planned ? "plan" : "", reference ? "ref" : "", value < 0 ? "neg" : "", canDrill ? "drill" : ""].filter(Boolean).join(" "),
          "data-row": canDrill ? row.id : null,
          "data-month": canDrill ? month : null,
          title: reference && value ? tx("참고 — 계획 값에 포함된 수량이라 합계에 더하지 않습니다.") : null,
        },
        valueNode(value)
      );
    });
    const label = sub
      ? mk("td", { class: "lbl sub" }, tx(sub[1]))
      : mk(
          "td",
          { class: `lbl kp-${row.cls}${row.subs ? " tog" : ""}`, "data-tog": row.subs ? row.id : null, title: row.subs ? tx("클릭 → 펼치기 / 접기") : null },
          row.subs ? mk("span", { class: "caret" }, open[row.id] ? "▾" : "▸") : null,
          tx(row.label)
        );
    return mk("tr", { class: sub ? "kp-subrow" : `kp-row kp-r-${row.cls}` }, label, cells);
  };

  const bodies = cards.map((card) => {
    const closed = collapsed.has(card.key);
    const title = mk(
      "tr",
      { class: `card-row${card.drill ? "" : " total"}`, "data-card": card.key },
      mk(
        "td",
        { class: "lbl", colspan: columns.length + 1 },
        mk("span", { class: "caret" }, closed ? "▸" : "▾"),
        mk("b", null, card.title),
        card.meta ? mk("span", { class: "meta" }, card.meta) : null
      )
    );
    const rows = closed
      ? []
      : ROWS.flatMap((row) => [
          dataRow(row, card.result[row.key], card),
          ...(row.subs && open[row.id] ? row.subs.map((sub) => dataRow(row, card.result[sub[0]], card, sub)) : []),
        ]);
    return mk("tbody", { "data-key": card.drill ? card.key : null }, title, rows);
  });

  return mk("div", { class: "kp-wrap" }, mk("table", { class: "kp-tbl" }, head, bodies));
}
