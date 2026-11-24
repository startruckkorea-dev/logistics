// 모델 고정 목록 — 1차 이관 때 이미 모델이 확정된 차량의 키 목록.
// 적재는 이 목록의 차량에서 모델 관련 열(List 정의의 lock.columns)을 바꾸지 않는다.
// 목록은 SharePoint 의 JSON 파일에 둔다. 어떤 차량을 고르는지는 고정 목록용 규칙 파일에만 있다.
import { SHAREPOINT, ENV_NAME } from "../lib/config.js";
import { readJsonFile, writeJsonFile } from "../lib/sharepoint.js";
import { LISTS } from "./lists.js";

/** 고정 목록용 규칙 파일이 내야 하는 결과 표 이름 */
export const LOCK_TABLE = "model_lock";

const LOCK_DEF = LISTS.find((def) => def.lock);
/** 목록에 담는 키 열(차량 List 의 키) */
export const LOCK_KEY = LOCK_DEF.key;

/**
 * 규칙 파일이 고정 목록을 만드는 모양인지: 결과 표가 model_lock 하나이고 열이 키 하나다.
 * @returns {Array<{where: string, item: string, message: string}>} 빈 배열이면 통과
 */
export function checkLockRules(rules) {
  const errors = [];
  const add = (item, message) => errors.push({ where: "outputs", item, message });
  const [output] = rules.outputs;
  if (rules.outputs.length !== 1 || output.name !== LOCK_TABLE) {
    add("name", `결과 표는 ${LOCK_TABLE} 하나여야 합니다`);
    return errors;
  }
  if (output.columns.length !== 1 || output.columns[0].name !== LOCK_KEY) {
    add("columns", `열은 ${LOCK_KEY} 하나여야 합니다`);
  }
  return errors;
}

/** runRules 의 결과 → 키 목록(빈 값과 겹치는 값은 뺀다) */
export function lockKeysOf(result) {
  const table = result.tables.find((t) => t.name === LOCK_TABLE);
  const keys = new Set();
  for (const [value] of table.rows) {
    if (value != null && value !== "") keys.add(String(value));
  }
  return [...keys];
}

/**
 * 저장된 고정 목록을 읽는다.
 * @returns {Promise<{keys: Set<string>, savedAt: string, source: string, etag: string}|null>} 파일이 없으면 null
 * @throws 파일이 이 환경의 목록 형식이 아니면
 */
export async function readModelLock() {
  const file = await readJsonFile(SHAREPOINT.modelLockFile);
  if (!file) return null;
  const { data } = file;
  const ok =
    data?.environment === ENV_NAME && Array.isArray(data.keys) && data.keys.every((k) => typeof k === "string");
  if (!ok) throw new Error("모델 고정 목록 파일의 형식이 맞지 않습니다.");
  return { keys: new Set(data.keys), savedAt: data.savedAt ?? "", source: data.source ?? "", etag: file.etag };
}

/**
 * 고정 목록을 저장한다(있으면 바꾼다).
 * @param {string[]} keys
 * @param {string} source 목록을 만든 원본 파일 이름
 * @param {string} [etag] 읽을 때 받은 값. 그사이 파일이 바뀌었으면 412 오류가 난다
 */
export function saveModelLock(keys, source, etag) {
  return writeJsonFile(
    SHAREPOINT.modelLockFile,
    { schemaVersion: 1, environment: ENV_NAME, savedAt: new Date().toISOString(), source, keys },
    etag
  );
}
