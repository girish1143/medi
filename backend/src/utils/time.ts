/**
 * Asia/Kolkata is a fixed UTC+05:30 zone with no DST. All appointments are
 * stored as UTC timestamps; all business rules and display values use IST.
 */
export const TZ = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;

export function parseLocalDate(dateStr: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Invalid date "${dateStr}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date "${dateStr}"`);
  }
  return { year, month, day };
}

export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new Error(`Invalid time "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Convert an IST wall-clock date + time into the corresponding UTC instant. */
export function istToUtc(dateStr: string, timeStr: string): Date {
  const { year, month, day } = parseLocalDate(dateStr);
  const minutes = timeToMinutes(timeStr);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes) - IST_OFFSET_MINUTES * 60_000);
}

/** Shift a UTC instant into a Date whose UTC getters read as IST wall clock. */
export function toIst(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
}

export function formatIstTime(date: Date): string {
  const d = toIst(date);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatIstDate(date: Date): string {
  const d = toIst(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function istToday(now = new Date()): string {
  return formatIstDate(now);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const { year, month, day } = parseLocalDate(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Weekday of an IST calendar date. 0 = Sunday ... 6 = Saturday. */
export function weekdayOfDate(dateStr: string): number {
  const { year, month, day } = parseLocalDate(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function startOfIstDayUtc(dateStr: string): Date {
  return istToUtc(dateStr, '00:00');
}

export function endOfIstDayUtc(dateStr: string): Date {
  return istToUtc(addDaysToDateStr(dateStr, 1), '00:00');
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? 'Unknown';
}

export function formatIstHuman(date: Date): string {
  const d = toIst(date);
  const hours = d.getUTCHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')} ${
    MONTHS[d.getUTCMonth()]
  } ${d.getUTCFullYear()} · ${displayHour}:${minutes} ${suffix} IST`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
