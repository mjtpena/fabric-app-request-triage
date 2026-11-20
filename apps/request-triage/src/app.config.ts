/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/** First persona = the data-team admin and the default viewer. The other three request data from different teams. */
export const personas: Persona[] = [
  { sub: 'demo-admin', name: 'Jordan Lee', email: 'jordan@example.com', isAdmin: true, role: 'Data team' },
  { sub: 'demo-priya', name: 'Priya Nair', email: 'priya@example.com', isAdmin: false, role: 'Finance' },
  { sub: 'demo-marco', name: 'Marco Silva', email: 'marco@example.com', isAdmin: false, role: 'Sales' },
  { sub: 'demo-hannah', name: 'Hannah Okafor', email: 'hannah@example.com', isAdmin: false, role: 'Operations' },
];

export const config: AppConfig<Schema> = {
  appId: 'request-triage',
  title: 'Data Request Triage',
  tagline: 'A transparent queue for data asks, ranked by value and effort.',
  defs,
  personas,
  seed,
  accent: 'teal',
  // A radar scope: outer and inner range rings, the sweep arm and one blip.
  logoPaths: ['M20.5 12A8.5 8.5 0 1 1 12 3.5', 'M16 12a4 4 0 1 1-4-4', 'M12 12l5.5-5.5', 'M16.5 16h.01'],
  // Phone tab-bar icons are added in main.tsx (this file stays JSX-free for the Node seed tools).
  nav: [
    { to: '/', label: 'Radar', end: true },
    { to: '/board', label: 'Flight board' },
    { to: '/submit', label: 'Flight plan' },
    { to: '/insights', label: 'Insights' },
    { to: '/about', label: 'About' },
  ],
};
