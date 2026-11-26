// 월말 마감 — 마감한 순간의 재고(Bonded Stock · OH Stock)를 파일로 남기고 다시 읽는다.
//   달마다 두 파일: stock-closing.<환경>.<YYYY-MM>.json(화면이 읽는 원본), .xlsx(공지 · 공유용 차량 목록)
//   Modify 폴더의 "Stock Closing/<연도>" 폴더에 쓰고 R-Download 폴더의 같은 이름 폴더에 복사한다(폴더가 없으면 만든다).
//   화면은 R-Download 것을 읽는다(조회 사용자도 볼 수 있게).
//   마감된 달은 R-Download 쪽 연도 폴더들의 파일 이름으로 안다. 다시 마감하면 덮어쓴다.
// 누가 · 언제 저장했는지는 SharePoint 의 수정한 사람 · 버전 기록에 남는다.
import { listFolder, ensureFolder, readJsonFile, writeJsonFile, writeBinaryFile } from "../lib/sharepoint.js";
import { SHAREPOINT, ENV_NAME } from "../lib/config.js";
import { buildXlsx, downloadXlsx, XLSX_MIME } from "../lib/xlsx.js";
import { monthOf } from "../domain/dates.js";
import { COLUMNS, CLOSING_EXPORT_COLUMNS, DATE_FILTER_COLUMNS } from "./columns.js";
import { currentStock } from "./derive.js";

const SCHEMA_VERSION = 1;
const SHEET_NAME = "Stock";
// 재고현황의 카드 · 막대 · 매트릭스가 쓰는 차량 속성. Excel 열에 없어도 JSON 에는 넣는다
const CHART_FIELDS = [
  "commission_no", "current_status", "model_year", "gen", "vehicle", "model", "type", "axle", "cab",
  "cab_gen", "pto", "emission", "customs_clearance_date",
];

const fileName = (month, ext) => `stock-closing.${ENV_NAME}.${month}.${ext}`;
const FILE_PATTERN = new RegExp(`^stock-closing\\.${ENV_NAME}\\.(\\d{4}-\\d{2})\\.json$`);
const pathIn = (folder, month, ext) => `${folder}/${fileName(month, ext)}`;
// 마감 파일을 모아 두는 하위 폴더. 그 아래에 연도("2026")별 폴더를 둔다. 없으면 마감할 때 만든다
const SUBFOLDER = "Stock Closing";
const YEAR_PATTERN = /^\d{4}$/;
const yearOf = (month) => month.slice(0, 4);
const readRoot = () => `${SHAREPOINT.folders.readDownload}/${SUBFOLDER}`;
const modifyFolder = (month) => `${SHAREPOINT.folders.modify}/${SUBFOLDER}/${yearOf(month)}`;
const readFolder = (month) => `${readRoot()}/${yearOf(month)}`;
// 폴더가 아직 없으면(한 번도 마감하지 않았다) 빈 목록
const listOrEmpty = (folder) =>
  listFolder(folder).catch((err) => {
    if (err?.status === 404) return [];
    throw err;
  });

/** 마감 파일 이름(확인 창에 보여준다) */
export const closingFileNames = (month) => [fileName(month, "json"), fileName(month, "xlsx")];
/** 그 달의 마감 파일을 쓰는 폴더(확인 창에 보여준다). 앞의 것에 먼저 쓴다 */
export const closingFolders = (month) => [modifyFolder(month), readFolder(month)];

let closings; // 마감된 달 목록
const loaded = new Map(); // 달 → 읽은 마감

/**
 * 마감된 달. 최근 달이 먼저다.
 * @returns {Promise<string[]>} "YYYY-MM"
 */
export function listClosings(options = {}) {
  if (options.refresh) closings = undefined;
  closings ??= listOrEmpty(readRoot())
    .then((items) => {
      const years = items.filter((item) => item.folder && YEAR_PATTERN.test(item.name ?? "")).map((item) => item.name);
      return Promise.all(years.map((year) => listOrEmpty(`${readRoot()}/${year}`)));
    })
    .then((folders) =>
      folders
        .flat()
        .map((item) => FILE_PATTERN.exec(item.name ?? "")?.[1])
        .filter(Boolean)
        .sort()
        .reverse()
    )
    .catch((err) => {
      closings = undefined; // 실패한 결과는 남기지 않는다
      throw err;
    });
  return closings;
}

/**
 * 한 달의 마감을 읽는다.
 * @param {string} month "YYYY-MM"
 * @returns {Promise<null | {month: string, closedAt: string, columns: string[], vehicles: object[],
 *   items: Array<{v: object, cleared: boolean}>}>}
 *   파일이 없거나 모양이 다르면 null. items 는 currentStock 과 같은 모양이다(cleared = 마감 때 통관일이 있었다)
 */
