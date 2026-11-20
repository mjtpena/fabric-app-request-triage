/**
 * Domain functions for requests, supporters, comments and the status trail. Every read and write goes through the
 * DataStore. Permission and rule checks live here so they hold in demo mode and in Fabric.
 *
 * Admin-only actions (status moves, effort, assignee, target date, decline reason): the Fabric row policies cannot
 * tell a data-team member from anyone else (there is no admin claim), so DataRequest updates are open to every
 * signed-in user at the API level and the admin checks below are what enforce them. See README "Known limits".
 */
import { NotFoundError, PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, type Errors } from '@x10/shared/lib';

import { STATUS_LABEL } from '../config';
import {
  EFFORTS,
  limits,
  URGENCIES,
  type DataRequest,
  type Effort,
  type RequestComment,
  type Schema,
  type Status,
  type StatusChange,
  type Urgency,
} from '../model';
import { computeInsights, type Insights } from './insights';
import { consistentTrail, distinctSupporters, supporterCounts } from './integrity';
import { compareByScore, scoreParts, type ScoreParts } from './score';
import { isOpen, isStatus, needsEffort, transitionProblem } from './status';
import { needsTriage } from './workdays';

type Store = DataStore<Schema>;
export type Me = Pick<Person, 'sub' | 'displayName' | 'isAdmin'>;

/** The request changed since the viewer loaded it (another tab or another person moved it). */
export class StaleStateError extends Error {
  readonly category = 'conflict';
  constructor(
    message: string,
    readonly current: DataRequest,
  ) {
    super(message);
    this.name = 'StaleStateError';
  }
}

const isAdmin = (me: Me) => me.isAdmin === true;

function requireAdmin(me: Me, what: string) {
  if (!isAdmin(me)) throw new PermissionError(`Only the data team can ${what}.`);
}

async function getRequest(store: Store, id: string): Promise<DataRequest> {
  const r = await store.repo('DataRequest').get(id);
  if (!r) throw new NotFoundError('Request', id);
  return r;
}

/* ------------------------------------------------------------------ validation (pure) */

export interface RequestInput {
  title: string;
  description: string;
  team: string;
  value: number;
  urgency: Urgency;
}

export function validateRequestInput(input: RequestInput): Errors<RequestInput> {
  const out: Errors<RequestInput> = {};
  const t = checkText(input.title, { ...limits.title, label: 'Title' });
  if (t) out.title = t;
  const d = checkText(input.description, { ...limits.description, label: 'Description' });
  if (d) out.description = d;
  const team = checkText(input.team, { ...limits.team, label: 'Team' });
  if (team) out.team = team;
  if (!Number.isInteger(input.value) || input.value < limits.value.min || input.value > limits.value.max)
    out.value = `Value must be a whole number from ${limits.value.min} to ${limits.value.max}.`;
  if (!URGENCIES.includes(input.urgency)) out.urgency = 'Choose an urgency.';
  return out;
}

export interface TriageInput {
  effort: Effort | null;
  assigneeName: string | null;
  /** ISO date-time or null. */
  targetDate: string | null;
}

export function validateTriageInput(input: TriageInput): Errors<TriageInput> {
  const out: Errors<TriageInput> = {};
  if (input.effort !== null && !EFFORTS.includes(input.effort)) out.effort = 'Choose S, M, L or XL.';
  const a = checkText(input.assigneeName, { ...limits.assigneeName, optional: true, label: 'Assignee' });
  if (a) out.assigneeName = a;
  if (input.targetDate && Number.isNaN(new Date(input.targetDate).getTime())) out.targetDate = 'Enter a valid date.';
  return out;
}

const firstError = (e: object): string | null => Object.values(e).find(Boolean) ?? null;
const clean = (s: string | null | undefined) => {
  const v = (s ?? '').trim();
  return v ? v : null;
};

/** The comment line posted when a request with supporters is declined. Fits the comment limit. */
export function declineNotice(reason: string, supporterNames: string[], duplicateOfTitle?: string | null): string {
  const head = duplicateOfTitle
    ? `Declined as a duplicate of "${duplicateOfTitle}": ${reason}`
    : `Declined: ${reason}`;
  const who = supporterNames.length
    ? ` Notifying ${supporterNames.length} ${supporterNames.length === 1 ? 'supporter' : 'supporters'}: ${supporterNames.join(', ')}.`
    : '';
  const text = `${head}${/[.!?]$/.test(head) ? '' : '.'}${who}`;
  return text.length > limits.comment.max ? `${text.slice(0, limits.comment.max - 1)}…` : text;
}

/* ------------------------------------------------------------------ queue */

