// 전처리 규칙 파일의 형식 검사.
// 형식 정의는 schema/preprocess-rules.schema.json 과 같아야 한다(스키마는 문서·편집기용).
// 오류에는 "위치·항목·기대 형식"만 담는다. 규칙에 적힌 값은 넣지 않는다.

const EXCEL_COLUMN = /^[A-Z]{1,3}$/;
const NEW_COLUMN = /^@[a-z][a-z0-9_]*$/;
const RULE_ID = /^[a-z0-9][a-z0-9-]*$/;
const OUTPUT_NAME = /^[a-z][a-z0-9_]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const ON_INVALID = ["empty", "keep", "error"];
export const DATE_FORMATS = ["yyyyMMdd", "yyyy-MM-dd", "dd.MM.yyyy", "MMMM-yy", "MMM-yy"];
const CONDITION_OPS = [
  "empty", "notEmpty", "equals", "notEquals", "in", "notIn", "kind",
  "matches", "notMatches", "before", "onOrBefore", "after", "onOrAfter",
];
const KINDS = ["text", "number", "date"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isScalar = (v) => ["string", "number", "boolean"].includes(typeof v);
const isColumn = (v) => typeof v === "string" && (EXCEL_COLUMN.test(v) || NEW_COLUMN.test(v));

function isRegex(source) {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

// ---- 항목 검사기: 맞으면 null, 틀리면 기대 형식 설명 ----
const check = {
  column: (v) => (isColumn(v) ? null : "열 문자(A~ZZZ) 또는 @새열 이어야 합니다"),
  columns: (v) =>
    Array.isArray(v) && v.length > 0 && v.every(isColumn)
      ? null
      : "열 목록(1개 이상)이어야 합니다",
  columnsOrAll: (v) => (v === "*" ? null : check.columns(v) && '열 목록 또는 "*" 이어야 합니다'),
  newColumns: (v) =>
    Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && NEW_COLUMN.test(x))
      ? null
      : "@이름 목록(소문자·숫자·밑줄)이어야 합니다",
  string: (v) => (typeof v === "string" ? null : "문자여야 합니다"),
  nonEmptyString: (v) => (typeof v === "string" && v.length > 0 ? null : "비어 있지 않은 문자여야 합니다"),
  boolean: (v) => (typeof v === "boolean" ? null : "true 또는 false 여야 합니다"),
  integer: (v) => (Number.isInteger(v) ? null : "정수여야 합니다"),
  scalars: (v) =>
    Array.isArray(v) && v.length > 0 && v.every(isScalar) ? null : "값 목록(1개 이상)이어야 합니다",
  scalarsOrEmpty: (v) => (Array.isArray(v) && v.every(isScalar) ? null : "값 목록이어야 합니다"),
  strings: (v) =>
    Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "문자 목록이어야 합니다",
  regexes: (v) =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && isRegex(x))
      ? null
      : "정규식 목록이어야 합니다",
  scalarOrNull: (v) => (v === null || isScalar(v) ? null : "값 또는 null 이어야 합니다"),
  map: (v) =>
    isObject(v) && Object.keys(v).length > 0 && Object.values(v).every(isScalar)
      ? null
      : "대응표(객체, 1개 이상)여야 합니다",
  formats: (v) =>
    Array.isArray(v) && v.every((x) => DATE_FORMATS.includes(x))
      ? null
      : `날짜 형식 목록이어야 합니다 (${DATE_FORMATS.join(", ")})`,
  fill: (v) =>
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x) => isObject(x) && isColumn(x.from) && isColumn(x.to) && Object.keys(x).length === 2)
      ? null
      : "{ from, to } 목록(1개 이상)이어야 합니다",
  oneOf: (...allowed) => (v) =>
    allowed.includes(v) ? null : `${allowed.join(" | ")} 중 하나여야 합니다`,
  columnMap: (required, optional = []) => (v) => {
    if (!isObject(v)) return "열 지정 객체여야 합니다";
    const missing = required.filter((k) => !isColumn(v[k]));
    if (missing.length) return `열 지정이 없거나 틀렸습니다: ${missing.join(", ")}`;
    const allowed = [...required, ...optional];
    const unknown = Object.keys(v).filter((k) => !allowed.includes(k));
    if (unknown.length) return `알 수 없는 항목: ${unknown.join(", ")}`;
    const bad = optional.filter((k) => k in v && !isColumn(v[k]));
    return bad.length ? `열 지정이 틀렸습니다: ${bad.join(", ")}` : null;
  },
};

