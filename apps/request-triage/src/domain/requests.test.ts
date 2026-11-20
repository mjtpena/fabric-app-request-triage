import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, type DataRequest } from '../model';
import { seed } from '../seed';
import {
  addComment,
  backRequest,
  declineNotice,
  DEFAULT_FILTER,
  editRequest,
  filterQueue,
  loadQueue,
  loadRequestDetail,
  StaleStateError,
  submitRequest,
  teamsOf,
  toggleSupport,
  transitionRequest,
  updateTriage,
  validateRequestInput,
  type RequestInput,
} from './requests';

const later = (min: number) => new Date(FIXED_NOW.getTime() + min * 60_000);

async function setup() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const people = await store.repo('Person').list();
  const bySub = (sub: string) => people.find((p) => p.sub === sub)!;
  return {
    store,
    admin: bySub('demo-admin'),
    priya: bySub('demo-priya'),
    marco: bySub('demo-marco'),
    hannah: bySub('demo-hannah'),
    byTitle: async (title: string) => (await store.repo('DataRequest').list()).find((r) => r.title === title)!,
  };
}

const input: RequestInput = {
  title: 'Overdue purchase orders by buyer',
  description: 'Open purchase orders past their due date, per buyer.',
  team: 'Operations',
  value: 3,
  urgency: 'normal',
};

describe('submitting and editing', () => {
  it('validates with the entity limits', () => {
    expect(validateRequestInput({ ...input, title: 'abc' }).title).toMatch(/at least 5/);
    expect(validateRequestInput({ ...input, description: 'x'.repeat(2001) }).description).toMatch(/2000/);
    expect(validateRequestInput({ ...input, team: '' }).team).toMatch(/required/);
    expect(validateRequestInput({ ...input, value: 6 }).value).toMatch(/1 to 5/);
    expect(validateRequestInput(input)).toEqual({});
  });

  it('creates a new request as the viewer, with the first trail row', async () => {
    const { store, hannah } = await setup();
    const r = await submitRequest(store, hannah, input, later(1));
    expect(r).toMatchObject({ status: 'new', requesterSub: hannah.sub, requesterName: hannah.displayName, effort: null });
    const trail = await store.repo('StatusChange').list({ where: { requestId: r.id } });
    expect(trail).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'new', bySub: hannah.sub })]);
  });

  it('lets the requester change everything while new', async () => {
    const { store, hannah } = await setup();
    const r = await submitRequest(store, hannah, input, later(1));
    const edited = await editRequest(store, hannah, r.id, { ...input, title: 'Overdue purchase orders by supplier', value: 4 }, later(2));
    expect(edited).toMatchObject({ title: 'Overdue purchase orders by supplier', value: 4 });
  });

  it('after triage, the requester can change the description only', async () => {
    const { store, priya, byTitle } = await setup();
    const r = await byTitle('Invoice processing backlog by approver');
    const same: RequestInput = { title: r.title, description: r.description, team: r.team, value: r.value, urgency: r.urgency };
    await expect(editRequest(store, priya, r.id, { ...same, value: 5 }, later(1))).rejects.toThrow(/only the description/);
    const ok = await editRequest(store, priya, r.id, { ...same, description: 'Shorter description.' }, later(1));
    expect(ok.description).toBe('Shorter description.');
    expect(ok.value).toBe(r.value);
  });

  it('refuses edits by anyone but the requester, and on closed requests', async () => {
    const { store, marco, hannah, byTitle } = await setup();
    const r = await byTitle('Invoice processing backlog by approver');
    const same: RequestInput = { title: r.title, description: 'x', team: r.team, value: r.value, urgency: r.urgency };
    await expect(editRequest(store, marco, r.id, same)).rejects.toMatchObject({ category: 'permission' });
    const closed = await byTitle('Real-time stock levels on the intranet');
    await expect(
      editRequest(store, hannah, closed.id, { title: closed.title, description: 'x', team: closed.team, value: 3, urgency: 'normal' }),
    ).rejects.toThrow(/no longer be edited/);
  });
});

