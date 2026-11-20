import { describe, expect, it } from 'vitest';

import { DAY } from '@x10/shared/lib';

import type { QueueItem } from '../domain/requests';
import type { DataRequest } from '../model';
import { ageBand, blipColor, blipSize, buildToday, layoutRadar, polar, R_CLOSED, R_CORE, R_OPEN, rankRadius, scoreBand, sectorsFor, trailDegrees } from './model';

const now = new Date('2026-11-20T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

function item(id: string, over: Partial<DataRequest> = {}, extra: Partial<QueueItem> = {}): QueueItem {
  const request: DataRequest = {
    id,
    title: `Request ${id}`,
    description: 'x',
    team: 'Sales',
    requesterSub: 'someone',
    requesterName: 'Someone',
    value: 3,
    urgency: 'normal',
    effort: 'M',
    status: 'new',
    assigneeName: null,
    targetDate: null,
    declineReason: null,
    duplicateOfId: null,
    createdAt: ago(3),
    updatedAt: ago(1),
    ...over,
  };
  return { request, supporters: 0, score: 4, needsTriage: false, backedByMe: false, mine: false, ...extra };
}

describe('radar geometry', () => {
  it('puts rank 1 at the core and the last open rank at the edge, evenly spaced', () => {
    expect(rankRadius(1, 10)).toBe(R_CORE);
    expect(rankRadius(10, 10)).toBe(R_OPEN);
    expect(rankRadius(2, 3) - rankRadius(1, 3)).toBeCloseTo(rankRadius(3, 3) - rankRadius(2, 3));
    expect(rankRadius(1, 1)).toBe(R_CORE);
  });

  it('measures bearings clockwise from 12 o’clock', () => {
    expect(polar(10, 0).y).toBeCloseTo(-10);
    expect(polar(10, 90).x).toBeCloseTo(10);
  });

  it('gives each team an equal sector, the first centred on north', () => {
    const s = sectorsFor(['A', 'B', 'C', 'D']);
    expect(s.map((x) => x.mid)).toEqual([0, 90, 180, 270]);
    expect(s[0].start).toBe(-45);
  });

  it('grows blips with supporters', () => {
    expect(blipSize(4)).toBeGreaterThan(blipSize(1));
    expect(blipSize(0)).toBe(5);
  });

  it('lays out open requests by rank and closed ones on the outer band inside their team sector', () => {
    const items = [
      item('a', { team: 'Sales' }, { score: 9 }),
      item('b', { team: 'Finance' }, { score: 6 }),
      item('c', { team: 'Sales' }, { score: 2 }),
      item('d', { team: 'Finance', status: 'delivered' }),
    ];
    const l = layoutRadar(items, now);
    expect(l.openCount).toBe(3);
    const byId = Object.fromEntries(l.blips.map((b) => [b.id, b]));
    expect(byId.a.rank).toBe(1);
    expect(byId.a.radius).toBe(R_CORE);
    expect(byId.c.radius).toBe(R_OPEN);
    expect(byId.d.rank).toBeNull();
    expect(byId.d.radius).toBe(R_CLOSED);
    const finance = l.sectors.find((s) => s.team === 'Finance')!;
    expect(byId.d.angle).toBeGreaterThan(finance.start);
    expect(byId.d.angle).toBeLessThan(finance.end);
    expect(finance.open).toBe(1);
    // Keyboard order: open blips by rank, closed last.
    expect(l.blips.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps closed blips clear of the sector label in the middle of the band', () => {
    const items = [item('x', { team: 'Sales', status: 'declined' })];
    const l = layoutRadar(items, now, { labelGap: 12 });
    const mid = l.sectors[0].mid;
    expect(Math.abs(l.blips[0].angle - mid)).toBeGreaterThanOrEqual(12);
  });

  it('measures age to now while open and to closing once closed', () => {
    const l = layoutRadar([item('o', { createdAt: ago(10) }), item('c', { createdAt: ago(10), updatedAt: ago(4), status: 'delivered' })], now);
    const byId = Object.fromEntries(l.blips.map((b) => [b.id, b]));
    expect(byId.o.ageDays).toBe(10);
    expect(byId.c.ageDays).toBe(6);
    expect(trailDegrees(200)).toBe(75);
  });
});

describe('lenses', () => {
  it('bands score and age', () => {
    expect(scoreBand(9).label).toMatch(/8 and up/);
    expect(scoreBand(5).label).toMatch(/4 to 8/);
    expect(scoreBand(1).label).toMatch(/Below/);
    expect(ageBand(3).label).toBe('Under a week');
    expect(ageBand(90).label).toBe('Over 2 months');
  });

  it('greys closed blips except in the status lens', () => {
    const l = layoutRadar([item('c', { status: 'declined' })], now);
    expect(blipColor(l.blips[0], 'score')).toBe('var(--gray-8)');
    expect(blipColor(l.blips[0], 'status')).toBe('var(--bad-solid)');
  });
});

describe('today', () => {
  const items = [
    item('top', { status: 'planned', effort: 'S' }, { score: 12, supporters: 4 }),
    item('stale', { createdAt: ago(20), effort: null }, { score: 5, needsTriage: true }),
    item('late', { status: 'in_progress', targetDate: ago(3) }, { score: 3 }),
    item('mine', {}, { score: 2, mine: true }),
    item('backed', {}, { score: 1, backedByMe: true }),
  ];

  it('ranks the data team’s attention: stale first, then overdue, unsized, top of queue', () => {
    const t = buildToday(items, 'team', now);
    expect(t.map((x) => x.id)).toEqual(['stale', 'late', 'top']);
    expect(t[0].severity).toBe('bad');
    expect(t[0].lens).toBe('age');
    expect(t[1].unit).toBe('days late');
  });

  it('shows a requester their own requests and what they back first', () => {
    const t = buildToday(items, 'requester', now);
    expect(t[0]).toMatchObject({ id: 'mine', value: '#4', lens: 'score' });
    expect(t[1]).toMatchObject({ id: 'backed', value: '#5' });
    expect(t.length).toBeLessThanOrEqual(5);
  });
});