// ---- 규칙 종류별 항목. [검사기, 필수 여부] ----
const RULE_TYPES = {
  dropColumns: { fields: { columns: [check.columns, true] }, where: "forbidden" },
  dropRows: { fields: {}, where: "required" },
  trim: { fields: { columns: [check.columnsOrAll, true], collapseSpaces: [check.boolean] } },
  toEmpty: {
    fields: {
      columns: [check.columnsOrAll, true],
      values: [check.scalars],
      excelErrors: [check.boolean],
      ignoreCase: [check.boolean],
    },
    extra: (rule) =>
      "values" in rule || rule.excelErrors === true
        ? null
        : ["values", "values 또는 excelErrors: true 중 하나가 필요합니다"],
  },
  replace: {
    fields: {
      columns: [check.columns, true],
      map: [check.map, true],
      ignoreCase: [check.boolean],
      unmapped: [check.oneOf("keep", "empty", "error")],
    },
  },
  toText: {
    fields: { columns: [check.columns, true], source: [check.oneOf("displayed", "raw")] },
  },
  toNumber: {
    fields: { columns: [check.columns, true], onInvalid: [check.oneOf(...ON_INVALID)] },
  },
  toDate: {
    fields: {
      columns: [check.columns, true],
      formats: [check.formats],
      precision: [check.oneOf("day", "month")],
      onInvalid: [check.oneOf(...ON_INVALID)],
    },
  },
  toBoolean: {
    fields: {
      columns: [check.columns, true],
      trueValues: [check.scalars, true],
      falseValues: [check.scalarsOrEmpty],
      emptyAs: [check.boolean],
      onInvalid: [check.oneOf(...ON_INVALID)],
    },
  },
  changeCase: {
    fields: { columns: [check.columns, true], case: [check.oneOf("lower", "upper"), true] },
  },
  set: { fields: { columns: [check.columns, true], value: [check.scalarOrNull, true] } },
  addColumn: { fields: { names: [check.newColumns, true] }, where: "forbidden" },
  transfer: {
    fields: {
      from: [check.column, true],
      to: [check.column, true],
      mode: [check.oneOf("move", "copy"), true],
      onConflict: [check.oneOf("overwrite", "skip", "error"), true],
    },
  },
  append: {
    fields: {
      from: [check.column, true],
      to: [check.column, true],
      separator: [check.string, true],
      position: [check.oneOf("after", "before")],
      splitBy: [check.nonEmptyString],
      excludeValues: [check.strings],
      excludePatterns: [check.regexes],
      removeWords: [check.strings],
      ignoreCase: [check.boolean],
    },
  },
  dateAdd: {
    fields: {
      from: [check.column, true],
      to: [check.column, true],
      days: [check.integer],
      daysFrom: [check.column],
    },
    extra: (rule) =>
      "days" in rule !== "daysFrom" in rule
        ? null
        : ["days", "days 와 daysFrom 중 하나만 적어야 합니다"],
  },
  lookup: {
    fields: {
      key: [check.column, true],
      sheet: [check.nonEmptyString, true],
      targetKey: [check.column, true],
      fill: [check.fill, true],
      onMissing: [check.oneOf("empty", "keep", "error"), true],
      onSourceEmpty: [check.oneOf("empty", "keep"), true],
    },
  },
  dedupe: {
    fields: { column: [check.column, true], keep: [check.oneOf("first", "last", "error"), true] },
  },
  mustExistIn: {
    fields: {
      column: [check.column, true],
      sheet: [check.nonEmptyString, true],
      targetColumn: [check.column, true],
      onMissing: [check.oneOf("keep", "dropRow", "error"), true],
    },
  },
  deriveStatus: {
    fields: {
      columns: [
        check.columnMap(
          ["status", "shipping", "vessel", "pm", "changeability"],
          ["orderNote", "cancelFlag"]
        ),
        true,
      ],
      sourceStatus: [check.nonEmptyString, true],
      dummyMarker: [check.string],
      dummyExclude: [check.string],
    },
  },
  deriveShippingCalc: {
    fields: {
      columns: [check.columnMap(["status", "pm", "shipping", "leadDays", "target"]), true],
    },
  },
};

const BASE_FIELDS = ["id", "type", "note", "where"];

