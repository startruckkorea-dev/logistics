// 전처리 2단계 — 가공.
// 읽은 통합 문서에 규칙 파일의 규칙을 차례로 적용해 결과 표를 만든다.
// 화면·네트워크와 무관한 순수 계산이다. 규칙 파일은 validateRules 를 통과한 것이어야 한다.
// 오류와 적용 기록에는 규칙 id·건수·행 번호만 담고 셀 값은 담지 않는다.
import { isDateText } from "./profile.js";
import { addDays, monthOf, serialToIsoDate, toIsoDate, todayIso } from "../domain/dates.js";
import { classifyOrdered } from "../domain/status.js";
import { needsShippingCalc, shippingCalc } from "../domain/shipping-calc.js";

// 규칙 실행 중 오류. rows 는 엑셀 행 번호(최대 몇 개)만 담는다.
export class RuleError extends Error {
  constructor(sheet, ruleId, message, rows = []) {
    super(message);
    this.sheet = sheet;
    this.ruleId = ruleId;
    this.rows = rows.slice(0, 20);
    this.rowCount = rows.length;
  }
}

const EXCEL_ERROR = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA)$/;

const cleanHeader = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const isEmpty = (v) => v == null || v === "";
const lower = (s, ignoreCase) => (ignoreCase ? s.toLowerCase() : s);

function letterToIndex(letter) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ---- 시트 상태 ----
// rows[i] = { n: 엑셀 행 번호, v: 값[], t: 원본 표시 문자[], k: 날짜 표시[] }
//   t 는 값이 원본 그대로일 때만 남는다(바뀌면 undefined).
//   k 는 규칙이 만든 날짜("date" = YYYY-MM-DD, "month" = YYYY-MM)를 표시한다.

function buildState(source, config) {
  const headerIndex = config.headerRow - source.firstRow;
  if (headerIndex < 0 || headerIndex >= source.values.length) {
    throw new RuleError(config.sheet, null, "headerRow 가 시트의 사용 범위 밖입니다");
  }
  const columns = new Map();
  for (let c = 0; c < source.columnCount; c++) columns.set(c + source.firstColumn, c);

  const state = {
    name: config.sheet,
    firstColumn: source.firstColumn,
    columns, // 엑셀 열 번호(0부터) → 배열 위치
    extra: new Map(), // "@이름" → 배열 위치
    dropped: new Set(),
    width: source.columnCount,
    headers: (source.text[headerIndex] ?? []).map(cleanHeader),
    rows: [],
  };
  for (let r = headerIndex + 1; r < source.values.length; r++) {
    state.rows.push({
      n: source.firstRow + r,
      v: [...(source.values[r] ?? [])],
      t: [...(source.text[r] ?? [])],
      k: [],
    });
  }
  return state;
}

// 열 지정 → 배열 위치. 없는 열·삭제된 열은 오류.
function col(state, ref, ruleId) {
  if (state.dropped.has(ref)) {
    throw new RuleError(state.name, ruleId, `앞 규칙에서 삭제한 열을 가리킵니다: ${ref}`);
  }
  const index = ref.startsWith("@") ? state.extra.get(ref) : state.columns.get(letterToIndex(ref));
  if (index == null) {
    throw new RuleError(
      state.name,
      ruleId,
      ref.startsWith("@")
        ? `addColumn 으로 만들지 않은 열입니다: ${ref}`
        : `시트의 사용 범위에 없는 열입니다: ${ref}`
    );
  }
  return index;
}

function allColumns(state) {
  const out = [];
  for (const [excelIndex, index] of state.columns) {
    let n = excelIndex + 1;
    let letter = "";
    while (n > 0) {
      letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
      n = Math.floor((n - 1) / 26);
    }
    if (!state.dropped.has(letter)) out.push(index);
  }
  for (const [name, index] of state.extra) if (!state.dropped.has(name)) out.push(index);
  return out;
}

const cols = (state, refs, ruleId) =>
  refs === "*" ? allColumns(state) : refs.map((ref) => col(state, ref, ruleId));

