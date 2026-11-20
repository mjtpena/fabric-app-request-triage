/**
 * The radar's geometry and encodings, as pure functions (unit-tested). Every mark maps to data:
 * distance from the centre = rank in the queue (closer = higher priority score), sector = team, blip size = supporters,
 * the trail behind a blip = days it has waited, blinking = still new past the triage threshold. Closed requests
 * (delivered, declined) sit in the outer band of their team's sector.
 */
import { DAY } from '@x10/shared/lib';
import type { Tone } from '@x10/shared/ui';

import { STATUS_LABEL } from '../config';
import { teamsOf, type QueueItem } from '../domain/requests';
import { formatScore } from '../domain/score';
import { isOpen } from '../domain/status';
import { isOverdue } from '../lib/dates';
import { workingDaysBetween } from '../domain/workdays';
import type { Effort, Status } from '../model';

/* ------------------------------------------------------------------ geometry */

/** Scope radius in SVG units; the viewBox adds room for the rim labels. */
export const R = 300;
/** Rank 1 sits this far from the centre (the crosshair stays clear). */
export const R_CORE = 36;
/** The last open rank. */
export const R_OPEN = 246;
/** Closed requests (delivered, declined) ride the outer band. */
export const R_CLOSED = 276;
export const VIEW = 318;
/** Sector labels ride the closed band at this radius, centred on the sector. */
export const R_LABEL = (R_OPEN + 14 + R) / 2;

export type LensKey = 'score' | 'age' | 'team' | 'effort' | 'status';
export const LENS_KEYS: LensKey[] = ['score', 'age', 'team', 'effort', 'status'];

export interface Sector {
  team: string;
  index: number;
  /** Degrees clockwise from 12 o'clock. */
  start: number;
  end: number;
  mid: number;
  open: number;
}

export interface Blip {
  id: string;
  item: QueueItem;
  /** 1-based rank among open requests; null for closed ones. */
  rank: number | null;
  /** Degrees clockwise from 12 o'clock. */
  angle: number;
  radius: number;
  x: number;
  y: number;
  /** Blip radius in SVG units (grows with supporters). */
  size: number;
  /** Calendar days since submission (open) or from submission to closing (closed). */
  ageDays: number;
  team: string;
  teamIndex: number;
}

export interface RadarLayout {
  blips: Blip[];
  sectors: Sector[];
  openCount: number;
  /** Rank rings to draw, with their radius. */
  rings: { rank: number; radius: number }[];
}

export const rad = (deg: number) => (deg * Math.PI) / 180;

/** Point at `radius` along a bearing (degrees clockwise from 12 o'clock), y down. */
export function polar(radius: number, angle: number): { x: number; y: number } {
  return { x: radius * Math.sin(rad(angle)), y: -radius * Math.cos(rad(angle)) };
}

/** Radius for a rank: rank 1 at R_CORE, the last open rank at R_OPEN, evenly spaced. */
export function rankRadius(rank: number, openCount: number): number {
  if (openCount <= 1) return R_CORE;
  const t = (Math.min(Math.max(rank, 1), openCount) - 1) / (openCount - 1);
  return R_CORE + (R_OPEN - R_CORE) * t;
}

/** Blip radius from distinct supporters: area grows with the count. */
export function blipSize(supporters: number): number {
  return 5 + 2.3 * Math.sqrt(Math.max(0, supporters));
}

/** Equal sectors, one per team (alphabetical), the first centred on 12 o'clock. */
export function sectorsFor(teams: string[]): Omit<Sector, 'open'>[] {
  const n = Math.max(1, teams.length);
  const span = 360 / n;
  return teams.map((team, index) => {
    const start = -span / 2 + index * span;
    return { team, index, start, end: start + span, mid: start + span / 2 };
  });
}

export function ageDays(item: QueueItem, now: Date): number {
  const r = item.request;
  const end = isOpen(r.status) ? now.getTime() : new Date(r.updatedAt).getTime();
  return Math.max(0, Math.floor((end - new Date(r.createdAt).getTime()) / DAY));
}

/**
 * Lay the queue out on the scope. `items` must be in queue order (highest score first), as loadQueue returns them.
 * Within a sector, blips are spread evenly across the sector's arc in rank order, so no two share a bearing.
 */
