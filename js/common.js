'use strict';
/* ===== 공통: 상수·컴포넌트·Drawer·Modal·Toast ===== */

const STAGES = ['Ordered(Dummy)','Rejected','Ordered(Changeable)','Ordered(Fixed)','In Production','Shipment scheduled','In Transit','Bonded Stock','OH Stock','Sold'];
const STAGE_CLASS = {'Ordered(Dummy)':'st-ordered','Rejected':'st-cancel','Ordered(Changeable)':'st-ordered','Ordered(Fixed)':'st-ordered','In Production':'st-prod','Shipment scheduled':'st-sched','In Transit':'st-transit','Bonded Stock':'st-bonded','OH Stock':'st-oh','Sold':'st-sold','Cancelled':'st-cancel'};
const STAGE_COLOR = {'Ordered(Dummy)':'var(--st-ordered)','Rejected':'var(--st-cancel)','Ordered(Changeable)':'var(--st-ordered)','Ordered(Fixed)':'var(--st-ordered)','In Production':'var(--st-prod)','Shipment scheduled':'var(--st-sched)','In Transit':'var(--st-transit)','Bonded Stock':'var(--st-bonded)','OH Stock':'var(--st-oh)','Sold':'var(--st-sold)','Cancelled':'var(--st-cancel)'};
const STAGE_SHORT = {'Ordered(Dummy)':'Ordered(Dummy)','Rejected':'Rejected','Ordered(Changeable)':'Ordered(Changeable)','Ordered(Fixed)':'Ordered(Fixed)','In Production':'In Production','Shipment scheduled':'Shipment scheduled','In Transit':'In Transit (Shipped / Invoiced)','Bonded Stock':'Bonded Stock','OH Stock':'OH Stock','Sold':'Sold','Cancelled':'Cancelled'};
const SERIES = ['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)','var(--s6)','var(--s7)','var(--s8)'];

// Logistics 그리드 44열 — docs/data-dictionary_v2_1_2.csv "최종 컬럼 순서" 기준 (Commission No 고정열 → Current Status → 사전 순서 → Order Note)
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
  {key:'option', label:'Option', group:'기본', src:'MODEL_MASTER'},   // 10/15 No.5: Model_Master에서 자동 반영 (수동 입력 제외)
  {key:'changeability_date', label:'Changeability Date', group:'일정', src:'AFAB'},
  {key:'pm', label:'PM', group:'일정', src:'AFAB'},
  {key:'original_pm', label:'Original PM', group:'일정', src:'오더 생성'},
  {key:'tdd_calc', label:'TDD Calc', group:'일정', src:'AFAB'},
  {key:'dispatch', label:'Dispatch', group:'일정', src:'AFAB'},
  {key:'shipping', label:'Shipping', group:'일정', src:'AFAB'},
  {key:'invoice', label:'Invoice', group:'선적', src:'AFAB'},
  {key:'planned_arrival', label:'Planned Arrival', group:'일정', src:'AFAB'},
  {key:'eta_from_tdd', label:'ETA From TDD', group:'일정', src:'+75 FROM TDD'},
  {key:'eta_from_eukor_pirt', label:'ETA From EUKOR/PIRT', group:'일정', src:'선적·입항'},
  {key:'ata', label:'ATA', group:'일정', src:'선적·입항'},
  {key:'bl_no', label:'B/L No', group:'선적', src:'선적·입항'},
  {key:'vessel', label:'Vessel', group:'선적', src:'선적·입항'},
  {key:'customs_clearance_date', label:'Customs Clearance Date', group:'통관', src:'입력'},
  {key:'color_code', label:'Color Code', group:'사양', src:'AFAB'},
  {key:'color_name', label:'Color Name', group:'사양', src:'COLOR_MASTER'},
  {key:'tires', label:'Tires', group:'메모', src:'WINGS', memo:true},
  {key:'model_in_afab', label:'Model In AFAB', group:'사양', src:'AFAB'},
  {key:'engine_no', label:'Engine No', group:'기본', src:'AFAB'},
  {key:'import_license', label:'Import License', group:'통관', src:'입력'},
  {key:'ref_commission_no', label:'Ref Commission No', group:'기본', src:'입력', keyin:true},
  {key:'option_remarks', label:'Option Note', group:'메모', src:'입력', keyin:true, memo:true},
  {key:'order_note', label:'Order Note', group:'메모', src:'입력', keyin:true, memo:true}, // 10/15 No.10: Option Note 다음 순서
  {key:'create_order_date', label:'Create Order Date', group:'일정', src:'오더 생성'}, // 10/20 No.10: 시스템 오더 등록일 (AFAB Order Date와 별개 · 더미 오더 → 실제 오더 전환 이력)
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
const GROUPS = ['기본','일정','선적','통관','사양','메모'];
const DEFAULT_HIDDEN_COLS = ['original_pm']; // 사전 주석: 'Original PM'은 숨기기 기능으로 구현 (편집 모드 열 머리글 체크박스로 다시 표시 가능)
const GRID_JUMPS = ['current_status','tdd_calc','bl_no','option_remarks']; // 그리드 바로가기 버튼(이름 = 열 라벨) → 이동할 열 key. current_status는 맨 처음으로