export interface QueueItem {
  request: DataRequest;
  supporters: number;
  score: number;
  needsTriage: boolean;
  backedByMe: boolean;
  mine: boolean;
}

export async function loadQueue(store: Store, me: Me, now = new Date()): Promise<QueueItem[]> {
  const [requests, supporters] = await Promise.all([store.repo('DataRequest').list(), store.repo('Supporter').list()]);
  const counts = supporterCounts(supporters);
  const mineBacked = new Set(supporters.filter((s) => s.voterSub === me.sub).map((s) => s.requestId));
  return requests
    .map((r) => {
      const n = counts.get(r.id) ?? 0;
      return {
        request: r,
        supporters: n,
        score: scoreParts(r, n).score,
        needsTriage: needsTriage(r, now),
        backedByMe: mineBacked.has(r.id),
        mine: r.requesterSub === me.sub,
      };
    })
    .sort(compareByScore);
}

export type StatusFilter = 'open' | 'all' | Status;

export interface QueueFilter {
  status: StatusFilter;
  team: string;
  mine: boolean;
  search: string;
}

export const DEFAULT_FILTER: QueueFilter = { status: 'open', team: '', mine: false, search: '' };

/** Apply the queue filters (pure). Keeps the ranking order. */
export function filterQueue(items: QueueItem[], f: QueueFilter): QueueItem[] {
  const words = f.search.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(({ request: r, mine }) => {
    if (f.status === 'open' && !isOpen(r.status)) return false;
    if (isStatus(f.status) && r.status !== f.status) return false;
    if (f.team && r.team !== f.team) return false;
    if (f.mine && !mine) return false;
    if (words.length) {
      const hay = `${r.title} ${r.description} ${r.team} ${r.requesterName} ${r.assigneeName ?? ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Distinct team names, alphabetical. */
export function teamsOf(requests: Pick<DataRequest, 'team'>[]): string[] {
  return [...new Set(requests.map((r) => r.team.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/* ------------------------------------------------------------------ detail */

export interface SupporterView {
  sub: string;
  name: string;
  createdAt: string;
}

export interface RequestDetail {
  request: DataRequest;
  parts: ScoreParts;
  needsTriage: boolean;
  supporters: SupporterView[];
  backedByMe: boolean;
  comments: RequestComment[];
  /** Oldest first. */
  changes: StatusChange[];
  duplicateOf: DataRequest | null;
  /** Other requests the data team declined as duplicates of this one. */
  duplicates: DataRequest[];
  /** Every other request, newest first (for the "duplicate of" choice when declining). */
  others: DataRequest[];
}

export async function loadRequestDetail(store: Store, me: Me, id: string, now = new Date()): Promise<RequestDetail> {
  const request = await getRequest(store, id);
  const [supporterRows, comments, changeRows, people, all] = await Promise.all([
    store.repo('Supporter').list({ where: { requestId: id } }),
    store.repo('RequestComment').list({ where: { requestId: id }, orderBy: { field: 'createdAt', dir: 'asc' } }),
    store.repo('StatusChange').list({ where: { requestId: id }, orderBy: { field: 'at', dir: 'asc' } }),
    store.repo('Person').list(),
    store.repo('DataRequest').list(),
  ]);
  const names = new Map(people.map((p) => [p.sub, p.displayName]));
  const supporters = distinctSupporters(supporterRows);
  const changes = consistentTrail(request, changeRows);
  return {
    request,
    parts: scoreParts(request, supporters.length),
    needsTriage: needsTriage(request, now),
    supporters: supporters
      .map((s) => ({ sub: s.voterSub, name: names.get(s.voterSub) ?? 'A colleague', createdAt: s.createdAt }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    backedByMe: supporters.some((s) => s.voterSub === me.sub),
    comments,
    changes,
    duplicateOf: request.duplicateOfId ? (all.find((r) => r.id === request.duplicateOfId) ?? null) : null,
    duplicates: all.filter((r) => r.duplicateOfId === id),
    others: all.filter((r) => r.id !== id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/** All requests (for duplicate suggestions and the decline dialog's "duplicate of" list). */
export async function listRequests(store: Store): Promise<DataRequest[]> {
  return store.repo('DataRequest').list({ orderBy: { field: 'createdAt', dir: 'desc' } });
}

/* ------------------------------------------------------------------ requester actions */

export async function submitRequest(store: Store, me: Me, input: RequestInput, now = new Date()): Promise<DataRequest> {
  const msg = firstError(validateRequestInput(input));
  if (msg) throw new RuleError(msg);
  const at = now.toISOString();
  const created = await store.repo('DataRequest').create({
    title: input.title.trim(),
    description: input.description.trim(),
    team: input.team.trim(),
    requesterSub: me.sub,
    requesterName: me.displayName,
    value: input.value,
    urgency: input.urgency,
    effort: null,
    status: 'new',
    assigneeName: null,
    targetDate: null,
    declineReason: null,
    duplicateOfId: null,
    createdAt: at,
    updatedAt: at,
  });
  await store.repo('StatusChange').create({
    requestId: created.id,
    fromStatus: null,
    toStatus: 'new',
    bySub: me.sub,
    byName: me.displayName,
    note: 'Submitted',
    at,
  });
  return created;
}

/**
 * The requester edits their own request. While it is new every requester field can change; once the data team has
 * triaged it only the description can (the score and the plan were based on the rest). Closed requests are frozen.
 */
export async function editRequest(store: Store, me: Me, id: string, input: RequestInput, now = new Date()): Promise<DataRequest> {
  const current = await getRequest(store, id);
  if (current.requesterSub !== me.sub) throw new PermissionError('Only the person who submitted a request can edit it.');
  if (!isOpen(current.status)) throw new RuleError(`This request is ${STATUS_LABEL[current.status]} and can no longer be edited.`);
  const msg = firstError(validateRequestInput(input));
  if (msg) throw new RuleError(msg);
  const description = input.description.trim();
  if (current.status !== 'new') {
    const changed =
      input.title.trim() !== current.title ||
      input.team.trim() !== current.team ||
      input.value !== current.value ||
      input.urgency !== current.urgency;
    if (changed)
      throw new RuleError('This request has been triaged, so only the description can change. Ask the data team in a comment for anything else.');
    return store.repo('DataRequest').update(id, { description, updatedAt: now.toISOString() });
  }
  return store.repo('DataRequest').update(id, {
    title: input.title.trim(),
    description,
    team: input.team.trim(),
    value: input.value,
    urgency: input.urgency,
    updatedAt: now.toISOString(),
  });
}

async function assertCanBack(store: Store, me: Me, requestId: string): Promise<DataRequest> {
  const r = await getRequest(store, requestId);
  if (r.requesterSub === me.sub) throw new RuleError('You submitted this request, so your vote is already counted.');
  if (!isOpen(r.status)) throw new RuleError(`This request is ${STATUS_LABEL[r.status]}, so it no longer takes supporters.`);
  return r;
}

/** Add or remove the viewer's "me too". One Supporter row per user per request. Returns true when now backing. */
export async function toggleSupport(store: Store, me: Me, requestId: string, now = new Date()): Promise<boolean> {
  await assertCanBack(store, me, requestId);
  const repo = store.repo('Supporter');
  const mine = await repo.list({ where: { requestId, voterSub: me.sub } });
  if (mine.length) {
    for (const s of mine) await repo.remove(s.id);
    return false;
  }
  await repo.create({ requestId, voterSub: me.sub, createdAt: now.toISOString() });
  return true;
}

/** "Back this instead" from the duplicate suggestions: adds support, never removes it. */
export async function backRequest(store: Store, me: Me, requestId: string, now = new Date()): Promise<'added' | 'already'> {
  await assertCanBack(store, me, requestId);
  const repo = store.repo('Supporter');
  if ((await repo.list({ where: { requestId, voterSub: me.sub }, limit: 1 })).length) return 'already';
  await repo.create({ requestId, voterSub: me.sub, createdAt: now.toISOString() });
  return 'added';
}

export function validateComment(body: string): string | null {
  return checkText(body, { ...limits.comment, label: 'Comment' });
}

export async function addComment(store: Store, me: Me, requestId: string, body: string, now = new Date()): Promise<RequestComment> {
  const msg = validateComment(body);
  if (msg) throw new RuleError(msg);
  await getRequest(store, requestId);
  return store.repo('RequestComment').create({
    requestId,
    authorSub: me.sub,
    authorName: me.displayName,
    body: body.trim(),
    createdAt: now.toISOString(),
  });
}

/* ------------------------------------------------------------------ data-team actions */

export interface TransitionArgs {
  requestId: string;
  /** The status the viewer saw when they chose the move. A different stored status means a stale tab. */
  from: Status;
  to: Status;
  note?: string | null;
  /** Required when declining. */
  declineReason?: string | null;
  duplicateOfId?: string | null;
  /** Optional triage fields set together with the move (effort is required to leave "new" for the delivery path). */
  effort?: Effort | null;
  assigneeName?: string | null;
  targetDate?: string | null;
}

/**
 * The one way a request changes status. Re-reads the request, refuses a stale or illegal move with an explanation,
 * writes the request, then appends the StatusChange row. Declining a request that has supporters also posts a comment
 * line naming them, so they hear about it.
 */
export async function transitionRequest(store: Store, me: Me, args: TransitionArgs, now = new Date()): Promise<DataRequest> {
  requireAdmin(me, 'change the status of a request');
  const current = await getRequest(store, args.requestId);
  if (current.status !== args.from) {
    throw new StaleStateError(
      `This request is now ${STATUS_LABEL[current.status]}, not ${STATUS_LABEL[args.from]}: someone moved it after you opened this page. Nothing was changed; the latest version is shown.`,
      current,
    );
  }
  const problem = transitionProblem(current.status, args.to);
  if (problem) throw new RuleError(problem);

  const note = clean(args.note);
  if (note && note.length > limits.note.max) throw new RuleError(`Note must be ${limits.note.max} characters or fewer.`);

  const patch: Partial<DataRequest> = { status: args.to, updatedAt: now.toISOString() };
  if (args.effort !== undefined) patch.effort = args.effort;
  if (args.assigneeName !== undefined) patch.assigneeName = clean(args.assigneeName);
  if (args.targetDate !== undefined) patch.targetDate = args.targetDate || null;
  const triageMsg = firstError(
    validateTriageInput({
      effort: patch.effort !== undefined ? patch.effort : current.effort,
      assigneeName: patch.assigneeName !== undefined ? patch.assigneeName : current.assigneeName,
      targetDate: patch.targetDate !== undefined ? patch.targetDate : current.targetDate,
    }),
  );
  if (triageMsg) throw new RuleError(triageMsg);
  const effort = patch.effort !== undefined ? patch.effort : current.effort;
  if (needsEffort(args.to) && !effort) throw new RuleError('Set an effort size (S, M, L or XL) before triaging this request.');

  let duplicateOf: DataRequest | null = null;
  if (args.to === 'declined') {
    const reason = clean(args.declineReason);
    const reasonMsg = checkText(reason, { ...limits.declineReason, label: 'Decline reason' });
    if (reasonMsg) throw new RuleError(reasonMsg);
    patch.declineReason = reason;
    if (args.duplicateOfId) {
      if (args.duplicateOfId === current.id) throw new RuleError('A request cannot be a duplicate of itself.');
      duplicateOf = await store.repo('DataRequest').get(args.duplicateOfId);
      if (!duplicateOf) throw new RuleError('The request chosen as the original no longer exists.');
      patch.duplicateOfId = duplicateOf.id;
    }
  }

  const updated = await store.repo('DataRequest').update(current.id, patch);
  await store.repo('StatusChange').create({
    requestId: current.id,
    fromStatus: current.status,
    toStatus: args.to,
    bySub: me.sub,
    byName: me.displayName,
    note: args.to === 'declined' ? (note ?? patch.declineReason ?? null) : note,
    at: now.toISOString(),
  });

  if (args.to === 'declined') {
    const supporters = distinctSupporters(await store.repo('Supporter').list({ where: { requestId: current.id } }));
    if (supporters.length) {
      const people = await store.repo('Person').list();
      const names = supporters.map((s) => people.find((p) => p.sub === s.voterSub)?.displayName ?? 'a colleague');
      await store.repo('RequestComment').create({
        requestId: current.id,
        authorSub: me.sub,
        authorName: me.displayName,
        body: declineNotice(patch.declineReason!, names, duplicateOf?.title),
        createdAt: now.toISOString(),
      });
    }
  }
  return updated;
}

/** Data team: size, assign and date a request without moving it. Closed requests are frozen. */
export async function updateTriage(store: Store, me: Me, id: string, input: TriageInput, now = new Date()): Promise<DataRequest> {
  requireAdmin(me, 'set effort, assignee or target date');
  const current = await getRequest(store, id);
  if (!isOpen(current.status)) throw new RuleError(`This request is ${STATUS_LABEL[current.status]}; its triage details are final.`);
  const msg = firstError(validateTriageInput(input));
  if (msg) throw new RuleError(msg);
  if (needsEffort(current.status) && !input.effort)
    throw new RuleError(`A ${STATUS_LABEL[current.status]} request needs an effort size.`);
  return store.repo('DataRequest').update(id, {
    effort: input.effort,
    assigneeName: clean(input.assigneeName),
    targetDate: input.targetDate || null,
    updatedAt: now.toISOString(),
  });
}

/* ------------------------------------------------------------------ insights */

export async function loadInsights(store: Store, now = new Date()): Promise<Insights> {
  const [requests, changes] = await Promise.all([store.repo('DataRequest').list(), store.repo('StatusChange').list()]);
  return computeInsights(requests, changes, now);
}