export function layoutRadar(items: QueueItem[], now: Date, opts: { labelGap?: number } = {}): RadarLayout {
  const labelGap = opts.labelGap ?? 12;
  const teams = teamsOf(items.map((i) => i.request));
  const base = sectorsFor(teams);
  const byTeam = new Map(base.map((s) => [s.team, s]));
  const open = items.filter((i) => isOpen(i.request.status));
  const closed = items.filter((i) => !isOpen(i.request.status));
  const rankOf = new Map(open.map((i, k) => [i.request.id, k + 1]));
  const blips: Blip[] = [];

  /** `gap`: degrees kept clear either side of the sector's middle (where its label sits). */
  const place = (group: QueueItem[], radiusOf: (i: QueueItem) => number, margin: number, gap = 0) => {
    const perTeam = new Map<string, QueueItem[]>();
    for (const i of group) {
      const t = i.request.team.trim();
      perTeam.set(t, [...(perTeam.get(t) ?? []), i]);
    }
    for (const [team, list] of perTeam) {
      const s = byTeam.get(team);
      if (!s) continue;
      const span = s.end - s.start - margin * 2;
      const usable = span - gap * 2;
      list.forEach((item, k) => {
        let along = (usable * (k + 0.5)) / list.length;
        if (gap && along > span / 2 - gap) along += gap * 2;
        const angle = s.start + margin + along;
        const radius = radiusOf(item);
        const { x, y } = polar(radius, angle);
        blips.push({
          id: item.request.id,
          item,
          rank: rankOf.get(item.request.id) ?? null,
          angle,
          radius,
          x,
          y,
          size: isOpen(item.request.status) ? blipSize(item.supporters) : 4,
          ageDays: ageDays(item, now),
          team,
          teamIndex: s.index,
        });
      });
    }
  };

  place(open, (i) => rankRadius(rankOf.get(i.request.id) ?? 1, open.length), 9);
  place(closed, () => R_CLOSED, 4, labelGap);

  const rings = [1, 5, 10, 15, 20, 25, 30, 40, 50]
    .filter((r) => r <= open.length)
    .map((rank) => ({ rank, radius: rankRadius(rank, open.length) }));
  if (open.length > 1 && !rings.some((r) => r.rank === open.length)) rings.push({ rank: open.length, radius: R_OPEN });

  // Open blips first in rank order (keyboard order follows the queue), closed after.
  blips.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.angle - b.angle);
  const sectors = base.map((s) => ({ ...s, open: open.filter((i) => i.request.team.trim() === s.team).length }));
  return { blips, sectors, openCount: open.length, rings };
}

/** Angular length (degrees) of the age trail: one degree per waiting day, capped. */
export function trailDegrees(days: number): number {
  return Math.min(Math.max(days, 0), 75);
}

