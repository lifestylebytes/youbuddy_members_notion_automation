import { config } from "./config.js";
import { addBusinessDays, getBusinessDayIndex } from "./business-day.js";

export const PROGRAM_START_DATE_KST = config.programStartDateKst;
export const PROGRAM_TOTAL_DAYS = config.programTotalDays;

export function getProgramDayIndex(todayKst) {
  return getBusinessDayIndex(PROGRAM_START_DATE_KST, todayKst, PROGRAM_TOTAL_DAYS);
}

export function getProgramDateForDay(day) {
  return addBusinessDays(PROGRAM_START_DATE_KST, day - 1);
}
