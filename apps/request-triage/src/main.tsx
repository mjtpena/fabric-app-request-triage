import { ChartColumn, Info, PlaneTakeoff, Radar, SquareKanban } from 'lucide-react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

/** Phone tab-bar icons, added here so app.config.ts stays JSX-free for the Node seed tools. */
const ICONS: Record<string, React.ReactNode> = {
  '/': <Radar />,
  '/board': <SquareKanban />,
  '/submit': <PlaneTakeoff />,
  '/insights': <ChartColumn />,
  '/about': <Info />,
};

mountApp({ ...config, nav: config.nav.map((n) => ({ ...n, icon: ICONS[n.to] ?? n.icon })) }, <App />);