/** SVG arc path along `radius` from bearing a0 to a1 (clockwise). */
export function arcPath(radius: number, a0: number, a1: number): string {
  const p0 = polar(radius, a0);
  const p1 = polar(radius, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** Closed wedge between two bearings, from r0 to r1. */
export function wedgePath(r0: number, r1: number, a0: number, a1: number): string {
  const o0 = polar(r1, a0);
  const o1 = polar(r1, a1);
  const i1 = polar(r0, a1);
  const i0 = polar(r0, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  return `M${f(i0.x)} ${f(i0.y)}L${f(o0.x)} ${f(o0.y)}A${r1} ${r1} 0 ${large} 1 ${f(o1.x)} ${f(o1.y)}L${f(i1.x)} ${f(i1.y)}${r0 > 0 ? `A${r0} ${r0} 0 ${large} 0 ${f(i0.x)} ${f(i0.y)}` : ''}Z`;
}

/* ------------------------------------------------------------------ lenses */

export const TEAM_COLORS = [
  'var(--indigo-9)',
  'var(--coral-9)',
  'var(--gold-9)',
  'var(--plum-9)',
  'var(--green-9)',
  'var(--blue-9)',
  'var(--violet-9)',
  'var(--cyan-9)',
];

export const STATUS_COLOR: Record<Status, string> = {
  new: 'var(--info-solid)',
  triaged: 'var(--gray-9)',
  planned: 'var(--accent-9)',
  in_progress: 'var(--warn-solid)',
  delivered: 'var(--ok-solid)',
  declined: 'var(--bad-solid)',
};

export const EFFORT_COLOR: Record<Effort, string> = {
  S: 'var(--violet-6)',
  M: 'var(--violet-8)',
  L: 'var(--violet-10)',
  XL: 'var(--violet-12)',
};

/** Score bands for the score lens (scores run from about 1 to 19). */
export const SCORE_BANDS = [
  { min: 8, label: 'Score 8 and up', color: 'var(--accent-9)' },
  { min: 4, label: 'Score 4 to 8', color: 'color-mix(in oklab, var(--accent-9) 55%, var(--gray-9))' },
  { min: -Infinity, label: 'Below 4', color: 'var(--gray-9)' },
];

/** Waiting-time bands for the age lens. */
export const AGE_BANDS = [
  { max: 7, label: 'Under a week', color: 'var(--gray-8)' },
  { max: 30, label: '1 to 4 weeks', color: 'var(--amber-8)' },
  { max: 60, label: '1 to 2 months', color: 'var(--amber-10)' },
  { max: Infinity, label: 'Over 2 months', color: 'var(--ember-10)' },
];

export const scoreBand = (score: number) => SCORE_BANDS.find((b) => score >= b.min)!;
export const ageBand = (days: number) => AGE_BANDS.find((b) => days < b.max)!;
export const teamColor = (index: number) => TEAM_COLORS[index % TEAM_COLORS.length];

/** Fill colour of a blip under a lens (CSS colour). Closed blips stay grey except in the status lens. */
export function blipColor(b: Blip, lens: LensKey): string {
  const r = b.item.request;
  if (!isOpen(r.status) && lens !== 'status') return 'var(--gray-8)';
  switch (lens) {
    case 'score':
      return scoreBand(b.item.score).color;
    case 'age':
      return ageBand(b.ageDays).color;
    case 'team':
      return teamColor(b.teamIndex);
    case 'effort':
      return r.effort ? EFFORT_COLOR[r.effort] : 'var(--gray-9)';
    case 'status':
      return STATUS_COLOR[r.status];
  }
}

/** True when the blip is drawn hollow (the effort lens shows unsized requests as rings). */
export function isHollow(b: Blip, lens: LensKey): boolean {
  return lens === 'effort' && isOpen(b.item.request.status) && !b.item.request.effort;
}

/* ------------------------------------------------------------------ view as */

export type Perspective = 'team' | 'requester';

/** Whether a blip is "yours" from the requester's point of view (you asked for it or back it). */
export function relation(b: Blip): 'mine' | 'backed' | null {
  if (b.item.mine) return 'mine';
  if (b.item.backedByMe) return 'backed';
  return null;
}

/* ------------------------------------------------------------------ today */

export interface TodayEntry {
  /** Request id: choosing the entry focuses this blip. */
  id: string;
  title: string;
  severity: Tone;
  value: string | number;
  unit: string;
  lens: LensKey;
  meta: string;
}

/**
 * The three to five things that need attention now, ranked, for the data team or for a requester.
 * Data team: stale untriaged requests, overdue targets, the highest unsized request, the top of the queue, the
 * most-backed open request. Requester: your requests and where they sit, what you back, then popular asks.
 */
export function buildToday(items: QueueItem[], perspective: Perspective, now: Date, max = 5): TodayEntry[] {
  const open = items.filter((i) => isOpen(i.request.status));
  const rank = new Map(open.map((i, k) => [i.request.id, k + 1]));
  const out: TodayEntry[] = [];
  const seen = new Set<string>();
  const add = (e: TodayEntry) => {
    if (seen.has(e.id) || out.length >= max) return;
    seen.add(e.id);
    out.push(e);
  };

  if (perspective === 'team') {
    open
      .filter((i) => i.needsTriage)
      .map((i) => ({ i, days: workingDaysBetween(i.request.createdAt, now) }))
      .sort((a, b) => b.days - a.days)
      .forEach(({ i, days }) =>
        add({ id: i.request.id, title: i.request.title, severity: 'bad', value: days, unit: 'working days', lens: 'age', meta: 'Waiting for triage' }),
      );
    open
      .filter((i) => isOverdue(i.request.targetDate, now))
      .forEach((i) => {
        const late = Math.max(1, Math.round((now.getTime() - new Date(i.request.targetDate!).getTime()) / DAY));
        add({ id: i.request.id, title: i.request.title, severity: 'warn', value: late, unit: late === 1 ? 'day late' : 'days late', lens: 'status', meta: `Past target · ${STATUS_LABEL[i.request.status]}` });
      });
    const unsized = open.find((i) => !i.request.effort);
    if (unsized)
      add({ id: unsized.request.id, title: unsized.request.title, severity: 'info', value: `#${rank.get(unsized.request.id)}`, unit: 'not sized', lens: 'effort', meta: 'Highest unsized request' });
    const top = open[0];
    if (top) add({ id: top.request.id, title: top.request.title, severity: 'brand', value: formatScore(top.score), unit: 'score', lens: 'score', meta: `Top of the queue · ${STATUS_LABEL[top.request.status]}` });
    const backed = [...open].sort((a, b) => b.supporters - a.supporters)[0];
    if (backed && backed.supporters > 0)
      add({ id: backed.request.id, title: backed.request.title, severity: 'neutral', value: backed.supporters, unit: 'supporters', lens: 'team', meta: `Most backed · ${backed.request.team}` });
    return out;
  }

  open
    .filter((i) => i.mine)
    .forEach((i) =>
      add({
        id: i.request.id,
        title: i.request.title,
        severity: i.needsTriage ? 'warn' : 'brand',
        value: `#${rank.get(i.request.id)}`,
        unit: `of ${open.length}`,
        lens: 'score',
        meta: i.needsTriage ? 'Yours · waiting for triage' : `Yours · ${STATUS_LABEL[i.request.status]}`,
      }),
    );
  open
    .filter((i) => i.backedByMe)
    .forEach((i) => add({ id: i.request.id, title: i.request.title, severity: 'info', value: `#${rank.get(i.request.id)}`, unit: `of ${open.length}`, lens: 'score', meta: 'You back this' }));
  [...open]
    .filter((i) => !i.mine && !i.backedByMe)
    .sort((a, b) => b.supporters - a.supporters || (rank.get(a.request.id) ?? 0) - (rank.get(b.request.id) ?? 0))
    .slice(0, 3)
    .forEach((i) => add({ id: i.request.id, title: i.request.title, severity: 'neutral', value: i.supporters, unit: i.supporters === 1 ? 'supporter' : 'supporters', lens: 'team', meta: `Popular in ${i.request.team}` }));
  return out;
}