// ---- 셀 읽기·쓰기 ----

function setCell(row, c, value, kind) {
  row.v[c] = isEmpty(value) ? null : value;
  row.t[c] = undefined;
  row.k[c] = isEmpty(value) ? undefined : kind;
}

function copyCell(from, fc, to, tc) {
  to.v[tc] = from.v[fc];
  to.t[tc] = from.t[fc];
  to.k[tc] = from.k[fc];
}

// 원본 숫자 칸이 엑셀에서 날짜로 표시되는지
const isSerialDate = (row, c) =>
  typeof row.v[c] === "number" && row.t[c] !== undefined && isDateText(row.t[c]);

function kindOf(row, c) {
  const v = row.v[c];
  if (isEmpty(v)) return "empty";
  if (row.k[c]) return "date";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return isSerialDate(row, c) ? "date" : "number";
  return "text";
}

// 비교용 문자. 숫자는 원시 값 그대로의 표기.
const str = (row, c) => (isEmpty(row.v[c]) ? "" : String(row.v[c]));

// 칸의 날짜("YYYY-MM-DD"). 날짜가 아니면 null. 월 값은 그 달 1일.
function dateOf(row, c) {
  if (row.k[c] === "date") return row.v[c];
  if (row.k[c] === "month") return `${row.v[c]}-01`;
  if (isSerialDate(row, c)) return serialToIsoDate(row.v[c]);
  return null;
}

// ---- where ----

function compileCondition(state, cond, ruleId, baseDate) {
  const c = col(state, cond.column, ruleId);
  const ic = cond.ignoreCase === true;
  const text = (row) => lower(str(row, c), ic);
  switch (cond.op) {
    case "empty":
      return (row) => isEmpty(row.v[c]);
    case "notEmpty":
      return (row) => !isEmpty(row.v[c]);
    case "equals": {
      const target = lower(String(cond.value), ic);
      return (row) => text(row) === target;
    }
    case "notEquals": {
      const target = lower(String(cond.value), ic);
      return (row) => text(row) !== target;
    }
    case "in": {
      const set = new Set(cond.values.map((v) => lower(String(v), ic)));
      return (row) => set.has(text(row));
    }
    case "notIn": {
      const set = new Set(cond.values.map((v) => lower(String(v), ic)));
      return (row) => !set.has(text(row));
    }
    case "kind":
      return (row) => kindOf(row, c) === cond.value;
    case "matches":
    case "notMatches": {
      const re = new RegExp(cond.value, ic ? "i" : "");
      const want = cond.op === "matches";
      return (row) => (!isEmpty(row.v[c]) && re.test(str(row, c))) === want;
    }
    default: {
      // 날짜 비교. 칸이 날짜가 아니면 조건에 맞지 않는 것으로 본다.
      const target = cond.value === "baseDate" ? baseDate : cond.value;
      const test = {
        before: (d) => d < target,
        onOrBefore: (d) => d <= target,
        after: (d) => d > target,
        onOrAfter: (d) => d >= target,
      }[cond.op];
      return (row) => {
        const d = dateOf(row, c);
        return d != null && test(d);
      };
    }
  }
}

function compileWhere(state, where, ruleId, baseDate) {
  if (!where) return () => true;
  const mode = "all" in where ? "all" : "any";
  const tests = where[mode].map((item) =>
    "all" in item || "any" in item
      ? compileWhere(state, item, ruleId, baseDate)
      : compileCondition(state, item, ruleId, baseDate)
  );
  return mode === "all"
    ? (row) => tests.every((t) => t(row))
    : (row) => tests.some((t) => t(row));
}

// ---- 날짜 변환 ----

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function monthNumber(name, full) {
  const n = name.toLowerCase();
  const index = full ? MONTHS.indexOf(n) : MONTHS.findIndex((m) => m.slice(0, 3) === n);
  return index + 1; // 없으면 0
}

