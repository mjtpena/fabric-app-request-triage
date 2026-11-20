import { SCORE } from '../config';
import type { DataRequest, Effort } from '../model';

export interface ScoreParts {
  valuePoints: number;
  urgencyPoints: number;
  supporterPoints: number;
  /** Effort used for the divisor (the default when the request has not been sized yet). */
  effort: Effort;
  effortAssumed: boolean;
  effortWeight: number;
  score: number;
}

/**
 * Priority score: (value × 2 + urgencyPoints + min(supporters, 5)) / effortWeight.
 * Weights come from config.ts. A request without an effort size is scored as the default effort (M).
 */
export function scoreParts(r: Pick<DataRequest, 'value' | 'urgency' | 'effort'>, supporters: number): ScoreParts {
  const valuePoints = r.value * SCORE.valueWeight;
  const urgencyPoints = SCORE.urgencyPoints[r.urgency] ?? 0;
  const supporterPoints = Math.min(Math.max(0, supporters), SCORE.supporterCap);
  const effort = r.effort ?? SCORE.defaultEffort;
  const effortWeight = SCORE.effortWeight[effort];
  return {
    valuePoints,
    urgencyPoints,
    supporterPoints,
    effort,
    effortAssumed: !r.effort,
    effortWeight,
    score: (valuePoints + urgencyPoints + supporterPoints) / effortWeight,
  };
}

export function priorityScore(r: Pick<DataRequest, 'value' | 'urgency' | 'effort'>, supporters: number): number {
  return scoreParts(r, supporters).score;
}

/** Score for display: at most two decimals, trailing zeros dropped (19, 4.5, 1.88). */
export function formatScore(score: number): string {
  return String(Math.round(score * 100) / 100);
}

/** Highest score first; ties go to the older request (it has waited longer), then by title. */
export function compareByScore<T extends { score: number; request: Pick<DataRequest, 'createdAt' | 'title'> }>(
  a: T,
  b: T,
): number {
  return (
    b.score - a.score ||
    a.request.createdAt.localeCompare(b.request.createdAt) ||
    a.request.title.localeCompare(b.request.title)
  );
}
