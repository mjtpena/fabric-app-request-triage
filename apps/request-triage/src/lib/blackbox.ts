/**
 * The black box: a request's consistent status trail turned into flight-recorder segments (how long it held each
 * status) and the stages it reached. Pure; used by the request page.
 */
import { DAY } from '@x10/shared/lib';

import { isOpen } from '../domain/status';
import type { DataRequest, Status, StatusChange } from '../model';

export interface Segment {
  status: Status;
  from: string;
  /** End of the segment: the next change, or now while the request is open. Null for a closed request's last status. */
  to: string | null;
  /** Length in fractional days (0 for the final closed status). */
  days: number;
}

/** One segment per accepted trail entry, oldest first. */
export function segments(request: Pick<DataRequest, 'status'>, trail: StatusChange[], now: Date): Segment[] {
  return trail.map((c, i) => {
    const next = trail[i + 1];
    const end = next ? next.at : isOpen(request.status) ? now.toISOString() : null;
    const days = end ? Math.max(0, (new Date(end).getTime() - new Date(c.at).getTime()) / DAY) : 0;
    return { status: c.toStatus, from: c.at, to: end, days };
  });
}

/** Total days spent in each status (a request can return to a status, e.g. in progress → planned). */
export function daysByStatus(segs: Segment[]): Partial<Record<Status, number>> {
  const out: Partial<Record<Status, number>> = {};
  for (const s of segs) out[s.status] = (out[s.status] ?? 0) + s.days;
  return out;
}

/** The delivery path shown as stages; a declined request ends in "declined" instead of "delivered". */
export function stagesFor(status: Status): Status[] {
  const path: Status[] = ['new', 'triaged', 'planned', 'in_progress'];
  return status === 'declined' ? [...path, 'declined'] : [...path, 'delivered'];
}

/** "3d", "5h", "<1h" for a duration in days. */
export function shortDuration(days: number): string {
  if (days >= 1) return `${Math.round(days)}d`;
  const h = Math.round(days * 24);
  return h >= 1 ? `${h}h` : '<1h';
}
