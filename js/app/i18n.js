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
  // 출처 배지
  "입력": "Input",
  "자동": "Auto",
  "AFAB/입력": "AFAB/Input",
  "선적·입항": "Shipping·Arrival",
  "오더 생성": "Create Order",
  "통관": "Customs",
  "AFAB 수정 가능": "AFAB Editable",
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
