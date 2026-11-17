import { ALL_DAYS, DayKey } from '../types/domain';

/**
 * Parses a YYYY-MM-DD string as a local date (at 12:00 to avoid DST midnight shifts).
 */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/**
 * Formats a Date object as YYYY-MM-DD.
 */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats YYYY-MM-DD to Brazilian format DD/MM/AAAA.
 */
export function formatDateBR(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Formats ISO timestamp to DD/MM/AAAA HH:mm.
 */
export function formatDateTimeBR(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/**
 * Returns the Monday (YYYY-MM-DD) of the week containing the given date.
 */
export function getMondayOfWeek(dateInput: Date | string = new Date()): string {
  const date = typeof dateInput === 'string' ? parseLocalDate(dateInput) : new Date(dateInput.getTime());
  date.setHours(12, 0, 0, 0);
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return toIsoDate(date);
}

/**
 * Adds N days to an ISO YYYY-MM-DD string.
 */
export function addDaysIso(isoDate: string, days: number): string {
  const date = parseLocalDate(isoDate);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/**
 * Given a Monday ISO date, returns the Sunday ISO date (+6 days).
 */
export function getSundayOfWeek(mondayIso: string): string {
  return addDaysIso(mondayIso, 6);
}

/**
 * Returns a map from DayKey (seg..dom) to DD/MM date string for a given Monday.
 */
export function getWeekDayDates(mondayIso: string): Record<DayKey, { iso: string; shortBR: string; fullBR: string }> {
  const result = {} as Record<DayKey, { iso: string; shortBR: string; fullBR: string }>;
  ALL_DAYS.forEach((dayKey, index) => {
    const iso = addDaysIso(mondayIso, index);
    const [, m, d] = iso.split('-');
    result[dayKey] = {
      iso,
      shortBR: `${d}/${m}`,
      fullBR: `${d}/${m}/${iso.slice(0, 4)}`,
    };
  });
  return result;
}

/**
 * Formats a week range in DD/MM/AAAA a DD/MM/AAAA.
 */
export function formatWeekRangeBR(weekStart: string, weekEnd?: string): string {
  const end = weekEnd ?? getSundayOfWeek(weekStart);
  return `${formatDateBR(weekStart)} a ${formatDateBR(end)}`;
}

/**
 * Generates a unique ID safely across browser and Node environments.
 */
export function generateUniqueId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
