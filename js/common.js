'use strict';
/* ===== 공통: 상수·컴포넌트·Drawer·Modal·Toast ===== */

const STAGES = ['Ordered(Dummy)','Rejected','Ordered(Changeable)','Ordered(Fixed)','In Production','Shipment scheduled','In Transit','Bonded Stock','OH Stock','Sold'];
const STAGE_CLASS = {'Ordered(Dummy)':'st-ordered','Rejected':'st-cancel','Ordered(Changeable)':'st-ordered','Ordered(Fixed)':'st-ordered','In Production':'st-prod','Shipment scheduled':'st-sched','In Transit':'st-transit','Bonded Stock':'st-bonded','OH Stock':'st-oh','Sold':'st-sold','Cancelled':'st-cancel'};
const STAGE_COLOR = {'Ordered(Dummy)':'var(--st-ordered)','Rejected':'var(--st-cancel)','Ordered(Changeable)':'var(--st-ordered)','Ordered(Fixed)':'var(--st-ordered)','In Production':'var(--st-prod)','Shipment scheduled':'var(--st-sched)','In Transit':'var(--st-transit)','Bonded Stock':'var(--st-bonded)','OH Stock':'var(--st-oh)','Sold':'var(--st-sold)','Cancelled':'var(--st-cancel)'};
const STAGE_SHORT = {'Ordered(Dummy)':'Ordered(Dummy)','Rejected':'Rejected','Ordered(Changeable)':'Ordered(Changeable)','Ordered(Fixed)':'Ordered(Fixed)','In Production':'In Production','Shipment scheduled':'Shipment scheduled','In Transit':'In Transit (Shipped / Invoiced)','Bonded Stock':'Bonded Stock','OH Stock':'OH Stock','Sold':'Sold','Cancelled':'Cancelled'};
const SERIES = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s7)','var(--s8)'];
// 연식(MY) 표시 키·색 (10/29: stock.js → 공용, MY28 추가 — 대시보드 카드도 사용) · MY28 색 --s5 분홍(10/30 사용자 변경, 이전 --s8 빨강)은 dataviz 팔레트 검증(인접 색각 분리) 통과 · '기타' = MY23 이하·판독 불가
const MY_KEYS = ['MY24','MY25','MY26','MY27','MY28'];
const MY_COLORS = {'MY24':'var(--s7)','MY25':'var(--s1)','MY26':'var(--s3)','MY27':'var(--s4)','MY28':'var(--s5)','기타':'#9aa5b1'};
// 장소 띠·항구 표시 정의 (10/29 재고현황 차트 가상안 확정): 화면은 한글 이름(EN 모드는 I18N), 영문(en)은 툴팁 · 아이콘 = 독일 국기 깃발 · 바다 그림 · 태극기 깃발 · 항구는 띠가 아니라 구간 경계 세로선 · short = 국가명 없는 짧은 이름(11/02 #2 대시보드 띠, 국기 아이콘이 국가를 대신)
const LOC_DEFS = {
  factory:{name:'독일 Wörth 공장', short:'Wörth 공장', en:'Wörth Factory in Germany', icon:'de', color:'var(--st-prod)'},
  sea:{name:'바다', en:'At Sea', icon:'sea', color:'var(--st-transit)'},
  center:{name:'대한민국 아산 트럭 스타 센터', short:'아산 트럭 스타 센터', en:'Asan Truck Star Center in Korea', icon:'kr', color:'var(--st-oh)'},
};
const PORT_DEFS = {antwerp:'Antwerp항', pyeongtaek:'평택항'};

// Logistics 그리드 48열 — docs/data-dictionary_v2_1_2.csv "최종 컬럼 순서" 기준 (Commission No 고정열 → Current Status → 사전 순서 → Order Note) + TSC Arrival Date(10/26 No.9, ATA 다음)
// 뒤쪽 블록: 사전 '제외' 열(v2_1_1·v2_2) 중 남긴 1개(AFAB 수정 가능) + 사전 미언급 열 1개(Baumuster). group은 상세 Drawer·열 설정 모달의 묶음에만 사용.
// 10/19: Order Date · Invoice No. · SAP · SAP B1 · Days in Stock · Stock level · T/M Memo 열 제거
// 10/20 No.2: 출처 배지(src) 별첨2 기준 · keyin:true = 초록 '입력' 배지(B1 Factory Order · Sales Month · Option Note · Order Note · Ref Commission No), 그 외 '입력'은 회색
const COLUMNS = [
  {key:'commission_no', label:'Commission No', group:'기본', src:'AFAB'},
  {key:'current_status', label:'Current Status', group:'기본', src:'AFAB/입력'},
  {key:'model_year', label:'MY', group:'기본', src:'MODEL_MASTER'},
  {key:'bm', label:'BM', group:'기본', src:'MODEL_MASTER'},
  {key:'vin_no', label:'Vin No', group:'기본', src:'AFAB'},
  {key:'vehicle', label:'Vehicle', group:'기본', src:'MODEL_MASTER'},
  {key:'series', label:'Model', group:'기본', src:'MODEL_MASTER'},   // 10/15 No.3: SAM 기준 라벨 (기존 Series → Model)
  {key:'model', label:'Type', group:'기본', src:'MODEL_MASTER'},     // 10/15 No.3: SAM 기준 라벨 (기존 Model → Type)
  {key:'axle', label:'Axle', group:'기본', src:'MODEL_MASTER'},
  {key:'cab', label:'Cab', group:'기본', src:'MODEL_MASTER'},
  {key:'cab_gen', label:'Cab Gen', group:'기본', src:'MODEL_MASTER'},     // 11/4: Option 열을 Cab Gen · Wheelbase · PTO · Emission 4열로 분리 (10/15 No.5: Model_Master에서 자동 반영, 수동 입력 제외)
  {key:'wheelbase', label:'Wheelbase', group:'기본', src:'MODEL_MASTER'},
  {key:'pto', label:'PTO', group:'기본', src:'MODEL_MASTER'},
  {key:'emission', label:'Emission', group:'기본', src:'MODEL_MASTER'},
  {key:'changeability_date', label:'Changeability Date', group:'일정', src:'AFAB'},
  {key:'pm', label:'PM', group:'일정', src:'AFAB'},
  {key:'original_pm', label:'Original PM', group:'일정', src:'오더 생성'},
  {key:'tdd_calc', label:'TDD Calc', group:'일정', src:'AFAB'},
  {key:'dispatch', label:'Dispatch', group:'일정', src:'AFAB'},
  {key:'shipping_calc', label:'Shipping Calc', group:'일정', src:'PM + LEAD TIME'}, // 10/27 #7: PM 1일 + 모델 리드타임(일, PM~Shipping) 자동 계산 · #8: Shipping 미입력·경과 시 '+n일' 배지
  {key:'shipping', label:'Shipping', group:'일정', src:'AFAB'},
  {key:'invoice', label:'Invoice', group:'선적', src:'AFAB'},
  {key:'planned_arrival', label:'Planned Arrival', group:'일정', src:'AFAB'},
  {key:'eta_from_tdd', label:'ETA From TDD', group:'일정', src:'+75 FROM TDD'},
  {key:'eta_from_eukor_pirt', label:'ETA From EUKOR/PIRT', group:'일정', src:'선적·입항'},
  {key:'ata', label:'ATA', group:'일정', src:'선적·입항'},
  {key:'tsc_arrival_date', label:'TSC Arrival Date', group:'일정', src:'선적·입항'}, // 10/26 No.9: 선적·입항 선박별 현황 입력 → 차량 마스터 반영 · 입력 시 In Transit → Bonded Stock (No.8)
  {key:'bl_no', label:'B/L No', group:'선적', src:'선적·입항'},
  {key:'vessel', label:'Vessel', group:'선적', src:'선적·입항'},
  {key:'customs_clearance_date', label:'Customs Clearance Date', group:'통관', src:'입력'},
  {key:'color_code', label:'Color Code', group:'사양', src:'AFAB'},
  {key:'color_name', label:'Color Name', group:'사양', src:'COLOR_MASTER'},
  {key:'tires', label:'Tires', group:'사양', src:'WINGS', memo:true}, // 11/3 #8: 메모 → 사양 그룹
  {key:'model_in_afab', label:'Model In AFAB', group:'사양', src:'AFAB'},
  {key:'engine_no', label:'Engine No', group:'기본', src:'AFAB'},
  {key:'import_license', label:'Import License', group:'통관', src:'입력'},
  {key:'ref_commission_no', label:'Ref Commission No', group:'메모', src:'입력', keyin:true, wide:true}, // 11/4: 기본 → 메모 그룹(Option Note 위) — 드로어 기본 그룹이 5줄로 바뀌며 빠진 열 · wide: 상세 Drawer에서 한 행 전체 폭(그리드 열 폭과 무관)
  {key:'option_remarks', label:'Option Note', group:'메모', src:'입력', keyin:true, memo:true},
  {key:'order_note', label:'Order Note', group:'메모', src:'입력', keyin:true, memo:true}, // 10/15 No.10: Option Note 다음 순서
  {key:'order_update_date', label:'Order Update Date', group:'일정', src:'오더 생성'}, // 10/20 No.10: 시스템 오더 등록일 (AFAB Order Date와 별개) · 11/3 #4: Create Order Date → Order Update Date — 생성일 + 오더 변경 시 변경일(KUFRI 확정 후 Dummy→Changeable 전환일 · Changeable 모델 변경일)로 갱신
  {key:'b1_factory_order', label:'B1 Factory Order', group:'선적', src:'입력', keyin:true},
  {key:'co', label:'C/O', group:'선적', src:'입력'}, // 10/20 No.14: Fleet C/O → C/O (fleet_co → co) · Sales Month 바로 앞
  {key:'sales_month', label:'Sales Month', group:'통관', src:'입력', keyin:true},
  {key:'model_classification', label:'Model Classification', group:'사양', src:'자동'},
  {key:'gen', label:'Gen', group:'기본', src:'AFAB'},
  {key:'spec', label:'Spec', group:'사양', src:'자동'},
  {key:'sub_cat', label:'Sub Cat', group:'사양', src:'AFAB'},
  // ---- 사전 제외 열 (뒤쪽 배치) ----
  {key:'afab_editable', label:'AFAB 수정 가능', group:'사양', src:'AFAB'},
  // ---- 사전 미언급 열 (뒤쪽 배치) ----
  {key:'baumuster', label:'Baumuster', group:'사양', src:'AFAB'},
];
const GROUPS = ['기본','메모','일정','선적','통관','사양']; // 11/3 #8: 메모 그룹을 기본 바로 아래로 (상세 Drawer 카드 순서)
const DEFAULT_HIDDEN_COLS = []; // 사전 주석: 'Original PM'은 숨기기 기능으로 구현 → 11/4: 오더 생성·변경이 Original PM을 쓰므로 기본 표시로 전환(편집 모드 열 머리글 체크박스로 숨길 수 있음)
const GRID_JUMPS = ['current_status','tdd_calc','bl_no','option_remarks']; // 그리드 바로가기 버튼(이름 = 열 라벨) → 이동할 열 key. current_status는 맨 처음으로

