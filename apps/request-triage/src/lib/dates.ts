/**
 * Target dates are calendar dates. They are stored at 12:00 UTC so the same day shows in every time zone from
 * UTC-11 to UTC+11, and edited with <input type="date">.
 */
export function targetToInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function inputToTarget(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Calendar date for display, read in UTC so it matches what was picked. */
export function formatTarget(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

/** True when a target date's calendar day is before today's (UTC). */
export function isOverdue(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  return targetToInput(iso) < now.toISOString().slice(0, 10);
}