describe('supporters', () => {
  it('toggles one supporter per user per request', async () => {
    const { store, hannah, byTitle } = await setup();
    const r = await byTitle('Customer churn drivers dashboard');
    const count = async () => (await store.repo('Supporter').list({ where: { requestId: r.id } })).length;
    const before = await count();
    expect(await toggleSupport(store, hannah, r.id)).toBe(true);
    expect(await count()).toBe(before + 1);
    expect(await toggleSupport(store, hannah, r.id)).toBe(false);
    expect(await count()).toBe(before);
  });

  it('"back this instead" is idempotent', async () => {
    const { store, hannah, byTitle } = await setup();
    const r = await byTitle('Customer churn drivers dashboard');
    expect(await backRequest(store, hannah, r.id)).toBe('added');
    expect(await backRequest(store, hannah, r.id)).toBe('already');
  });

  it('refuses backing your own or a closed request', async () => {
    const { store, priya, hannah, byTitle } = await setup();
    const own = await byTitle('Quarterly revenue bridge for the board pack');
    await expect(toggleSupport(store, priya, own.id)).rejects.toThrow(/already counted/);
    const closed = await byTitle('Daily cash position feed');
    await expect(toggleSupport(store, hannah, closed.id)).rejects.toThrow(/no longer takes supporters/);
  });

  it('supporters raise the score in the queue', async () => {
    const { store, hannah, byTitle } = await setup();
    const r = await byTitle('Returns rate by product category');
    const score = async () => (await loadQueue(store, hannah, FIXED_NOW)).find((q) => q.request.id === r.id)!.score;
    const before = await score();
    const me = { ...hannah, sub: 'someone-else' };
    await toggleSupport(store, me, r.id);
    expect(await score()).toBe(before + 0.5); // one point, divided by the default M weight of 2
  });
});

describe('status transitions (the one domain function)', () => {
  it('moves a request, then appends the StatusChange row', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Returns rate by product category');
    const moved = await transitionRequest(store, admin, { requestId: r.id, from: 'new', to: 'triaged', effort: 'S', note: 'Quick one' }, later(5));
    expect(moved).toMatchObject({ status: 'triaged', effort: 'S' });
    const trail = await store.repo('StatusChange').list({ where: { requestId: r.id }, orderBy: { field: 'at', dir: 'asc' } });
    expect(trail.at(-1)).toMatchObject({ fromStatus: 'new', toStatus: 'triaged', bySub: admin.sub, note: 'Quick one' });
  });

  it('refuses illegal moves in the data layer', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Returns rate by product category');
    await expect(transitionRequest(store, admin, { requestId: r.id, from: 'new', to: 'delivered' })).rejects.toThrow(
      'A New request can move to Triaged or Declined, not Delivered.',
    );
    const done = await byTitle('Daily cash position feed');
    await expect(transitionRequest(store, admin, { requestId: done.id, from: 'delivered', to: 'planned' })).rejects.toThrow(/closed/);
    const unchanged = await store.repo('DataRequest').get(r.id);
    expect(unchanged!.status).toBe('new');
  });

  it('refuses a move from a stale tab and explains it', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Sales forecast accuracy tracker'); // triaged
    // Tab A moves it to planned…
    await transitionRequest(store, admin, { requestId: r.id, from: 'triaged', to: 'planned' }, later(1));
    // …tab B still shows "triaged" and tries to decline it.
    const stale = transitionRequest(store, admin, { requestId: r.id, from: 'triaged', to: 'declined', declineReason: 'No' }, later(2));
    await expect(stale).rejects.toBeInstanceOf(StaleStateError);
    await expect(stale).rejects.toMatchObject({ category: 'conflict', message: expect.stringMatching(/now Planned, not Triaged/) });
    expect((await store.repo('DataRequest').get(r.id))!.status).toBe('planned');
    const trail = await store.repo('StatusChange').list({ where: { requestId: r.id } });
    expect(trail.filter((c) => c.toStatus === 'declined')).toHaveLength(0);
  });

  it('is for the data team only', async () => {
    const { store, priya, byTitle } = await setup();
    const r = await byTitle('Quarterly revenue bridge for the board pack');
    await expect(
      transitionRequest(store, priya, { requestId: r.id, from: 'new', to: 'triaged', effort: 'S' }),
    ).rejects.toMatchObject({ category: 'permission' });
    await expect(updateTriage(store, priya, r.id, { effort: 'S', assigneeName: null, targetDate: null })).rejects.toMatchObject({
      category: 'permission',
    });
  });

  it('needs an effort size to triage', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Overtime hours trend by site');
    await expect(transitionRequest(store, admin, { requestId: r.id, from: 'new', to: 'triaged' })).rejects.toThrow(/effort size/);
  });

  it('declining needs a reason', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Overtime hours trend by site');
    await expect(transitionRequest(store, admin, { requestId: r.id, from: 'new', to: 'declined', declineReason: '  ' })).rejects.toThrow(
      /Decline reason is required/,
    );
  });

  it('declining a request with supporters posts a notice comment naming them', async () => {
    const { store, admin, byTitle } = await setup();
    const dup = await byTitle('Sales pipeline by region with weekly snapshots');
    const original = await byTitle('Weekly sales pipeline by region');
    const before = await loadRequestDetail(store, admin, dup.id, FIXED_NOW);
    expect(before.supporters.length).toBe(1);
    await transitionRequest(
      store,
      admin,
      { requestId: dup.id, from: 'new', to: 'declined', declineReason: 'Already planned; please back the original.', duplicateOfId: original.id },
      later(3),
    );
    const after = await loadRequestDetail(store, admin, dup.id, FIXED_NOW);
    expect(after.request).toMatchObject({ status: 'declined', duplicateOfId: original.id });
    expect(after.duplicateOf?.id).toBe(original.id);
    const notice = after.comments.at(-1)!;
    expect(notice.authorSub).toBe(admin.sub);
    expect(notice.body).toBe(
      `Declined as a duplicate of "Weekly sales pipeline by region": Already planned; please back the original. Notifying 1 supporter: ${before.supporters[0].name}.`,
    );
    const originalDetail = await loadRequestDetail(store, admin, original.id, FIXED_NOW);
    expect(originalDetail.duplicates.map((d) => d.id)).toEqual([dup.id]);
  });

  it('declining without supporters posts no comment', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Overtime hours trend by site');
    const count = async () => (await store.repo('RequestComment').list({ where: { requestId: r.id } })).length;
    const before = await count();
    await transitionRequest(store, admin, { requestId: r.id, from: 'new', to: 'declined', declineReason: 'Covered by the HR system.' });
    expect(await count()).toBe(before);
  });

  it('can move back from in progress to planned', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Supplier on-time delivery scorecard');
    const moved = await transitionRequest(store, admin, { requestId: r.id, from: 'in_progress', to: 'planned', note: 'Blocked' });
    expect(moved.status).toBe('planned');
  });
});

