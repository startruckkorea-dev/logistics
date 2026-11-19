// Logistics 차량 마스터의 열 정의와 표시용 상수.
//   key   : 차량 데이터의 필드 이름(List 열 이름과 같다)
//   label : 화면 열 이름
//   group : 상세 화면에서 묶는 그룹
//   src   : 출처 배지
//   memo  : 긴 글 열(그리드에서 말줄임)
//   drawerAfter : 상세 드로어에서만 지정한 열 바로 뒤에 둔다(그리드 순서는 그대로)
export const COLUMNS = [
  { key: "commission_no", label: "Commission No", group: "기본", src: "AFAB" },
  { key: "current_status", label: "Current Status", group: "기본", src: "AFAB/입력" },
  { key: "model_year", label: "MY", group: "기본", src: "MODEL_MASTER" },
  { key: "bm", label: "BM", group: "기본", src: "MODEL_MASTER" },
  { key: "vin_no", label: "Vin No", group: "기본", src: "AFAB" },
  { key: "vehicle", label: "Vehicle", group: "기본", src: "MODEL_MASTER" },
  { key: "model", label: "Model", group: "기본", src: "MODEL_MASTER" },
  { key: "type", label: "Type", group: "기본", src: "MODEL_MASTER" },
  { key: "axle", label: "Axle", group: "기본", src: "MODEL_MASTER" },
  { key: "cab", label: "Cab", group: "기본", src: "MODEL_MASTER" },
  { key: "cab_gen", label: "Cab Gen", group: "기본", src: "MODEL_MASTER" },
  { key: "wheelbase", label: "Wheelbase", group: "기본", src: "MODEL_MASTER" },
  { key: "pto", label: "PTO", group: "기본", src: "MODEL_MASTER" },
  { key: "emission", label: "Emission", group: "기본", src: "MODEL_MASTER" },
  { key: "changeability_date", label: "Changeability Date", group: "일정", src: "AFAB" },
  { key: "pm", label: "PM", group: "일정", src: "AFAB" },
  { key: "original_pm", label: "Original PM", group: "일정", src: "오더 생성" },
  { key: "tdd_calc", label: "TDD Calc", group: "일정", src: "AFAB" },
  { key: "dispatch", label: "Dispatch", group: "일정", src: "AFAB" },
  { key: "shipping_calc", label: "Shipping Calc", group: "일정", src: "PM + LEAD TIME" },
  { key: "shipping", label: "Shipping", group: "일정", src: "AFAB" },
  { key: "invoice", label: "Invoice", group: "선적", src: "AFAB" },
  { key: "planned_arrival", label: "Planned Arrival", group: "일정", src: "AFAB" },
  { key: "eta_from_tdd", label: "ETA From TDD", group: "일정", src: "+75 FROM TDD" },
  { key: "eta_from_eukor_pirt", label: "ETA From EUKOR/PIRT", group: "일정", src: "선적·입항" },
  { key: "ata", label: "ATA", group: "일정", src: "선적·입항" },
  { key: "tsc_arrival_date", label: "TSC Arrival Date", group: "일정", src: "선적·입항" },
  { key: "bl_no", label: "B/L No", group: "선적", src: "선적·입항" },
  { key: "vessel", label: "Vessel", group: "선적", src: "AFAB" },
  { key: "customs_clearance_date", label: "Customs Clearance Date", group: "통관", src: "통관" },
  { key: "color_code", label: "Color Code", group: "사양", src: "AFAB" },
  { key: "color_name", label: "Color Name", group: "사양", src: "COLOR_MASTER" },
  { key: "tires", label: "Tires", group: "사양", src: "WINGS", memo: true },
  { key: "model_in_afab", label: "Model In AFAB", group: "사양", src: "AFAB" },
  { key: "engine_no", label: "Engine No", group: "기본", src: "AFAB" },
  { key: "import_license", label: "Import License", group: "통관", src: "통관" },
  { key: "ref_commission_no", label: "Ref Commission No", group: "메모", src: "입력", drawerAfter: "order_note" },
  { key: "option_note", label: "Option Note", group: "메모", src: "입력", memo: true },
  { key: "order_note", label: "Order Note", group: "메모", src: "입력", memo: true },
  { key: "order_update_date", label: "Order Update Date", group: "일정", src: "오더 생성" },
  { key: "b1_factory_order", label: "B1 Factory Order", group: "일정", src: "입력" },
  { key: "co", label: "C/O", group: "메모", src: "입력", drawerAfter: "ref_commission_no" },
  { key: "sales_month", label: "Sales Month", group: "일정", src: "입력" },
  { key: "model_classification", label: "Model Classification", group: "사양", src: "자동" },
  { key: "gen", label: "Gen", group: "사양", src: "AFAB" },
  { key: "spec", label: "Spec", group: "사양", src: "자동" },
  { key: "sub_cat", label: "Sub Cat", group: "사양", src: "AFAB" },
  { key: "afab_editable", label: "AFAB 수정 가능", group: "사양", src: "AFAB" },
  { key: "baumuster", label: "Baumuster", group: "사양", src: "AFAB" },
];

