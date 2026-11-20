import type { Tone } from '@x10/shared/ui';

import { OPEN_STATUSES, STATUS_LABEL, TRANSITIONS } from '../config';
import { STATUSES, type Status } from '../model';

export function isStatus(v: unknown): v is Status {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

/** Statuses a request in `from` may move to, in table order. */
export function allowedNext(from: Status): readonly Status[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: Status, to: Status): boolean {
  return allowedNext(from).includes(to);
}

/** Why a move is refused, in words a user understands; null when it is allowed. */
export function transitionProblem(from: Status, to: Status): string | null {
  if (from === to) return `This request is already ${STATUS_LABEL[to]}.`;
  if (canTransition(from, to)) return null;
  const next = allowedNext(from);
  return next.length
    ? `A ${STATUS_LABEL[from]} request can move to ${next.map((s) => STATUS_LABEL[s]).join(' or ')}, not ${STATUS_LABEL[to]}.`
    : `A ${STATUS_LABEL[from]} request is closed and cannot move to ${STATUS_LABEL[to]}.`;
}

export function isOpen(status: Status): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Statuses that need an effort size: everything on the delivery path after "new". */
export function needsEffort(status: Status): boolean {
  return status === 'triaged' || status === 'planned' || status === 'in_progress' || status === 'delivered';
}

export const STATUS_TONE: Record<Status, Tone> = {
  new: 'info',
  triaged: 'neutral',
  planned: 'brand',
  in_progress: 'warn',
  delivered: 'ok',
  declined: 'bad',
};
