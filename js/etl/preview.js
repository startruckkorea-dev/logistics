// 전처리 1단계 화면 — 읽은 엑셀의 구조를 눈으로 확인한다.
// 시트별 사용 범위와 처음 몇 행을 엑셀과 같은 좌표(열 문자·행 번호)로 보여준다.
import { mk } from "../lib/dom.js";
import { columnLetter } from "./read.js";

const PREVIEW_ROWS = 20;

const isHidden = (sheet) => sheet.visibility && sheet.visibility !== "Visible";

// 가공 규칙을 정할 때 붙여 쓰기 좋은 요약. 데이터 행은 넣지 않고 1행(헤더로 보이는 행)만 넣는다.
function buildSummary(fileName, workbook) {
  const lines = [`파일: ${fileName}`];
  workbook.sheets.forEach((sheet, i) => {
    lines.push(
      "",
      `시트 ${i + 1}: ${sheet.name}${isHidden(sheet) ? " (숨김)" : ""}` +
        ` | 범위 ${sheet.address} | ${sheet.rowCount}행 × ${sheet.columnCount}열`
    );
    const first = sheet.text[0] ?? [];
    lines.push(
      `  ${sheet.firstRow}행: ` +
        first
          .map((cell, c) => `${columnLetter(sheet.firstColumn + c)}=${cell}`)
          .join(" | ")
    );
  });
  return lines.join("\n");
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
      "시트별 범위와 첫 행만 담은 요약입니다. 데이터 행은 들어 있지 않습니다."
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
      `범위 ${sheet.address} · ${sheet.rowCount}행 × ${sheet.columnCount}열 · 처음 ${shown}행 표시`
    ),
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
