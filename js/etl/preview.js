// 전처리 1단계 화면 — 읽은 엑셀의 구조를 눈으로 확인한다.
// 시트별 사용 범위와 처음 몇 행을 엑셀과 같은 좌표(열 문자·행 번호)로 보여준다.
import { mk } from "../lib/dom.js";
import { columnLetter } from "./read.js";
import { profileSheet, describeKinds } from "./profile.js";

const PREVIEW_ROWS = 20;

const isHidden = (sheet) => sheet.visibility && sheet.visibility !== "Visible";

const dataRowCount = (sheet) => Math.max(0, sheet.values.length - 1);

// 가공 규칙을 정할 때 붙여 쓰기 좋은 요약.
// 헤더(1행)와 열별 통계만 넣고 데이터 값은 넣지 않는다.
function buildSummary(fileName, workbook) {
  const lines = [`파일: ${fileName}`];
  workbook.sheets.forEach((sheet, i) => {
    const rows = dataRowCount(sheet);
    lines.push(
      "",
      `시트 ${i + 1}: ${sheet.name}${isHidden(sheet) ? " (숨김)" : ""}` +
        ` | 범위 ${sheet.address} | 데이터 ${rows}행 × ${sheet.columnCount}열`,
      "  열 | 헤더 | 채움 | 값 종류 | 고유값 | 최대 길이"
    );
    for (const column of profileSheet(sheet)) {
      lines.push(
        "  " +
          [
            columnLetter(sheet.firstColumn + column.index),
            column.header || "(헤더 없음)",
            `${column.filled}/${rows}`,
            describeKinds(column),
            `${column.distinct}${column.unique ? " (전부 다름)" : ""}`,
            column.maxLength,
          ].join(" | ")
      );
    }
  });
  return lines.join("\n");
}

function profileTable(sheet) {
  const rows = dataRowCount(sheet);
  const head = mk(
    "tr",
    null,
    ["열", "헤더", "채움", "값 종류", "고유값", "최대 길이"].map((label) =>
      mk("th", null, label)
    )
  );
  const body = profileSheet(sheet).map((column) =>
    mk(
      "tr",
      null,
      mk("th", { class: "rownum" }, columnLetter(sheet.firstColumn + column.index)),
      mk("td", null, column.header || "(헤더 없음)"),
      mk("td", null, `${column.filled}/${rows}`),
      mk("td", null, describeKinds(column)),
      mk("td", null, column.distinct, column.unique ? " (전부 다름)" : ""),
      mk("td", null, column.maxLength)
    )
  );
  return mk(
    "div",
    { class: "grid-wrap" },
    mk("table", { class: "grid" }, mk("thead", null, head), mk("tbody", null, body))
  );
}

function summaryBox(fileName, workbook) {
  const textarea = mk(
    "textarea",
    { class: "summary", readonly: true, rows: "8", "aria-label": "엑셀 구조 요약" },
    buildSummary(fileName, workbook)
  );
  const button = mk("button", { type: "button" }, "구조 요약 복사");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      button.textContent = "복사됨";
    } catch {
      // 클립보드 권한이 없으면 직접 복사할 수 있게 전체 선택만 해 둔다.
      textarea.focus();
      textarea.select();
    }
  });
  return mk(
    "div",
    { class: "summary-box" },
    mk(
      "p",
      { class: "hint" },
      "시트별 범위, 헤더, 열별 통계만 담은 요약입니다. 데이터 값은 들어 있지 않습니다."
    ),
    textarea,
    button
  );
}

function sheetSection(sheet) {
  const shown = Math.min(PREVIEW_ROWS, sheet.text.length);
  const columns = Array.from({ length: sheet.columnCount }, (_, c) =>
    columnLetter(sheet.firstColumn + c)
  );

  const head = mk(
    "tr",
    null,
    mk("th", { class: "corner" }),
    columns.map((letter) => mk("th", null, letter))
  );
  const body = sheet.text.slice(0, shown).map((row, r) =>
    mk(
      "tr",
      null,
      mk("th", { class: "rownum" }, sheet.firstRow + r),
      columns.map((_, c) => mk("td", null, row[c] ?? ""))
    )
  );

  return mk(
    "section",
    { class: "sheet" },
    mk("h3", null, sheet.name, isHidden(sheet) ? " (숨김)" : ""),
    mk(
      "p",
      { class: "hint" },
      `범위 ${sheet.address} · ${sheet.rowCount}행 × ${sheet.columnCount}열`
    ),
    mk("h4", null, "열 프로필 (1행을 헤더로 봄)"),
    profileTable(sheet),
    mk("h4", null, `처음 ${shown}행`),
    mk(
      "div",
      { class: "grid-wrap" },
      mk("table", { class: "grid" }, mk("thead", null, head), mk("tbody", null, body))
    )
  );
}

export function renderPreview(container, fileName, workbook) {
  container.replaceChildren(
    mk("h2", null, `${fileName} — 시트 ${workbook.sheets.length}개`),
    summaryBox(fileName, workbook),
    ...workbook.sheets.map(sheetSection)
  );
  container.hidden = false;
}