function checkCondition(cond, at, add) {
  if (!isObject(cond)) return add(at, "조건", "객체여야 합니다");
  const unknown = Object.keys(cond).filter(
    (k) => !["column", "op", "value", "values", "ignoreCase"].includes(k)
  );
  if (unknown.length) add(at, unknown.join(", "), "알 수 없는 항목입니다");
  if (!isColumn(cond.column)) add(at, "column", "열 문자 또는 @새열 이어야 합니다");
  if (!CONDITION_OPS.includes(cond.op)) {
    return add(at, "op", `${CONDITION_OPS.join(" | ")} 중 하나여야 합니다`);
  }
  if ("ignoreCase" in cond && typeof cond.ignoreCase !== "boolean") {
    add(at, "ignoreCase", "true 또는 false 여야 합니다");
  }
  const op = cond.op;
  if (op === "equals" || op === "notEquals") {
    if (!isScalar(cond.value)) add(at, "value", "값이 필요합니다");
  } else if (op === "in" || op === "notIn") {
    if (check.scalars(cond.values)) add(at, "values", "값 목록(1개 이상)이 필요합니다");
  } else if (op === "kind") {
    if (!KINDS.includes(cond.value)) add(at, "value", `${KINDS.join(" | ")} 중 하나여야 합니다`);
  } else if (op === "matches" || op === "notMatches") {
    if (typeof cond.value !== "string" || !isRegex(cond.value)) {
      add(at, "value", "정규식이어야 합니다");
    }
  } else if (["before", "onOrBefore", "after", "onOrAfter"].includes(op)) {
    if (cond.value !== "baseDate" && !(typeof cond.value === "string" && DATE.test(cond.value))) {
      add(at, "value", 'YYYY-MM-DD 또는 "baseDate" 여야 합니다');
    }
  }
}

function checkWhere(where, at, add, depth = 0) {
  if (!isObject(where)) return add(at, "where", "객체여야 합니다");
  const keys = Object.keys(where);
  if (keys.length !== 1 || !["all", "any"].includes(keys[0])) {
    return add(at, "where", "all 또는 any 하나만 있어야 합니다");
  }
  const items = where[keys[0]];
  if (!Array.isArray(items) || items.length === 0) {
    return add(at, `where.${keys[0]}`, "조건 목록(1개 이상)이어야 합니다");
  }
  items.forEach((item, i) => {
    const itemAt = `${at}.where.${keys[0]}[${i}]`;
    if (isObject(item) && ("all" in item || "any" in item)) {
      if (depth >= 1) add(itemAt, "where", "묶음은 한 단계까지만 중첩할 수 있습니다");
      else checkWhere(item, itemAt, add, depth + 1);
    } else {
      checkCondition(item, itemAt, add);
    }
  });
}

function checkRule(rule, at, add, seenIds) {
  if (!isObject(rule)) return add(at, "규칙", "객체여야 합니다");

  const idOk = typeof rule.id === "string" && RULE_ID.test(rule.id);
  // id 가 형식에 맞을 때만 위치 표시에 붙인다(잘못 적힌 값이 화면에 나가지 않게).
  const where = idOk ? `${at} (id: ${rule.id})` : at;
  if (!idOk) add(where, "id", "소문자·숫자·하이픈으로 된 식별자여야 합니다");
  else if (seenIds.has(rule.id)) add(where, "id", "다른 규칙과 id 가 같습니다");
  else seenIds.add(rule.id);

  const spec = RULE_TYPES[rule.type];
  if (!spec) {
    return add(where, "type", `알 수 없는 규칙 종류입니다 (${Object.keys(RULE_TYPES).join(", ")})`);
  }
  if ("note" in rule && typeof rule.note !== "string") add(where, "note", "문자여야 합니다");

  const unknown = Object.keys(rule).filter((k) => !BASE_FIELDS.includes(k) && !(k in spec.fields));
  if (unknown.length) add(where, unknown.join(", "), "이 규칙 종류에 없는 항목입니다");

  for (const [name, [validator, required]] of Object.entries(spec.fields)) {
    if (!(name in rule)) {
      if (required) add(where, name, "필수 항목입니다");
      continue;
    }
    const problem = validator(rule[name]);
    if (problem) add(where, name, problem);
  }
  const extra = spec.extra?.(rule);
  if (extra) add(where, extra[0], extra[1]);

  if ("where" in rule) {
    if (spec.where === "forbidden") add(where, "where", "이 규칙 종류에는 붙일 수 없습니다");
    else checkWhere(rule.where, where, add);
  } else if (spec.where === "required") {
    add(where, "where", "필수 항목입니다");
  }
}

function checkSheet(sheet, at, add, seenIds) {
  if (!isObject(sheet)) return add(at, "시트", "객체여야 합니다");
  const unknown = Object.keys(sheet).filter(
    (k) => !["sheet", "headerRow", "expectHeaders", "rules"].includes(k)
  );
  if (unknown.length) add(at, unknown.join(", "), "알 수 없는 항목입니다");
  if (check.nonEmptyString(sheet.sheet)) add(at, "sheet", "시트 이름이 필요합니다");
  if (!Number.isInteger(sheet.headerRow) || sheet.headerRow < 1) {
    add(at, "headerRow", "1 이상의 정수여야 합니다");
  }
  if ("expectHeaders" in sheet) {
    const h = sheet.expectHeaders;
    const ok =
      isObject(h) &&
      Object.entries(h).every(([k, v]) => EXCEL_COLUMN.test(k) && typeof v === "string");
    if (!ok) add(at, "expectHeaders", "{ 열 문자: 헤더 } 객체여야 합니다");
  }
  if (!Array.isArray(sheet.rules)) return add(at, "rules", "규칙 목록이어야 합니다");
  sheet.rules.forEach((rule, i) => checkRule(rule, `${at}.rules[${i}]`, add, seenIds));
}

