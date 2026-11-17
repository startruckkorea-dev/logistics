// 전처리 1단계 — 엑셀 읽기.
// 파일을 내려받지 않고 Graph Workbook API 로 시트의 사용 범위를 읽는다(라이브러리 불필요).
// .xlsx 만 지원한다(.xls 는 Workbook API 가 열지 못한다).
import { gfetch } from "../lib/graph.js";
import { getDriveId } from "../lib/sharepoint.js";

export const isExcelFile = (item) =>
  Boolean(item.file) && /\.xlsx$/i.test(item.name);

// 열 번호(0부터) → 엑셀 열 문자. 0 → A, 26 → AA
export function columnLetter(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// "Sheet1!C3:AQ2062" → { address: "C3:AQ2062", firstRow: 3, firstColumn: 2 }
function parseAddress(fullAddress) {
  const address = String(fullAddress ?? "").split("!").pop();
  const match = /^\$?([A-Z]+)\$?(\d+)/.exec(address);
  if (!match) return { address, firstRow: 1, firstColumn: 0 };
  let column = 0;
  for (const ch of match[1]) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { address, firstRow: Number(match[2]), firstColumn: column - 1 };
}

/**
 * 통합 문서의 모든 시트를 읽는다.
 * @param {string} itemId 문서 라이브러리 항목 ID
 * @returns {Promise<{sheets: Array<{
 *   name: string, visibility: string, address: string,
 *   firstRow: number, firstColumn: number, rowCount: number, columnCount: number,
 *   values: any[][],  // 원시 값 (날짜는 엑셀 일련번호)
 *   text: string[][], // 엑셀에 표시되는 문자열
 * }>}>}
 */
export async function readWorkbook(itemId) {
  const base = `/drives/${await getDriveId()}/items/${itemId}/workbook`;

  // 세션을 열어 두면 뒤따르는 호출이 빨라진다. 읽기만 하므로 변경은 저장하지 않는다.
  const session = await gfetch(`${base}/createSession`, {
    method: "POST",
    body: { persistChanges: false },
    name: "workbook.createSession",
  });
  const headers = { "workbook-session-id": session.id };

  try {
    const list = await gfetch(
      `${base}/worksheets?$select=id,name,position,visibility`,
      { headers, name: "workbook.worksheets" }
    );
    const worksheets = (list.value ?? []).sort((a, b) => a.position - b.position);

    const sheets = [];
    for (const ws of worksheets) {
      // valuesOnly=true : 서식만 있고 값이 없는 칸은 사용 범위에서 뺀다.
      const range = await gfetch(
        `${base}/worksheets/${encodeURIComponent(ws.id)}/usedRange(valuesOnly=true)` +
          "?$select=address,rowCount,columnCount,values,text",
        { headers, name: "workbook.usedRange" }
      );
      sheets.push({
        name: ws.name,
        visibility: ws.visibility,
        ...parseAddress(range.address),
        rowCount: range.rowCount ?? 0,
        columnCount: range.columnCount ?? 0,
        values: range.values ?? [],
        text: range.text ?? [],
      });
    }
    return { sheets };
  } finally {
    // 세션 정리는 실패해도 결과에 영향이 없다(서버가 시간 초과로 닫는다).
    gfetch(`${base}/closeSession`, {
      method: "POST",
      headers,
      name: "workbook.closeSession",
    }).catch(() => {});
  }
}