// 설계 노트 (목업 전용)
const NOTES = {
  G1:'상단 메뉴 바 7개(좌측 사이드바 아님) + AFAB 최근 반영 표시', G2:'화면 제목 줄: 통합 검색(Comm/VIN/B/L → 1건이면 상세 즉시) · 설계 노트 토글 · 로그인 사용자·역할', G3:'Viewer에게는 입력·반영·확정 버튼이 보이지 않는다. UI 한국어, 필드명은 기존 엑셀 영문',
  D1:'차량 주문·재고 흐름: 카드 7종 한 줄 수정 가능 주문(Ordered(Changeable)) → 확정 주문(Ordered(Fixed)) → 확정 재고(Factory Stock = In Production + Shipment scheduled) → 운송 중(In Transit) → 당월 입항 예정(Arrival) → 재고(Bonded + OH) → 판매(Sold YTD). 카드별 아이콘, Cancelled 카드 없음. 카드 클릭 → 관련 목록', D2:'월별 생산/입항/판매 추이: 26년 1월~27년 12월 24개월 중 당월 포함 8개월만 표시, 나머지는 가로 스크롤(Y축 고정). 막대 수치 표시, 기준월 강조, 기준월 이후 음영', D3:'입항 예정 선박: 입항예정 값은 Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환, ATA 후 2일까지 표시', D4:'차종별 파이프라인(7단계, Sold 제외) · 단계 색 = Current Status 색', D6:'연식별 재고: 세로 누적 막대(연식 최신순, Tractor/Rigid/Tipper/BB)', D7:'당월 도착 예정: 선적·입항 월별 입항 예정 피벗의 당월 블록 (행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · Option) · 열: 당월 입항 선박 + Total · 선박 입항월 = ATA → ETA 선사 → Pl. arrival) · 당월 입항 예정 카드와 동일 기준',
  L1:'단계 칩 필터(10단계 + Cancelled)', L2:'열 필터(모델 관련 Vehicle~Option · 날짜 열 Changeability Date~Customs Clearance Date 연·월 체크 트리 · Vessel) · 텍스트 검색(Comm · VIN · B/L · Vessel · Type · Engine · Order Note · Option Note, 일치 텍스트 하이라이트) · 정렬(기본 Commission No 최신순)', L3:'Comm No. 기준 한 행에 전체 44열을 data-dictionary 순서로 표시, Comm No. 열 고정, 바로가기(Current Status · TDD Calc · B/L No · Option Note)', L4:'열 표시/숨김: 편집 모드에서 열 머리글 체크박스로 조정(변경 이력 없음)', L5:'출처 배지: 파랑 = AFAB · WINGS · +75 FROM TDD · AFAB/입력, 초록 = Key-in 입력(B1 Factory Order · Sales Month · Option Note · Order Note · Ref Commission No), 회색 = 마스터·자동·화면 입력·그 외 입력', L6:'행 클릭 → 상세 Drawer(마일스톤 타임라인, 필드 그룹, 변경 이력)', L7:'수동 오더 추가, 엑셀 내보내기',
  S1:'KPI 3종(운송중·당월/익월 입항 예정) + 월별 입항 예정(엑셀 Arrival Schedule 피벗: 구분 > 차종 > 모델 × 월 > 선박)', S2:'선박별 현황(B/L·Shipping·Pl.arrival·ETA 선사·ATA·TSC 입고일(Key-in)·대수) + 선사 스케줄 일괄 업데이트. ETA 불일치 카드·탭·표시는 제외',
  K1:'기준월 선택(최근 5개월 월말 마감 + 현재) → 요약 카드(Total Stock + 연식 MY24~27 대수·비율) → 연식 범례', K2:'By Vehicle(차종별 스택 바, 길이=대수) → By Model(차종 섹션 안 모델별 스택 바) → 마감 리포트 HTML·Excel 내보내기',
  A1:'4단계 흐름 + 드롭존', A2:'파일 검증 결과(헤더 32개, 중복 0, 날짜/금액 변환, FIN 형식)', A3:'변경점(신규/변경/제외/변동없음) 체크 반영', A4:'반영 이력(AFAB_Uploads)', A5:'매핑 요약(32열)',
  P1:'연도·차종 선택, 판매계획 입력 모드(Editor), 범례(실적/확정/계획)', P2:'모델 그룹 접기, 행 = Production/Arrival/Sales/OH Stock/In Transit/재고월수, 기준월 열 강조', P3:'전체 합계 + Fixed Order', P4:'계획 확정·시나리오(2차)·Kufri Excel',
  C1:'아키텍처·연결 정보', C2:'모델 마스터(Model_Master)', C3:'AFAB 매핑', C4:'상태 규칙(§7)', C5:'기준값(Settings)', C6:'사용자·권한(M365 그룹)', C7:'변경 이력(Vehicle_History)', C8:'감사 로그(Audit_Log)',
};

