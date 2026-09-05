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

/**
 * True when the clock crossed a multiple of `interval` ticks between two frames.
 *
 * The bug this exists to kill: every periodic system in the game used to gate
 * itself on `time.tick % INTERVAL === 0`. That reads as "every N ticks" and is
 * exactly right for an integer clock — but `MainMapScene` feeds the engine a
 * *fractional* `dtTicks` proportional to the frame delta (≈0.4 at 60 fps and
 * normal speed), so `tick` is a float and the remainder is never exactly zero.
 * Every one of those systems was silently dead: `updateNpcSpawns` put no ships
 * on the map at all, `updateNpcAi` never took a decision, and the news exchange
 * never ran. The world looked empty because it *was* empty.
 *
 * Comparing which interval-sized bucket each end of the frame falls in is
 * immune to that, fires exactly once per boundary however big or small the
 * frame was, and still behaves the old way for an integer clock. `offset`
 * staggers a per-entity phase without changing the period.
 */
export function tickBoundaryCrossed(
  prevTick: number,
  nowTick: number,
  interval: number,
  offset = 0,
): boolean {
  if (interval <= 0) return true;
  if (!(nowTick > prevTick)) return false;
  return Math.floor((prevTick + offset) / interval) !== Math.floor((nowTick + offset) / interval);
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

/**
 * Convert a calendar date back to a game day — the inverse of `dayToCalendar`.
 *
 * Written for the historical wars (v0.30.0), which had been storing their end
 * as `startDay + years * 365 + months * 30`. The calendar this game keeps has
 * leap years in it, so that estimate runs about a day short every four years:
 * the Nine Years' War came out four days short of its own end date and the
 * Eighty Years' War twenty. `expireEvents` deletes an event the day after its
 * `endDay`, and `checkHistoricalWars` only announces a peace for a war it can
 * still see — so every war in the table quietly evaporated a few days before
 * anyone could sign anything, and the peace has never once been declared.
 *
 * Dates before the start of the game return day 1 rather than a negative day;
 * a war that was already running when the captain was born is not this
 * function's problem.
 */
export function calendarToDay(
  year: number,
  month: number,
  dayOfMonth: number,
  startYear?: number,
): number {
  const from = startYear ?? DEFAULT_START_YEAR;
  const target = year * 12 + month;
  let cursor = from * 12 + GAME_START_MONTH;
  if (target < cursor) return 1;

  // Whole months first, then the days within the target month. The first month
  // is short by however far into it the game starts.
  let day = 1 - (GAME_START_DAY - 1);
  let y = from;
  let m = GAME_START_MONTH;
  while (cursor < target) {
    day += daysInMonth(m, y);
    m++;
    if (m > 12) { m = 1; y++; }
    cursor++;
  }
  return Math.max(1, day + dayOfMonth - 1);
}

export function getMonthName(month: number): string {
  const names = t("time.month_names").split(",");
  return names[month - 1] ?? `Month ${month}`;
}

export function formatCalendarDate(time: GameTime, startYear?: number): string {
  const cal = dayToCalendar(time.day, startYear);
  return `${cal.dayOfMonth} ${getMonthName(cal.month)} ${cal.year}`;
}
