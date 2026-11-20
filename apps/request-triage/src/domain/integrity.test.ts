import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, type Status, type StatusChange } from '../model';
import { seed } from '../seed';
import { consistentTrail, distinctSupporters, supporterCounts } from './integrity';
import { loadInsights, loadQueue, loadRequestDetail } from './requests';

const seeded = () => testStore(defs, { personas, fn: seed, now: FIXED_NOW });

function change(id: string, from: Status | null, to: Status, at: string): StatusChange {
  return { id, requestId: 'r', fromStatus: from, toStatus: to, bySub: 'x', byName: 'X', note: null, at };
}

describe('supporters count once per user', () => {
  it('dedupes by request and voter', () => {
    const rows = [
      { id: '1', requestId: 'a', voterSub: 'u1', createdAt: '2026-11-02' },
      { id: '2', requestId: 'a', voterSub: 'u1', createdAt: '2026-11-01' },
      { id: '3', requestId: 'a', voterSub: 'u2', createdAt: '2026-11-03' },
      { id: '4', requestId: 'b', voterSub: 'u1', createdAt: '2026-11-03' },
    ];
    expect(distinctSupporters(rows).map((s) => s.id).sort()).toEqual(['2', '3', '4']);
    expect(supporterCounts(rows)).toEqual(new Map([['a', 2], ['b', 1]]));
  });

  it('stacked Supporter rows written straight to the API add one point, not five', async () => {
    const store = await seeded();
    const people = await store.repo('Person').list();
    const hannah = people.find((p) => p.sub === 'demo-hannah')!;
    const r = (await store.repo('DataRequest').list()).find((x) => x.title === 'Overtime hours trend by site')!; // Hannah's, 0 supporters
    const marco = people.find((p) => p.sub === 'demo-marco')!;
    const before = (await loadQueue(store, hannah, FIXED_NOW)).find((q) => q.request.id === r.id)!;
    for (let i = 0; i < 5; i++) {
      await store.repo('Supporter').create({ requestId: r.id, voterSub: marco.sub, createdAt: FIXED_NOW.toISOString() });
    }
    const after = (await loadQueue(store, hannah, FIXED_NOW)).find((q) => q.request.id === r.id)!;
    expect(after.supporters).toBe(1);
    expect(after.score).toBe(before.score + 0.5); // one point ÷ the default M weight
    const detail = await loadRequestDetail(store, hannah, r.id, FIXED_NOW);
    expect(detail.supporters).toHaveLength(1);
    expect(detail.parts.supporterPoints).toBe(1);
  });
});

describe('status trail consistency', () => {
  const ok = [
    change('1', null, 'new', '2026-11-01'),
    change('2', 'new', 'triaged', '2026-11-02'),
    change('3', 'triaged', 'planned', '2026-11-03'),
  ];

  it('keeps a valid chain as is', () => {
    expect(consistentTrail({ id: 'r', status: 'planned' }, ok).map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('ignores rows that do not continue the chain or break the transition table', () => {
    const forged = [...ok, change('f1', 'new', 'delivered', '2026-11-04'), change('f2', 'planned', 'delivered', '2026-11-05')];
    expect(consistentTrail({ id: 'r', status: 'planned' }, forged).map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('cuts a forged next step that runs past the actual status', () => {
    const forged = [...ok, change('f', 'planned', 'in_progress', '2026-11-04')];
    expect(consistentTrail({ id: 'r', status: 'planned' }, forged).map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('keeps the chain when the last legitimate row is missing', () => {
    expect(consistentTrail({ id: 'r', status: 'in_progress' }, ok).map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('forged StatusChange rows do not move the Insights funnel or delivery times', async () => {
    const store = await seeded();
    const before = await loadInsights(store, FIXED_NOW);
    const requests = await store.repo('DataRequest').list();
    const planned = requests.find((r) => r.status === 'planned')!;
    const delivered = requests.find((r) => r.status === 'delivered')!;
    const rows = [
      { requestId: planned.id, fromStatus: 'planned' as const, toStatus: 'in_progress' as const },
      { requestId: planned.id, fromStatus: 'in_progress' as const, toStatus: 'delivered' as const },
      { requestId: delivered.id, fromStatus: 'in_progress' as const, toStatus: 'delivered' as const },
    ];
    for (const r of rows) {
      await store.repo('StatusChange').create({ ...r, bySub: 'demo-marco', byName: 'Marco Silva', note: null, at: FIXED_NOW.toISOString() });
    }
    const after = await loadInsights(store, FIXED_NOW);
    expect(after.funnel).toEqual(before.funnel);
    expect(after.medianByEffort).toEqual(before.medianByEffort);
    expect(after.medianDaysToDeliver).toBe(before.medianDaysToDeliver);
  });
});
