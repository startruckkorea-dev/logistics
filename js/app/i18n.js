// 언어 전환(한/EN).
// tx(ko, vars) 는 한국어 모드에서 ko 를 그대로 돌려주므로 한국어 화면은 바뀌지 않는다.
// 사전에 없는 문구는 영문 모드에서도 한글 그대로 나온다. 화면을 옮길 때 그 화면의 문구를 여기에 더한다.
import { state } from "./state.js";

const DICTIONARY = {
  // 상단 메뉴
  "대시보드": "Dashboard",
  "Logistics 차량 마스터": "Logistics Vehicle Master",
  "선적 · 입항": "Shipping & Arrival",
  "재고현황": "Stock Status",
  "KUFRI 생산판매계획": "KUFRI Production & Sales Plan",
  "마스터 · 설정": "Master & Settings",
  "관리": "Admin",
  // 공통
  "닫기": "Close",
  "취소": "Cancel",
  "저장": "Save",
  "적용": "Apply",
  "로그인": "Sign in",
  "로그아웃": "Sign out",
  "Microsoft 로그인": "Sign in with Microsoft",
  "Microsoft 계정으로 로그인하세요.": "Sign in with your Microsoft account.",
  "초기화 중...": "Loading...",
  "준비 중인 화면입니다": "This screen is not ready yet",
  "화면을 옮기는 중입니다. 준비되면 이 자리에 표시됩니다.":
    "This screen is being migrated. It will appear here when ready.",
  // Logistics 차량 마스터
  "검색": "Search",
  "초기화": "Reset",
  "새로 고침": "Reload",
  "다시 시도": "Retry",
  "바로가기": "Jump to",
  "{n}건 / 전체 {m}": "{n} / Total {m}",
  "{n}건 중 {a}–{b}": "{a}–{b} of {n}",
  "‹ 이전": "‹ Prev",
  "다음 ›": "Next ›",
  "· 열 {n}개 · 가로 스크롤 · Comm No. 고정": "· {n} columns · horizontal scroll · Comm No. pinned",
  "조건에 맞는 차량이 없습니다.": "No vehicles match the filters.",
  "차량 데이터를 불러오는 중...": "Loading vehicles...",
  "차량 데이터를 불러오지 못했습니다.": "Could not load vehicles.",
  "Comm(여러 개는 쉼표 구분) / VIN / B/L / Vessel / Type / Order·Option Note":
    "Comm (comma-separated for multiple) / VIN / B/L / Vessel / Type / Order·Option Note",
  "Shipping 미입력 · Shipping Calc 경과 {n}일 (기준일 {d})":
    "No Shipping yet · {n} days past Shipping Calc (as of {d})",
  "Shipping {s} · 실적 PM~Shipping {m}일 (계획 {p}일, 초과 {n}일)":
    "Shipping {s} · actual PM~Shipping {m} days (plan {p}, over by {n})",
  " · 열 필터: {cols}": " · Column filter: {cols}",
  "{c} 열 필터": "{c} Column Filter",
  "값 검색": "Search values",
  "값 검색 (예: 2853)": "Search values (e.g. 2853)",
  "연·월 검색 (예: 2026-11)": "Search year-month (e.g. 2026-11)",
  "{y}년": "{y}",
  "{m}월": "{mon}",
  "(빈 값)": "(blank)",
  "일치하는 값이 없습니다.": "No matching values.",
  "표시된 값 전체 선택": "Select All Shown",
  "표시된 값 해제": "Clear Shown",
  "필터 해제": "Clear Filter",
  "경과 배지 행만": "Overdue badge rows only",
  "Shipping Calc 경과 배지가 있는 행만 표시 (선적 전·후 모두) · 리드타임 재검토 후보":
    "Only rows with a Shipping Calc overdue badge (before and after shipping) · lead time review candidates",
  // 차량 상세
  "마일스톤 타임라인": "Milestone Timeline",
  "미부여": "not assigned",
  "기본": "Basic",
  "메모": "Memo",
  "일정": "Schedule",
  "선적": "Shipping",
  "사양": "Spec",
  // 출처 배지
  "입력": "Input",
  "자동": "Auto",
  "AFAB/입력": "AFAB/Input",
  "선적·입항": "Shipping·Arrival",
  "오더 생성": "Create Order",
  "통관": "Customs",
  "AFAB 수정 가능": "AFAB Editable",
  // 화면 설계의 사전에서 가져온 문구
  "{v}대": "{v} units",
  " (계획/예정)": " (plan/forecast)",
  "기준월": "Base Month",
  "기준월 이후(계획·예정)": "After base month (plan/forecast)",
  "수정 가능 주문": "Changeable Orders",
  "확정 주문": "Fixed Orders",
  "확정 재고 (Factory Stock)": "Factory Stock",
  "운송 중": "In Transit",
  "당월 입항 예정({m}월) {n}대": "Arriving this month ({mon}) {n} units",
  "재고 (보세 + 통관)": "Stock (Bonded + OH)",
  "판매 ({y} YTD)": "Sales ({y} YTD)",
  "전월 {n}": "Prev. month {n}",
  "확정 주문 · 확정 재고": "Fixed Orders · Factory Stock",
  "차량 주문·재고 흐름": "Vehicle Order & Stock Flow",
  "6개 지표 · 수정 가능 주문 → 확정 주문 → 확정 재고 → 운송 중 → 재고 → 판매 · 전체 {n} (Cancelled 제외)": "6 metrics · Changeable → Fixed → Factory Stock → In Transit → Stock → Sales · Total {n} (excl. Cancelled)",
  "카드 클릭 시 관련 목록으로 이동합니다.": "Click a card to open the related list.",
  "Arrival (ATA / 예정)": "Arrival (ATA / Planned)",
  "Sales (판매 / 계획)": "Sales (Actual / Plan)",
  "월별 생산 / 입항 / 판매 추이": "Monthly Production / Arrival / Sales Trend",
  "{a} ~ {b} (24개월) · 당월 포함 8개월 표시, 나머지는 가로 스크롤 · 기준월 {c} 강조, 이후 음영": "{a} ~ {b} (24 months) · 8 months shown incl. current, scroll for the rest · base month {c} highlighted, later months shaded",
  "입항 예정 선박": "Arriving Vessels",
  "Pl. arrival(AFAB) → ETA(EUKOR, 평택) → ATA 순 전환 · ATA 후 2일까지 표시": "Pl. arrival (AFAB) → ETA (EUKOR, Pyeongtaek) → ATA · shown until 2 days after ATA",
  "선적·입항 →": "Shipping & Arrival →",
  "대수": "Units",
  "(예정)": "(planned)",
  "당월 도착 예정 ({m}월)": "Arrivals This Month ({mon})",
  "구분 > 차종 > 모델 × 당월 입항 선박 · 합계 {n}대 · 선박 {v}척": "Gen > Vehicle > Model × vessels arriving this month · Total {n} units · {v} vessels",
  "월별 입항 예정 →": "Monthly Arrival Schedule →",
  "당월 입항 예정 차량이 없습니다.": "No vehicles arriving this month.",
  "차종별 파이프라인": "Pipeline by Vehicle",
  "7단계 (Sold·Cancelled 제외) · 합계 {n}": "7 stages (excl. Sold · Cancelled) · Total {n}",
  "연식별 재고": "Stock by Model Year",
  "단계": "Stage",
  "입항 예정": "Arrival",
  "기타": "Other",
  "독일 Wörth 공장": "Wörth Factory in Germany",
  "Wörth 공장": "Wörth Factory",
  "바다": "At Sea",
  "대한민국 아산 트럭 스타 센터": "Asan Truck Star Center in Korea",
  "아산 트럭 스타 센터": "Asan Truck Star Center",
  "Antwerp항": "Port of Antwerp",
  "평택항": "Pyeongtaek Port",
  "Sales 계획 = 최근 6개월 평균(당월 포함) {n}대.": "Sales plan = average of the last 6 months (incl. this month): {n} units.",
  "입항 예정 선박이 없습니다.": "No vessels are due to arrive.",
  "Bonded + OH Stock {n}대 · 연식(MY) 최신순 · 누적 = Vehicle": "Bonded + OH Stock {n} units · newest MY first · stacked by Vehicle",
};

/**
 * @param {string} ko 한국어 문구(사전의 키)
 * @param {Record<string, string|number>} [vars] {이름} 자리표시자에 넣을 값
 */
export function tx(ko, vars) {
  let text = state.lang === "en" ? DICTIONARY[ko] ?? ko : ko;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
