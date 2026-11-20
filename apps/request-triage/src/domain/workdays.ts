import { DAY, utcDay } from '@x10/shared/lib';

import { NEEDS_TRIAGE_WORKING_DAYS } from '../config';
import type { DataRequest } from '../model';

/**
 * Working days (Monday to Friday, UTC calendar) that have started after the day of `from`, up to and including the
 * day of `to`. Same day → 0; Friday → next Monday → 1. Public holidays are unknown to the app and count as working days.
 */
export function workingDaysBetween(from: string | Date, to: string | Date): number {
  const start = utcDay(from);
  const end = utcDay(to);
  if (end <= start) return 0;
  let count = 0;
  for (let t = start + DAY; t <= end; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

/** A request still "new" more than NEEDS_TRIAGE_WORKING_DAYS working days after it was submitted. */
export function needsTriage(
  r: Pick<DataRequest, 'status' | 'createdAt'>,
  now: Date,
  limit: number = NEEDS_TRIAGE_WORKING_DAYS,
): boolean {
  return r.status === 'new' && workingDaysBetween(r.createdAt, now) > limit;
}
