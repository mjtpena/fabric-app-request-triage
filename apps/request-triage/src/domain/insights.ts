import { DAY, median, toMs } from '@x10/shared/lib';

import { STATUS_LABEL } from '../config';
import { EFFORTS, type DataRequest, type Effort, type Status, type StatusChange } from '../model';
import { consistentTrail } from './integrity';
import { isOpen } from './status';
import { needsTriage } from './workdays';

/** The delivery path shown as a funnel. Declined is a side exit, not a stage. */
export const FUNNEL_STAGES: readonly Status[] = ['new', 'triaged', 'planned', 'in_progress', 'delivered'];

export const EFFORT_X: Record<Effort, number> = { S: 1, M: 2, L: 3, XL: 4 };

export type ScatterPoint = {
  id: string;
  title: string;
  effort: Effort;
  /** Effort on a 1–4 axis, nudged sideways so requests with the same value and effort do not hide each other. */
  x: number;
  value: number;
};

export interface Insights {
  total: number;
  open: number;
  needsTriage: number;
  delivered: number;
  declined: number;
  /** Median calendar days from submission to delivery, all sizes. Null when nothing was delivered. */
  medianDaysToDeliver: number | null;
  scatter: ScatterPoint[];
  perTeam: { team: string; count: number }[];
  funnel: { status: Status; stage: string; count: number }[];
  medianByEffort: { effort: Effort; days: number | null; delivered: number }[];
}

type Sized = DataRequest & { effort: Effort };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** When a request was delivered: its latest "→ delivered" change, falling back to updatedAt. */
export function deliveredAt(r: DataRequest, changes: StatusChange[]): string {
  const hits = consistentTrail(r, changes).filter((c) => c.toStatus === 'delivered').map((c) => c.at);
  return hits.sort().at(-1) ?? r.updatedAt;
}

/** Days from submission to delivery, one decimal. */
export function daysToDeliver(r: DataRequest, changes: StatusChange[]): number {
  return round1((toMs(deliveredAt(r, changes)) - toMs(r.createdAt)) / DAY);
}

/** Spread points that share a cell evenly around the cell centre (pure, deterministic). */
export function scatterPoints(requests: DataRequest[]): ScatterPoint[] {
  const sized = requests.filter((r): r is Sized => !!r.effort);
  const cells = new Map<string, Sized[]>();
  for (const r of [...sized].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${r.effort}|${r.value}`;
    cells.set(key, [...(cells.get(key) ?? []), r]);
  }
  const out: ScatterPoint[] = [];
  for (const list of cells.values()) {
    list.forEach((r, i) => {
      const nudge = (i - (list.length - 1) / 2) * 0.12;
      const x = Math.round((EFFORT_X[r.effort] + nudge) * 100) / 100;
      out.push({ id: r.id, title: r.title, effort: r.effort, x, value: r.value });
    });
  }
  return out;
}

/** Requests that ever reached each funnel stage (from the consistent status trail, plus the current status). */
export function funnelCounts(requests: DataRequest[], changes: StatusChange[]): Insights['funnel'] {
  const reached = new Map<Status, Set<string>>(FUNNEL_STAGES.map((s) => [s, new Set<string>()]));
  for (const r of requests) {
    reached.get('new')!.add(r.id);
    reached.get(r.status)?.add(r.id);
  }
  for (const r of requests) for (const c of consistentTrail(r, changes)) reached.get(c.toStatus)?.add(r.id);
  return FUNNEL_STAGES.map((s) => ({ status: s, stage: STATUS_LABEL[s], count: reached.get(s)!.size }));
}

export function computeInsights(requests: DataRequest[], changes: StatusChange[], now: Date): Insights {
  const delivered = requests.filter((r) => r.status === 'delivered');
  const teamCounts = new Map<string, number>();
  for (const r of requests) teamCounts.set(r.team, (teamCounts.get(r.team) ?? 0) + 1);
  return {
    total: requests.length,
    open: requests.filter((r) => isOpen(r.status)).length,
    needsTriage: requests.filter((r) => needsTriage(r, now)).length,
    delivered: delivered.length,
    declined: requests.filter((r) => r.status === 'declined').length,
    medianDaysToDeliver: median(delivered.map((r) => daysToDeliver(r, changes))),
    scatter: scatterPoints(requests),
    perTeam: [...teamCounts.entries()]
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)),
    funnel: funnelCounts(requests, changes),
    medianByEffort: EFFORTS.map((effort) => {
      const days = delivered.filter((r) => r.effort === effort).map((r) => daysToDeliver(r, changes));
      return { effort, days: median(days), delivered: days.length };
    }),
  };
}