// 설계 노트 (목업 전용)
const NOTES = {
  G1:'상단 메뉴 바 7개(좌측 사이드바 아님) + AFAB 최근 반영 표시', G2:'화면 제목 줄: 통합 검색(Comm/VIN/B/L → 1건이면 상세 즉시) · 설계 노트 토글 · 로그인 사용자·역할', G3:'Viewer에게는 입력·반영·확정 버튼이 보이지 않는다. Sales = 대시보드·선적·입항·Logistics(Request 탭) 조회 + 통관 신청만. UI 한국어, 필드명은 기존 엑셀 영문',
  D1:'차량 주문·재고 흐름: 카드 6종 한 줄 수정 가능 주문(Ordered(Changeable)) → 확정 주문(Ordered(Fixed)) → 확정 재고(Factory Stock = In Production + Shipment scheduled) → 운송 중(In Transit, 하단에 당월 입항 예정 대수) → 재고(Bonded + OH) → 판매(Sold YTD). 카드별 아이콘(재고 카드 창고에 벤츠 스타 마크, 10/27 #3), Cancelled 카드 없음. 카드 클릭 → 관련 목록', D2:'월별 생산/입항/판매 추이: 26년 1월~27년 12월 24개월 중 당월 포함 8개월만 표시, 나머지는 가로 스크롤(Y축 고정). 막대 수치 표시, 기준월 강조, 기준월 이후 음영', D3:'입항 예정 선박: 입항예정 값은 Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환, ATA 후 2일까지 표시', D4:'차종별 파이프라인(7단계, Sold 제외) · 단계 색 = Current Status 색', D6:'연식별 재고: 세로 누적 막대(연식 최신순, Tractor/Rigid/Tipper/BB)', D7:'당월 도착 예정: 선적·입항 월별 입항 예정 피벗의 당월 블록 (행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · 비표준 옵션) · 열: 당월 입항 선박 + Total · 선박 입항월 = ATA → ETA 선사 → Pl. arrival) · 당월 입항 예정 카드와 동일 기준',
  L1:'탭 5개: Logistics(홈 그리드) · AFAB 업로드(10/29 상단 메뉴에서 이동) · 수입통관 신청(Sales 통관 신청 · 신청 접수 처리 · 통관 여부 조회 · 신청번호 Customs-YYYY-MM-DD-N · 신청/처리 시 메일 자동 발송) · 통관 완료 처리(템플릿 Excel 업로드로 통관일·수입필증번호 반영) · 보험 조회(Excel Export). 역할별 표시: Editor 전체 · Viewer Logistics만 · Sales 수입통관 신청만. 편집 중 저장 대기 값이 있으면 탭 전환 차단',
  L2:'열 필터(Current Status 단계 순 10단계 + Cancelled · 모델 관련 Vehicle~Emission · 날짜 열 Changeability Date~Customs Clearance Date·Order Update Date 연·월 체크 트리 · Vessel) · 텍스트 검색(Comm · VIN · B/L · Vessel · Type · Engine · Order Note · Option Note, 일치 텍스트 하이라이트) · 정렬(기본 Commission No 최신순) · Shipping Calc 열 필터의 경과 배지 행만 항목(10/30, 리드타임 재검토 후보)', L3:'Comm No. 기준 한 행에 전체 48열을 data-dictionary 순서로 표시(Shipping Calc = In Production 진입 시 PM 1일 + 리드타임(일)로 1회 작성, 10/27 #7·10/30 · 경과 배지 선적 전 빨강, 선적 후 회색으로 Shipping − Shipping Calc 고정 10/30 #8), Comm No. 열 고정, 바로가기(Current Status · TDD Calc · B/L No · Option Note)', L4:'열 표시/숨김: 편집 모드에서 열 머리글 체크박스로 조정(변경 이력 없음)', L5:'출처 배지: 파랑 = AFAB · WINGS · +75 FROM TDD · AFAB/입력, 초록 = Key-in 입력(B1 Factory Order · Sales Month · Option Note · Order Note · Ref Commission No), 회색 = 마스터·자동·화면 입력·그 외 입력', L6:'행 클릭 → 상세 Drawer(마일스톤 타임라인, 필드 그룹, 변경 이력)', L7:'수동 오더 추가 · Current Status 업데이트(편집자 진입 시 하루 1회 자동 점검 팝업, 규칙 3·5·7, 제외 선택 후 즉시 반영, 배지로 재열기) · 엑셀 내보내기',
  S1:'KPI 3종(운송중·당월/익월 입항 예정) + 월별 입항 예정(엑셀 Arrival Schedule 피벗: 구분 > 차종 > 모델 × 월 > 선박 + 미배정 열 = Vessel 없이 ETA From TDD만 있는 오더, 10/27 #14)', S2:'선박별 현황(Vessel·단계·대수·총중량(kg, Key-in, 11/3 #9)·B/L·Shipping·Pl.arrival·ETA 선사·ATA·TSC Arrival Date). 선박 단위 입력은 해당 선박 차량의 차량 마스터 열에 반영·Vehicle_History 기록. TSC 입고일은 예정(선박 단위) 저장 후 배지 클릭으로 확정 → 차량 마스터 반영 + In Transit → Bonded Stock. ETA 불일치 카드·탭·표시는 제외',
  K1:'상단 탭(TSC 재고 = Bonded + OH Stock 월말 마감 / 현재 및 미래 재고현황 = Ordered(Fixed) ~ OH Stock 현재 기준만, 10/27 #15 · 10/29 #7) → 기준월 선택(최근 5개월 월말 마감 + 현재) → TSC 재고: 요약 카드(Total Stock + 연식 MY24~28 대수·비율) · 현재 및 미래: 여정 지도(5구역 원 + 장소 띠·항구 세로선, 연식 구분 없음 · 10/29 #3) → 연식 범례 → 모델별 구역 현황(모델 × 5구역 연식 막대) → 상태 × 연식 히트맵 (10/29 #8~#10) → 연식 범례', K2:'By Vehicle(차종별 스택 바, 길이=대수) → By Model(차종 섹션 안 모델별 스택 바) → 마감 리포트 HTML·Excel 내보내기',
  A1:'4단계 흐름 + 드롭존', A2:'파일 검증 결과(헤더 32개, 중복 0, 날짜/금액 변환, FIN 형식)', A3:'변경점(신규/변경/제외/변동없음) 체크 반영', A4:'반영 이력(AFAB_Uploads)', A5:'매핑 요약(32열)',
  P1:'연도·차종 선택, 판매계획 입력 모드(Editor), 범례(실적/확정/계획)', P2:'모델 그룹 접기, 행 = Production/Arrival/Sales/OH Stock/In Transit/재고월수, 기준월 열 강조', P3:'전체 합계 + Fixed Order', P4:'계획 확정·시나리오(2차)·Kufri Excel',
  C1:'아키텍처·연결 정보', C2:'모델 마스터(Model_Master)', C3:'AFAB 매핑', C4:'상태 규칙(§7)', C5:'기준값(Settings)', C6:'사용자·권한(M365 그룹)', C7:'변경 이력(Vehicle_History)', C8:'감사 로그(Audit_Log)',
};

// ---- 전역 상태 ----
const PAGES = {};
const state = { role:'Editor', user: USERS.find(u=>u.role==='Editor').name, notes:false, hiddenCols:new Set(DEFAULT_HIDDEN_COLS), lang:'ko' };
function isEditor(){ return state.role==='Editor'; }
function isSales(){ return state.role==='Sales'; } // 10/27: 영업 역할 — 대시보드·선적·입항 조회 + Logistics '수입 통관 신청' 탭(통관 신청)만. 그 외 입력 버튼은 Viewer와 같이 숨김(body.viewer)

