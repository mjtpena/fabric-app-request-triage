import { needsTriage, workingDaysBetween } from './workdays';

// 2026-11-20 is a Friday.
describe('working days', () => {
  it('counts weekdays after the start day up to the end day', () => {
    expect(workingDaysBetween('2026-11-20T09:00:00Z', '2026-11-20T17:00:00Z')).toBe(0);
    expect(workingDaysBetween('2026-11-20T09:00:00Z', '2026-11-23T08:00:00Z')).toBe(1); // Fri → Mon
    expect(workingDaysBetween('2026-11-21T09:00:00Z', '2026-11-22T09:00:00Z')).toBe(0); // Sat → Sun
    expect(workingDaysBetween('2026-11-16T09:00:00Z', '2026-11-23T09:00:00Z')).toBe(5); // Mon → next Mon
    expect(workingDaysBetween('2026-11-02T09:00:00Z', '2026-11-20T09:00:00Z')).toBe(14);
    expect(workingDaysBetween('2026-11-20T09:00:00Z', '2026-11-10T09:00:00Z')).toBe(0);
  });

  it('flags new requests older than five working days', () => {
    const now = new Date('2026-11-20T09:00:00Z');
    // Fri 13 Nov → Fri 20 Nov: 5 working days, not yet
    expect(needsTriage({ status: 'new', createdAt: '2026-11-13T10:00:00Z' }, now)).toBe(false);
    // Thu 12 Nov → Fri 20 Nov: 6 working days
    expect(needsTriage({ status: 'new', createdAt: '2026-11-12T10:00:00Z' }, now)).toBe(true);
    // A weekend does not count: Sat 14 Nov → Fri 20 Nov is 5 working days
    expect(needsTriage({ status: 'new', createdAt: '2026-11-14T10:00:00Z' }, now)).toBe(false);
  });

  it('only flags requests that are still new', () => {
    const now = new Date('2026-11-20T09:00:00Z');
    expect(needsTriage({ status: 'triaged', createdAt: '2026-10-01T10:00:00Z' }, now)).toBe(false);
    expect(needsTriage({ status: 'declined', createdAt: '2026-10-01T10:00:00Z' }, now)).toBe(false);
  });
});
