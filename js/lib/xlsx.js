// 엑셀(.xlsx) 파일을 브라우저에서 읽고 쓴다 — SheetJS(js/vendor/xlsx.mini.min.js) 를 감싼다.
// 라이브러리는 처음 쓸 때 한 번만 불러온다(엑셀을 다루지 않는 화면은 내려받지 않는다).
// 파일은 이 PC 의 브라우저 안에서만 읽고, 어디에도 올리지 않는다.
import { mk } from "./dom.js";
import { serialToIsoDate } from "../domain/dates.js";

const LIBRARY = "js/vendor/xlsx.mini.min.js";
/** 읽을 수 있는 파일 크기 한도 */
export const XLSX_MAX_BYTES = 20 * 1024 * 1024;

let libraryPromise;
function loadLibrary() {
  libraryPromise ??= new Promise((resolve, reject) => {
    if (window.XLSX?.read) {
      resolve(window.XLSX);
      return;
    }
    const script = mk("script", { src: LIBRARY });
    script.addEventListener("load", () =>
      window.XLSX?.read ? resolve(window.XLSX) : reject(new Error("xlsx_library"))
    );
    script.addEventListener("error", () => reject(new Error("xlsx_library")));
    document.head.append(script);
  }).catch((err) => {
    libraryPromise = undefined; // 다음에 다시 시도할 수 있게
    throw err;
  });
  return libraryPromise;
}

export const isXlsxName = (name) => /\.xlsx$/i.test(String(name ?? ""));

/**
 * 사용자가 고른 엑셀 파일을 읽는다.
 * @param {File} file
 * @returns {Promise<{sheets: Array<{
 *   name: string,
 *   firstRow: number,   // values[0] 의 엑셀 행 번호(1부터)
 *   values: any[][],    // 칸의 값. 날짜 서식인 숫자 칸은 "YYYY-MM-DD" 로 바꿔 준다. 빈 칸은 ""
 *   text: string[][],   // 엑셀에 표시되는 글자. 빈 칸은 ""
 * }>}>}
 *   오류는 Error(code): not_xlsx | too_large | xlsx_library | unreadable
 */
export async function readXlsxFile(file) {
  if (!isXlsxName(file?.name)) throw new Error("not_xlsx");
  if (file.size > XLSX_MAX_BYTES) throw new Error("too_large");
  const XLSX = await loadLibrary();

  let book;
  try {
    book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellNF: true, cellDates: false });
  } catch {
    throw new Error("unreadable");
  }

  const sheets = book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const values = [];
    const text = [];
    if (!sheet["!ref"]) return { name, firstRow: 1, values, text };
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const valueRow = [];
      const textRow = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v == null) {
          valueRow.push("");
          textRow.push("");
          continue;
        }
        const isDate = cell.t === "n" && XLSX.SSF.is_date(String(cell.z ?? ""));
        valueRow.push(isDate ? serialToIsoDate(cell.v) ?? "" : cell.v);
        textRow.push(String(cell.w ?? cell.v));
      }
      values.push(valueRow);
      text.push(textRow);
    }
    return { name, firstRow: range.s.r + 1, values, text };
  });
  return { sheets };
}

// 글자 수로 본 표시 너비. 한글·한자 등 전각 글자는 두 칸으로 센다
const displayWidth = (value) =>
  [...String(value ?? "")].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e7f ? 2 : 1), 0);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_FORMAT = "yyyy-mm-dd";
// "YYYY-MM-DD" → 엑셀 날짜 일련번호
const isoToSerial = (iso) => {
  const m = ISO_DATE.exec(iso);
  return m ? Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000) : null;
};

/**
 * 표 하나를 엑셀 파일로 내려받는다. 열 너비는 머리글과 값이 잘리지 않게 맞춘다.
 * @param {string} fileName ".xlsx" 로 끝나는 이름
 * @param {string} sheetName
 * @param {any[][]} rows 첫 줄이 머리글. 글자로 넘긴 값은 글자 칸이 된다(앞자리 0 이 지워지지 않는다)
 * @param {{dateColumns?: number[]}} [options] dateColumns: "YYYY-MM-DD" 값을 엑셀 날짜 칸으로 넣을 열(0부터)
 */
export async function downloadXlsx(fileName, sheetName, rows, options = {}) {
  const XLSX = await loadLibrary();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const c of options.dateColumns ?? []) {
    for (let r = 1; r < rows.length; r++) {
      const serial = isoToSerial(String(rows[r][c] ?? ""));
      if (serial != null) sheet[XLSX.utils.encode_cell({ r, c })] = { t: "n", v: serial, z: DATE_FORMAT };
    }
  }
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  sheet["!cols"] = Array.from({ length: columnCount }, (_, c) => ({
    wch: Math.min(60, Math.max(8, ...rows.map((row) => displayWidth(row[c]))) + 2),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, fileName, { bookType: "xlsx" });
}
