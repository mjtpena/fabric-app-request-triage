/**
 * Rules and thresholds. Shown on the About page, used by the pure functions in src/domain.
 * Change a number here and the queue, the board, the tests' expectations and About all follow.
 */
import type { Effort, Status, Urgency } from './model';

/** Priority score = (value × valueWeight + urgencyPoints + min(supporters, supporterCap)) / effortWeight. */
export const SCORE = {
  valueWeight: 2,
  urgencyPoints: { low: 0, normal: 2, high: 4 } satisfies Record<Urgency, number>,
  supporterCap: 5,
  effortWeight: { S: 1, M: 2, L: 4, XL: 8 } satisfies Record<Effort, number>,
  /** Effort assumed while a request has not been sized yet. */
  defaultEffort: 'M' as Effort,
};

/** Allowed status moves. Anything else is refused in the UI and in the domain function. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ['triaged', 'declined'],
  triaged: ['planned', 'declined'],
  planned: ['in_progress', 'declined'],
  in_progress: ['delivered', 'planned'],
  delivered: [],
  declined: [],
};

/** A request still "new" after this many working days (Mon–Fri, UTC) gets a "needs triage" chip. */
export const NEEDS_TRIAGE_WORKING_DAYS = 5;

/** Duplicate help: an open request is suggested when its title shares at least this many meaningful words. */
export const DUPLICATE_MIN_SHARED = 2;
export const DUPLICATE_MAX_SUGGESTIONS = 3;

/** Statuses that count as open (still on the roadmap): suggestions, "Back this" and the default queue filter. */
export const OPEN_STATUSES: readonly Status[] = ['new', 'triaged', 'planned', 'in_progress'];

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  triaged: 'Triaged',
  planned: 'Planned',
  in_progress: 'In progress',
  delivered: 'Delivered',
  declined: 'Declined',
};

export const URGENCY_LABEL: Record<Urgency, string> = { low: 'Low', normal: 'Normal', high: 'High' };

export const EFFORT_LABEL: Record<Effort, string> = {
  S: 'S (days)',
  M: 'M (1–2 weeks)',
  L: 'L (a month)',
  XL: 'XL (a quarter)',
};

export const VALUE_LABEL: Record<number, string> = {
  1: '1 · Nice to have',
  2: '2 · Useful',
  3: '3 · Important',
  4: '4 · Very important',
  5: '5 · Critical',
};
