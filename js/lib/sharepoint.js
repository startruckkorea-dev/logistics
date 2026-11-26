import { SHAREPOINT } from "./config.js";
import { gfetch, gfetchAll } from "./graph.js";

// Graph는 사이트 경로와 항목 경로를 한 URL에 같이 쓰는 것을 허용하지 않아
// 사이트의 기본 문서 라이브러리(drive) ID를 먼저 조회해 둔다.
let driveIdPromise;
export function getDriveId() {
  driveIdPromise ??= gfetch(
    `/sites/${SHAREPOINT.hostname}:${SHAREPOINT.sitePath}:/drive?$select=id`
  ).then((drive) => drive.id);
  return driveIdPromise;
}

async function folderPathOf(folderPath) {
  const driveId = await getDriveId();
  const path = folderPath.split("/").map(encodeURIComponent).join("/");
  return path ? `/drives/${driveId}/root:/${path}:` : `/drives/${driveId}/root`;
}

/**
 * 문서 라이브러리의 텍스트 파일을 읽는다.
 * @param {string} filePath 기본 문서 라이브러리 기준 경로
 * @returns {Promise<{name: string, lastModified: string, version: string, text: string}>}
 *   version 은 SharePoint 버전 번호("3.0" 등). 조회에 실패하면 "".
 */
export async function readTextFile(filePath) {
  const driveId = await getDriveId();
  const path = filePath.split("/").map(encodeURIComponent).join("/");
  const itemPath = `/drives/${driveId}/root:/${path}`;
  const urlOf = (it) => it["@microsoft.graph.downloadUrl"] ?? it["@content.downloadUrl"];

  // 내려받기 주소는 $select 에 content.downloadUrl 로 적어야 온다.
  // 그래도 오지 않는 테넌트가 있어, 그때만 $select 없이 한 번 더 조회한다.
  let item = await gfetch(
    `${itemPath}?$select=id,name,lastModifiedDateTime,content.downloadUrl`,
    { name: "readTextFile.item" }
  );
  if (!urlOf(item)) item = await gfetch(itemPath, { name: "readTextFile.itemFull" });
  const downloadUrl = urlOf(item);
  if (!downloadUrl) throw new Error("파일을 내려받을 주소를 받지 못했습니다.");

  // downloadUrl 은 짧은 시간만 유효한 사전 인증 주소다. Authorization 헤더를 붙이지 않는다.
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`파일 내려받기 실패 (${res.status})`);
  const text = await res.text();

  // 버전 번호는 표시용이다. 조회에 실패해도 파일 읽기는 성공으로 본다.
  let version = "";
  try {
    const versions = await gfetch(
      `/drives/${driveId}/items/${item.id}/versions?$select=id&$top=1`,
      { name: "readTextFile.versions" }
    );
    version = versions.value?.[0]?.id ?? "";
  } catch {
    version = "";
  }

  return { name: item.name, lastModified: item.lastModifiedDateTime, version, text };
}

// 폴더 바로 아래 항목(파일/하위 폴더)을 모두 가져온다.
// folderPath 는 SHAREPOINT.folders 의 값 중 하나를 넘긴다.
export async function listFolder(folderPath) {
  const { items } = await gfetchAll(
    `${await folderPathOf(folderPath)}/children` +
      "?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder&$top=200",
    { name: "listFolder" }
  );
  return items;
}

// ---- JSON 파일 읽기·쓰기 (공지처럼 List 로 두지 않는 작은 값) ----

const filePathOf = async (filePath) =>
  `/drives/${await getDriveId()}/root:/${filePath.split("/").map(encodeURIComponent).join("/")}`;

/**
 * 문서 라이브러리의 JSON 파일을 읽는다.
 * @param {string} filePath 기본 문서 라이브러리 기준 경로
 * @returns {Promise<{data: any, etag: string}|null>} 파일이 없으면 null. etag 는 저장할 때 충돌 확인에 쓴다
 */
export async function readJsonFile(filePath) {
  const itemPath = await filePathOf(filePath);
  const urlOf = (it) => it["@microsoft.graph.downloadUrl"] ?? it["@content.downloadUrl"];
  let item;
  try {
    item = await gfetch(`${itemPath}?$select=id,eTag,content.downloadUrl`, { name: "readJsonFile.item" });
    if (!urlOf(item)) item = await gfetch(itemPath, { name: "readJsonFile.itemFull" });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
  const downloadUrl = urlOf(item);
  if (!downloadUrl) throw new Error("파일을 내려받을 주소를 받지 못했습니다.");
  // 사전 인증 주소라 Authorization 헤더를 붙이지 않는다.
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`파일 내려받기 실패 (${res.status})`);
  return { data: await res.json(), etag: item.eTag ?? "" };
}

/**
 * JSON 파일을 쓴다(없으면 만든다).
 * @param {string} filePath 기본 문서 라이브러리 기준 경로
 * @param {object} data
 * @param {string} [etag] 읽을 때 받은 값. 주면 그사이 파일이 바뀌었을 때 쓰지 않고 412 오류가 난다
 * @returns {Promise<{etag: string}>}
 */
export async function writeJsonFile(filePath, data, etag) {
  const item = await gfetch(`${await filePathOf(filePath)}:/content`, {
    method: "PUT",
    body: data,
    headers: etag ? { "If-Match": etag } : {},
    name: "writeJsonFile",
  });
  return { etag: item?.eTag ?? "" };
}

/**
 * 파일을 내용 그대로 쓴다(없으면 만들고, 있으면 덮어쓴다). 엑셀처럼 JSON 이 아닌 파일에 쓴다. 4MB 이하.
 * @param {string} filePath 기본 문서 라이브러리 기준 경로
 * @param {ArrayBuffer|Blob} bytes
 * @param {string} contentType
 * @returns {Promise<void>}
 */
export async function writeBinaryFile(filePath, bytes, contentType) {
  await gfetch(`${await filePathOf(filePath)}:/content`, {
    method: "PUT",
    raw: bytes,
    headers: { "Content-Type": contentType },
    name: "writeBinaryFile",
  });
}