export function loadClosing(month) {
  if (!loaded.has(month)) {
    const reading = readJsonFile(pathIn(readFolder(month), month, "json"))
      .then((file) => {
        const data = file?.data;
        if (!data || !Array.isArray(data.vehicles)) return null;
        return {
          month,
          closedAt: typeof data.closedAt === "string" ? data.closedAt : "",
          columns: Array.isArray(data.columns) ? data.columns.filter((key) => typeof key === "string") : [],
          vehicles: data.vehicles,
          items: data.vehicles.map((v) => ({ v, cleared: Boolean(v.customs_clearance_date) })),
        };
      })
      .catch((err) => {
        loaded.delete(month);
        throw err;
      });
    loaded.set(month, reading);
  }
  return loaded.get(month);
}

/**
 * 마감 Excel 의 내용.
 * @param {{columns: string[], vehicles: object[]}} closing
 * @returns {{rows: any[][], dateColumns: number[]}} rows 의 첫 줄이 머리글
 */
export function closingRows(closing) {
  const known = new Map(COLUMNS.map((c) => [c.key, c]));
  const keys = closing.columns.filter((key) => known.has(key));
  // PM 은 연월일로 저장하고 월까지만 보여준다(차량 그리드와 같다)
  const text = (v, key) => (key === "pm" ? monthOf(String(v[key] ?? "")) || String(v[key] ?? "") : String(v[key] ?? ""));
  return {
    rows: [keys.map((key) => known.get(key).label), ...closing.vehicles.map((v) => keys.map((key) => text(v, key)))],
    dateColumns: keys.map((key, i) => (DATE_FILTER_COLUMNS.includes(key) && key !== "pm" ? i : -1)).filter((i) => i >= 0),
  };
}

/** 읽은 마감을 Excel 로 내려받는다(SharePoint 에 저장한 Excel 과 내용이 같다) */
export function downloadClosing(closing) {
  const { rows, dateColumns } = closingRows(closing);
  return downloadXlsx(fileName(closing.month, "xlsx"), SHEET_NAME, rows, { dateColumns, headerFill: true });
}

/**
 * 지금 마감하면 들어갈 차량: Current Status 가 Bonded Stock · OH Stock 인 차량.
 * @returns {Array<{v: object, cleared: boolean}>}
 */
export const closingTargets = (vehicles) => currentStock(vehicles, "stock");

/**
 * 마감한다: 지금의 재고를 그 달의 마감으로 저장한다. 이미 마감한 달이면 덮어쓴다.
 * @param {string} month "YYYY-MM"
 * @param {object[]} vehicles loadVehicles 의 차량 행
 * @param {string} closedAt 마감한 날 "YYYY-MM-DD"
 * @returns {Promise<{ok: boolean, copied: boolean, count: number, code: string}>}
 *   ok = Modify 폴더에 저장했다. copied = R-Download 폴더에도 복사했다(화면에 나온다).
 *   code 는 실패했을 때의 오류 코드
 */
export async function saveClosing(month, vehicles, closedAt) {
  const keys = [...new Set([...CHART_FIELDS, ...CLOSING_EXPORT_COLUMNS])];
  const data = {
    schemaVersion: SCHEMA_VERSION,
    environment: ENV_NAME,
    month,
    closedAt,
    columns: CLOSING_EXPORT_COLUMNS,
    vehicles: closingTargets(vehicles).map(({ v }) => Object.fromEntries(keys.map((key) => [key, v[key] ?? ""]))),
  };
  const count = data.vehicles.length;
  const codeOf = (err) => `${err?.status ?? ""} ${err?.code ?? err?.message ?? ""}`.trim();
  const { rows, dateColumns } = closingRows(data);
  let bytes;
  try {
    bytes = await buildXlsx(SHEET_NAME, rows, { dateColumns, headerFill: true });
  } catch (err) {
    return { ok: false, copied: false, count, code: codeOf(err) };
  }
  // base: Modify 나 R-Download 폴더(이미 있다). 그 아래 "Stock Closing" 과 연도 폴더는 없으면 만든다
  const write = async (base) => {
    await ensureFolder(base, SUBFOLDER);
    await ensureFolder(`${base}/${SUBFOLDER}`, yearOf(month));
    const folder = `${base}/${SUBFOLDER}/${yearOf(month)}`;
    await writeJsonFile(pathIn(folder, month, "json"), data);
    await writeBinaryFile(pathIn(folder, month, "xlsx"), bytes, XLSX_MIME);
  };
  try {
    await write(SHAREPOINT.folders.modify);
  } catch (err) {
    return { ok: false, copied: false, count, code: codeOf(err) };
  }
  try {
    await write(SHAREPOINT.folders.readDownload);
  } catch (err) {
    return { ok: true, copied: false, count, code: codeOf(err) };
  } finally {
    // 다음에 다시 읽는다
    closings = undefined;
    loaded.delete(month);
  }
  return { ok: true, copied: true, count, code: "" };
}
