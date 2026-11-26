// Microsoft Graph 호출 계층 — 429/5xx 재시도 + 페이지 따라가기 + $batch + 동시성 제한
// (운영 레포 kufri 의 src/lib/graph.js 를 옮겨 온 것)
import { GRAPH } from "./config.js";
import { getToken } from "./auth.js";

// 최근 호출 기록. 오류 진단용이며, 긴 세션에서 무한히 쌓이지 않게 최근 MAX 건만 둔다.
const MAX_CALLS = 200;
export const telemetry = {
  calls: [],
  add(rec) {
    this.calls.push(rec);
    if (this.calls.length > MAX_CALLS) {
      this.calls.splice(0, this.calls.length - MAX_CALLS);
    }
    return rec;
  },
};

export class GraphError extends Error {
  constructor(status, code, message) {
    super(`${status} ${code}: ${message}`);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RETRY_STATUS = [429, 503, 504];

/**
 * Graph 단일 호출.
 * @param {string} path '/sites/...' 같은 상대 경로 또는 절대 URL(nextLink)
 * @param {{method?: string, body?: object, raw?: Blob|ArrayBuffer, headers?: object, name?: string}} opts
 *   body 는 JSON 으로 보낸다. raw 는 파일 내용처럼 그대로 보낼 본문이다(Content-Type 은 headers 로 준다)
 */
export async function gfetch(path, opts = {}) {
  const {
    method = "GET",
    body,
    raw,
    headers = {},
    name = `${method} ${path.split("?")[0]}`,
  } = opts;
  const url = path.startsWith("http") ? path : GRAPH.base + path;

  let retries = 0;
  while (true) {
    const { accessToken } = await getToken();
    const startedAt = performance.now();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const ms = performance.now() - startedAt;

    // 스로틀·일시 장애는 Retry-After 를 존중해 다시 시도한다.
    // 무시하고 바로 재시도하면 스로틀이 길어진다.
    if (RETRY_STATUS.includes(res.status) && retries < GRAPH.maxRetry) {
      const waitMs =
        (Number(res.headers.get("Retry-After")) || 2 ** retries) * 1000;
      retries++;
      telemetry.add({ name, status: res.status, ms, retries, waitMs });
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      telemetry.add({ name, status: res.status, ms, retries });
      throw new GraphError(
        res.status,
        payload.error?.code ?? res.statusText,
        payload.error?.message ?? ""
      );
    }

    telemetry.add({ name, status: res.status, ms, retries });
    return res.status === 204 ? null : res.json();
  }
}

/** @odata.nextLink 를 끝까지 따라가며 value 를 모은다. */
export async function gfetchAll(path, opts = {}) {
  const items = [];
  let next = path;
  let pages = 0;
  while (next) {
    const data = await gfetch(next, {
      ...opts,
      name: `${opts.name ?? "page"}#${pages}`,
    });
    items.push(...(data.value ?? []));
    next = data["@odata.nextLink"] ?? null;
    pages++;
  }
  return { items, pages };
}

/**
 * Graph $batch — 요청 최대 20개를 HTTP 왕복 한 번으로 묶는다.
 * 네트워크 왕복만 줄일 뿐 SharePoint 부하는 줄지 않는다.
 * @param {Array<{id, method, url, body?, headers?}>} requests url 은 /v1.0 없는 상대 경로
 * @returns {Promise<Array<{id, status, body, headers}>>}
 */
export async function gbatch(requests, name = "batch") {
  if (requests.length > 20) {
    throw new Error("Graph $batch 는 요청 20개가 상한입니다.");
  }
  const payload = {
    requests: requests.map((r) => ({
      id: String(r.id),
      method: r.method,
      url: r.url,
      ...(r.body
        ? {
            body: r.body,
            headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
          }
        : {}),
      ...(r.headers && !r.body ? { headers: r.headers } : {}),
    })),
  };
  const data = await gfetch("/$batch", { method: "POST", body: payload, name });
  return (data.responses ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    body: r.body,
    headers: r.headers,
  }));
}

/** 동시성 제한 실행기. tasks 는 () => Promise 형태. */
export async function runPool(tasks, concurrency, onProgress) {
  const results = new Array(tasks.length);
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      done++;
      onProgress?.(done, tasks.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );
  return results;
}

export const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
