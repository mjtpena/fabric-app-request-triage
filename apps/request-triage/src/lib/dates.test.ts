import { formatTarget, inputToTarget, isOverdue, targetToInput } from './dates';

describe('target dates', () => {
  it('round-trips a date input through the stored value', () => {
    expect(inputToTarget('2026-12-01')).toBe('2026-12-01T12:00:00.000Z');
    expect(targetToInput('2026-12-01T12:00:00.000Z')).toBe('2026-12-01');
    expect(inputToTarget('')).toBeNull();
    expect(inputToTarget('not a date')).toBeNull();
    expect(targetToInput(null)).toBe('');
  });

  it('formats in UTC so the picked day is shown', () => {
    expect(formatTarget('2026-12-01T12:00:00.000Z')).toContain('2026');
    expect(formatTarget(null)).toBe('—');
  });

  it('knows when a target date has passed', () => {
    const now = new Date('2026-11-20T09:00:00Z');
    expect(isOverdue('2026-11-19T12:00:00.000Z', now)).toBe(true);
    expect(isOverdue('2026-11-20T12:00:00.000Z', now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
});
