import { groupBy } from '@x10/shared/data';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, STATUSES } from '../model';
import { seed } from '../seed';
import { computeInsights, scatterPoints } from './insights';
import { loadInsights } from './requests';
import { canTransition } from './status';

const seeded = () => testStore(defs, { personas, fn: seed, now: FIXED_NOW });

describe('seed data', () => {
  it('has the rows the spec asks for', async () => {
    const store = await seeded();
    const requests = await store.repo('DataRequest').list();
    expect(requests).toHaveLength(25);
    expect(new Set(requests.map((r) => r.team)).size).toBe(5);
    for (const s of STATUSES) expect(requests.some((r) => r.status === s), s).toBe(true);
    expect(await store.repo('Supporter').list()).toHaveLength(40);
    expect(await store.repo('RequestComment').list()).toHaveLength(30);
  });

  it('gives every request a full, legal status trail ending at its status', async () => {
    const store = await seeded();
    const requests = await store.repo('DataRequest').list();
    const trails = groupBy(await store.repo('StatusChange').list({ orderBy: { field: 'at', dir: 'asc' } }), (c) => c.requestId);
    for (const r of requests) {
      const trail = trails.get(r.id) ?? [];
      expect(trail[0]).toMatchObject({ fromStatus: null, toStatus: 'new' });
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i].fromStatus).toBe(trail[i - 1].toStatus);
        expect(canTransition(trail[i].fromStatus!, trail[i].toStatus), `${r.title}: ${trail[i].fromStatus} → ${trail[i].toStatus}`).toBe(true);
      }
      expect(trail.at(-1)!.toStatus).toBe(r.status);
      expect(trail[0].at).toBe(r.createdAt);
    }
  });

  it('allows one supporter per user per request and never the requester', async () => {
    const store = await seeded();
    const requests = new Map((await store.repo('DataRequest').list()).map((r) => [r.id, r]));
    const supporters = await store.repo('Supporter').list();
    expect(new Set(supporters.map((s) => `${s.requestId}|${s.voterSub}`)).size).toBe(supporters.length);
    for (const s of supporters) expect(requests.get(s.requestId)!.requesterSub).not.toBe(s.voterSub);
  });

  it('includes the edge cases: near-duplicates, decline notice, edit after triage', async () => {
    const store = await seeded();
    const requests = await store.repo('DataRequest').list();
    expect(requests.filter((r) => /sales pipeline by region/i.test(r.title))).toHaveLength(2);
    const declinedWithBackers = requests.find((r) => r.title === 'Lead response time by sales rep')!;
    const notes = await store.repo('RequestComment').list({ where: { requestId: declinedWithBackers.id } });
    expect(notes.some((c) => c.body.startsWith('Declined:') && c.body.includes('Notifying 2 supporters'))).toBe(true);
    const edited = requests.find((r) => r.title === 'Invoice processing backlog by approver')!;
    expect(edited.status).toBe('triaged');
    expect(edited.description).toContain('Update:');
  });
});

describe('insights numbers match the seed', () => {
  it('KPIs', async () => {
    const i = await loadInsights(await seeded(), FIXED_NOW);
    expect(i).toMatchObject({ total: 25, open: 17, needsTriage: 2, delivered: 5, declined: 3, medianDaysToDeliver: 28 });
  });

  it('requests per team', async () => {
    const i = await loadInsights(await seeded(), FIXED_NOW);
    expect(i.perTeam).toEqual([
      { team: 'Marketing', count: 6 },
      { team: 'Sales', count: 6 },
      { team: 'Finance', count: 5 },
      { team: 'Operations', count: 5 },
      { team: 'People', count: 3 },
    ]);
  });

  it('funnel from new to delivered', async () => {
    const i = await loadInsights(await seeded(), FIXED_NOW);
    expect(i.funnel.map((f) => [f.stage, f.count])).toEqual([
      ['New', 25],
      ['Triaged', 18],
      ['Planned', 13],
      ['In progress', 9],
      ['Delivered', 5],
    ]);
  });

  it('median days from submission to delivery by effort', async () => {
    const i = await loadInsights(await seeded(), FIXED_NOW);
    expect(i.medianByEffort).toEqual([
      { effort: 'S', days: 5, delivered: 2 },
      { effort: 'M', days: 31, delivered: 2 },
      { effort: 'L', days: 60, delivered: 1 },
      { effort: 'XL', days: null, delivered: 0 },
    ]);
  });

  it('scatter has one point per sized request, near its effort column', async () => {
    const i = await loadInsights(await seeded(), FIXED_NOW);
    expect(i.scatter).toHaveLength(18);
    const col = { S: 1, M: 2, L: 3, XL: 4 };
    for (const p of i.scatter) expect(Math.abs(p.x - col[p.effort])).toBeLessThan(0.5);
  });

  it('is stable on any day of the week (needs triage depends on working days)', async () => {
    for (let d = 0; d < 7; d++) {
      const now = new Date(FIXED_NOW.getTime() + d * 86400000);
      const store = await testStore(defs, { personas, fn: seed, now });
      expect((await loadInsights(store, now)).needsTriage, `day +${d}`).toBe(2);
    }
  });

  it('handles an empty database', () => {
    const i = computeInsights([], [], FIXED_NOW);
    expect(i).toMatchObject({ total: 0, open: 0, medianDaysToDeliver: null, scatter: [], perTeam: [] });
    expect(i.funnel.every((f) => f.count === 0)).toBe(true);
    expect(scatterPoints([])).toEqual([]);
  });
});