// ---- 전역 상태 ----
const PAGES = {};
const state = { role:'Editor', user: USERS.find(u=>u.role==='Editor').name, notes:false, hiddenCols:new Set(DEFAULT_HIDDEN_COLS), lang:'ko' };
function isEditor(){ return state.role==='Editor'; }

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
  '대수':'Units', '단계':'Stage', '검색':'Search', '일시':'Date', '필드':'Field', '이전':'Before', '이후':'After', '사용자':'User', '출처':'Source',
  '기본':'Basic', '일정':'Schedule', '선적':'Shipping', '통관':'Customs', '사양':'Spec', '메모':'Memo',
  '입력':'Input', '자동':'Auto', 'AFAB/입력':'AFAB/Input', '선적·입항':'Shipping·Arrival', '오더 생성':'Create Order', 'AFAB 수정 가능':'AFAB Editable',
  '(빈 값)':'(blank)', '(공란)':'(blank)', '전체':'All', '전체 ({n})':'All ({n})',
  // 차량 상세 Drawer
  '파생·상태':'Derived · Status', '저장하지 않고 계산':'Calculated, not stored', '(VIN 10번째 자리)':'(VIN 10th digit)', 'AFAB 금일 존재':'In AFAB Today',
  '있음':'Yes', '없음 — 확인 필요':'No — check', '해당 없음':'N/A', '(자동 판정)':'(Auto)', 'override 시 사유 필수':'Reason required for override',
  '변경 이력':'Change History', 'Vehicle_History · 필드 단위 before/after':'Vehicle_History · field-level before/after', '미부여':'not assigned', '수정':'Modified',
  '상태 override':'Status override', '취소 처리':'Cancel Vehicle', '이력 전체':'Full History', '마일스톤 타임라인':'Milestone Timeline',
  // 대시보드
  '수정 가능 주문':'Changeable Orders', '확정 주문':'Fixed Orders', '확정 재고 (Factory Stock)':'Factory Stock', '운송 중':'In Transit',
  '당월 입항 예정 ({m}월)':'Arriving This Month ({mon})', '선박 {n}척':'{n} vessels', '재고 (보세 + 통관)':'Stock (Bonded + OH)', '판매 ({y} YTD)':'Sales ({y} YTD)', '전월 {n}':'Prev. month {n}',
  '차량 주문·재고 흐름':'Vehicle Order & Stock Flow',
  '7개 지표 · 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 당월 입항 예정 → 재고 → 판매 · 전체 {n} (Cancelled 제외)':'7 metrics · Changeable → Fixed → Factory Stock → In Transit → Arriving This Month → Stock → Sales · Total {n} (excl. Cancelled)',
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
  '엑셀 내보내기':'Export Excel', '{n}건 / 전체 {m}':'{n} / Total {m}', ' · 열 필터: {cols}':' · Column filter: {cols}', '조건에 맞는 차량이 없습니다.':'No vehicles match the filters.',
  '바로가기':'Jump to', '· 열 {a}/{b} · 가로 스크롤 · Comm No. 고정':'· Columns {a}/{b} · horizontal scroll · Comm No. pinned',
  '{n}건 중 {a}–{b}':'{a}–{b} of {n}', '‹ 이전':'‹ Prev', '다음 ›':'Next ›', '50행 페이지 (실제 구현은 가상 스크롤 또는 50행 페이지)':'50 rows per page (real build: virtual scroll or 50-row pages)',
  '편집 모드':'Edit Mode', '· 선택 ':'· Selected ', '건':' items', '오더 변경 (모델 일괄)':'Change Order (Bulk Model)', 'Key-in 일괄 입력':'Bulk Key-in', '선택 해제':'Clear Selection',
  'Key-in 대상 열: B1 Factory Order · Sales Month (셀 클릭 → 개별 입력)':'Key-in columns: B1 Factory Order · Sales Month (click a cell to edit)',
  "· 저장 대기 {n}건 → '편집 종료' 시 저장·변경 이력 기록":"· {n} pending → saved with history on 'End Edit'",
  '현재 BM':'Current BM', '현재 모델 분포':'Current Model Mix', '변경할 모델 (Model_Master) *':'New Model (Model_Master) *', '{k} {n}건':'{k} ({n})',
  '오더 변경 — 모델 일괄 변경':'Change Order — Bulk Model Change', '변경':'Change', '예) B1-12345':'e.g. B1-12345',
  '값 검색 (예: 2853)':'Search values (e.g. 2853)', '연·월 검색 (예: 2026-11)':'Search year-month (e.g. 2026-11)', '값 검색':'Search values',
  '{y}년':'{y}', '{m}월':'{mon}', '일치하는 값이 없습니다.':'No matching values.', '{c} 열 필터':'{c} Column Filter',
  '표시된 값 전체 선택':'Select All Shown', '표시된 값 해제':'Clear Shown', '필터 해제':'Clear Filter',
  'Type 숫자 3~4자리 (예: 2863)':'Type digits, 3–4 (e.g. 2863)', '검색어를 입력하세요':'Enter a search term', 'Type을 먼저 선택하세요':'Select a Type first',
  '모델을 선택하면 속성이 표시됩니다.':'Select a model to see its attributes.', '리드타임(월)':'Lead Time (mo)', '시작 번호 (예) 071009001':'Start No. (e.g. 071009001)',
  '생성될 Commission No: {range} ({n}건) · 마지막 번호 {last}':'Commission No to create: {range} ({n}) · last No. {last}', '시작 번호는 숫자만 입력하세요.':'Start number must be digits only.',
  'Type 선택 ({n})':'Select Type ({n})', '숫자 3~4자리를 입력하세요':'Enter 3–4 digits', '일치하는 Type 없음':'No matching Type', '모델 선택 ({n})':'Select Model ({n})',
  '① Type 검색 *':'① Type Search *', '④ 모델 (Model_Master) *':'④ Model (Model_Master) *', '매칭된 모델 속성':'Matched Model Attributes',
  '⑤ Original PM (생산월) *':'⑤ Original PM (Production Month) *', '수량 *':'Qty *', '⑥ Commission No 생성 방식 *':'⑥ Commission No Numbering *',
  ' 마지막 번호에 이어서 생성':' Continue from last No.', ' 새 번호로 시작 ':' Start from new No. ', '생성':'Create',
  // 선적 · 입항
  '운송중 (In Transit)':'In Transit', 'Shipped / Invoiced · {n}척 · 선적 예정 {m}대 별도':'Shipped / Invoiced · {n} vessels · {m} units scheduled separately',
  '당월 입항 예정 ({m})':'Arriving This Month ({m})', 'ETA Final 기준, 없으면 Pl. arrival':'By ETA Final, else Pl. arrival', '익월 입항 예정 ({m})':'Arriving Next Month ({m})', 'Shipment scheduled 포함':'Incl. Shipment scheduled',
  '월별 입항 예정 (Arrival Schedule)':'Monthly Arrival Schedule',
  '행: 구분 > 차종 > 모델(Vehicle · Model · Type · Axle · Cab · Option) · 열: 입항 월(ATA → ETA 선사 → Pl. arrival 순) > 선박 · 값: 모델별 선박 선적 대수 (In Transit + Shipment scheduled)':'Rows: Gen > Vehicle > Model (Vehicle · Model · Type · Axle · Cab · Option) · Columns: arrival month (ATA → carrier ETA → Pl. arrival) > vessel · Values: units shipped per vessel by model (In Transit + Shipment scheduled)',
  '선박의 입항 월은 ATA → ETA 선사 → Pl. arrival(AFAB) 순으로 결정. 실제 구현에서는 셀 클릭 → 해당 선박·모델 Logistics 목록.':'Arrival month per vessel = ATA → carrier ETA → Pl. arrival (AFAB). In the real build, clicking a cell opens the Logistics list for that vessel and model.',
  '운송중':'In Transit', '선적 예정':'Scheduled', '미확정':'TBD', '예정':'planned', '미입력':'Not entered',
  '선박별 현황':'Status by Vessel', 'ATA = 실제 입항일(구 ETA Final) · TSC 입고일(TSC Arrival Date)은 Editor 수기 입력(Key-in)':'ATA = actual arrival (formerly ETA Final) · TSC Arrival Date is Editor key-in',
  '선사 스케줄 일괄 업데이트':'Bulk Update Carrier Schedule', '엑셀':'Excel', 'ETA 선사 (EUKOR/MOL)':'Carrier ETA (EUKOR/MOL)', 'TSC 입고일 (TSC Arrival Date)':'TSC Arrival Date',
  '행 클릭 → 해당 선박의 차량 Logistics 목록. ATA 입력은 Logistics 그리드/상세 또는 아래 일괄 업데이트에서.':"Click a row for that vessel's Logistics list. Enter ATA in the Logistics grid/detail or via bulk update below.",
  'ETA 선사 (현재)':'Carrier ETA (current)', 'ETA 선사 (신규)':'Carrier ETA (new)', '영향 대수':'Units',
  // 재고현황
  '현재 ({d}, 상태 Bonded Stock·OH Stock 기준)':'Current ({d}, by status Bonded Stock·OH Stock)', '{m} 월말 마감 ({d})':'{m} month-end closing ({d})',
  '보세(Bonded) {b} · 통관(OH) {c} · 보세/통관 = Customs Clearance DATE ≤ 월말':'Bonded {b} · OH {c} · Bonded/OH = Customs Clearance DATE ≤ month-end',
  '연식(MY) 범례':'Model Year (MY) legend', '기타':'Other', ' (MY23 이하·판독 불가)':' (MY23 or older · unreadable)', '· MY = VIN 10번째 자리 (M=21 … T=26 V=27 W=28)':'· MY = VIN 10th digit (M=21 … T=26 V=27 W=28)',
  '차종별 · 막대 길이 = 대수 · 우측 대수·비율':'By vehicle type · bar length = units · units & share at right', '차종 섹션 안 모델별 · 모델명 = Gen · Model · Type · Cab · Option':'Models within each vehicle section · name = Gen · Model · Type · Cab · Option',
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
  '모델 마스터 (Model_Master)':'Model Master (Model_Master)', 'baumuster_prefix(8자리) + type_desc → vehicle · gen · series(Model) · model(Type) · axle · cab · option · dms_model_name · lead_time':'baumuster_prefix (8 digits) + type_desc → vehicle · gen · series(Model) · model(Type) · axle · cab · option · dms_model_name · lead_time',
  '＋ 모델 추가':'＋ Add Model', '실적 중앙값':'Actual Median', '차량 수':'Vehicles',
  'AFAB(SDISP) → 시스템 필드 매핑':'AFAB (SDISP) → System Field Mapping', '헤더 32개 명칭·순서가 바뀌면 업로드 검증에서 차단':'Upload validation blocks the file if the 32 header names or order change', 'AFAB 헤더(독일어)':'AFAB Header (German)',
  'Current Status 판정 규칙':'Current Status Rules', '상태별 Source · 판정 기준 (10/20 확정) · 1대 = 1단계 · 수동 override 시 사유 필수':'Source & rule per status (fixed 10/20) · 1 vehicle = 1 stage · reason required for manual override',
  '판정 규칙':'Rule', '현재 건수':'Count', '오더 분류 (order_class)':'Order Classification (order_class)', '분류':'Class', '조건':'Condition', '현재':'Count',
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
  'AFAB':{cls:'afab', tip:'AFAB 업로드로만 갱신(잠금)'}, 'AFAB/입력':{cls:'afab', tip:'AFAB 기준 자동 판정 + Editor 입력(override)'}, 'WINGS':{cls:'afab', tip:'WINGS 연동 값(잠금)'}, '+75 FROM TDD':{cls:'afab', tip:'TDD Calc + 75일 자동 계산(잠금)'},
  '자동':{cls:'auto', tip:'시스템 계산(잠금)'}, 'MODEL_MASTER':{cls:'auto', tip:'모델 마스터에서 자동 반영(잠금)'}, 'COLOR_MASTER':{cls:'auto', tip:'색상 마스터에서 자동 반영(잠금)'}, '선적·입항':{cls:'auto', tip:'선적·입항 화면에서 선박 단위 입력'}, '오더 생성':{cls:'auto', tip:'오더 생성 시 기록(잠금)'}, '입력':{cls:'auto', tip:'Editor 수동 입력'},
};
function srcBadge(src, keyin){ const b = SRC_BADGE[src]||SRC_BADGE['입력']; const c = (src==='입력'&&keyin)? 'input' : b.cls; return `<span class="badge ${c}" title="${b.tip}">${esc(tx(src))}</span>`; }
function srcEditable(src){ return src==='입력' || src==='선적·입항'; } // 상세 Drawer에서 입력창을 여는 출처
function stagePill(stage){ return `<span class="pill ${STAGE_CLASS[stage]||'neutral'}">${esc(stage)}</span>`; }
function classPill(cls){ if(!cls||cls==='—') return '<span class="muted">—</span>'; return `<span class="pill ${cls==='Fixed order'?'cls-fixed':'cls-chg'}">${esc(cls)}</span>`; }
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
    {l:'Shipping', d:v.shipping}, {l:'ETA Final', d:v.ata}, {l:'Customs', d:v.customs_clearance_date}, {l:'Sales', d:v.sales_month},
  ]; // 10/19: 'Ordered' 단계 제거 (Order Date 열 제거에 따름)
  const doneIdx = v.current_status==='Sold'?7: v.current_status==='OH Stock'?6: v.current_status==='Bonded Stock'?5: v.current_status==='In Transit'?4: v.current_status==='Shipment scheduled'?3: v.current_status==='In Production'?(v.dispatch?3:2):0;
  const tl = ms.map((m,i)=>`<div class="ms ${i<doneIdx?'done':''} ${i===doneIdx?'cur':''}"><div class="dot"></div><div class="l">${m.l}</div><div class="d">${esc(m.d)||'—'}</div></div>`).join('');
  const editable = isEditor();
  const field = (c)=>{
    const val = v[c.key];
    let inner;
    if(c.key==='current_status') inner = stagePill(val);
    else if(srcEditable(c.src) && editable) inner = `<input value="${esc(val)}" data-f="${c.key}" placeholder="${c.key.includes('date')?'YYYY-MM-DD': c.key==='sales_month'?'YYYY-MM':''}">`;
    else if(editable) inner = `<input value="${esc(c.num?num(val):val)}" readonly title="${esc((SRC_BADGE[c.src]||{}).tip||'')}">`;
    else inner = `<span>${esc(c.num?num(val):val)||'<span class="muted">—</span>'}</span>`;
    return `<div class="f ${c.memo?'wide':''}"><div class="k">${esc(tx(c.label))} ${srcBadge(c.src, c.keyin)}${srcEditable(c.src)?'':'<span class="lock">🔒</span>'}</div><div class="v">${inner}</div></div>`;
  };
  const groups = GROUPS.map(g=>`<div class="card"><div class="card-h"><h2>${tx(g)}</h2></div><div class="fields">${COLUMNS.filter(c=>c.group===g).map(field).join('')}</div></div>`).join('');
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
      <button class="btn primary sm editor-only" onclick="describe('저장', 'Graph PATCH(If-Match ETag)로 입력 필드만 저장하고 Vehicle_History에 before/after를 기록합니다. 충돌 시 재조회 후 알림.')">${tx('저장')}</button>
      <button class="btn sm editor-only" onclick="describe('상태 override', '자동 판정 대신 지정 단계를 적용합니다. 사유(Status reason) 입력이 필수입니다.')">${tx('상태 override')}</button>
      <button class="btn sm danger editor-only" onclick="describe('취소 처리', 'Cancelled는 수동 지정만 가능합니다(자동 취소 금지). 사유 기록 후 KUFRI·대시보드 집계에서 제외됩니다.')">${tx('취소 처리')}</button>
      <button class="btn sm" onclick="describe('이력 보기', 'Vehicle_History 전체를 마스터·설정 > 변경 이력에서 Comm 필터로 조회합니다.')">${tx('이력 전체')}</button>
    </div></div>`;
  openDrawer(head, `<div class="card"><div class="card-h"><h2>${tx('마일스톤 타임라인')}</h2>${note('L6')}</div><div class="timeline">${tl}</div></div>${groups}${extra}${histHtml}`);
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
