import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { BoardPage } from './pages/BoardPage';
import { InsightsPage } from './pages/InsightsPage';
import { RadarPage } from './pages/RadarPage';
import { RequestPage } from './pages/RequestPage';
import { SubmitPage } from './pages/SubmitPage';
import { Shortcuts } from './shortcuts';

export function App() {
  return (
    <>
      <Shortcuts />
      <Routes>
        <Route path="/" element={<AppShell immersive><RadarPage /></AppShell>} />
        <Route path="/submit" element={<AppShell wide><SubmitPage /></AppShell>} />
        <Route path="/requests/:id" element={<AppShell wide><RequestPage /></AppShell>} />
        <Route path="/board" element={<AppShell wide><BoardPage /></AppShell>} />
        <Route path="/insights" element={<AppShell><InsightsPage /></AppShell>} />
        <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