// 상세 드로어의 카드 순서
export const GROUPS = ["기본", "메모", "일정", "선적", "통관", "사양"];

// 그리드 위 바로가기 버튼이 이동하는 열
export const GRID_JUMPS = ["current_status", "tdd_calc", "bl_no", "option_note"];

// 검색어를 찾는 열
export const SEARCH_COLUMNS = [
  "commission_no", "vin_no", "bl_no", "vessel", "type", "engine_no", "order_note", "option_note",
];

// 열 필터를 쓸 수 있는 열. 날짜 열은 연·월 단위로 고른다.
export const DATE_FILTER_COLUMNS = [
  "changeability_date", "pm", "original_pm", "tdd_calc", "dispatch", "shipping_calc", "shipping",
  "invoice", "planned_arrival", "eta_from_tdd", "eta_from_eukor_pirt", "ata", "tsc_arrival_date",
  "customs_clearance_date", "order_update_date",
];
export const FILTER_COLUMNS = [
  "current_status", "gen", "vehicle", "model", "type", "axle", "cab", "cab_gen", "wheelbase", "pto",
  "emission", ...DATE_FILTER_COLUMNS, "vessel",
];

// Current Status 열 필터에서 값을 나열하는 순서(단계 순)
export const STAGE_ORDER = [
  "Ordered(Dummy)", "Ordered(Changeable)", "Ordered(Fixed)", "Rejected", "In Production",
  "Shipment scheduled", "In Transit", "Bonded Stock", "OH Stock", "Sold", "Cancelled",
];

// 출처 배지: 배지 색(cls)과 설명(tip)
const SOURCE_BADGES = {
  AFAB: { cls: "afab", tip: "AFAB 업로드로만 갱신(잠금)" },
  "AFAB/입력": { cls: "afab", tip: "AFAB 기준 자동 판정 + Editor 입력(override)" },
  WINGS: { cls: "afab", tip: "WINGS 연동 값(잠금)" },
  "+75 FROM TDD": { cls: "afab", tip: "TDD Calc + 75일 자동 계산(잠금)" },
  "PM + LEAD TIME": { cls: "auto", tip: "PM 1일 + 모델 리드타임(일, PM~Shipping)으로 작성(잠금)" },
  자동: { cls: "auto", tip: "시스템 계산(잠금)" },
  MODEL_MASTER: { cls: "auto", tip: "모델 마스터에서 자동 반영(잠금)" },
  COLOR_MASTER: { cls: "auto", tip: "색상 마스터에서 자동 반영(잠금)" },
  "선적·입항": { cls: "auto", tip: "선적·입항 화면에서 선박 단위 입력(잠금)" },
  "오더 생성": { cls: "auto", tip: "오더 생성 시 기록(잠금)" },
  통관: { cls: "auto", tip: "통관 완료 처리로 반영(잠금)" },
  입력: { cls: "input", tip: "Editor 수동 입력" },
};
export const sourceBadge = (src) => SOURCE_BADGES[src] ?? SOURCE_BADGES["입력"];

// Current Status → 알약 표시의 색 클래스
const STAGE_CLASSES = {
  "Ordered(Dummy)": "st-ordered",
  Rejected: "st-cancel",
  "Ordered(Changeable)": "st-ordered",
  "Ordered(Fixed)": "st-ordered",
  "In Production": "st-prod",
  "Shipment scheduled": "st-sched",
  "In Transit": "st-transit",
  "Bonded Stock": "st-bonded",
  "OH Stock": "st-oh",
  Sold: "st-sold",
  Cancelled: "st-cancel",
};
export const stageClass = (stage) => STAGE_CLASSES[stage] ?? "neutral";
