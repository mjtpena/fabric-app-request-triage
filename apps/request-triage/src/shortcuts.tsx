/**
 * Keyboard shortcuts: global navigation keys and the "?" cheat sheet. Render <Shortcuts /> once; any button can open
 * the sheet with openShortcuts().
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Dialog, Kbd, useHotkeys } from '@x10/shared/ui';

const EVENT = 'rt:shortcuts';

export function openShortcuts() {
  window.dispatchEvent(new Event(EVENT));
}

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: 'Anywhere',
    keys: [
      [['R'], 'Radar'],
      [['B'], 'Flight board'],
      [['N'], 'New flight plan'],
      [['?'], 'This cheat sheet'],
    ],
  },
  {
    title: 'Radar',
    keys: [
      [['1', '–', '5'], 'Lens: score, age, team, effort, status'],
      [['J'], 'Next blip down the queue'],
      [['K'], 'Previous blip'],
      [['Enter'], 'Open the focused request'],
      [['Esc'], 'Clear focus'],
      [['V'], 'View as data team or requester'],
      [['L'], 'Radar or list'],
      [['/'], 'Find a request'],
    ],
  },
];

export function Shortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useHotkeys({
    'shift+?': () => setOpen(true),
    r: () => navigate('/'),
    b: () => navigate('/board'),
    n: () => navigate('/submit'),
  });
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      <div className="grid gap-5 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="x-legend-label m-0 mb-2 text-muted">{g.title}</h3>
            <dl className="m-0 space-y-1.5">
              {g.keys.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-fg">{what}</dt>
                  <dd className="m-0 flex shrink-0 items-center gap-1">
                    {keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
