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

/**
 * 표 하나를 엑셀 파일로 내려받는다.
 * @param {string} fileName ".xlsx" 로 끝나는 이름
 * @param {string} sheetName
 * @param {any[][]} rows 첫 줄이 머리글
 */
export async function downloadXlsx(fileName, sheetName, rows) {
  const XLSX = await loadLibrary();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
  XLSX.writeFile(book, fileName, { bookType: "xlsx" });
}