// ---- 언어 (한/EN 토글) ----
// I18N: 한글 UI 문구 → 영문 사전. tx(ko, vars)는 한국어 모드에서는 ko를 그대로 돌려주므로 한국어 화면은 바뀌지 않는다.
// {n} 같은 자리표시자는 vars로 치환하며, 영문 문구만 쓰는 자리표시자({mon})도 함께 넘길 수 있다. 사전에 없는 문구는 영문 모드에서도 한글 그대로 표시.
// 1차 범위: 메뉴·제목·버튼·필터·카드·차트·표 머리글·배지·단위. 토스트·설계 노트·툴팁·데이터 값은 2차.
const I18N = {
  // 상단바
  '목업 v0.1':'Mockup v0.1', 'STK Logistics Hub — 화면 목업 v0.1':'STK Logistics Hub — Screen Mockup v0.1',
  'AFAB 최근 반영':'AFAB last applied', '{rows}행 · 변경 {n}':'{rows} rows · {n} changed',
  '언어 전환 불가':'Cannot switch language', "저장 대기 중인 편집 내용이 있습니다. '편집 종료'로 저장한 뒤 전환하세요.":"There are unsaved edits. Save with 'End Edit' before switching.",
  // 메뉴
  '대시보드':'Dashboard', 'Logistics 차량 마스터':'Logistics Vehicle Master', '선적 · 입항':'Shipping & Arrival', '재고현황':'Stock Status',
  'AFAB 업로드':'AFAB Upload', 'KUFRI 생산판매계획':'KUFRI Production & Sales Plan', '마스터 · 설정':'Master & Settings',
  // 공통
  '닫기':'Close', '취소':'Cancel', '저장':'Save', '적용':'Apply', '반영':'Apply', '편집':'Edit', '편집 종료':'End Edit', '초기화':'Reset',
  '{v}대':'{v} units', '{n}대':'{n} units', ' (계획/예정)':' (plan/forecast)', '기준월':'Base Month', '기준월 이후(계획·예정)':'After base month (plan/forecast)',
  '대수':'Units', '총중량 (kg)':'Gross Weight (kg)', '검색':'Search', '일시':'Date', '필드':'Field', '이전':'Before', '이후':'After', '사용자':'User', '출처':'Source',
  '기본':'Basic', '일정':'Schedule', '선적':'Shipping', '통관':'Customs', '사양':'Spec', '메모':'Memo',
  '입력':'Input', '자동':'Auto', 'AFAB/입력':'AFAB/Input', '선적·입항':'Shipping·Arrival', '오더 생성':'Create Order', 'AFAB 수정 가능':'AFAB Editable',
  '(빈 값)':'(blank)', '(공란)':'(blank)', '전체':'All',
  // 차량 상세 Drawer
  '파생·상태':'Derived · Status', '저장하지 않고 계산':'Calculated, not stored', '(VIN 10번째 자리)':'(VIN 10th digit)', 'AFAB 금일 존재':'In AFAB Today',
  '있음':'Yes', '없음 — 확인 필요':'No — check', '해당 없음':'N/A', '(자동 판정)':'(Auto)', 'override 시 사유 필수':'Reason required for override',
  'Note 저장':'Notes saved', '변경된 Note가 없습니다.':'No note changes.', '{comm} · {fields} · Vehicle_History {n}건 기록 (출처: 입력)':'{comm} · {fields} · {n} Vehicle_History rows (source: Input)', 'Order Note · Option Note 저장 + 변경 이력 기록 (그 외 입력 필드는 목업에서 저장하지 않음)':'Save Order Note · Option Note + change history (other input fields are not saved in the mockup)', // 11/4 드로어 저장
  'Order Note 토글 저장':'Order Note toggle saved', '{comm} · {val} · Vehicle_History 기록 (출처: 입력)':'{comm} · {val} · Vehicle_History recorded (source: Input)', 'On = 검토가 필요한 오더 · 토글 즉시 저장 + 변경 이력 기록':'On = order needs review · saved immediately + change history', // 10/30 리뷰 #7
  '변경 이력':'Change History', 'Vehicle_History · 필드 단위 before/after':'Vehicle_History · field-level before/after', '미부여':'not assigned', '수정':'Modified',
  '상태 override':'Status override', '취소 처리':'Cancel Vehicle', '이력 전체':'Full History', '마일스톤 타임라인':'Milestone Timeline',
  // 대시보드
  '수정 가능 주문':'Changeable Orders', '확정 주문':'Fixed Orders', '확정 재고 (Factory Stock)':'Factory Stock', '운송 중':'In Transit',
  '당월 입항 예정({m}월) {n}대':'Arriving this month ({mon}) {n} units', '재고 (보세 + 통관)':'Stock (Bonded + OH)', '판매 ({y} YTD)':'Sales ({y} YTD)', '전월 {n}':'Prev. month {n}',
  '차량 주문·재고 흐름':'Vehicle Order & Stock Flow',
  '6개 지표 · 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 재고 → 판매 · 전체 {n} (Cancelled 제외)':'6 metrics · Changeable → Fixed → Factory Stock → In Transit → Stock → Sales · Total {n} (excl. Cancelled)',
  '카드 클릭 시 관련 목록으로 이동합니다.':'Click a card to open the related list.',
  'Arrival (ATA / 예정)':'Arrival (ATA / Planned)', 'Sales (판매 / 계획)':'Sales (Actual / Plan)', '월별 생산 / 입항 / 판매 추이':'Monthly Production / Arrival / Sales Trend',
  '{a} ~ {b} (24개월) · 당월 포함 8개월 표시, 나머지는 가로 스크롤 · 기준월 {c} 강조, 이후 음영':'{a} ~ {b} (24 months) · 8 months shown incl. current, scroll for the rest · base month {c} highlighted, later months shaded',
  'Sales 계획 = 최근 6개월 평균(당월 포함) {n}대. KUFRI에서 입력한 sales_plan이 있으면 그 값을 사용.':'Sales plan = 6-month average incl. current month ({n} units). Uses sales_plan entered in KUFRI when available.',
  '입항 예정 선박':'Arriving Vessels', 'Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환 · ATA 후 2일까지 표시':'Pl. arrival (AFAB) → ETA (EUKOR, Pyeongtaek) → ATA · shown until 2 days after ATA',
  '선적·입항 →':'Shipping & Arrival →', '입항 예정':'Arrival', '(예정)':'(planned)',
  '차종별 파이프라인':'Pipeline by Vehicle', '7단계 (Sold·Cancelled 제외) · 합계 {n}':'7 stages (excl. Sold · Cancelled) · Total {n}',
  '당월 도착 예정 ({m}월)':'Arrivals This Month ({mon})', '구분 > 차종 > 모델 × 당월 입항 선박 · 합계 {n}대 · 선박 {v}척':'Gen > Vehicle > Model × vessels arriving this month · Total {n} units · {v} vessels',
  '월별 입항 예정 →':'Monthly Arrival Schedule →', '당월 입항 예정 차량이 없습니다.':'No vehicles arriving this month.',
  '연식별 재고':'Stock by Model Year', 'Bonded + OH Stock {n}대 · 연식(MY) 최신순 · 누적 = Vehicle 4종':'Bonded + OH Stock {n} units · newest MY first · stacked by 4 vehicle types',
  // Logistics 차량 마스터
  '엑셀 내보내기':'Export Excel', '{n}건 / 전체 {m}':'{n} / Total {m}', 'Comm(여러 개는 쉼표 구분) / VIN / B/L / Vessel / Type / Order·Option Note':'Comm (comma-separated for several) / VIN / B/L / Vessel / Type / Order·Option Note', ' · 열 필터: {cols}':' · Column filter: {cols}', '조건에 맞는 차량이 없습니다.':'No vehicles match the filters.',
  '바로가기':'Jump to', '· 열 {a}/{b} · 가로 스크롤 · Comm No. 고정':'· Columns {a}/{b} · horizontal scroll · Comm No. pinned',
  '{n}건 중 {a}–{b}':'{a}–{b} of {n}', '‹ 이전':'‹ Prev', '다음 ›':'Next ›', '50행 페이지 (실제 구현은 가상 스크롤 또는 50행 페이지)':'50 rows per page (real build: virtual scroll or 50-row pages)',
  '편집 모드':'Edit Mode', '· 선택 ':'· Selected ', '건':' items', '오더 변경 (모델 일괄)':'Change Order (Bulk Model)', 'Key-in 일괄 입력':'Bulk Key-in', '선택 해제':'Clear Selection',
  'Key-in 대상 열: B1 Factory Order · Sales Month · Order Note · Option Note (셀 클릭 → 개별 입력 · Note는 여러 줄 팝업, 셀을 끌어 선택 → Ctrl+C / Ctrl+V)':'Key-in columns: B1 Factory Order · Sales Month · Order Note · Option Note (click a cell to edit · notes open a multi-line popup, drag cells to select → Ctrl+C / Ctrl+V)', // 11/3 리뷰 #6
  // 11/3 리뷰 #6: Order Note·Option Note 여러 줄 팝업 편집창
  '여러 줄 입력 가능 (Enter = 줄바꿈)':'Multi-line (Enter = new line)', 'Enter = 줄바꿈 · Ctrl+Enter = 이 행에 적용 · Esc = 취소 · Ctrl+C = 칸 전체 복사':'Enter = new line · Ctrl+Enter = apply to this row · Esc = cancel · Ctrl+C = copy whole cell', '다른 행에 같은 내용: Note 셀을 끌어 범위 선택 → Ctrl+V (엑셀 열 복사도 가능)':'Same text in other rows: drag note cells to select a range → Ctrl+V (an Excel column works too)',
  '이 행에 적용':'Apply to this row', '선택한 {n}건에 적용':'Apply to {n} selected', '체크한 오더 전부(이 행 포함)에 같은 내용으로 덮어씁니다 · 출처 수동/일괄':'Overwrite all checked orders (including this row) with the same text · source Manual/Bulk',
  '{col} {n}칸 복사':'{col}: {n} cells copied', '다른 행의 Note 셀을 끌어 선택한 뒤 Ctrl+V':'Drag to select note cells in other rows, then Ctrl+V',
  '{col} 선택 {n}건에 적용 (저장 대기)':'{col}: applied to {n} selected (pending)', '{col} 붙여넣기 {n}칸 (저장 대기)':'{col}: pasted into {n} cells (pending)',
  "· 저장 대기 {n}건 → '편집 종료' 시 저장·변경 이력 기록":"· {n} pending → saved with history on 'End Edit'",
  '현재 BM':'Current BM', '현재 모델 분포':'Current Model Mix', '변경할 모델 (Model_Master) *':'New Model (Model_Master) *', '{k} {n}건':'{k} ({n})',
  '오더 변경 — 모델·PM 일괄 변경':'Change Order — Bulk Model · PM Change', '현재 PM 분포':'Current PM Mix', '변경할 PM (생산월, 비우면 변경 없음)':'New PM (production month, blank = no change)',
  // 11/3 리뷰 #1~#4: 오더 생성 상태 2종 · 오더 변경 모델 매칭·Original PM·상태 전환 안내
  '오더 변경 — 모델·Original PM 일괄 변경':'Change Order — Bulk Model · Original PM Change', '현재 Original PM 분포':'Current Original PM Mix', '변경할 Original PM (생산월, 비우면 변경 없음)':'New Original PM (production month, blank = no change)',
  'Current Status가 Ordered(Changeable)로 변경(유지)됩니다':'Current Status will be set to (or kept as) Ordered(Changeable)', '선택 {n}건 중 {m}건은 Ordered(Dummy)·Ordered(Changeable)가 아니라 제외됩니다':'{m} of {n} selected are excluded (not Ordered(Dummy)·Ordered(Changeable))',
  '변경':'Change', '예) B1-12345':'e.g. B1-12345',
  '값 검색 (예: 2853)':'Search values (e.g. 2853)', '연·월 검색 (예: 2026-11)':'Search year-month (e.g. 2026-11)', '값 검색':'Search values',
  '{y}년':'{y}', '{m}월':'{mon}', '일치하는 값이 없습니다.':'No matching values.', '{c} 열 필터':'{c} Column Filter',
  '표시된 값 전체 선택':'Select All Shown', '표시된 값 해제':'Clear Shown', '필터 해제':'Clear Filter',
  'Type 숫자 3~4자리 (예: 2863)':'Type digits, 3–4 (e.g. 2863)', '검색어를 입력하세요':'Enter a search term', 'Type을 먼저 선택하세요':'Select a Type first',
  '모델을 선택하면 속성이 표시됩니다.':'Select a model to see its attributes.', '리드타임(월)':'Lead Time (mo)', '리드타임(일)':'Lead Time (days)', '시작 번호 (예) 071009001':'Start No. (e.g. 071009001)',
  '생성될 Commission No: {range} ({n}건) · 마지막 번호 {last}':'Commission No to create: {range} ({n}) · last No. {last}', '시작 번호는 숫자만 입력하세요.':'Start number must be digits only.',
  'Type 선택 ({n})':'Select Type ({n})', '숫자 3~4자리를 입력하세요':'Enter 3–4 digits', '일치하는 Type 없음':'No matching Type', '모델 선택 ({n})':'Select Model ({n})',
  // Current Status 업데이트 (10/28): 자동 점검 팝업·배지
  'Current Status 업데이트':'Update Current Status', '상태 업데이트 대상 {n}건':'{n} status updates pending', '나중에':'Later', '변경 전':'Before', '변경 후':'After', '수정 이유':'Reason', '반영 제외':'Exclude',
  '자동 전환 대상이 없습니다.':'No vehicles to update.', '{n}건 · 규칙 {r}: {c}':'{n} · Rule {r}: {c}', '제외 {n}건':'{n} excluded',
  'Status override로 보류: {n}건':'Held by status override: {n}', 'Status override로 보류':'Held by status override', '{n}건':'{n}', '현재 상태':'Current', '규칙 적용 시':'By rule',
  // Logistics 탭 2~4: 통관·보험 (10/26 No.1) — 탭 이름은 영문 고정
  '탭 전환 불가':'Cannot switch tab', '조회':'Look up', 'Commission No 여러 개 (줄바꿈·쉼표 구분)':'Multiple Commission Nos (newline / comma separated)',
  '조회 {n}건':'{n} found', '미등록 {n}건: {list}':'{n} not registered: {list}', 'Commission No를 입력하세요.':'Enter Commission Nos.',  'Commission No로 통관 여부 조회':'Check customs clearance by Commission No',
  '템플릿 Excel 업로드 → 차량 마스터 Customs Clearance Date · Import License 반영 · 통관일 입력 시 Bonded Stock → OH Stock':'Upload the template Excel → vehicle master Customs Clearance Date · Import License · Bonded Stock → OH Stock when a clearance date is entered',
  '템플릿에 맞춘 통관 Excel(Commission · 수리일 · 신고번호)을 여기에 놓거나 클릭하여 선택':'Drop the customs Excel in the template layout (Commission · 수리일 · 신고번호) here or click to select',
  '템플릿 다운로드':'Download Template', // 10/27 #10
  // 10/28: 업로드 미리보기 (열 매핑 표는 삭제)
  '음영 열 = 반영되는 차량 마스터 필드 (현재 값 표시)':'Shaded columns = vehicle master fields to be updated (current values shown)',
  '반영 결과 — {f}':'Applied — {f}', '반영 {n}건 · Bonded Stock → OH Stock 전환 {m}대 · 음영 열 = 반영된 값':'{n} applied · {m} moved Bonded Stock → OH Stock · shaded columns = applied values',
  // 10/27: 통관 신청 (Sales) · 신청 접수 (Editor·Viewer)
  '통관 신청 ({n}건)':'Request Clearance ({n})', '신청 ({n}건)':'Submit ({n})', '통관 신청 확인':'Confirm Clearance Request', '신청자':'Requested by', '수신':'To', '선택 차량':'Selected vehicles',
  'Bonded Stock 차량을 선택해 물류 담당자에게 통관 신청 · 신청·접수 중인 차량은 목록에서 제외':'Select Bonded Stock vehicles and send a clearance request to Logistics · vehicles already requested or confirmed are excluded',
  '대상 {n}건 · 신청 중 제외 {m}건':'{n} eligible · {m} excluded (pending)', '신청 접수':'Requests received',
  '영업(Sales)이 보낸 통관 신청 · 행 클릭 → 아래 조회 목록에서 Commission No별 접수/거절 선택 후 제출':'Clearance requests from Sales · click a row → confirm / reject each Commission No in the lookup below, then submit',
  // 10/27 #5·#11·#12: 탭명 · 상태 3종 · 처리 패널(조회 목록 안에서 행별 접수/거절 → 제출)
  '수입 통관 신청':'Request of Customs Clearance', '수입통관 신청':'Request of Customs Clearance', '통관 완료 처리':'Update Customs Clearance Info', '보험 조회':'Insurance', '신청':'Requested', '거절':'Rejected', // 10/29 #3: 하단 탭 한글명
  '처리 중: {id}':'Processing: {id}', '처리 해제':'Stop processing', '처리 제출 (접수 {a} · 거절 {b})':'Submit (confirm {a} · reject {b})', '처리 선택':'Decision', '거절 사유':'Reject reason',
  '접수 (Confirm)':'Confirm', '거절 (Reject)':'Reject', '거절 사유 (거절 시 필수)':'Reject reason (required to reject)', '이 신청에 없는 차량':'Not in this request',
  '행별로 접수/거절을 선택한 뒤 제출 · 거절은 사유 필수 · 이미 처리된 행은 선택 불가':'Choose confirm / reject per row, then submit · a reason is required to reject · processed rows cannot be changed',
  '경과 배지 행만':'Overdue badge rows only', 'Shipping Calc 경과 배지가 있는 행만 표시 (선적 전·후 모두) · 리드타임 재검토 후보':'Only rows with a Shipping Calc overdue badge (before and after shipping) · lead time review candidates', 'Shipping {s} · 실적 PM~Shipping {m}일 (계획 {p}일, 초과 {n}일)':'Shipping {s} · actual PM~Shipping {m} days (plan {p}, over by {n})', 'Shipping 미입력 · Shipping Calc 경과 {n}일 (기준일 {d})':'No Shipping yet · {n} days past Shipping Calc (as of {d})', // 10/30 #8 · 재검토 1단계
  '발송 메일 미리보기':'Email preview', '제목':'Subject', '본문':'Body', '실제 구현에서는 Graph sendMail로 자동 발송됩니다 (목업은 미리보기만)':'The real system sends this automatically via Graph sendMail (mockup shows a preview only)', '통관 신청 {id} 등록 · 물류 담당자에게 아래 메일이 발송됩니다.':'Request {id} saved · the email below goes to Logistics.', '처리 결과가 신청자 {who}에게 아래 메일로 발송됩니다.':'The result below is emailed to the requester {who}.', // 10/30 메일 미리보기 모달
  '신청번호':'Request No', '신청 건 전체(남은 {n}건)를 접수/거절로 고른 뒤 제출':'Decide all remaining {n} rows (confirm/reject) before submitting', '신청 건 전체를 한 번에 처리(모든 행 선택 후 제출)':'Process the whole request at once (select every row, then submit)', '신청일시':'Requested at', '건수':'Count', '통관 여부 조회':'Clearance Lookup', '신청 내역':'My Requests', '보낸 통관 신청과 처리 상태':'Requests you sent and their status', '통관 신청 대상 (Bonded Stock)':'Eligible vehicles (Bonded Stock)', '클릭 → 선택':'Click → select', '체크박스 또는 Commission No 클릭 → 선택':'Tick the box or click a Commission No to select', '외 {n}건':'+{n} more', '접수':'Confirmed', '메모':'Note', '신청 내역이 없습니다.':'No requests yet.', '전체 선택':'Select all',
  '선택한 차량 {n}대의 통관을 물류 담당자에게 신청합니다. 신청 내역은 Customs_Requests에 기록되고 담당자에게 메일로 안내됩니다.':'Sends a clearance request for {n} selected vehicles to Logistics. The request is stored in Customs_Requests and emailed to the owners.',
  '미리보기 — {f}':'Preview — {f}', '매칭 {a}건 · 미매칭 {b}건':'{a} matched · {b} unmatched', '수리일':'Clearance Date', '신고번호':'Declaration No', '매칭':'Match', '일치':'Matched', '미등록':'Not registered',
  '반영 ({n}건)':'Apply ({n})', '보험 조회 · 조회 결과를 Excel(xlsx)로 내보내기':'Insurance lookup · export results to Excel (xlsx)',
  '① Type 검색 *':'① Type Search *', '④ 모델 (Model_Master) *':'④ Model (Model_Master) *', '매칭된 모델 속성':'Matched Model Attributes',
  '⑤ Original PM (생산월) *':'⑤ Original PM (Production Month) *', '수량 *':'Qty *', '⑥ Commission No 생성 방식 *':'⑥ Commission No Numbering *',
  ' 마지막 번호에 이어서 생성':' Continue from last No.', ' 새 번호로 시작 ':' Start from new No. ', '생성':'Create',
  // 선적 · 입항
  '운송중 (In Transit)':'In Transit', 'Shipped / Invoiced · {n}척 · 선적 예정 {m}대 별도':'Shipped / Invoiced · {n} vessels · {m} units scheduled separately',
  '당월 입항 예정 ({m})':'Arriving This Month ({m})', 'ETA Final 기준, 없으면 Pl. arrival':'By ETA Final, else Pl. arrival', '익월 입항 예정 ({m})':'Arriving Next Month ({m})', 'Shipment scheduled 포함':'Incl. Shipment scheduled',
  '월별 입항 예정·실적 (Arrival Schedule)':'Monthly Arrival Schedule & Actuals', '당월 이전 달은 입항 실적(ATA 기준, Bonded·OH·Sold)':'Months before the current month show actual arrivals (ATA; Bonded·OH·Sold)',
  '이번달~연말 ({a}~{b})':'This month to year-end ({a}~{b})', '올해 전체 ({y})':'Full year ({y})', '해당 월 입항 선박 없음':'No vessel arriving this month', '입항 실적 (ATA 기준)':'Actual arrival (ATA)',
  '행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · 비표준 옵션) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)':'Rows: Gen > Vehicle > Model (Vehicle · Model · Type · Axle · Cab · non-standard options) · Columns: arrival month (ATA → carrier ETA → Pl. arrival) > vessel · Values: units shipped per vessel by model (In Transit + Shipment scheduled)',
  '선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. Grand Total 행의 수량 셀·월 Total 클릭 → 해당 선박 Logistics 목록(같은 건수). 모델 행과 Grand Total 열은 표시 전용.':'Arrival month per vessel = ATA → carrier ETA → Pl. arrival (AFAB). Click a count or month Total cell in the Grand Total row → Logistics list for that vessel (same count). Model rows and the Grand Total column are display only.', '클릭 → Logistics 목록':'Click → Logistics list', '클릭 → 선박 열 펼치기':'Click → show vessel columns', '클릭 → 선박 열 접기':'Click → hide vessel columns', '올해 전체에서 당월 외 월은 Total만 표시 — 월 Total 머리글(▸) 클릭으로 선박 열 펼침.':'In the full-year view, months other than the current one show only their Total — click a month Total header (▸) to expand its vessel columns.',
  '운송중':'In Transit', '선적 예정':'Scheduled', '미확정':'TBD', '예정':'planned', '미입력':'Not entered', '단계':'Stage',
  '선박별 현황':'Status by Vessel', 'ATA = 실제 입항일(구 ETA Final) · TSC 입고일 입력 = 예정 저장(선박 단위) · 확정 시 차량 마스터 반영 · 해당 선박 In Transit → Bonded Stock 전환':'ATA = actual arrival (formerly ETA Final) · entering a TSC date saves it as planned (vessel level) · on confirmation it is written to the vehicle master · that vessel\'s In Transit → Bonded Stock',
  // 10/27: TSC 입고일 예정/확정
  '확정':'Confirmed', 'TSC 입고일 확정 — {v}':'Confirm TSC Arrival Date — {v}', '기존 날짜로 확정':'Confirm with current date', '새 날짜 입력 후 확정':'Enter a new date, then confirm', '클릭 → TSC 입고일 확정':'Click → confirm TSC Arrival Date', '구분':'Option', '날짜':'Date', '선택':'Select',
  'TSC 입고일은 예정으로 저장되며, 확정 시 해당 선박 차량 {n}대의 TSC Arrival Date에 반영되고 In Transit {m}대가 Bonded Stock으로 전환됩니다.':'The TSC date is saved as planned. On confirmation it is written to TSC Arrival Date of {n} vehicles on this vessel and {m} In Transit vehicles move to Bonded Stock.',
  'ETA 선사 (EUKOR/MOL)':'Carrier ETA (EUKOR/MOL)', 'TSC 입고일 (TSC Arrival Date)':'TSC Arrival Date',
  '행 클릭 → 해당 선박의 차량 Logistics 목록. ATA 입력은 편집 모드 또는 Logistics 그리드/상세에서.':"Click a row for that vessel's Logistics list. Enter ATA in edit mode or in the Logistics grid/detail.",
  // 재고현황
  '현재 ({d}, 상태 Bonded Stock·OH Stock 기준)':'Current ({d}, by status Bonded Stock·OH Stock)', '{m} 월말 마감 ({d})':'{m} month-end closing ({d})',
  '보세(Bonded) {b} · 통관(OH) {c} · 보세/통관 = Customs Clearance DATE ≤ 월말':'Bonded {b} · OH {c} · Bonded/OH = Customs Clearance DATE ≤ month-end',
  '연식(MY) 범례':'Model Year (MY) legend', '기타':'Other', ' (MY23 이하·판독 불가)':' (MY23 or older · unreadable)', '· MY = VIN 10번째 자리 (M=21 … T=26 V=27 W=28)':'· MY = VIN 10th digit (M=21 … T=26 V=27 W=28)',
  '차종별 · 막대 길이 = 대수 · 우측 대수·비율':'By vehicle type · bar length = units · units & share at right', '차종 섹션 안 모델별 · 모델명 = Gen · Model · Type · Cab · 비표준 옵션':'Models within each vehicle section · name = Gen · Model · Type · Cab · non-standard options',
  '월말 마감 판정 = Cancelled 제외 · 입고일(ETA Final Arrival) ≤ 월 말일 · Sales Month 공란 또는 해당 월 이후(미판매)':'Month-end rule = excl. Cancelled · arrival (ETA Final) ≤ last day of month · Sales Month blank or later (unsold)',
  '{m} 월말 마감':'{m} month-end', '현재 ({d})':'Current ({d})', '리포트 HTML':'Report HTML',
  // KUFRI
  '연도':'Year', '차종':'Vehicle', '판매계획 입력 모드':'Sales Plan Input Mode', '실적(≤기준월)':'Actual (≤ base month)', '확정(AFAB 오더·잠금)':'Fixed (AFAB orders · locked)', '계획(입력)':'Plan (input)',
  '계획 확정':'Confirm Plan', '시나리오 복제 (2차)':'Clone Scenario (Phase 2)', ' 정상':' OK', ' 주의':' Warn', ' 위험':' Risk',
  '{n}대 · 리드타임 {lt}개월':'{n} units · lead time {lt} mo', 'OH Stock (월말)':'OH Stock (month-end)', 'In Transit (월말)':'In Transit (month-end)', '재고월수':'Months of Stock',
  'Fixed Order (당월+익월 Production)':'Fixed Order (current + next month Production)', '모델 (vehicle | model | axle | cab)':'Model (vehicle | model | axle | cab)', '합계':'Total', '전체 합계':'Grand Total', '전 차종':'All vehicles',
  // AFAB 업로드
  '반영 이력':'Upload History', 'AFAB_Uploads · 하루 2회 이상 가능':'AFAB_Uploads · multiple uploads per day allowed', '파일':'File', '행':'Rows', '신규':'New', '제외':'Removed', '상태':'Status',
  '매핑 요약':'Mapping Summary', 'SDISP 32열 → 시스템 필드 (✓ 사용 · △ 보관 · ✗ 미사용)':'SDISP 32 cols → system fields (✓ used · △ kept · ✗ unused)',
  '열':'Col', 'AFAB 헤더':'AFAB Header', '시스템 필드':'System Field', '변환':'Conversion', '사용':'Use', '✓ 사용':'✓ Used', '△ 보관':'△ Kept', '✗ 미사용':'✗ Unused',
  '파일 선택':'Select File', '검증':'Validate', '변경점 확인':'Review Changes', 'AFAB Raw data 파일을 여기에 놓거나 클릭하여 선택':'Drop the AFAB Raw data file here or click to select',
  '검증 결과 — {f}':'Validation — {f}', '677행 × 32열':'677 rows × 32 cols', '다른 파일':'Other File', '변경점 계산 →':'Compute Changes →',
  '제외(확인 필요)':'Removed (check)', '변동없음':'Unchanged', '처리':'Action', '매핑됨':'Mapped', '매핑 필요 — Editor 지정':'Mapping needed — Editor', 'Ordered로 등록 · Order (Changeable)':'Register as Ordered · Order (Changeable)',
  '모델':'Model', '영향':'Impact', '현재 단계':'Current Stage', '보류 (확인 필요)':'Hold (check)', 'Cancelled 확정 (사유 입력)':'Confirm Cancelled (enter reason)',
  '{n}건은 모든 필드가 현재 Vehicles와 동일합니다. (표시 생략)':'{n} rows are identical to current Vehicles (not shown).',
  '변경점 — {f}':'Changes — {f}', '현재 Vehicles와 비교 · 체크한 항목만 반영':'Compared with current Vehicles · only checked items are applied', '← 검증':'← Validate', '체크 항목 반영 ({n}건)':'Apply Checked ({n})',
  '반영 완료 — {f}':'Applied — {f}', '새 업로드':'New Upload', 'Logistics 확인 →':'Open Logistics →',
  // 마스터 · 설정
  '아키텍처·연결 정보':'Architecture & Connections', '모델 마스터':'Model Master', 'AFAB 매핑':'AFAB Mapping', '상태 규칙':'Status Rules', '기준값':'Settings', '사용자·권한':'Users & Roles', '감사 로그':'Audit Log',
  '아키텍처 · 연결 정보':'Architecture & Connections', '브라우저 (SPA)':'Browser (SPA)', 'M365 로그인':'M365 Login', 'SharePoint 사이트 STK-Logistics':'SharePoint site STK-Logistics',
  '인덱스 열':'Indexed Columns', '실시간 정의':'Real-time Definition', '엑셀 파싱·내보내기':'Excel Parsing & Export', '연결 상태 (목업)':'Connection Status (mockup)', '열린 질문':'Open Questions',
  '로그인 미연동':'Login not connected', 'Graph 미연동':'Graph not connected', 'SharePoint 미연동':'SharePoint not connected',
  '모델 마스터 (Model_Master)':'Model Master (Model_Master)',
  // 11/3 #10·#11: 모델 마스터 편집 모드·모델 추가 (11/4 리뷰 #2: 기본 모델·주문제작 구분 삭제)
  '모델 추가':'Add Model', '변경 없음':'No changes',
  '모든 열을 수정할 수 있습니다. 저장 시 BM(Code1-Code2)이 같은 차량에 반영됩니다.':'All columns can be edited. Saving applies to vehicles with the same BM (Code1-Code2).',
  '선택한 MY에 해당 모델 없음':'No model for the selected MY',
  // 10/27 #14 미배정 열 · #15 재고 현황 확장 뷰
  '미배정':'Unassigned', 'Vessel 미배정 · ETA From TDD 월 기준 (Ordered(Changeable) · Ordered(Fixed) · In Production) · Pl. Arrival·Shipping·Vessel 반영 시 선박 열로 이동':'No vessel assigned · by ETA From TDD month (Ordered(Changeable) · Ordered(Fixed) · In Production) · moves to the vessel column once Pl. Arrival·Shipping·Vessel are set', '클릭 → Logistics 목록 (미배정 제외)':'Click → Logistics list (excl. unassigned)', '미배정 셀 클릭 → 해당 월 ETA From TDD · Vessel 빈 값 목록, 미배정이 있는 달의 월 Total 링크는 선박분만.':'Unassigned cell → list filtered by that month ETA From TDD and empty Vessel; a month Total link covers vessels only.', '미배정 = Vessel 없이 ETA From TDD만 있는 오더 (ETA From TDD 월)':'Unassigned = orders with ETA From TDD but no Vessel (by ETA From TDD month)',
  'Ordered(Fixed) ~ OH Stock':'Ordered(Fixed) ~ OH Stock', 'Bonded + OH Stock':'Bonded + OH Stock', '현재 ({d}, 상태 Ordered(Fixed) ~ OH Stock 기준)':'Current ({d}, status Ordered(Fixed) ~ OH Stock)', '확장 뷰는 현재 기준만 지원 (월말 마감 없음)':'Extended view is current-basis only (no month-end closing)', 'Total (Ordered(Fixed) ~ OH Stock)':'Total (Ordered(Fixed) ~ OH Stock)', '단계별 {s}':'By stage: {s}',
  // 10/29 #7~#11 재고현황 탭명 · 장소 띠 · 항구 · 현재 및 미래 재고현황 차트 3종 · 대시보드 카드 연식 줄
  'TSC 재고':'Overall OH Stock(TSC)', '현재 및 미래 재고현황':'Current & Future Stock Status',
  '독일 Wörth 공장':'Wörth Factory in Germany', '바다':'At Sea', '대한민국 아산 트럭 스타 센터':'Asan Truck Star Center in Korea', 'Wörth 공장':'Wörth Factory', '아산 트럭 스타 센터':'Asan Truck Star Center', 'Antwerp항':'Port of Antwerp', '평택항':'Pyeongtaek Port',
  '여정 지도':'Journey Map', 'Ordered(Fixed) ~ OH Stock {n}대 · 원 면적 = 대수 · Factory Stock = In Production + Shipment scheduled':'Ordered(Fixed) ~ OH Stock {n} units · circle area = units · Factory Stock = In Production + Shipment scheduled',
  '모델별 구역 현황':'Models by Zone', '행 = 구분 > 차종 > 모델(Vehicle Series Model Axle Cab 비표준 옵션) · 열 = 5구역 균등 · 막대 = 연식 누적, 길이 = 대수(모델 행끼리 · 그룹 행끼리 같은 기준)':'Rows = Gen > Vehicle > Model (Vehicle Series Model Axle Cab non-standard options) · 5 equal zones · bar = stacked by MY, length = units (same scale within model rows and within group rows)',
  '상태 × 연식 히트맵':'Status × Model Year Heatmap', '행 = 구분 > 차종 > 모델 · 열 = 장소 > Current Status > 연식 + Total · 셀 색 농도 = 대수(상태 색) · 0은 공란 · 대수 0인 연식 열은 숨김':'Rows = Gen > Vehicle > Model · columns = location > Current Status > MY + Total · cell shade = units (status color) · 0 left blank · model-year columns with 0 units are hidden',
  '확정 주문 · 확정 재고':'Fixed Orders · Factory Stock', '운송 중':'In Transit', '재고 (보세 + 통관)':'Stock (Bonded + OH)',
  '＋ 모델 추가':'＋ Add Model', '실적 중앙값':'Actual Median', '차량 수':'Vehicles',
  'AFAB(SDISP) → 시스템 필드 매핑':'AFAB (SDISP) → System Field Mapping', '헤더 32개 명칭·순서가 바뀌면 업로드 검증에서 차단':'Upload validation blocks the file if the 32 header names or order change', 'AFAB 헤더(독일어)':'AFAB Header (German)',
  'Current Status 판정 규칙':'Current Status Rules', '상태별 Source · 판정 기준 (10/20 확정) · 1대 = 1단계 · 수동 override 시 사유 필수':'Source & rule per status (fixed 10/20) · 1 vehicle = 1 stage · reason required for manual override',
  '판정 규칙':'Rule', '현재 건수':'Count',
  '기준값 (Settings)':'Settings', '설명':'Description',
  '사용자 · 권한':'Users & Roles', 'M365 보안 그룹 2개로 역할 결정 · 5명 미만':'Roles from 2 M365 security groups · under 5 users', '이름':'Name', '부서':'Dept', 'M365 그룹':'M365 Group', '역할':'Role', '관리자':'Admin', '권한':'Permissions',
  '입력·수정·AFAB 반영·계획 확정':'Input · edit · AFAB apply · plan confirm', ' · 마스터·기준값·되돌리기':' · master · settings · undo', '조회·내보내기':'View · export',
  '변경 이력 (Vehicle_History)':'Change History (Vehicle_History)', '{n}건 · 필드 단위 before/after':'{n} records · field-level before/after', 'Commission 검색':'Search Commission', '되돌리기':'Undo',
  '감사 로그 (Audit_Log)':'Audit Log (Audit_Log)', '시스템 전체 행위 기록(로그인 제외): 누가·언제·무엇을':'All system actions (excl. login): who · when · what', '행위':'Action', '대상':'Target', '상세':'Detail',
};
function tx(ko, vars){
  let s = state.lang==='en' ? (I18N[ko]!=null ? I18N[ko] : ko) : ko;
  if(vars) Object.keys(vars).forEach(k=>{ s = s.split('{'+k+'}').join(String(vars[k])); });
  return s;
}

