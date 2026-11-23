export const MAX_EXCEPTION_DATES = 366;
export const MAX_REPEAT_EVERY = 99;

export const EXCEPTION_KINDS = ["OFF", "WORKING"] as const;
export const EXCEPTION_REPEAT_UNITS = ["DAY", "WEEK", "MONTH"] as const;

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
export type ExceptionRepeatUnit = (typeof EXCEPTION_REPEAT_UNITS)[number];

export type ExceptionDateRule = {
  startDate: string;
  endDate: string;
  repeatEvery: number;
  repeatUnit: ExceptionRepeatUnit;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}

function toIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addIsoDays(value: string, days: number): string {
  const date = parseIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

function repeatStep(every: number, unit: ExceptionRepeatUnit): number {
  const count = Math.min(
    MAX_REPEAT_EVERY,
    Math.max(1, Math.floor(every) || 1),
  );
  if (unit === "WEEK") return count * 7;
  if (unit === "MONTH") return count;
  return count;
}

/**
 * Expands a from/to range.
 * DAY/WEEK step forward by that many days from the start date.
 * MONTH keeps the day-of-month and skips months that do not have it.
 * Returns one extra date when the cap is exceeded so callers can detect it.
 */
export function expandExceptionDates(rule: ExceptionDateRule): string[] {
  const { startDate, endDate, repeatUnit } = rule;
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
    return [];
  }

  const every = repeatStep(rule.repeatEvery, repeatUnit);
  const dates: string[] = [];

  if (repeatUnit === "MONTH") {
    const start = parseIso(startDate);
    const day = start.getUTCDate();
    let year = start.getUTCFullYear();
    let month = start.getUTCMonth();

    while (dates.length <= MAX_EXCEPTION_DATES) {
      const candidate = new Date(Date.UTC(year, month, day));
      const overflow =
        candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month;
      if (!overflow) {
        const iso = toIso(candidate);
        if (iso > endDate) break;
        if (iso >= startDate) dates.push(iso);
      }
      const index = year * 12 + month + every;
      year = Math.floor(index / 12);
      month = index % 12;
      if (year > start.getUTCFullYear() + 40) break;
    }
    return dates;
  }

  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    if (dates.length > MAX_EXCEPTION_DATES) return dates;
    cursor = addIsoDays(cursor, every);
  }
  return dates;
}

export function readExcludedDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && isIsoDate(item));
}

export function includedExceptionDates(
  input: ExceptionDateRule & { excludedDates: readonly string[] },
): string[] {
  const excluded = new Set(input.excludedDates);
  return expandExceptionDates(input).filter((date) => !excluded.has(date));
}

export function exceptionExceedsDateLimit(rule: ExceptionDateRule): boolean {
  return expandExceptionDates(rule).length > MAX_EXCEPTION_DATES;
}
