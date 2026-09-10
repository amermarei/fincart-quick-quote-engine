import { DateTime } from 'luxon';

/**
 * Time helpers — every function takes its time input as a parameter.
 * Nothing here reads the system clock (constitution II: all time-dependent
 * pricing derives from quotedAt).
 */

/** Interpret an ISO timestamp in an IANA zone (wall-clock local time). */
export function localTimeIn(quotedAtIso: string, ianaZone: string): DateTime {
  return DateTime.fromISO(quotedAtIso, { zone: ianaZone });
}

/**
 * "HH:mm" cutoff comparison — at the cutoff counts as AT or AFTER.
 */
export function atOrAfterCutoff(local: DateTime, cutoff: string): boolean {
  const [h, m] = cutoff.split(':').map(Number);
  return local.hour > h || (local.hour === h && local.minute >= m);
}

/**
 * Count `days` business days (Mon-Fri) strictly AFTER startLocal, skipping
 * the given holiday ISO dates. The start date itself is never counted.
 */
export function addBusinessDays(
  startLocal: DateTime,
  days: number,
  holidays: ReadonlySet<string>,
): DateTime {
  let cursor = startLocal.plus({ days: 1 });
  let remaining = days;
  while (remaining > 0) {
    if (cursor.weekday <= 5 && !holidays.has(cursor.toISODate() ?? '')) {
      remaining -= 1;
    }
    if (remaining > 0) {
      cursor = cursor.plus({ days: 1 });
    }
  }
  return cursor;
}