import { SCORE } from '../config';
import { compareByScore, formatScore, priorityScore, scoreParts } from './score';

const base = { value: 3, urgency: 'normal' as const };

describe('priority score', () => {
  it('divides by the weight of each effort size', () => {
    // (3 × 2 + 2 + 2) = 10 points
    expect(priorityScore({ ...base, effort: 'S' }, 2)).toBe(10);
    expect(priorityScore({ ...base, effort: 'M' }, 2)).toBe(5);
    expect(priorityScore({ ...base, effort: 'L' }, 2)).toBe(2.5);
    expect(priorityScore({ ...base, effort: 'XL' }, 2)).toBe(1.25);
  });

  it('scores a request without an effort size as M', () => {
    const parts = scoreParts({ ...base, effort: null }, 2);
    expect(parts.effort).toBe('M');
    expect(parts.effortAssumed).toBe(true);
    expect(parts.score).toBe(priorityScore({ ...base, effort: 'M' }, 2));
  });

  it('caps supporters at five', () => {
    const at5 = priorityScore({ ...base, effort: 'S' }, 5);
    expect(priorityScore({ ...base, effort: 'S' }, 6)).toBe(at5);
    expect(priorityScore({ ...base, effort: 'S' }, 40)).toBe(at5);
    expect(priorityScore({ ...base, effort: 'S' }, 4)).toBe(at5 - 1);
    expect(scoreParts({ ...base, effort: 'S' }, 12).supporterPoints).toBe(SCORE.supporterCap);
  });

  it('gives 0, 2 and 4 points for low, normal and high urgency', () => {
    expect(priorityScore({ value: 1, urgency: 'low', effort: 'S' }, 0)).toBe(2);
    expect(priorityScore({ value: 1, urgency: 'normal', effort: 'S' }, 0)).toBe(4);
    expect(priorityScore({ value: 1, urgency: 'high', effort: 'S' }, 0)).toBe(6);
  });

  it('matches the formula at the extremes', () => {
    // (5 × 2 + 4 + 5) / 1 = 19 is the highest possible score
    expect(priorityScore({ value: 5, urgency: 'high', effort: 'S' }, 9)).toBe(19);
    // (1 × 2 + 0 + 0) / 8 = 0.25 is the lowest
    expect(priorityScore({ value: 1, urgency: 'low', effort: 'XL' }, 0)).toBe(0.25);
  });

  it('formats with at most two decimals', () => {
    expect(formatScore(19)).toBe('19');
    expect(formatScore(2.5)).toBe('2.5');
    expect(formatScore(15 / 8)).toBe('1.88');
  });

  it('ranks by score, then the older request first', () => {
    const mk = (score: number, createdAt: string, title = 'x') => ({ score, request: { createdAt, title } });
    const list = [mk(3, '2026-11-02'), mk(5, '2026-11-03'), mk(3, '2026-11-01')];
    expect(list.sort(compareByScore).map((x) => `${x.score}@${x.request.createdAt}`)).toEqual([
      '5@2026-11-03',
      '3@2026-11-01',
      '3@2026-11-02',
    ]);
  });
});