describe('triage fields', () => {
  it('sets effort, assignee and target date', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Training completion rates by team');
    const out = await updateTriage(store, admin, r.id, { effort: 'S', assigneeName: '  Riley Chen ', targetDate: '2026-12-01T12:00:00.000Z' });
    expect(out).toMatchObject({ effort: 'S', assigneeName: 'Riley Chen', targetDate: '2026-12-01T12:00:00.000Z', status: 'new' });
  });

  it('keeps an effort size once triaged', async () => {
    const { store, admin, byTitle } = await setup();
    const r = await byTitle('Sales forecast accuracy tracker');
    await expect(updateTriage(store, admin, r.id, { effort: null, assigneeName: null, targetDate: null })).rejects.toThrow(/needs an effort/);
  });
});

describe('comments', () => {
  it('posts as the viewer, within the limit', async () => {
    const { store, marco, byTitle } = await setup();
    const r = await byTitle('Customer churn drivers dashboard');
    const c = await addComment(store, marco, r.id, '  Sales would use this too.  ');
    expect(c).toMatchObject({ authorSub: marco.sub, authorName: marco.displayName, body: 'Sales would use this too.' });
    await expect(addComment(store, marco, r.id, 'x'.repeat(601))).rejects.toThrow(/600/);
    await expect(addComment(store, marco, r.id, '   ')).rejects.toThrow(/required/);
  });

  it('the decline notice stays within the comment limit', () => {
    const names = Array.from({ length: 80 }, (_, i) => `Colleague number ${i}`);
    expect(declineNotice('x'.repeat(300), names).length).toBeLessThanOrEqual(600);
    expect(declineNotice('Out of scope.', [])).toBe('Declined: Out of scope.');
    expect(declineNotice('No source yet', ['A', 'B'])).toBe('Declined: No source yet. Notifying 2 supporters: A, B.');
  });
});

describe('queue', () => {
  it('ranks by score and filters by status, team, mine and search', async () => {
    const { store, priya } = await setup();
    const items = await loadQueue(store, priya, FIXED_NOW);
    expect(items).toHaveLength(25);
    for (let i = 1; i < items.length; i++) expect(items[i - 1].score).toBeGreaterThanOrEqual(items[i].score);
    expect(filterQueue(items, DEFAULT_FILTER)).toHaveLength(17);
    expect(filterQueue(items, { ...DEFAULT_FILTER, status: 'all' })).toHaveLength(25);
    expect(filterQueue(items, { ...DEFAULT_FILTER, status: 'declined' })).toHaveLength(3);
    expect(filterQueue(items, { ...DEFAULT_FILTER, status: 'all', team: 'People' })).toHaveLength(3);
    const mine = filterQueue(items, { ...DEFAULT_FILTER, status: 'all', mine: true });
    expect(mine.map((m) => m.request.title).sort()).toEqual([
      'Invoice processing backlog by approver',
      'Monthly close variance report for cost centres',
      'Quarterly revenue bridge for the board pack',
    ]);
    expect(filterQueue(items, { ...DEFAULT_FILTER, search: 'PIPELINE region' })).toHaveLength(2);
    expect(items.filter((i) => i.needsTriage).map((i) => i.request.title).sort()).toEqual([
      'Returns rate by product category',
      'Training completion rates by team',
    ]);
  });

  it('lists distinct teams', () => {
    expect(teamsOf([{ team: 'Sales' }, { team: 'Finance' }, { team: 'Sales ' }] as DataRequest[])).toEqual(['Finance', 'Sales']);
  });
});