function parseMonthYear(text, full) {
  const m = /^([A-Za-z]+)[-\s]('?\d{2}|\d{4})$/.exec(text);
  if (!m) return null;
  const month = monthNumber(m[1], full);
  if (!month) return null;
  const digits = m[2].replace("'", "");
  const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits);
  return toIsoDate(year, month, 1);
}

const DATE_PARSERS = {
  yyyyMMdd: (s) => {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    return m ? toIsoDate(+m[1], +m[2], +m[3]) : null;
  },
  "yyyy-MM-dd": (s) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    return m ? toIsoDate(+m[1], +m[2], +m[3]) : null;
  },
  "dd.MM.yyyy": (s) => {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
    return m ? toIsoDate(+m[3], +m[2], +m[1]) : null;
  },
  "MMMM-yy": (s) => parseMonthYear(s, true),
  "MMM-yy": (s) => parseMonthYear(s, false),
};

// 칸을 "YYYY-MM-DD" 로 읽는다. 읽을 수 없으면 null.
function parseDate(row, c, formats) {
  const known = dateOf(row, c);
  if (known) return known;
  const text = str(row, c).trim();
  for (const format of formats) {
    const iso = DATE_PARSERS[format](text);
    if (iso) return iso;
  }
  return null;
}

// ---- 규칙 ----
// 각 함수는 적용 기록 { changed, details? } 를 돌려준다.

const count = (details, key, n = 1) => {
  details[key] = (details[key] ?? 0) + n;
};

// 변환 규칙 공통: where 에 맞고 비어 있지 않은 칸마다 convert 를 부른다.
// convert 는 { value, kind? } 또는 null(변환 불가)을 돌려준다.
function convertCells(ctx, rule, convert) {
  const { state, match } = ctx;
  const targets = cols(state, rule.columns, rule.id);
  const onInvalid = rule.onInvalid ?? "keep";
  const details = {};
  const invalidRows = [];
  let changed = 0;

  for (const row of state.rows) {
    if (!match(row)) continue;
    for (const c of targets) {
      if (isEmpty(row.v[c])) continue;
      const result = convert(row, c);
      if (result) {
        if (result.value !== row.v[c] || result.kind !== row.k[c]) changed++;
        setCell(row, c, result.value, result.kind);
      } else if (onInvalid === "empty") {
        setCell(row, c, null);
        count(details, "변환 불가 → 빈 값");
      } else if (onInvalid === "error") {
        invalidRows.push(row.n);
      } else {
        count(details, "변환 불가 → 그대로");
      }
    }
  }
  if (invalidRows.length) {
    throw new RuleError(state.name, rule.id, "변환할 수 없는 값이 있습니다", invalidRows);
  }
  return { changed, details };
}