// ---- 문자열 헬퍼 ----
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function num(n){ return (n==null||n==='')?'':Number(n).toLocaleString('ko-KR'); }
function pct(a,b){ return b? (a/b*100).toFixed(1)+'%':'0.0%'; }
function el(id){ return document.getElementById(id); }
function q(sel,root){ return (root||document).querySelector(sel); }
function qa(sel,root){ return Array.from((root||document).querySelectorAll(sel)); }

// ---- 작은 컴포넌트 ----
function note(id){ return `<span class="note" title="${esc(NOTES[id]||'')}" data-note="${id}">${id}</span>`; }
// 출처 배지 (10/20 No.2 별첨2): 파랑(afab) = AFAB · WINGS · +75 FROM TDD · AFAB/입력 / 초록(input) = keyin 열의 '입력' / 회색(auto) = 그 외
const SRC_BADGE = {
  'AFAB':{cls:'afab', tip:'AFAB 업로드로만 갱신(잠금)'}, 'AFAB/입력':{cls:'afab', tip:'AFAB 기준 자동 판정 + Editor 입력(override)'}, 'WINGS':{cls:'afab', tip:'WINGS 연동 값(잠금)'}, '+75 FROM TDD':{cls:'afab', tip:'TDD Calc + 75일 자동 계산(잠금)'}, 'PM + LEAD TIME':{cls:'auto', tip:'In Production 진입 시 PM 1일 + 모델 리드타임(일, PM~Shipping)으로 1회 작성 · 이후 수정 없음(잠금)'},
  '자동':{cls:'auto', tip:'시스템 계산(잠금)'}, 'MODEL_MASTER':{cls:'auto', tip:'모델 마스터에서 자동 반영(잠금)'}, 'COLOR_MASTER':{cls:'auto', tip:'색상 마스터에서 자동 반영(잠금)'}, '선적·입항':{cls:'auto', tip:'선적·입항 화면에서 선박 단위 입력'}, '오더 생성':{cls:'auto', tip:'오더 생성 시 기록(잠금)'}, '입력':{cls:'auto', tip:'Editor 수동 입력'},
};
function srcBadge(src, keyin){ const b = SRC_BADGE[src]||SRC_BADGE['입력']; const c = (src==='입력'&&keyin)? 'input' : b.cls; return `<span class="badge ${c}" title="${b.tip}">${esc(tx(src))}</span>`; }
function srcEditable(src){ return src==='입력' || src==='선적·입항'; } // 상세 Drawer에서 입력창을 여는 출처
function stagePill(stage){ return `<span class="pill ${STAGE_CLASS[stage]||'neutral'}">${esc(stage)}</span>`; }
function statusPill(kind, text){ return `<span class="pill ${kind}">${esc(text)}</span>`; }

