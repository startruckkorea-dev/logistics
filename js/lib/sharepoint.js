import { SHAREPOINT } from "./config.js";
import { gfetch, gfetchAll } from "./graph.js";

// Graph는 사이트 경로와 항목 경로를 한 URL에 같이 쓰는 것을 허용하지 않아
// 사이트의 기본 문서 라이브러리(drive) ID를 먼저 조회해 둔다.
let driveIdPromise;
function getDriveId() {
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

// 폴더 바로 아래 항목(파일/하위 폴더)을 모두 가져온다.
export async function listFolder(folderPath = SHAREPOINT.folderPath) {
  const { items } = await gfetchAll(
    `${await folderPathOf(folderPath)}/children` +
      "?$select=id,name,size,lastModifiedDateTime,webUrl,file,folder&$top=200",
    { name: "listFolder" }
  );
  return items;
}
