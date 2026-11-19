// 단계·연식·장소의 표시 상수. 여러 화면의 카드·차트·표가 같이 쓴다.
import { STATUS } from "../domain/status.js";

// 진행 순서
export const STAGES = [
  STATUS.ORDERED_DUMMY, STATUS.REJECTED, STATUS.ORDERED_CHANGEABLE, STATUS.ORDERED_FIXED,
  STATUS.IN_PRODUCTION, STATUS.SHIPMENT_SCHEDULED, STATUS.IN_TRANSIT, STATUS.BONDED_STOCK,
  STATUS.OH_STOCK, STATUS.SOLD,
];

// 단계 색(CSS 변수). Ordered 계열은 같은 색을 쓴다.
export const STAGE_COLOR = {
  [STATUS.ORDERED_DUMMY]: "var(--st-ordered)",
  [STATUS.REJECTED]: "var(--st-cancel)",
  [STATUS.ORDERED_CHANGEABLE]: "var(--st-ordered)",
  [STATUS.ORDERED_FIXED]: "var(--st-ordered)",
  [STATUS.IN_PRODUCTION]: "var(--st-prod)",
  [STATUS.SHIPMENT_SCHEDULED]: "var(--st-sched)",
  [STATUS.IN_TRANSIT]: "var(--st-transit)",
  [STATUS.BONDED_STOCK]: "var(--st-bonded)",
  [STATUS.OH_STOCK]: "var(--st-oh)",
  [STATUS.SOLD]: "var(--st-sold)",
  [STATUS.CANCELLED]: "var(--st-cancel)",
};

// 차트 계열 색
export const SERIES = [
  "var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)",
];

// 연식 표시 키와 색. 목록에 없는 연식은 "기타"로 묶는다.
export const MY_KEYS = ["MY24", "MY25", "MY26", "MY27", "MY28"];
export const MY_OTHER = "기타";
export const MY_COLORS = {
  MY24: "var(--s7)", MY25: "var(--s1)", MY26: "var(--s3)", MY27: "var(--s4)", MY28: "var(--s5)",
  [MY_OTHER]: "#9aa5b1",
};

// 장소 띠. 화면에는 name(영문 모드는 번역), 풍선 도움말에는 en 을 쓴다. short 는 국가명을 뺀 이름.
export const LOCATIONS = {
  factory: { name: "독일 Wörth 공장", short: "Wörth 공장", en: "Wörth Factory in Germany", icon: "de", color: "var(--st-prod)" },
  sea: { name: "바다", en: "At Sea", icon: "sea", color: "var(--st-transit)" },
  center: { name: "대한민국 아산 트럭 스타 센터", short: "아산 트럭 스타 센터", en: "Asan Truck Star Center in Korea", icon: "kr", color: "var(--st-oh)" },
};
export const PORTS = { antwerp: "Antwerp항", pyeongtaek: "평택항" };
