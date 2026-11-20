import { STATUSES, type Status } from '../model';
import { allowedNext, canTransition, isOpen, needsEffort, transitionProblem } from './status';

const allowed: [Status, Status][] = [
  ['new', 'triaged'],
  ['new', 'declined'],
  ['triaged', 'planned'],
  ['triaged', 'declined'],
  ['planned', 'in_progress'],
  ['planned', 'declined'],
  ['in_progress', 'delivered'],
  ['in_progress', 'planned'],
];

describe('status transitions', () => {
  it('allows exactly the moves in the table', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it('lists the next statuses for each status', () => {
    expect(allowedNext('new')).toEqual(['triaged', 'declined']);
    expect(allowedNext('in_progress')).toEqual(['delivered', 'planned']);
    expect(allowedNext('delivered')).toEqual([]);
    expect(allowedNext('declined')).toEqual([]);
  });

  it('explains refused moves', () => {
    expect(transitionProblem('new', 'triaged')).toBeNull();
    expect(transitionProblem('new', 'delivered')).toBe('A New request can move to Triaged or Declined, not Delivered.');
    expect(transitionProblem('declined', 'new')).toMatch(/closed/);
    expect(transitionProblem('planned', 'planned')).toMatch(/already Planned/);
  });

  it('knows open statuses and which need an effort size', () => {
    expect(STATUSES.filter(isOpen)).toEqual(['new', 'triaged', 'planned', 'in_progress']);
    expect(STATUSES.filter(needsEffort)).toEqual(['triaged', 'planned', 'in_progress', 'delivered']);
  });
});
