import type { GameTime } from "../model/WorldState.ts";
import { t } from "../i18n/index.ts";

// 1 tick = 1 game minute at normal speed
// 20 ticks/sec real time → 1 game hour = 60 ticks = 3 real seconds
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export function advanceTime(time: GameTime, dtTicks: number): GameTime {
  let { day, hour, minute, tick } = time;
  tick += dtTicks;
  minute += dtTicks;

  while (minute >= MINUTES_PER_HOUR) {
    minute -= MINUTES_PER_HOUR;
    hour += 1;
  }
  while (hour >= HOURS_PER_DAY) {
    hour -= HOURS_PER_DAY;
    day += 1;
  }

  return { day, hour, minute, tick };
}

export function formatTime(time: GameTime): string {
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  return t("time.format", { day: String(time.day), hh, mm });
}

export function isDaytime(time: GameTime): boolean {
  return time.hour >= 6 && time.hour < 20;
}

// --- Calendar ---

export type CalendarDate = {
  year: number;
  month: number; // 1-12
  dayOfMonth: number; // 1-31
};

const DEFAULT_START_YEAR = 1690;
const GAME_START_MONTH = 1;
const GAME_START_DAY = 1;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(month: number, year: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Convert game day (1-based) to a calendar date.
 * Day 1 = January 1 of startYear.
 */
export function dayToCalendar(gameDay: number, startYear?: number): CalendarDate {
  let year = startYear ?? DEFAULT_START_YEAR;
  let month = GAME_START_MONTH;
  let day = GAME_START_DAY;
  let remaining = gameDay - 1;

  while (remaining > 0) {
    const dim = daysInMonth(month, year);
    const daysLeftInMonth = dim - day;

    if (remaining <= daysLeftInMonth) {
      day += remaining;
      remaining = 0;
    } else {
      remaining -= daysLeftInMonth + 1;
      month++;
      day = 1;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
  }

  return { year, month, dayOfMonth: day };
}

export function getMonthName(month: number): string {
  const names = t("time.month_names").split(",");
  return names[month - 1] ?? `Month ${month}`;
}

export function formatCalendarDate(time: GameTime, startYear?: number): string {
  const cal = dayToCalendar(time.day, startYear);
  return `${cal.dayOfMonth} ${getMonthName(cal.month)} ${cal.year}`;
}
