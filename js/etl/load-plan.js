// 전처리 3단계 — 적재 계획.
// 전처리 결과 표와 List 의 현재 항목을 키로 비교해 추가·변경할 것을 정한다.
// 화면·네트워크와 무관한 순수 계산이다. 계획에는 건수만 요약하고 값은 실행 단계로만 넘긴다.

const isEmpty = (v) => v == null || v === "";

// 결과 표의 값 → List 열 타입에 맞는 값. 맞출 수 없으면 undefined.
function coerce(value, type) {
  if (isEmpty(value)) return null;
  if (type === "text") {
    const s = String(value);
    return s.length > 255 ? undefined : s;
  }
  if (type === "note") return String(value);
  if (type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") return typeof value === "boolean" ? value : undefined;
  return undefined;
}

// List 에서 읽은 값과 넣으려는 값이 같은지
function same(current, next, type) {
  if (isEmpty(current) && isEmpty(next)) return true;
  if (isEmpty(current) || isEmpty(next)) {
    // 예/아니요 열은 값이 없으면 아니요로 본다
    return type === "boolean" && (current ?? false) === (next ?? false);
  }
  if (type === "number") return Number(current) === Number(next);
  if (type === "boolean") return Boolean(current) === Boolean(next);
  // SharePoint 는 여러 줄 텍스트의 줄바꿈을 바꿔 돌려줄 수 있다
  const norm = (s) => String(s).replace(/\r\n/g, "\n");
  return norm(current) === norm(next);
}

/**
 * @param {{name, columns: string[], rows: any[][]}} table 전처리 결과 표
 * @param {{key: string, columns: Array<{name, type}>}} def List 정의
 * @param {Array<{id: string, fields: object}>} items List 의 현재 항목
 * @returns {{
 *   problems: string[],   // 있으면 적재할 수 없다. 값은 담지 않는다
 *   ops: Array,           // writeListItems 에 넘길 추가·변경
 *   adds: number, updates: number, same: number, onlyInList: number,
 *   changedByColumn: Record<string, number>,
 * }}
 */
export function planLoad(table, def, items) {
  const problems = [];
  const defNames = def.columns.map((c) => c.name);
  const missing = defNames.filter((n) => !table.columns.includes(n));
  const extra = table.columns.filter((n) => !defNames.includes(n));
  if (missing.length) problems.push(`결과 표에 없는 열: ${missing.join(", ")}`);
  if (extra.length) problems.push(`List 정의에 없는 열: ${extra.join(", ")}`);
  const empty = { problems, ops: [], adds: 0, updates: 0, same: 0, onlyInList: 0, changedByColumn: {} };
  if (problems.length) return empty;

  const indexOf = Object.fromEntries(table.columns.map((name, i) => [name, i]));
  const keyIndex = indexOf[def.key];

  const existing = new Map();
  for (const item of items) {
    const key = item.fields[def.key];
    if (!isEmpty(key)) existing.set(String(key), item);
  }

  const badType = {};
  const seen = new Set();
  let emptyKeys = 0;
  let duplicateKeys = 0;
  const ops = [];
  const changedByColumn = {};
  let adds = 0;
  let updates = 0;
  let unchanged = 0;

  for (const row of table.rows) {
    const key = isEmpty(row[keyIndex]) ? "" : String(row[keyIndex]);
    if (!key) {
      emptyKeys++;
      continue;
    }
    if (seen.has(key)) {
      duplicateKeys++;
      continue;
    }
    seen.add(key);

    const values = {};
    for (const column of def.columns) {
      const value = coerce(row[indexOf[column.name]], column.type);
      if (value === undefined) badType[column.name] = (badType[column.name] ?? 0) + 1;
      else values[column.name] = value;
    }

    const item = existing.get(key);
    if (!item) {
      // 새 항목에는 값이 있는 필드만 보낸다. Title 은 SharePoint 화면에서 행을 알아보기 위한 키 복사본.
      const fields = { Title: key };
      for (const [name, value] of Object.entries(values)) if (value !== null) fields[name] = value;
      ops.push({ kind: "add", fields });
      adds++;
      continue;
    }
    const fields = {};
    for (const column of def.columns) {
      const next = values[column.name];
      if (next === undefined || same(item.fields[column.name], next, column.type)) continue;
      fields[column.name] = next;
      changedByColumn[column.name] = (changedByColumn[column.name] ?? 0) + 1;
    }
    if (Object.keys(fields).length) {
      ops.push({ kind: "update", id: item.id, fields });
      updates++;
    } else unchanged++;
  }

  if (emptyKeys) problems.push(`키(${def.key})가 빈 행 ${emptyKeys}건`);
  if (duplicateKeys) problems.push(`키(${def.key})가 겹치는 행 ${duplicateKeys}건`);
  for (const [name, n] of Object.entries(badType)) {
    problems.push(`${name}: 열 타입에 맞지 않는 값 ${n}건(255자 초과 포함)`);
  }

  let onlyInList = 0;
  for (const key of existing.keys()) if (!seen.has(key)) onlyInList++;

  return {
    problems,
    ops: problems.length ? [] : ops,
    adds,
    updates,
    same: unchanged,
    onlyInList,
    changedByColumn,
  };
}

/**
 * List 의 실제 열과 정의의 차이.
 * @param {{key, indexed: string[], columns: Array<{name, type}>}} def
 * @param {Array<{name, type, indexed, unique}>} actual
 * @returns {{missing: Array<{name, type}>, wrongType: string[], notIndexed: string[], notUnique: string[]}}
 */
export function compareColumns(def, actual) {
  const byName = new Map(actual.map((c) => [c.name, c]));
  const missing = [];
  const wrongType = [];
  const notIndexed = [];
  const notUnique = [];
  const extraUnique = []; // 키가 아닌데 고유값이 걸린 열. 같은 값을 여러 행에 쓸 수 없게 된다
  for (const column of def.columns) {
    const found = byName.get(column.name);
    if (!found) {
      missing.push(column);
      continue;
    }
    if (found.type !== column.type) wrongType.push(column.name);
    const isKey = column.name === def.key;
    if ((isKey || def.indexed.includes(column.name)) && !found.indexed) notIndexed.push(column.name);
    if (isKey && !found.unique) notUnique.push(column.name);
    if (!isKey && found.unique) extraUnique.push(column.name);
  }
  return { missing, wrongType, notIndexed, notUnique, extraUnique };
}