const RULES = {
  dropColumns({ state }, rule) {
    for (const ref of rule.columns) {
      col(state, ref, rule.id);
      state.dropped.add(ref);
    }
    return { changed: rule.columns.length };
  },

  dropRows({ state, match }) {
    const before = state.rows.length;
    state.rows = state.rows.filter((row) => !match(row));
    return { changed: before - state.rows.length };
  },

  trim({ state, match }, rule) {
    const targets = cols(state, rule.columns, rule.id);
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      for (const c of targets) {
        const v = row.v[c];
        if (typeof v !== "string") continue;
        const next = rule.collapseSpaces ? v.replace(/\s+/g, " ").trim() : v.trim();
        if (next !== v) {
          setCell(row, c, next, row.k[c]);
          changed++;
        }
      }
    }
    return { changed };
  },

  toEmpty({ state, match }, rule) {
    const targets = cols(state, rule.columns, rule.id);
    const ic = rule.ignoreCase === true;
    const values = new Set((rule.values ?? []).map((v) => lower(String(v), ic)));
    const details = {};
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      for (const c of targets) {
        if (isEmpty(row.v[c])) continue;
        const text = str(row, c);
        const isError = rule.excelErrors === true && EXCEL_ERROR.test(text.trim());
        if (!isError && !values.has(lower(text, ic))) continue;
        setCell(row, c, null);
        changed++;
        count(details, isError ? "엑셀 오류 값" : "지정 표기");
      }
    }
    return { changed, details };
  },

  replace({ state, match }, rule) {
    const targets = cols(state, rule.columns, rule.id);
    const ic = rule.ignoreCase === true;
    const map = new Map(Object.entries(rule.map).map(([k, v]) => [lower(k, ic), v]));
    const unmapped = rule.unmapped ?? "keep";
    const details = {};
    const errorRows = [];
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      for (const c of targets) {
        if (isEmpty(row.v[c])) continue;
        const key = lower(str(row, c), ic);
        if (map.has(key)) {
          const next = map.get(key);
          if (next !== row.v[c]) changed++;
          setCell(row, c, next);
        } else if (unmapped === "empty") {
          setCell(row, c, null);
          count(details, "대응표에 없음 → 빈 값");
        } else if (unmapped === "error") {
          errorRows.push(row.n);
        } else {
          count(details, "대응표에 없음 → 그대로");
        }
      }
    }
    if (errorRows.length) {
      throw new RuleError(state.name, rule.id, "대응표에 없는 값이 있습니다", errorRows);
    }
    return { changed, details };
  },

  toText(ctx, rule) {
    const displayed = (rule.source ?? "displayed") === "displayed";
    return convertCells(ctx, rule, (row, c) => {
      const shown = displayed && row.t[c] !== undefined ? String(row.t[c]).trim() : "";
      return { value: shown || String(row.v[c]) };
    });
  },

  toNumber(ctx, rule) {
    return convertCells(ctx, rule, (row, c) => {
      const v = row.v[c];
      if (typeof v === "number" && !row.k[c]) return { value: v };
      if (typeof v !== "string") return null;
      const text = v.replace(/,/g, "").trim();
      const n = text === "" ? NaN : Number(text);
      return Number.isFinite(n) ? { value: n } : null;
    });
  },

  toDate(ctx, rule) {
    const formats = rule.formats ?? [];
    const month = rule.precision === "month";
    return convertCells(ctx, rule, (row, c) => {
      const iso = parseDate(row, c, formats);
      if (!iso) return null;
      return month ? { value: monthOf(iso), kind: "month" } : { value: iso, kind: "date" };
    });
  },

  toBoolean({ state, match }, rule) {
    const targets = cols(state, rule.columns, rule.id);
    const norm = (v) => String(v).trim().toLowerCase();
    const trues = new Set(rule.trueValues.map(norm));
    const falses = new Set((rule.falseValues ?? []).map(norm));
    const onInvalid = rule.onInvalid ?? "keep";
    const details = {};
    const invalidRows = [];
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      for (const c of targets) {
        const v = row.v[c];
        if (isEmpty(v)) {
          if ("emptyAs" in rule) {
            setCell(row, c, rule.emptyAs);
            changed++;
          }
          continue;
        }
        if (typeof v === "boolean") continue;
        const key = norm(v);
        if (trues.has(key) || falses.has(key)) {
          setCell(row, c, trues.has(key));
          changed++;
        } else if (onInvalid === "empty") {
          setCell(row, c, null);
          count(details, "변환 불가 → 빈 값");
        } else if (onInvalid === "error") {
          invalidRows.push(row.n);
        } else {
          count(details, "변환 불가 → 그대로");
        }
      }
    }
    if (invalidRows.length) {
      throw new RuleError(state.name, rule.id, "참거짓으로 바꿀 수 없는 값이 있습니다", invalidRows);
    }
    return { changed, details };
  },

  changeCase({ state, match }, rule) {
    const targets = cols(state, rule.columns, rule.id);
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      for (const c of targets) {
        const v = row.v[c];
        if (typeof v !== "string" || row.k[c]) continue;
        const next = rule.case === "lower" ? v.toLowerCase() : v.toUpperCase();
        if (next !== v) {
          setCell(row, c, next);
          changed++;
        }
      }
    }
    return { changed };
  },

  set({ state, match }, rule) {
    const targets = cols(state, rule.columns, rule.id);
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      for (const c of targets) {
        const same = isEmpty(rule.value) ? isEmpty(row.v[c]) : row.v[c] === rule.value;
        if (same) continue;
        setCell(row, c, rule.value);
        changed++;
      }
    }
    return { changed };
  },

  addColumn({ state }, rule) {
    for (const name of rule.names) {
      if (state.extra.has(name)) {
        throw new RuleError(state.name, rule.id, `이미 있는 열입니다: ${name}`);
      }
      state.extra.set(name, state.width++);
    }
    return { changed: rule.names.length };
  },

  transfer({ state, match }, rule) {
    const from = col(state, rule.from, rule.id);
    const to = col(state, rule.to, rule.id);
    const details = {};
    const conflictRows = [];
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row) || isEmpty(row.v[from])) continue;
      if (!isEmpty(row.v[to])) {
        if (rule.onConflict === "skip") {
          count(details, "대상에 값 있음 → 건너뜀");
          continue;
        }
        if (rule.onConflict === "error") {
          conflictRows.push(row.n);
          continue;
        }
        count(details, "대상에 값 있음 → 덮어씀");
      }
      copyCell(row, from, row, to);
      if (rule.mode === "move") setCell(row, from, null);
      changed++;
    }
    if (conflictRows.length) {
      throw new RuleError(state.name, rule.id, "대상 칸에 이미 값이 있습니다", conflictRows);
    }
    return { changed, details };
  },

  append({ state, match }, rule) {
    const from = col(state, rule.from, rule.id);
    const to = col(state, rule.to, rule.id);
    const ic = rule.ignoreCase === true;
    const flags = ic ? "giu" : "gu";
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 단어 단위로만 지운다(앞뒤가 글자·숫자가 아닐 때).
    const removers = (rule.removeWords ?? []).map(
      (w) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, flags)
    );
    const excludeValues = new Set((rule.excludeValues ?? []).map((v) => lower(v, ic)));
    const excludePatterns = (rule.excludePatterns ?? []).map((p) => new RegExp(p, ic ? "i" : ""));
    const tidy = (s) => s.replace(/\s+/g, " ").replace(/^[\s,;|/]+|[\s,;|/]+$/g, "");

    const details = {};
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row) || isEmpty(row.v[from])) continue;
      let text = str(row, from);
      for (const re of removers) text = text.replace(re, " ");
      let parts = rule.splitBy ? text.split(rule.splitBy) : [text];
      parts = parts.map(tidy).filter(Boolean);
      const kept = parts.filter(
        (p) => !excludeValues.has(lower(p, ic)) && !excludePatterns.some((re) => re.test(p))
      );
      if (kept.length < parts.length) count(details, "제외한 조각", parts.length - kept.length);
      if (!kept.length) {
        count(details, "붙일 내용 없음");
        continue;
      }
      const addition = kept.join(rule.separator);
      const current = str(row, to);
      const parts2 = rule.position === "before" ? [addition, current] : [current, addition];
      setCell(row, to, parts2.filter(Boolean).join(rule.separator));
      changed++;
    }
    return { changed, details };
  },

  dateAdd({ state, match }, rule) {
    const from = col(state, rule.from, rule.id);
    const to = col(state, rule.to, rule.id);
    const daysFrom = rule.daysFrom ? col(state, rule.daysFrom, rule.id) : null;
    const details = {};
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      const base = dateOf(row, from);
      const days = daysFrom == null ? rule.days : row.v[daysFrom];
      if (!base || typeof days !== "number") {
        count(details, base ? "일수 없음" : "날짜 없음");
        continue;
      }
      setCell(row, to, addDays(base, days), "date");
      changed++;
    }
    return { changed, details };
  },

  lookup({ state, match, sheets }, rule) {
    const other = sheets.get(rule.sheet);
    if (!other) {
      throw new RuleError(state.name, rule.id, "참조 시트는 sheets 에서 이 시트보다 먼저 적어야 합니다");
    }
    const key = col(state, rule.key, rule.id);
    const targetKey = col(other, rule.targetKey, rule.id);
    const pairs = rule.fill.map((f) => ({
      ref: f.to,
      from: col(other, f.from, rule.id),
      to: col(state, f.to, rule.id),
    }));

    const index = new Map();
    let duplicates = 0;
    for (const row of other.rows) {
      const k = str(row, targetKey).trim();
      if (!k) continue;
      if (index.has(k)) duplicates++;
      else index.set(k, row);
    }

    const details = {};
    const missingRows = [];
    let changed = 0;
    if (duplicates) count(details, "참조 시트의 중복 키(첫 행 사용)", duplicates);
    for (const row of state.rows) {
      if (!match(row)) continue;
      const found = index.get(str(row, key).trim());
      if (!found) {
        count(details, "매칭 실패");
        if (rule.onMissing === "error") missingRows.push(row.n);
        else if (rule.onMissing === "empty") {
          for (const p of pairs) {
            if (!isEmpty(row.v[p.to])) {
              setCell(row, p.to, null);
              count(details, `${p.ref} 바뀜`);
              changed++;
            }
          }
        }
        continue;
      }
      count(details, "매칭 성공");
      for (const p of pairs) {
        const sourceEmpty = isEmpty(found.v[p.from]);
        if (sourceEmpty && rule.onSourceEmpty === "keep") continue;
        const before = row.v[p.to];
        if (sourceEmpty) setCell(row, p.to, null);
        else copyCell(found, p.from, row, p.to);
        const same = isEmpty(before) ? isEmpty(row.v[p.to]) : before === row.v[p.to];
        if (!same) {
          count(details, `${p.ref} 바뀜`);
          changed++;
        }
      }
    }
    if (missingRows.length) {
      throw new RuleError(state.name, rule.id, "참조 시트에 없는 키가 있습니다", missingRows);
    }
    return { changed, details };
  },

  dedupe({ state, match }, rule) {
    const c = col(state, rule.column, rule.id);
    const groups = new Map();
    for (const row of state.rows) {
      if (!match(row)) continue;
      const k = str(row, c).trim();
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row);
    }
    const remove = new Set();
    const duplicateRows = [];
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      if (rule.keep === "error") duplicateRows.push(...rows.map((r) => r.n));
      else (rule.keep === "first" ? rows.slice(1) : rows.slice(0, -1)).forEach((r) => remove.add(r));
    }
    if (duplicateRows.length) {
      throw new RuleError(state.name, rule.id, "키가 같은 행이 있습니다", duplicateRows);
    }
    state.rows = state.rows.filter((row) => !remove.has(row));
    return { changed: remove.size };
  },

  mustExistIn({ state, match, sheets }, rule) {
    const other = sheets.get(rule.sheet);
    if (!other) {
      throw new RuleError(state.name, rule.id, "참조 시트는 sheets 에서 이 시트보다 먼저 적어야 합니다");
    }
    const c = col(state, rule.column, rule.id);
    const target = col(other, rule.targetColumn, rule.id);
    const known = new Set(other.rows.map((row) => str(row, target).trim()).filter(Boolean));
    const missing = state.rows.filter((row) => match(row) && !known.has(str(row, c).trim()));
    if (missing.length && rule.onMissing === "error") {
      throw new RuleError(state.name, rule.id, "참조 시트에 없는 값이 있습니다", missing.map((r) => r.n));
    }
    if (rule.onMissing === "dropRow") {
      const drop = new Set(missing);
      state.rows = state.rows.filter((row) => !drop.has(row));
    }
    return { changed: rule.onMissing === "dropRow" ? missing.length : 0, details: { "참조 시트에 없음": missing.length } };
  },

  deriveStatus({ state, match, baseDate }, rule) {
    const c = Object.fromEntries(
      Object.entries(rule.columns).map(([name, ref]) => [name, col(state, ref, rule.id)])
    );
    const options = { dummyMarker: rule.dummyMarker, dummyExclude: rule.dummyExclude };
    const details = {};
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row) || str(row, c.status) !== rule.sourceStatus) continue;
      const pmDate = dateOf(row, c.pm);
      const next = classifyOrdered(
        {
          shipping: dateOf(row, c.shipping) ?? "",
          vessel: str(row, c.vessel),
          pm: pmDate ? monthOf(pmDate) : "",
          changeability: dateOf(row, c.changeability) ?? "",
          orderNote: c.orderNote == null ? "" : str(row, c.orderNote),
          cancelled: c.cancelFlag != null && !isEmpty(row.v[c.cancelFlag]),
        },
        baseDate,
        options
      );
      count(details, next);
      if (next !== row.v[c.status]) {
        setCell(row, c.status, next);
        changed++;
      }
    }
    return { changed, details };
  },

  deriveShippingCalc({ state, match }, rule) {
    const c = Object.fromEntries(
      Object.entries(rule.columns).map(([name, ref]) => [name, col(state, ref, rule.id)])
    );
    const details = {};
    let changed = 0;
    for (const row of state.rows) {
      if (!match(row)) continue;
      if (!needsShippingCalc(str(row, c.status), row.v[c.shipping])) continue;
      const pmDate = dateOf(row, c.pm);
      const leadDays = row.v[c.leadDays];
      const value = shippingCalc(pmDate ? monthOf(pmDate) : "", typeof leadDays === "number" ? leadDays : null);
      if (!value) {
        count(details, pmDate ? "리드타임 없음" : "PM 없음");
        continue;
      }
      setCell(row, c.target, value, "date");
      changed++;
    }
    return { changed, details };
  },
};