// ---- Toast (저장·처리 버튼은 동작 설명만 표시) ----
function toast(title, detail){
  const box=el('toast'); const t=document.createElement('div'); t.className='toast';
  t.innerHTML = `<b>${esc(title)}</b>${detail?`<span class="t2">${esc(detail)}</span>`:''}`;
  box.appendChild(t); setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 3800);
}
function describe(action, detail){ toast('[목업] '+action, detail||'실제 시스템에서는 SharePoint List에 저장되고 모든 화면 집계가 즉시 재계산됩니다.'); }

// ---- Modal ----
function openModal(title, bodyHtml, footerHtml){
  el('modal-title').innerHTML = title; el('modal-body').innerHTML = bodyHtml; el('modal-foot').innerHTML = footerHtml || `<button class="btn" onclick="closeModal()">${tx('닫기')}</button>`;
  document.body.classList.add('modal-open');
}
function closeModal(){ document.body.classList.remove('modal-open'); }

// ---- Drawer ----
function openDrawer(headHtml, bodyHtml){
  el('drawer-head').innerHTML = headHtml + `<button class="x" onclick="closeDrawer()" title="닫기">×</button>`;
  el('drawer-body').innerHTML = bodyHtml; el('drawer-body').scrollTop=0;
  document.body.classList.add('drawer-open');
}
function closeDrawer(){ document.body.classList.remove('drawer-open'); }

