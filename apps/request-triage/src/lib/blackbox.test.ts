import { describe, expect, it } from 'vitest';

import type { StatusChange } from '../model';
import { daysByStatus, segments, shortDuration, stagesFor } from './blackbox';

const at = (d: number) => new Date(Date.UTC(2026, 10, 1 + d)).toISOString();
const ch = (id: string, from: StatusChange['fromStatus'], to: StatusChange['toStatus'], d: number): StatusChange => ({
  id,
  requestId: 'r',
  fromStatus: from,
  toStatus: to,
  bySub: 's',
  byName: 'S',
  note: null,
  at: at(d),
});

describe('black box', () => {
  const trail = [ch('1', null, 'new', 0), ch('2', 'new', 'triaged', 2), ch('3', 'triaged', 'planned', 5), ch('4', 'planned', 'in_progress', 6), ch('5', 'in_progress', 'planned', 9)];

  it('runs the last segment of an open request to now', () => {
    const s = segments({ status: 'planned' }, trail, new Date(at(10)));
    expect(s.map((x) => Math.round(x.days))).toEqual([2, 3, 1, 3, 1]);
  });

  it('sums time per status across returns', () => {
    const held = daysByStatus(segments({ status: 'planned' }, trail, new Date(at(10))));
    expect(Math.round(held.planned!)).toBe(2);
    expect(Math.round(held.in_progress!)).toBe(3);
  });

  it('gives a closed request a zero-length final segment', () => {
    const s = segments({ status: 'declined' }, [ch('1', null, 'new', 0), ch('2', 'new', 'declined', 4)], new Date(at(30)));
    expect(s[1]).toMatchObject({ status: 'declined', to: null, days: 0 });
  });

  it('ends the path in declined or delivered', () => {
    expect(stagesFor('declined').at(-1)).toBe('declined');
    expect(stagesFor('planned').at(-1)).toBe('delivered');
  });

  it('formats durations', () => {
    expect(shortDuration(3.4)).toBe('3d');
    expect(shortDuration(0.25)).toBe('6h');
    expect(shortDuration(0.01)).toBe('<1h');
  });
});