function checkHeaders(state, config) {
  const wrong = [];
  for (const [letter, expected] of Object.entries(config.expectHeaders ?? {})) {
    const index = state.columns.get(letterToIndex(letter));
    if (index == null || state.headers[index] !== cleanHeader(expected)) wrong.push(letter);
  }
  if (wrong.length) {
    throw new RuleError(
      state.name,
      null,
      `헤더가 expectHeaders 와 다릅니다(열이 밀렸을 수 있습니다): ${wrong.join(", ")}`
    );
  }
}

/**
 * @param {{sheets: Array}} workbook readWorkbook 의 결과
 * @param {object} rules validateRules 를 통과한 규칙 파일
 * @returns {{
 *   baseDate: string,
 *   baseDateSource: "rules" | "today",
 *   report: Array<{sheet, id, type, changed, details}>,
 *   tables: Array<{name, sheet, key, columns: string[], rows: any[][]}>,
 * }}
 */
export function runRules(workbook, rules) {
  const baseDate = rules.baseDate ?? todayIso();
  const sheets = new Map();
  const report = [];

  for (const config of rules.sheets) {
    const source = workbook.sheets.find((s) => s.name === config.sheet);
    if (!source) throw new RuleError(config.sheet, null, "통합 문서에 이 시트가 없습니다");
    const state = buildState(source, config);
    checkHeaders(state, config);

    for (const rule of config.rules) {
      const match = compileWhere(state, rule.where, rule.id, baseDate);
      const result = RULES[rule.type]({ state, match, sheets, baseDate }, rule);
      report.push({
        sheet: config.sheet,
        id: rule.id,
        type: rule.type,
        changed: result.changed,
        details: result.details ?? {},
      });
    }
    sheets.set(config.sheet, state);
  }

  const tables = rules.outputs.map((output) => {
    const state = sheets.get(output.sheet);
    const indexes = output.columns.map((c) => col(state, c.from, `outputs:${output.name}`));
    return {
      name: output.name,
      sheet: output.sheet,
      key: output.columns.find((c) => c.from === output.key).name,
      columns: output.columns.map((c) => c.name),
      rows: state.rows.map((row) => indexes.map((i) => (isEmpty(row.v[i]) ? null : row.v[i]))),
    };
  });

  return {
    baseDate,
    baseDateSource: rules.baseDate ? "rules" : "today",
    report,
    tables,
  };
}
