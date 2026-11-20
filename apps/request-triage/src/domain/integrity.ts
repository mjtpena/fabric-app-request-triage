/**
 * Defensive reads. The database cannot enforce "one supporter per user per request" (no composite unique constraint)
 * or "StatusChange rows only from the transition function" (any signed-in user may create rows attributed to
 * themselves). These pure functions make forged or duplicated rows harmless wherever the app counts or charts them.
 */
import type { DataRequest, Status, StatusChange, Supporter } from '../model';
import { canTransition } from './status';

/** One row per (request, voter): the earliest. Stacked rows from the same user count once. */
export function distinctSupporters(rows: Supporter[]): Supporter[] {
  const best = new Map<string, Supporter>();
  for (const s of rows) {
    const key = `${s.requestId}|${s.voterSub}`;
    const cur = best.get(key);
    if (!cur || s.createdAt < cur.createdAt) best.set(key, s);
  }
  return [...best.values()];
}

/** Distinct supporters per request id. */
export function supporterCounts(rows: Supporter[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of distinctSupporters(rows)) counts.set(s.requestId, (counts.get(s.requestId) ?? 0) + 1);
  return counts;
}

/**
 * The request's status history as a consistent chain, oldest first: it starts with the submission row (no fromStatus,
 * to "new"), and each accepted row continues from the previous status with a move the transition table allows. Rows
 * that do not fit are ignored. If the chain runs past the request's actual status (a forged "next step"), it is cut at
 * the last point where it matched the actual status.
 */
export function consistentTrail(request: Pick<DataRequest, 'id' | 'status'>, changes: StatusChange[]): StatusChange[] {
  const rows = changes
    .filter((c) => c.requestId === request.id)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const chain: StatusChange[] = [];
  let at: Status | null = null;
  for (const c of rows) {
    const fits = at === null ? c.fromStatus === null && c.toStatus === 'new' : c.fromStatus === at && canTransition(at, c.toStatus);
    if (!fits) continue;
    chain.push(c);
    at = c.toStatus;
  }
  if (at !== request.status) {
    const last = chain.map((c) => c.toStatus).lastIndexOf(request.status);
    if (last >= 0) return chain.slice(0, last + 1);
  }
  return chain;
}
