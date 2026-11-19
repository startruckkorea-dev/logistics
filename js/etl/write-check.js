// 쓰기 점검 — 저장할 때 쓸 충돌 감지(If-Match 헤더 → 412)가 실제로 동작하는지 확인한다.
// 점검 전용 List 의 항목 하나(Title 열)에만 쓴다. 차량 데이터 List 는 건드리지 않는다.
// 화면에는 요청 종류와 응답 상태만 표시한다.
import { mk } from "../lib/dom.js";
import { ENV, SHAREPOINT } from "../lib/config.js";
import { gfetch, gbatch } from "../lib/graph.js";
import { getSiteId, findListId } from "../lib/splist.js";

/** 점검용 List 이름. 없는 환경에서는 점검 기능을 보여주지 않는다. */
export const WRITE_CHECK_LIST = SHAREPOINT.lists.writeCheck ?? null;

const SUCCESS = "성공";
const CONFLICT = "412";

const etagOf = (obj) => obj?.["@odata.etag"] ?? obj?.eTag ?? null;

// 요청을 실행하고 결과를 "성공" 또는 상태 코드 문자열로 돌려준다.
async function outcome(run) {
  try {
    return { result: SUCCESS, body: await run() };
  } catch (err) {
    return { result: String(err?.status ?? "실패"), body: null };
  }
}

// $batch 응답 하나를 같은 형식으로
const batchOutcome = (res) => ({
  result: res && res.status >= 200 && res.status < 300 ? SUCCESS : String(res?.status ?? "실패"),
  body: res?.body ?? null,
});

async function runChecks(setStatus) {
  const listId = await findListId(WRITE_CHECK_LIST);
  const base = `/sites/${await getSiteId()}/lists/${listId}/items`;
  const rows = [];
  const add = (label, expected, actual) => rows.push({ label, expected, actual });

  const readEtag = async (id) =>
    etagOf(await gfetch(`${base}/${id}?$select=id,eTag`, { name: "check.read" }));
  const patchFields = (id, etag, title) =>
    gfetch(`${base}/${id}/fields`, {
      method: "PATCH",
      headers: { "If-Match": etag },
      body: { Title: title },
      name: "check.patchFields",
    });
  const patchItem = (id, etag, title) =>
    gfetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { "If-Match": etag },
      body: { fields: { Title: title } },
      name: "check.patchItem",
    });
  const batchPatch = async (id, etag, title) => {
    const [res] = await gbatch(
      [
        {
          id: 1,
          method: "PATCH",
          url: `${base}/${id}/fields`,
          headers: { "If-Match": etag },
          body: { Title: title },
        },
      ],
      "check.batch"
    );
    return batchOutcome(res);
  };

  // 1. 점검에 쓸 항목. 없으면 하나 만든다(지우지 않고 다음 점검에서 다시 쓴다).
  setStatus("점검용 항목을 준비하는 중...");
  const page = await gfetch(`${base}?$select=id,eTag&$top=1`, { name: "check.list" });
  let id = page.value?.[0]?.id;
  if (id) {
    add("목록 읽기 응답에 ETag", "있음", etagOf(page.value[0]) ? "있음" : "없음");
  } else {
    const created = await gfetch(base, {
      method: "POST",
      body: { fields: { Title: "write-check" } },
      name: "check.create",
    });
    id = created.id;
    add("항목 추가 응답에 ETag", "있음", etagOf(created) ? "있음" : "없음");
  }

  const e0 = await readEtag(id);
  add("항목 읽기 응답에 ETag", "있음", e0 ? "있음" : "없음");
  if (!e0) return rows;

  // 2. 단일 요청 — 최신 ETag 로 쓰기
  setStatus("단일 요청을 점검하는 중...");
  const fresh = await outcome(() => patchFields(id, e0, "write-check 1"));
  add("최신 ETag 로 쓰기 (/fields)", SUCCESS, fresh.result);
  add("쓰기 응답에 새 ETag", "있음", etagOf(fresh.body) ? "있음" : "없음");
  const e1 = await readEtag(id);
  add("쓰기 뒤 ETag 가 바뀜", "바뀜", e1 !== e0 ? "바뀜" : "그대로");

  // 3. 단일 요청 — 지난 ETag 로 쓰기. 412 가 나와야 충돌을 잡을 수 있다.
  const stale = await outcome(() => patchFields(id, e0, "write-check 2"));
  add("지난 ETag 로 쓰기 (/fields)", CONFLICT, stale.result);

  // 4. 항목 경로(/items/{id})로도 같은 점검. /fields 가 If-Match 를 무시할 때의 대안이다.
  const e2 = await readEtag(id);
  const itemFresh = await outcome(() => patchItem(id, e2, "write-check 3"));
  add("최신 ETag 로 쓰기 (항목 경로)", SUCCESS, itemFresh.result);
  const itemStale = await outcome(() => patchItem(id, e2, "write-check 4"));
  add("지난 ETag 로 쓰기 (항목 경로)", CONFLICT, itemStale.result);

  // 5. $batch 안에서
  setStatus("$batch 요청을 점검하는 중...");
  const e3 = await readEtag(id);
  add("$batch — 최신 ETag 로 쓰기", SUCCESS, (await batchPatch(id, e3, "write-check 5")).result);
  add("$batch — 지난 ETag 로 쓰기", CONFLICT, (await batchPatch(id, e3, "write-check 6")).result);

  return rows;
}

function resultTable(rows) {
  return mk(
    "div",
    { class: "grid-wrap" },
    mk(
      "table",
      { class: "grid" },
      mk("thead", null, mk("tr", null, ["점검", "기대", "결과", "판정"].map((h) => mk("th", null, h)))),
      mk(
        "tbody",
        null,
        rows.map((row) =>
          mk(
            "tr",
            null,
            [row.label, row.expected, row.actual, row.expected === row.actual ? "일치" : "다름"].map((v) =>
              mk("td", null, v)
            )
          )
        )
      )
    )
  );
}

/** "쓰기 점검" 화면. 점검용 List 에 대고 If-Match 동작을 확인해 표로 보여준다. */
export async function renderWriteCheck(container, setStatus) {
  container.hidden = false;
  container.replaceChildren(
    mk("h2", null, `쓰기 점검 — ${ENV.label}`),
    mk("p", { class: "hint" }, `대상 List: ${WRITE_CHECK_LIST}. 이 List 의 항목 하나(Title 열)에만 씁니다.`)
  );

  let rows;
  try {
    rows = await runChecks(setStatus);
  } catch (err) {
    console.error(err);
    const reason =
      err?.status === 403
        ? "이 List 에 쓸 권한이 없습니다(403)."
        : `${err?.status ?? ""} ${err?.code ?? ""} ${err?.message ?? ""}`.trim();
    setStatus(`쓰기 점검 실패: ${reason}`, true);
    return;
  }

  container.append(resultTable(rows));
  const different = rows.filter((row) => row.expected !== row.actual).length;
  setStatus(
    different
      ? `쓰기 점검: 기대와 다른 항목 ${different}건. 표의 "다름" 줄을 전달해 주세요.`
      : "쓰기 점검: 모든 항목이 기대와 같습니다.",
    different > 0
  );
}
