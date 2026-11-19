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
