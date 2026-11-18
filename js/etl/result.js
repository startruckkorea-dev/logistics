// 전처리 결과 화면 — 사용한 규칙 파일, 규칙별 적용 건수, 결과 표의 열 프로필을 보여준다.
// 복사용 요약과 오류 표시에는 규칙에 적힌 값과 데이터 값을 넣지 않는다.
import { mk } from "../lib/dom.js";
import { profileSheet, describeKinds } from "./profile.js";
import { profileTable, copyBox } from "./preview.js";

const PREVIEW_ROWS = 20;

const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString("ko-KR") : "확인 불가");

// 규칙 파일 정보 한 줄. 화면과 요약에 같이 쓴다.
function rulesLine(info) {
  return [
    `규칙 파일: ${info.name}`,
    `수정 ${formatDateTime(info.lastModified)}`,
    `버전 ${info.version || "확인 불가"}`,
    `환경 ${info.envLabel}`,
  ].join(" | ");
}

const baseDateLine = (result) =>
  `기준일: ${result.baseDate}` +
  (result.baseDateSource === "today" ? " (규칙 파일에 없어 실행한 날을 사용)" : "");

// 결과 표를 열 프로필이 읽는 모양(첫 행 = 헤더)으로 바꾼다.
function asSheet(table) {
  const values = [table.columns, ...table.rows];
  return {
    values,
    text: values.map((row) => row.map((v) => (v == null ? "" : String(v)))),
    columnCount: table.columns.length,
    firstColumn: 0,
  };
}

const describeDetails = (details) =>
  Object.entries(details)
    .map(([label, n]) => `${label} ${n}`)
    .join(" · ");

function buildSummary(info, sourceName, result) {
  const lines = [rulesLine(info), baseDateLine(result), `원본: ${sourceName}`];
  result.tables.forEach((table, i) => {
    lines.push(
      "",
      `결과 ${i + 1}: ${table.name} | 원본 시트 ${table.sheet} | 키 ${table.key}` +
        ` | 데이터 ${table.rows.length}행 × ${table.columns.length}열`,
      "  # | 열 이름 | 채움 | 값 종류 | 고유값 | 최대 길이"
    );
    for (const column of profileSheet(asSheet(table), { isoDates: true })) {
      lines.push(
        "  " +
          [
            column.index + 1,
            column.header,
            `${column.filled}/${table.rows.length}`,
            describeKinds(column),
            `${column.distinct}${column.unique ? " (전부 다름)" : ""}`,
            column.maxLength,
          ].join(" | ")
      );
    }
  });
  lines.push("", "규칙 적용 건수", "  시트 | 규칙 id | 종류 | 적용 | 세부");
  for (const r of result.report) {
    lines.push("  " + [r.sheet, r.id, r.type, r.changed, describeDetails(r.details) || "-"].join(" | "));
  }
  return lines.join("\n");
}

function gridTable(headLabels, bodyRows) {
  return mk(
    "div",
    { class: "grid-wrap" },
    mk(
      "table",
      { class: "grid" },
      mk("thead", null, mk("tr", null, headLabels.map((label) => mk("th", null, label)))),
      mk("tbody", null, bodyRows)
    )
  );
}

function reportTable(report) {
  return gridTable(
    ["시트", "규칙 id", "종류", "적용 건수", "세부"],
    report.map((r) =>
      mk(
        "tr",
        null,
        mk("td", null, r.sheet),
        mk("td", null, r.id),
        mk("td", null, r.type),
        mk("td", null, r.changed),
        mk("td", null, describeDetails(r.details))
      )
    )
  );
}

function tableSection(table) {
  const sheet = asSheet(table);
  const shown = Math.min(PREVIEW_ROWS, table.rows.length);
  return mk(
    "section",
    { class: "sheet" },
    mk("h3", null, table.name),
    mk(
      "p",
      { class: "hint" },
      `원본 시트 ${table.sheet} · 키 ${table.key} · ${table.rows.length}행 × ${table.columns.length}열`
    ),
    mk("h4", null, "열 프로필"),
    profileTable(sheet, { isoDates: true, label: (index) => index + 1 }),
    mk("h4", null, `처음 ${shown}행`),
    gridTable(
      ["#", ...table.columns],
      table.rows.slice(0, shown).map((row, r) =>
        mk(
          "tr",
          null,
          mk("th", { class: "rownum" }, r + 1),
          row.map((v) => mk("td", null, v == null ? "" : String(v)))
        )
      )
    )
  );
}

function header(container, info) {
  container.replaceChildren(
    mk("h2", null, "전처리 결과"),
    mk("p", { class: "hint" }, rulesLine(info))
  );
  container.hidden = false;
}

/** 규칙 파일의 형식 오류. errors = validateRules 의 결과 */
export function renderRuleErrors(container, info, errors) {
  header(container, info);
  container.append(
    mk("p", { class: "error" }, `규칙 파일에 형식 오류가 ${errors.length}건 있어 실행하지 않았습니다.`),
    gridTable(
      ["위치", "항목", "내용"],
      errors.map((e) =>
        mk("tr", null, mk("td", null, e.where), mk("td", null, e.item), mk("td", null, e.message))
      )
    )
  );
}

/** 규칙 실행 중 오류. error = RuleError */
export function renderRunError(container, info, error) {
  header(container, info);
  const rows =
    error.rowCount > 0
      ? `해당 행 ${error.rowCount}건 (엑셀 행 번호: ${error.rows.join(", ")}${
          error.rowCount > error.rows.length ? " …" : ""
        })`
      : "";
  container.append(
    mk("p", { class: "error" }, "규칙 실행 중 오류가 나서 중단했습니다. 결과는 만들어지지 않았습니다."),
    gridTable(
      ["시트", "규칙 id", "내용", "행"],
      [
        mk(
          "tr",
          null,
          mk("td", null, error.sheet ?? ""),
          mk("td", null, error.ruleId ?? "-"),
          mk("td", null, error.message),
          mk("td", null, rows)
        ),
      ]
    )
  );
}

/**
 * @param {HTMLElement} container
 * @param {{name, lastModified, version, envLabel}} info 사용한 규칙 파일
 * @param {string} sourceName 원본 엑셀 파일 이름
 * @param {object} result runRules 의 결과
 */
export function renderResult(container, info, sourceName, result) {
  header(container, info);
  container.append(
    mk("p", { class: "hint" }, `${baseDateLine(result)} · 원본 ${sourceName}`),
    copyBox(
      buildSummary(info, sourceName, result),
      "규칙 파일 정보, 결과 표의 열별 통계, 규칙별 적용 건수만 담은 요약입니다. 데이터 값과 규칙에 적힌 값은 들어 있지 않습니다.",
      "전처리 결과 요약"
    ),
    mk("h3", null, "규칙 적용 건수"),
    reportTable(result.report),
    ...result.tables.map(tableSection)
  );
}