// ---- 차량 상세 Drawer (L6) ----
function openVehicle(comm){
  const v = VEHICLE_BY_COMM[comm]; if(!v){ toast('차량을 찾을 수 없습니다', comm); return; }
  const ms = [
    {l:'PM', d:v.pm}, {l:'TDD', d:v.tdd_calc}, {l:'Dispatch', d:v.dispatch},
    {l:'Shipping', d:v.shipping}, {l:'ETA Final', d:v.ata || v.eta_from_eukor_pirt || v.planned_arrival || v.eta_from_tdd}, {l:'Customs', d:v.customs_clearance_date}, {l:'Sales', d:v.sales_month},
  ]; // 10/19: 'Ordered' 단계 제거 (Order Date 열 제거에 따름) · 10/26 No.11: ETA Final 표시 = ATA > ETA From EUKOR/PIRT > Planned Arrival > ETA From TDD
  const doneIdx = v.current_status==='Sold'?7: v.current_status==='OH Stock'?6: v.current_status==='Bonded Stock'?5: v.current_status==='In Transit'?4: v.current_status==='Shipment scheduled'?3: v.current_status==='In Production'?(v.dispatch?3:2):0;
  const tl = ms.map((m,i)=>`<div class="ms ${i<doneIdx?'done':''} ${i===doneIdx?'cur':''}"><div class="dot"></div><div class="l">${m.l}</div><div class="d">${esc(m.d)||'—'}</div></div>`).join('');
  const editable = isEditor();
  const field = (c)=>{
    const val = v[c.key];
    let inner;
    if(c.key==='current_status') inner = stagePill(val);
    else if(c.key==='order_note') inner = editable? '<textarea rows="6" data-f="order_note"></textarea>' : ''; // 10/30 리뷰 #7: 6줄 칸 · 값은 openDrawer 뒤 DOM에서 대입(규칙 2) · Viewer는 .v.note 텍스트
    else if(c.key==='option_remarks' && editable) inner = '<textarea rows="4" data-f="option_remarks"></textarea>'; // 11/4: Option Note 4줄 칸 · 값은 openDrawer 뒤 DOM에서 대입(규칙 2)
    else if(srcEditable(c.src) && editable) inner = `<input value="${esc(val)}" data-f="${c.key}" placeholder="${c.key.includes('date')?'YYYY-MM-DD': c.key==='sales_month'?'YYYY-MM':''}">`;
    else if(editable) inner = `<input value="${esc(c.num?num(val):val)}" readonly title="${esc((SRC_BADGE[c.src]||{}).tip||'')}">`;
    else inner = `<span>${esc(c.num?num(val):val)||'<span class="muted">—</span>'}</span>`;
    const isNote = c.key==='order_note';
    return `<div class="f ${(c.memo||c.wide)?'wide':''}"><div class="k">${esc(tx(c.label))} ${srcBadge(c.src, c.keyin)}${srcEditable(c.src)?'':'<span class="lock">🔒</span>'}${isNote?'<span class="sw-slot"></span>':''}</div><div class="v${isNote&&!editable?' note':''}">${inner}</div></div>`; // 10/30 리뷰 #7: sw-slot = On/Off 스위치 자리
  };
  // 11/3 #7: 기본 그룹은 5줄만 'Vehicle : Tractor' 형식 — Model(MY Model Type Axle Cab Cab Gen Wheelbase PTO Emission 공백 구분 · 11/6: Cab 다음에 Cab Gen 추가) / Vehicle / BM / VIN No / Engine · 점선 칸·자물쇠·점선 구분·출처 배지 없음 · Commission No·Current Status는 머리글. 값은 openDrawer 뒤 DOM으로 대입(규칙 2, basicCard)
  const basicLines = [['Model', [v.model_year, v.series, v.model, v.axle, v.cab, v.cab_gen, v.wheelbase, v.pto, v.emission].filter(Boolean).join(' ')], ['Vehicle', v.vehicle], ['BM', v.bm], ['VIN No', v.vin_no], ['Engine', v.engine_no]];
  const basicCard = mk('div', {class:'card'}, mk('div', {class:'card-h'}, mk('h2', null, tx('기본'))),
    mk('div', {class:'lines'}, basicLines.map(([l,val])=> mk('div', {class:'line'}, mk('span', {class:'k'}, l), mk('span', {class:'c'}, ':'), val? mk('span', {class:'v'}, String(val)) : mk('span', {class:'v muted'}, '—')))));
  const groups = '<div id="drvBasic"></div>' + GROUPS.filter(g=>g!=='기본').map(g=>`<div class="card"><div class="card-h"><h2>${tx(g)}</h2></div><div class="fields">${COLUMNS.filter(c=>c.group===g).map(field).join('')}</div></div>`).join('');
  const extra = `<div class="card"><div class="card-h"><h2>${tx('파생·상태')}</h2><span class="desc">${tx('저장하지 않고 계산')}</span></div><div class="fields">
    <div class="f"><div class="k">MY ${srcBadge('자동')}</div><div class="v">${esc(v.model_year)} <span class="muted small">${tx('(VIN 10번째 자리)')}</span></div></div>
    <div class="f"><div class="k">Model Classification ${srcBadge('자동')}</div><div class="v">${esc(v.model_classification)}</div></div>
    <div class="f"><div class="k">DMS Model Name ${srcBadge('자동')}</div><div class="v">${esc(v.dms_model_name)}</div></div>
    <div class="f"><div class="k">Changeability D-day ${srcBadge('자동')}</div><div class="v">${v.changeability_dday==null?'—':'D-'+v.changeability_dday}</div></div>
    <div class="f"><div class="k">${tx('AFAB 금일 존재')} ${srcBadge('자동')}</div><div class="v">${v.in_afab_today? statusPill('ok',tx('있음')) : (['Ordered(Changeable)','Ordered(Fixed)','In Production','Shipment scheduled','In Transit'].includes(v.current_status)? statusPill('warn',tx('없음 — 확인 필요')):`<span class="muted">${tx('해당 없음')}</span>`)}</div></div>
    <div class="f"><div class="k">Status override ${srcBadge('입력', true)}</div><div class="v">${editable?`<select data-f="status_override"><option value="">${tx('(자동 판정)')}</option>${['Cancelled','Rejected','Sold','OH Stock','Bonded Stock','In Transit','Shipment scheduled','In Production','Ordered(Fixed)','Ordered(Changeable)','Ordered(Dummy)'].map(s=>`<option ${v.status_override===s?'selected':''}>${s}</option>`).join('')}</select>`:esc(v.status_override||'—')}</div></div>
    <div class="f"><div class="k">Status reason ${srcBadge('입력', true)}</div><div class="v">${editable?`<input value="${esc(v.status_reason)}" placeholder="${tx('override 시 사유 필수')}">`:esc(v.status_reason||'—')}</div></div>
  </div></div>`;
  const hist = VEHICLE_HISTORY.filter(h=>h.commission_no===comm);
  const histHtml = `<div class="card"><div class="card-h"><h2>${tx('변경 이력')}</h2><span class="desc">${tx('Vehicle_History · 필드 단위 before/after')}</span></div>
    <table class="tbl"><thead><tr>${['일시','필드','이전','이후','사용자','출처'].map(x=>`<th>${tx(x)}</th>`).join('')}</tr></thead><tbody>
    ${hist.map(h=>`<tr><td class="mono">${h.changed_at}</td><td class="mono">${h.field}</td><td class="muted">${esc(h.old_value)||'—'}</td><td><b>${esc(h.new_value)||'—'}</b></td><td>${esc(h.changed_by)}</td><td>${statusPill('neutral',h.source)}</td></tr>`).join('')}
    <tr><td class="mono">2026-09-15 10:00</td><td class="mono">(전체)</td><td class="muted">—</td><td>초기 적재</td><td>이관 스크립트</td><td>${statusPill('neutral','이관')}</td></tr>
    </tbody></table></div>`;
  const head = `<div><h2>${esc(v.commission_no)} ${stagePill(v.current_status)}</h2>
    <div class="meta">${esc(v.model_classification)} · ${esc(v.vehicle)} · VIN ${esc(v.vin_no)||tx('미부여')} · ${tx('수정')} ${esc(v.modified)} (${esc(v.modified_by)})</div>
    <div class="btn-group" style="margin-top:8px">
      <button class="btn primary sm editor-only" id="drvSave" title="${esc(tx('Order Note · Option Note 저장 + 변경 이력 기록 (그 외 입력 필드는 목업에서 저장하지 않음)'))}">${tx('저장')}</button>
      <button class="btn sm editor-only" onclick="describe('상태 override', '자동 판정 대신 지정 단계를 적용합니다. 사유(Status reason) 입력이 필수입니다.')">${tx('상태 override')}</button>
      <button class="btn sm danger editor-only" onclick="describe('취소 처리', 'Cancelled는 수동 지정만 가능합니다(자동 취소 금지). 사유 기록 후 KUFRI·대시보드 집계에서 제외됩니다.')">${tx('취소 처리')}</button>
      <button class="btn sm" onclick="describe('이력 보기', 'Vehicle_History 전체를 마스터·설정 > 변경 이력에서 Comm 필터로 조회합니다.')">${tx('이력 전체')}</button>
    </div></div>`;
  openDrawer(head, `<div class="card"><div class="card-h"><h2>${tx('마일스톤 타임라인')}</h2>${note('L6')}</div><div class="timeline">${tl}</div></div>${groups}${extra}${histHtml}`);
  // 10/30 리뷰 #7: Order Note 값 대입(규칙 2: innerHTML 대신 DOM) + On/Off 스위치 삽입
  const body = el('drawer-body');
  const bp = el('drvBasic'); if(bp) bp.replaceWith(basicCard); // 11/3 #7: 기본 그룹 카드 삽입
  const ta = q('textarea[data-f="order_note"]', body); if(ta) ta.value = v.order_note||'';
  const oa = q('textarea[data-f="option_remarks"]', body); if(oa) oa.value = v.option_remarks||''; // 11/4: Option Note 4줄 칸 값 대입
  const nt = q('.v.note', body); if(nt){ if(v.order_note) nt.textContent = v.order_note; else nt.replaceChildren(mk('span', {class:'muted'}, '—')); }
  const slot = q('.sw-slot', body); if(slot) slot.replaceWith(orderNoteSwitch(v, body));
  // 11/4: '저장' = Order Note·Option Note 텍스트 즉시 저장(Store.vehicles.saveNotes, 출처 '입력') + 드로어 '변경 이력' 표 맨 위에 행 추가 + 그리드가 떠 있으면 다시 그림. 그 외 입력 필드는 목업에서 저장하지 않음
  const sb = el('drvSave'); if(sb) sb.onclick = ()=>{
    const oi = q('[data-f="option_remarks"]', body); // 11/4: textarea
    const rows = Store.vehicles.saveNotes(comm, {order_note: ta? ta.value.trim() : undefined, option_remarks: oi? oi.value.trim() : undefined}, state.user);
    if(!rows.length){ toast(tx('저장'), tx('변경된 Note가 없습니다.')); return; }
    const tb = q('.tbl tbody', body); if(tb) rows.forEach(r=>tb.prepend(histRowEl(r)));
    if(ta) ta.value = v.order_note||''; if(oi) oi.value = v.option_remarks||'';
    if(typeof renderGrid==='function' && el('gridwrap')) renderGrid();
    toast(tx('Note 저장'), tx('{comm} · {fields} · Vehicle_History {n}건 기록 (출처: 입력)', {comm, fields: rows.map(r=>keyinLabel(r.field)).join(' · '), n:num(rows.length)}));
  };
}
// 드로어 '변경 이력' 표 행 (11/4): Vehicle_History 행 → tr (orderNoteSwitch의 행 구성과 동일)
function histRowEl(r){ return mk('tr', null, mk('td', {class:'mono'}, r.changed_at), mk('td', {class:'mono'}, r.field), mk('td', {class:'muted'}, r.old_value||'—'), mk('td', null, mk('b', null, r.new_value||'—')), mk('td', null, r.changed_by), mk('td', null, mk('span', {class:'pill neutral'}, r.source))); }
// Order Note On/Off 스위치 (10/30 리뷰 #7): On = 검토가 필요한 오더. Editor만 조작(그 외 비활성·상태만 표시), 바꾸면 즉시 저장(Store.vehicles.setOrderNoteFlag) + Vehicle_History 기록 + 드로어 '변경 이력' 표 맨 위에 행 추가
function orderNoteSwitch(v, body){
  const txt = mk('span', {class:'sw-txt'}, v.order_note_flag?'On':'Off');
  const input = mk('input', {type:'checkbox', checked: v.order_note_flag||null, disabled: isEditor()?null:true, onchange: e=>{
    const row = Store.vehicles.setOrderNoteFlag(v.commission_no, e.target.checked, state.user);
    txt.textContent = v.order_note_flag?'On':'Off';
    if(!row) return;
    const tb = q('.tbl tbody', body);
    if(tb) tb.prepend(mk('tr', null, mk('td', {class:'mono'}, row.changed_at), mk('td', {class:'mono'}, row.field), mk('td', {class:'muted'}, row.old_value), mk('td', null, mk('b', null, row.new_value)), mk('td', null, row.changed_by), mk('td', null, mk('span', {class:'pill neutral'}, row.source))));
    toast(tx('Order Note 토글 저장'), tx('{comm} · {val} · Vehicle_History 기록 (출처: 입력)', {comm:v.commission_no, val:row.new_value}));
  }});
  return mk('label', {class:'sw', title: tx('On = 검토가 필요한 오더 · 토글 즉시 저장 + 변경 이력 기록')}, input, mk('span', {class:'sw-track'}), txt);
}

