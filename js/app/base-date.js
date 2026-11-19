// 기준일 — 화면의 날짜 계산(당월, 경과 일수, 입항 예정 등)이 "오늘"로 삼는 날짜.
// 환경 설정(config.js 의 baseDate)에 날짜가 있으면 그 날짜로 고정하고, 없으면 실제 오늘을 쓴다.
import { ENV } from "../lib/config.js";
import { todayIso } from "../domain/dates.js";

/** @returns {string} "YYYY-MM-DD" */
export const baseDate = () => ENV.baseDate ?? todayIso();

/** 기준일을 설정으로 고정해 둔 상태인지 */
export const isBaseDateFixed = () => Boolean(ENV.baseDate);