function checkOutput(output, at, add, sheetNames, seenNames) {
  if (!isObject(output)) return add(at, "결과 표", "객체여야 합니다");
  const unknown = Object.keys(output).filter((k) => !["name", "sheet", "key", "columns"].includes(k));
  if (unknown.length) add(at, unknown.join(", "), "알 수 없는 항목입니다");

  if (typeof output.name !== "string" || !OUTPUT_NAME.test(output.name)) {
    add(at, "name", "소문자·숫자·밑줄로 된 이름이어야 합니다");
  } else if (seenNames.has(output.name)) add(at, "name", "다른 결과 표와 이름이 같습니다");
  else seenNames.add(output.name);

  if (typeof output.sheet !== "string" || !sheetNames.includes(output.sheet)) {
    add(at, "sheet", "sheets 에 정의된 시트 이름이어야 합니다");
  }
  if (!isColumn(output.key)) add(at, "key", "열 문자 또는 @새열 이어야 합니다");

  if (!Array.isArray(output.columns) || output.columns.length === 0) {
    return add(at, "columns", "열 목록(1개 이상)이어야 합니다");
  }
  const names = new Set();
  const sources = new Set();
  output.columns.forEach((col, i) => {
    const colAt = `${at}.columns[${i}]`;
    if (!isObject(col)) return add(colAt, "열", "{ from, name } 객체여야 합니다");
    if (!isColumn(col.from)) add(colAt, "from", "열 문자 또는 @새열 이어야 합니다");
    else if (sources.has(col.from)) add(colAt, "from", "같은 열이 두 번 나옵니다");
    else sources.add(col.from);
    if (typeof col.name !== "string" || !OUTPUT_NAME.test(col.name)) {
      add(colAt, "name", "소문자·숫자·밑줄로 된 이름이어야 합니다");
    } else if (names.has(col.name)) add(colAt, "name", "같은 이름이 두 번 나옵니다");
    else names.add(col.name);
  });
  if (isColumn(output.key) && !sources.has(output.key)) {
    add(at, "key", "columns 의 from 에 있는 열이어야 합니다");
  }
}

/**
 * @param {unknown} doc 규칙 파일을 JSON 으로 읽은 값
 * @param {string} envName 접속한 환경("uat" | "prod")
 * @returns {Array<{where: string, item: string, message: string}>} 빈 배열이면 통과
 */
export function validateRules(doc, envName) {
  const errors = [];
  const add = (where, item, message) => {
    errors.push({ where, item, message });
  };

  if (!isObject(doc)) {
    add("파일", "전체", "JSON 객체여야 합니다");
    return errors;
  }
  const unknown = Object.keys(doc).filter(
    (k) =>
      !["$schema", "schemaVersion", "environment", "description", "baseDate", "sheets", "outputs"].includes(k)
  );
  if (unknown.length) add("파일", unknown.join(", "), "알 수 없는 항목입니다");

  if (doc.schemaVersion !== 1) add("파일", "schemaVersion", "1 이어야 합니다");
  if (!["uat", "prod"].includes(doc.environment)) {
    add("파일", "environment", "uat | prod 중 하나여야 합니다");
  } else if (doc.environment !== envName) {
    add("파일", "environment", `접속한 환경(${envName})과 다릅니다. 이 환경용 규칙 파일이 아닙니다`);
  }
  if ("description" in doc && typeof doc.description !== "string") {
    add("파일", "description", "문자여야 합니다");
  }
  if ("baseDate" in doc && !(typeof doc.baseDate === "string" && DATE.test(doc.baseDate))) {
    add("파일", "baseDate", "YYYY-MM-DD 여야 합니다");
  }

  const seenIds = new Set();
  let sheetNames = [];
  if (!Array.isArray(doc.sheets) || doc.sheets.length === 0) {
    add("파일", "sheets", "시트 목록(1개 이상)이어야 합니다");
  } else {
    doc.sheets.forEach((sheet, i) => checkSheet(sheet, `sheets[${i}]`, add, seenIds));
    sheetNames = doc.sheets.map((s) => s?.sheet).filter((n) => typeof n === "string");
    if (new Set(sheetNames).size !== sheetNames.length) {
      add("파일", "sheets", "같은 시트가 두 번 나옵니다");
    }
  }

  if (!Array.isArray(doc.outputs) || doc.outputs.length === 0) {
    add("파일", "outputs", "결과 표 목록(1개 이상)이어야 합니다");
  } else {
    const seenNames = new Set();
    doc.outputs.forEach((output, i) => checkOutput(output, `outputs[${i}]`, add, sheetNames, seenNames));
  }
  return errors;
}