// ---- SVG 세로 막대 차트 (그룹 막대, 기준월 이후 음영) ----
function barChart(opts){
  // opts: {months:[], series:[{name,color,values:[]}], baseIdx, height}
  const W=960, H=opts.height||240, padL=40, padR=10, padT=14, padB=28;
  const n=opts.months.length, gw=(W-padL-padR)/n;
  const max=Math.max(1,...opts.series.flatMap(s=>s.values));
  const nice = Math.ceil(max/10)*10;
  const y=v=>padT+(H-padT-padB)*(1-v/nice);
  let g='';
  for(let i=0;i<n;i++){ const x=padL+i*gw; if(opts.baseIdx!=null && i>opts.baseIdx) g+=`<rect class="future" x="${x}" y="${padT}" width="${gw}" height="${H-padT-padB}"/>`; if(i===opts.baseIdx) g+=`<rect class="base" x="${x}" y="${padT}" width="${gw}" height="${H-padT-padB}"/>`; }
  for(let t=0;t<=4;t++){ const v=nice*t/4; g+=`<line class="gridl" x1="${padL}" x2="${W-padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`; }
  const bw=Math.min(14,(gw-8)/opts.series.length-2);
  opts.series.forEach((s,si)=>{ s.values.forEach((v,i)=>{ const x=padL+i*gw+(gw-(bw+2)*opts.series.length)/2+si*(bw+2); const yy=y(v);
    g+=`<rect class="bar" x="${x}" y="${yy}" width="${bw}" height="${Math.max(0,H-padB-yy)}" fill="${s.color}" data-tip="${esc(opts.months[i])} · ${esc(s.name)} ${v}대${(opts.baseIdx!=null&&i>opts.baseIdx)?' (계획/예정)':''}"/>`; }); });
  opts.months.forEach((m,i)=>{ g+=`<text x="${padL+i*gw+gw/2}" y="${H-8}" text-anchor="middle">${m.slice(2)}</text>`; });
  const legend = `<div class="legend">${opts.series.map(s=>`<span><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}${opts.baseIdx!=null?'<span><span class="sw" style="background:#fff4e0;border:1px solid #f3d9a8"></span>기준월</span><span><span class="sw" style="background:#eef1f5;border:1px solid #d3dae3"></span>기준월 이후(계획·예정)</span>':''}</div>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg>${legend}`;
}

// ---- 가로 스택 바 (hbars) ----
function hbar(label, segs, total, max, cls){
  // segs: [{name,color,value}]
  const w = max? total/max*100 : 0;
  const track = segs.filter(s=>s.value>0).map(s=>`<div class="seg" style="width:${(s.value/total*w).toFixed(2)}%;background:${s.color}" data-tip="${esc(label)} · ${esc(s.name)} ${tx('{v}대',{v:s.value})} (${pct(s.value,total)})"></div>`).join('');
  return `<div class="hbar ${cls||''}"><div class="lbl" title="${esc(label)}">${esc(label)}</div><div class="track">${track}</div><div class="val num"><b>${num(total)}</b>${max!=null&&cls!=='nopct'?` · ${pct(total, hbar._grand||total)}`:''}</div></div>`;
}

// 툴팁
document.addEventListener('mousemove', e=>{ const t=e.target.closest&&e.target.closest('[data-tip]'); const tip=el('tip'); if(!tip) return; if(t){ tip.textContent=t.getAttribute('data-tip'); tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY+12)+'px'; } else tip.style.display='none'; });
// 설계 노트 클릭 → 설명
document.addEventListener('click', e=>{ const n=e.target.closest&&e.target.closest('.note'); if(n){ e.stopPropagation(); toast('설계 노트 '+n.dataset.note, NOTES[n.dataset.note]); } });

// ---- DOM 생성 헬퍼 (innerHTML 미사용: 데이터는 textContent/createElement로) ----
function mk(tag, attrs, ...children){ return _mkNode(document.createElement(tag), attrs, children); }
function mkSvg(tag, attrs, ...children){ return _mkNode(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, children); }
function _mkNode(e, attrs, children){
  if(attrs) Object.entries(attrs).forEach(([k,v])=>{ if(v==null||v===false) return; if(k==='class') e.setAttribute('class', v); else if(k==='style') e.style.cssText=v; else if(k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); });
  children.flat(Infinity).forEach(c=>{ if(c==null||c===false) return; e.append(c instanceof Node? c : document.createTextNode(String(c))); });
  return e;
}
function noteEl(id){ return mk('span', {class:'note', title:NOTES[id]||'', 'data-note':id}, id); }
function stagePillEl(stage){ return mk('span', {class:'pill '+(STAGE_CLASS[stage]||'neutral')}, stage); }
function legendEl(items){ return mk('div', {class:'legend'}, items.map(it=>mk('span', null, mk('span', {class:'sw', style:'background:'+it.color+(it.border?';border:1px solid '+it.border:'')}), it.name))); }

// ---- SVG 세로 막대 차트 (DOM 버전): 그룹 막대 + 막대 수치 + 기준월 강조 + 영문 월 라벨 ----
const MON_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monEn(ym){ return MON_EN[Number(ym.slice(5,7))-1]||ym; }
function ymLabel(ym){ return ym? `${ym.slice(0,4)}-${monEn(ym)}` : ''; } // 10/20 No.18: '2026-10' → '2026-Oct'
function barChartEl(opts){
  // opts: {months:[ym], series:[{name,color,values:[]}], baseIdx, width, height, visible, scrollTo, barW, barGap}
  // visible: 한 화면에 보일 월 수(나머지는 가로 스크롤) · scrollTo: 처음에 왼쪽 끝에 올 월 index (10/19 No.14)
  // barW·barGap: 막대 폭·같은 달 막대 사이 간격 (10/20 No.20 B안) · 스크롤 모드에서는 Y축을 별도 SVG로 왼쪽에 고정
  const n=opts.months.length, vis = (opts.visible && opts.visible<n)? opts.visible : null;
  // visible 지정 시 viewBox 폭을 n/visible배로 늘려(월당 폭·글자 크기는 그대로) SVG를 그만큼 넓게 표시하고 래퍼를 가로 스크롤
  const base=opts.width||1200, axisW=42, padL=vis? 6 : axisW;
  const W=base*(vis? n/vis : 1), H=opts.height||300, padR=10, padT=20, padB=40;
  const gw=(W-padL-padR)/n, plotH=H-padT-padB;
  const max=Math.max(1,...opts.series.flatMap(s=>s.values));
  const nice=Math.ceil(max/10)*10;
  const y=v=>padT+plotH*(1-v/nice);
  const svg=mkSvg('svg', {class:'chart', viewBox:`0 0 ${W} ${H}`, role:'img'});
  const axis=vis? mkSvg('svg', {class:'chart chart-axis', viewBox:`0 0 ${axisW} ${H}`, 'aria-hidden':'true'}) : null; // 고정 Y축
  for(let i=0;i<n;i++){ const x=padL+i*gw;
    if(opts.baseIdx!=null && i>opts.baseIdx) svg.append(mkSvg('rect', {class:'future', x, y:padT, width:gw, height:plotH}));
    if(i===opts.baseIdx) svg.append(mkSvg('rect', {class:'base strong', x:x+1, y:padT, width:gw-2, height:plotH}));
  }
  for(let t=0;t<=4;t++){ const v=nice*t/4; svg.append(mkSvg('line', {class:'gridl', x1:padL, x2:W-padR, y1:y(v), y2:y(v)}));
    (axis||svg).append(mkSvg('text', {x:axisW-6, y:y(v)+4, 'text-anchor':'end'}, v)); }
  const bg=opts.barGap!=null? opts.barGap : 2;
  const bw=Math.min(opts.barW||14,(gw-8)/opts.series.length-bg);
  opts.series.forEach((s,si)=>{ s.values.forEach((v,i)=>{ const x=padL+i*gw+(gw-(bw+bg)*opts.series.length)/2+si*(bw+bg); const yy=y(v); const future=opts.baseIdx!=null&&i>opts.baseIdx; const hgt=Math.max(0,H-padB-yy);
    svg.append(mkSvg('rect', {class:'bar', x, y:yy, width:bw, height:hgt, fill:s.color, 'data-tip':`${monEn(opts.months[i])} ${opts.months[i].slice(0,4)} · ${s.name} ${tx('{v}대',{v})}${future?tx(' (계획/예정)'):''}`}));
    // 수치는 막대 안쪽 위에 흰색으로, 막대가 짧으면 위에 표시 (10/20 No.20)
    if(v>0) svg.append(hgt>=16? mkSvg('text', {class:'ilbl', x:x+bw/2, y:yy+11, 'text-anchor':'middle'}, v) : mkSvg('text', {class:'vlbl', x:x+bw/2, y:yy-3, 'text-anchor':'middle'}, v));
  }); });
  opts.months.forEach((m,i)=>{ const cx=padL+i*gw+gw/2; svg.append(mkSvg('text', {class:i===opts.baseIdx?'base-m':'', x:cx, y:H-padB+15, 'text-anchor':'middle'}, monEn(m)));
    if(i===0 || m.endsWith('-01')) svg.append(mkSvg('text', {class:'yr', x:cx, y:H-padB+30, 'text-anchor':'middle'}, m.slice(0,4))); });
  const legend = legendEl([...opts.series.map(s=>({name:s.name, color:s.color})), ...(opts.baseIdx!=null?[{name:tx('기준월'), color:'#ffe0a8', border:'#e08a00'},{name:tx('기준월 이후(계획·예정)'), color:'#eef1f5', border:'#d3dae3'}]:[])]);
  if(vis){
    // 초기 스크롤 위치(scrollTo 월이 왼쪽 끝)는 화면에 붙은 뒤 scrollChartTo()로 맞춘다
    svg.style.width = (n/vis*100).toFixed(1)+'%';
    const wrap = mk('div', {class:'chart-scroll'}, svg);
    wrap.dataset.scrollFrac = ((padL + (opts.scrollTo||0)*gw)/W).toFixed(4); // 스크롤 위치 = SVG 전체 폭 × 비율
    // Y축 SVG 폭 = 전체 폭 × axisW/(base+axisW) 이면 두 SVG의 px/단위 배율이 같아져 눈금 높이가 맞는다 (측정 불필요)
    axis.style.width = (axisW/(base+axisW)*100).toFixed(3)+'%';
    return mk('div', null, mk('div', {class:'chart-split'}, axis, wrap), legend);
  }
  return mk('div', null, svg, legend);
}
function scrollChartTo(root){ const go=()=>qa('.chart-scroll', root).forEach(w=>{ w.scrollLeft = w.scrollWidth * Number(w.dataset.scrollFrac||0); }); go(); requestAnimationFrame(go); }

// ---- SVG 세로 누적 막대 차트 (DOM 버전) ----
function stackChartEl(opts){
  // opts: {cats:[label], series:[{name,color,values:[]}], width, height, unit}
  const W=opts.width||600, H=opts.height||260, padL=42, padR=10, padT=26, padB=28;
  const n=opts.cats.length, gw=(W-padL-padR)/Math.max(1,n), plotH=H-padT-padB;
  const totals=opts.cats.map((c,i)=>opts.series.reduce((a,s)=>a+(s.values[i]||0),0));
  const nice=Math.max(10, Math.ceil(Math.max(1,...totals)/10)*10);
  const y=v=>padT+plotH*(1-v/nice);
  const svg=mkSvg('svg', {class:'chart', viewBox:`0 0 ${W} ${H}`, role:'img'});
  for(let t=0;t<=4;t++){ const v=nice*t/4; svg.append(mkSvg('line', {class:'gridl', x1:padL, x2:W-padR, y1:y(v), y2:y(v)}), mkSvg('text', {x:padL-6, y:y(v)+4, 'text-anchor':'end'}, v)); }
  const bw=Math.min(64, gw*0.6);
  opts.cats.forEach((c,i)=>{ const x=padL+i*gw+(gw-bw)/2; let acc=0;
    opts.series.forEach(s=>{ const v=s.values[i]||0; if(!v) return; const y1=y(acc+v), hgt=y(acc)-y1;
      svg.append(mkSvg('rect', {class:'bar', x, y:y1, width:bw, height:hgt, fill:s.color, 'data-tip':`${c} · ${s.name} ${tx('{v}대',{v})} (${pct(v,totals[i])})`}));
      if(hgt>=14) svg.append(mkSvg('text', {class:'slbl', x:x+bw/2, y:y1+hgt/2, 'text-anchor':'middle', 'dominant-baseline':'middle'}, v));
      acc+=v; });
    svg.append(mkSvg('text', {class:'vlbl', x:x+bw/2, y:y(acc)-5, 'text-anchor':'middle'}, totals[i]));
    svg.append(mkSvg('text', {x:x+bw/2, y:H-padB+16, 'text-anchor':'middle'}, c)); });
  return mk('div', null, svg, legendEl(opts.series.map(s=>({name:s.name, color:s.color}))));
}

// ---- 10/29: 재고현황 차트 가상안(docs/재고현황_차트_가상안.html) 채택분 공용 컴포넌트 — 연식 세그먼트 · hbar DOM 버전 · 모델 묶음 · 그림 아이콘 · 장소 띠 · 항구 세로선 ----
function myOf(v){ return MY_KEYS.includes(v.model_year) ? v.model_year : '기타'; }
function mySegs(vs){ const c = countBy(vs, myOf); return [...MY_KEYS, '기타'].map(k=>({name:tx(k), color:MY_COLORS[k], value:c[k]||0})); } // value 0 포함 (그리는 쪽에서 거름)
function myCountText(vs){ return mySegs(vs).filter(s=>s.value).map(s=>`${s.name} ${num(s.value)}`).join(' · '); }
function miniStackEl(label, vs){ const n=vs.length; return mk('div', {class:'mini'}, mySegs(vs).filter(s=>s.value>0).map(s=>mk('div', {style:`flex:${s.value};background:${s.color}`, 'data-tip':`${label} · ${s.name} ${tx('{v}대',{v:s.value})} (${pct(s.value,n)})`}))); }
// hbar의 DOM 버전 (같은 CSS 클래스, innerHTML 없이 생성) · grand가 있으면 우측에 비율
function hbarEl(label, segs, n, max, grand, cls){ const w = max ? n/max*100 : 0;
  const track = mk('div', {class:'track'}, segs.filter(s=>s.value>0).map(s=>mk('div', {class:'seg', style:`width:${(s.value/n*w).toFixed(2)}%;background:${s.color}`, 'data-tip':`${label} · ${s.name} ${tx('{v}대',{v:s.value})} (${pct(s.value,n)})`})));
  return mk('div', {class:'hbar '+(cls||'')}, mk('div', {class:'lbl', title:label}, label), track, mk('div', {class:'val num'}, mk('b', null, num(n)), grand ? ' · '+pct(n,grand) : '')); }
// 선적·입항 표와 같은 모델 묶음: 구분(Gen, Model_Master 순) > 차종(VEHICLE_TYPES 순) > 모델(arrivalModelLabel, 사전순) · rows[].vs = 차량 목록
function modelGroups(vs){ const byKey={}; vs.forEach(v=>{ const label=arrivalModelLabel(v); const k=v.gen+'|'+v.vehicle+'|'+label; const c = byKey[k] = byKey[k] || {gen:v.gen, vehicle:v.vehicle, label, vs:[]}; c.vs.push(v); });
  const rows = Object.values(byKey);
  return [...new Set(MODEL_MASTER.map(m=>m.gen))].filter(g=>rows.some(r=>r.gen===g)).map(g=>({gen:g, vehicles: VEHICLE_TYPES.filter(t=>rows.some(r=>r.gen===g&&r.vehicle===t)).map(t=>({vehicle:t, rows: rows.filter(r=>r.gen===g&&r.vehicle===t).sort((a,b)=>a.label<b.label?-1:1)}))})); }
// CSS 변수 색('var(--x)') → hex · rgba 문자열 (히트맵 농도 · SVG 띠 배경)
function cssColor(c){ const m=/var\((--[\w-]+)\)/.exec(c); return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : c; }
function rgbaOf(c, a){ const h=cssColor(c).replace('#',''); const n=parseInt(h.length===3 ? h.split('').map(x=>x+x).join('') : h, 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
// 그림 아이콘 (24×24 좌표): de = 독일 국기 깃발 · kr = 태극기 깃발 · sea = 바다 그림(하늘·해·갈매기·파도) — 틀(d) 안에 무늬를 clipPath로 잘라 넣고 테두리, clipPath id는 전역 카운터로 고유
let _picSeq = 0;
const _picPath = (d, a) => mkSvg('path', Object.assign({d, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, a||{}));
const PIC_FLAG_D = 'M5.5 4C10 2.2 14 6 21 4.3V15.3C14 17 10 13.2 5.5 15Z', PIC_SEA_D = 'M2 3h20v18H2z';
function _picFrame(d, inner){ const id = 'picclip'+(++_picSeq); return [mkSvg('clipPath', {id}, mkSvg('path', {d})), mkSvg('g', {'clip-path':`url(#${id})`}, inner), mkSvg('path', {d, fill:'none', stroke:'#8a95a3', 'stroke-width':.8})]; }
function _picFlag(inner){ return [..._picFrame(PIC_FLAG_D, inner), mkSvg('line', {x1:4.5, y1:2.5, x2:4.5, y2:22, stroke:'#5b6b82', 'stroke-width':1.6, 'stroke-linecap':'round'}), mkSvg('circle', {cx:4.5, cy:2.2, r:1.1, fill:'#5b6b82'})]; }
function picNodes(kind){
  if(kind==='de') return _picFlag([mkSvg('rect', {x:5, y:2, width:17, height:5.3, fill:'#000'}), mkSvg('rect', {x:5, y:7.3, width:17, height:5, fill:'#dd0000'}), mkSvg('rect', {x:5, y:12.3, width:17, height:5.5, fill:'#ffce00'})]);
  if(kind==='kr') return _picFlag([mkSvg('rect', {x:5, y:2, width:17, height:16, fill:'#fff'}),
    mkSvg('path', {d:'M10 9.7a3.2 3.2 0 0 1 6.4 0a1.6 1.6 0 0 1-3.2 0a1.6 1.6 0 0 0-3.2 0z', fill:'#cd2e3a'}), mkSvg('path', {d:'M16.4 9.7a3.2 3.2 0 0 1-6.4 0a1.6 1.6 0 0 1 3.2 0a1.6 1.6 0 0 0 3.2 0z', fill:'#0047a0'}), // 태극 (빨강 위 · 파랑 아래)
    ...[[6.3,4.6],[17.6,5.2],[6.3,12.3],[17.6,12.9]].flatMap(([x,y])=>[0,1,2].map(i=>mkSvg('rect', {x, y:y+i*1.1, width:2.6, height:.6, fill:'#1d2733'})))]); // 4괘 = 짧은 막대 3줄
  if(kind==='sea') return _picFrame(PIC_SEA_D, [mkSvg('rect', {x:2, y:3, width:20, height:18, fill:'#dceefb'}), mkSvg('circle', {cx:16.8, cy:8.2, r:2.7, fill:'#ffce00'}),
    _picPath('M5 8.2c1.3-1.6 2.6-1.9 3.9-.9 1.3-1 2.6-.7 3.9.9', {stroke:'#3a4553', 'stroke-width':1.1}), _picPath('M8.5 11.6c.9-1.1 1.8-1.3 2.7-.6.9-.7 1.8-.5 2.7.6', {stroke:'#3a4553', 'stroke-width':.9}),
    mkSvg('path', {d:'M2 14.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0 2 0 2 0V21H2z', fill:'#2a78d6'}), _picPath('M2 14.5c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0', {stroke:'#fff', 'stroke-width':.9, opacity:.85}),
    mkSvg('path', {d:'M2 18.2c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0 2 0 2 0V21H2z', fill:'#1b4f9b'})]);
  return [];
}
function picIconEl(kind){ const s = mkSvg('svg', {class:'loc-ic', viewBox:'0 0 24 24', 'aria-hidden':'true'}); picNodes(kind).forEach(n=>s.append(n)); return s; }
function picIconSvg(kind, x, y, k){ const g = mkSvg('g', {transform:`translate(${x},${y}) scale(${k})`}); picNodes(kind).forEach(n=>g.append(n)); return g; }
// 장소 띠 (DOM / SVG) · 항구 라벨 행·세로 점선 (DOM / SVG)
function locTip(loc, stages, n){ return [tx(loc.name), state.lang==='en' ? null : loc.en, stages, tx('{v}대', {v:num(n)})].filter(Boolean).join(' · '); }
function locBandEl(loc, n, tip, short){ return mk('div', {class:'locb', style:`--c:${loc.color}`, 'data-tip':tip||locTip(loc, '', n)}, picIconEl(loc.icon), mk('div', {class:'nm'}, tx(short && loc.short ? loc.short : loc.name)), mk('div', {class:'ct num'}, tx('{v}대', {v:num(n)}))); }
function portsRowEl(ports){ return mk('div', {class:'ports'}, ports.map(p=>mk('span', {style:`left:${p.left}`}, tx(p.name)))); } // ports: [{name, left(CSS 값)}]
function vlinesEl(ports){ return ports.map(p=>mk('div', {class:'vline', style:`left:${p.left}`})); }
function gridBoundaryLeft(i, cols, gap){ return `calc(${(i/cols*100).toFixed(3)}% + ${(gap*(i/cols-0.5)).toFixed(2)}px)`; } // 등폭 grid(열 cols, 간격 gap px)에서 i-1열과 i열 사이의 left
const _textW = s => [...s].reduce((a,ch)=>a+(/[가-힣]/.test(ch) ? 11 : 6.3), 0); // SVG 글자 폭 추정 (한글 11px · 영숫자 6.3px)
function svgLocBand(svg, loc, n, x0, x1, y, h, tip){ const col=cssColor(loc.color), w=x1-x0, iw=26, name=tx(loc.name);
  svg.append(mkSvg('rect', {x:x0, y, width:w, height:h, rx:7, fill:rgbaOf(col,.08), stroke:rgbaOf(col,.45), 'data-tip':tip||locTip(loc, '', n)}));
  let tx0 = x0+10; if(w >= iw+8+_textW(name)+60){ svg.append(picIconSvg(loc.icon, x0+10, y+(h-26)/2, 26/24)); tx0 = x0+10+iw+8; } // 아이콘 + 이름 + 대수가 들어갈 폭일 때만 아이콘
  svg.append(mkSvg('text', {class:'bn', x:tx0, y:y+h/2+5}, name), mkSvg('text', {class:'bc', x:x1-10, y:y+h/2+5, 'text-anchor':'end'}, tx('{v}대', {v:num(n)}))); }
function svgPorts(svg, ports, yTop, yBottom){ ports.forEach(p=>{ const name=tx(p.name), w=_textW(name)+16, x=p.x; // ports: [{name, x}] · 알약 라벨 + 점선(yTop+5 → yBottom)
  svg.append(mkSvg('line', {x1:x, x2:x, y1:yTop+5, y2:yBottom, stroke:'var(--line-strong)', 'stroke-dasharray':'3 3'}), mkSvg('rect', {x:x-w/2, y:yTop-13, width:w, height:18, rx:9, fill:'#fff', stroke:'var(--line)'}), mkSvg('text', {class:'bs', x, y:yTop, 'text-anchor':'middle', style:'pointer-events:none'}, name)); }); }
