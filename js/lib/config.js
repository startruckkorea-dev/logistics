// Entra ID 앱 등록 정보. SPA(public client)라 client secret 없이 PKCE로 인증한다.
// clientId / tenantId 는 인증 요청 URL 에 그대로 실려 나가는 공개 식별자라 소스에 둔다.
export const AUTH = {
  clientId: "9b247088-5afb-4622-9c5e-b5f27142761d",
  tenantId: "19cab1f5-21f4-44df-8ac6-96d6ca595203",
  // 앱 등록의 SPA 리디렉션 URI와 정확히 일치해야 한다.
  redirectUri: `${window.location.origin}/`,
};

// .default = 앱 등록에 이미 부여된 위임 권한만 요청 (추가 동의 팝업 없음)
export const GRAPH_SCOPES = ["https://graph.microsoft.com/.default"];

export const GRAPH = {
  base: "https://graph.microsoft.com/v1.0",
  // 429/503/504 재시도 횟수. Retry-After 를 존중한다.
  maxRetry: 3,
  // $batch 한 번에 담는 요청 수(Graph 상한 20)와 동시 실행 수.
  // SharePoint 부하를 조절하는 레버는 동시성이다.
  batchSize: 20,
  concurrency: 4,
};

// 환경별 값. UAT 와 운영은 같은 코드를 쓰고 호스트명으로만 갈린다.
// 운영 반영 = 파일 복사가 되도록, 환경에 따라 달라지는 값은 전부 여기에 둔다.
const ENVIRONMENTS = {
  // folders 의 경로는 기본 문서 라이브러리(Shared Documents) 기준이다.
  //   modify       : 수정용. 전처리 원본 엑셀도 여기에 있다.
  //   readDownload : 조회·내려받기용.
  // rulesFile 은 전처리 규칙 파일의 경로다. 규칙 내용은 저장소가 아니라 이 파일에만 둔다.
  // lists 는 SharePoint List 이름이다. 환경 접두어(UAT_/PRD_)를 반드시 붙인다.
  uat: {
    label: "UAT",
    // 화면이 "오늘"로 삼는 날짜. null 이면 실제 오늘을 쓴다.
    // 이관 파일을 수시로 다시 적재하므로 고정하지 않는다. 전처리 규칙 파일의 baseDate 도 같이 비워야
    // 상태 판정과 화면이 같은 날짜를 본다(날짜를 고정하려면 두 곳을 같은 값으로 둔다).
    baseDate: null,
    folders: {
      modify: "02._kufri_UAT/Internal/Modify",
      readDownload: "02._kufri_UAT/Internal/R-Download",
    },
    rulesFile: "02._kufri_UAT/Internal/Modify/preprocess-rules.uat.json",
    // 1차 이관 파일용 규칙 파일(고정). 1차 파일을 다시 적재해 List 를 1차 상태로 되돌릴 때 쓴다.
    // 관리 화면에서 rulesFile(수시로 올리는 파일용)과 골라 쓴다. null 이면 고르는 칸이 없다.
    baselineRulesFile: "02._kufri_UAT/Internal/Modify/preprocess-rules.uat.phase1.json",
    // 모델 고정 목록: 1차 이관 때 이미 모델이 확정된 차량. 적재가 이 차량의 모델 관련 열을 바꾸지 않는다.
    //   lockRulesFile: 1차 파일에서 대상 차량을 고르는 규칙 파일(형식은 전처리 규칙 파일과 같다)
    //   modelLockFile: 만들어진 목록. 관리 화면에서 만든다
    lockRulesFile: "02._kufri_UAT/Internal/Modify/model-lock-rules.uat.json",
    modelLockFile: "02._kufri_UAT/Internal/Modify/model-lock.uat.json",
    // AFAB 업로드가 올린 파일을 가공할 때 쓰는 규칙 파일. 형식은 전처리 규칙 파일과 같다.
    afabRulesFile: "02._kufri_UAT/Internal/Modify/afab-rules.uat.json",
    // 선적·입항 공지(자유 입력 한 칸). 처음 저장할 때 만들어진다.
    noticeFile: "02._kufri_UAT/Internal/Modify/shipping-notice.uat.json",
    // 기준값(KUFRI 생산판매계획이 쓰는 값). 마스터·설정의 "기준값" 탭에서 고친다. 파일은 사람이 올려 둔다.
    settingsFile: "02._kufri_UAT/Internal/Modify/kufri-setting.uat.json",
    lists: {
      modelMaster: "UAT_ModelMaster",
      colorMaster: "UAT_ColorMaster",
      logisticsAfab: "UAT_Logistics_AFAB",
      logisticsMain: "UAT_Logistics_Main",
      vehicleHistory: "UAT_Vehicle_History",
      voyages: "UAT_Voyages",
      // 쓰기 점검 전용(관리 화면). 차량 데이터와 무관한 빈 List 다. 운영에는 두지 않는다.
      writeCheck: "UAT_WriteCheck",
    },
  },
  prod: {
    label: "운영",
    baseDate: null,
    folders: {
      modify: "01._kufri/Internal/Modify",
      readDownload: "01._kufri/Internal/R-Download",
    },
    rulesFile: "01._kufri/Internal/Modify/preprocess-rules.prod.json",
    baselineRulesFile: null,
    lockRulesFile: "01._kufri/Internal/Modify/model-lock-rules.prod.json",
    modelLockFile: "01._kufri/Internal/Modify/model-lock.prod.json",
    afabRulesFile: "01._kufri/Internal/Modify/afab-rules.prod.json",
    noticeFile: "01._kufri/Internal/Modify/shipping-notice.prod.json",
    settingsFile: "01._kufri/Internal/Modify/kufri-setting.prod.json",
    lists: {
      modelMaster: "PRD_ModelMaster",
      colorMaster: "PRD_ColorMaster",
      logisticsAfab: "PRD_Logistics_AFAB",
      logisticsMain: "PRD_Logistics_Main",
      vehicleHistory: "PRD_Vehicle_History",
      voyages: "PRD_Voyages",
    },
  },
};

const PROD_HOSTS = ["kufri.startruckkorea.com"];

// 운영 호스트가 아니면(UAT 도메인, localhost 등) 모두 UAT 로 본다.
export const ENV_NAME = PROD_HOSTS.includes(window.location.hostname)
  ? "prod"
  : "uat";
export const ENV = ENVIRONMENTS[ENV_NAME];

export const SHAREPOINT = {
  hostname: "startruckkorea.sharepoint.com",
  sitePath: "/sites/STK-Kufri",
  folders: ENV.folders,
  rulesFile: ENV.rulesFile,
  baselineRulesFile: ENV.baselineRulesFile,
  lockRulesFile: ENV.lockRulesFile,
  modelLockFile: ENV.modelLockFile,
  afabRulesFile: ENV.afabRulesFile,
  noticeFile: ENV.noticeFile,
  settingsFile: ENV.settingsFile,
  // 같은 사이트를 UAT 와 운영이 같이 쓰므로 List 는 이름의 접두어로 구분한다.
  lists: ENV.lists,
};
