/**
 * The flight plan's duplicate radar. Your draft sits at the centre; every open request is a blip in its team's sector,
 * and its range is how many key title words it shares with your draft (two or more = a likely duplicate, drawn close
 * and numbered like the suggestion list). Blips glide inward as you type.
 */
import { useMemo } from 'react';

import { cx } from '@x10/shared/ui';

import { sharedTokens, type DuplicateMatch } from '../domain/duplicates';
import { teamsOf } from '../domain/requests';
import type { DataRequest } from '../model';
import { polar, sectorsFor, wedgePath } from './model';

const MR = 100;

export function rangeFor(shared: number): number {
  if (shared >= 3) return MR * 0.2;
  if (shared === 2) return MR * 0.36;
  if (shared === 1) return MR * 0.62;
  return MR * 0.86;
}

export function MiniRadar({
  title,
  team,
  open,
  matches,
  reduced,
  className,
}: {
  title: string;
  team: string;
  /** Open requests (the candidates). */
  open: DataRequest[];
  matches: DuplicateMatch[];
  reduced: boolean;
  className?: string;
}) {
  const sectors = useMemo(() => sectorsFor(teamsOf(open)), [open]);
  const matchIndex = new Map(matches.map((m, i) => [m.request.id, i + 1]));
  const blips = useMemo(() => {
    const byTeam = new Map<string, DataRequest[]>();
    for (const r of open) byTeam.set(r.team.trim(), [...(byTeam.get(r.team.trim()) ?? []), r]);
    return sectors.flatMap((s) => {
      const list = byTeam.get(s.team) ?? [];
      return list.map((r, k) => ({ r, angle: s.start + 8 + ((s.end - s.start - 16) * (k + 0.5)) / list.length }));
    });
  }, [open, sectors]);
  const typed = title.trim().length > 0;
  const myTeam = team.trim().toLowerCase();

  return (
    <svg
      viewBox="-118 -118 236 236"
      className={cx('rt-mini block h-auto w-full', className)}
      role="img"
      aria-label={
        matches.length
          ? `Duplicate radar: ${matches.length} similar open ${matches.length === 1 ? 'request' : 'requests'} close to your draft.`
          : `Duplicate radar: ${open.length} open requests, none close to your draft.`
      }
    >
      <defs>
        <radialGradient id="rtm-disc" r="0.5" cx="0.5" cy="0.5">
          <stop offset="0" style={{ stopColor: 'var(--rt-disc-1)' }} />
          <stop offset="0.85" style={{ stopColor: 'var(--rt-disc-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--rt-disc-3)' }} />
        </radialGradient>
      </defs>
      <circle r={MR + 4} fill="none" stroke="var(--rt-rim)" strokeWidth={8} opacity={0.6} />
      <circle r={MR} fill="url(#rtm-disc)" stroke="var(--rt-line-strong)" />
      {sectors.map((s) =>
        myTeam && s.team.toLowerCase() === myTeam ? <path key={`w${s.team}`} d={wedgePath(0, MR, s.start, s.end)} fill="var(--accent-9)" opacity={0.08} /> : null,
      )}
      {[0.36, 0.62, 0.86].map((k) => (
        <circle key={k} r={MR * k + (k === 0.36 ? 7 : 0)} fill="none" stroke="var(--rt-line)" strokeDasharray={k === 0.36 ? '3 3' : undefined} />
      ))}
      {sectors.map((s) => {
        const a = polar(MR, s.start);
        return <line key={s.team} x1={0} y1={0} x2={a.x} y2={a.y} stroke="var(--rt-line)" />;
      })}
      {!reduced && (
        <g aria-hidden="true">
          {Array.from({ length: 10 }, (_, k) => (
            <path key={k} d={wedgePath(0, MR - 1, -4 * (k + 1), -4 * k)} fill="var(--rt-sweep)" opacity={0.16 * Math.pow(1 - k / 10, 2)} />
          ))}
          <line x1={0} y1={0} x2={0} y2={-(MR - 1)} stroke="var(--rt-sweep)" strokeWidth={1.25} opacity={0.8} />
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="5s" repeatCount="indefinite" />
        </g>
      )}
      {blips.map(({ r, angle }) => {
        const shared = typed ? sharedTokens(title, r.title).length : 0;
        const n = matchIndex.get(r.id);
        const p = polar(rangeFor(n ? Math.max(2, shared) : Math.min(shared, 1)), angle);
        return (
          <g key={r.id} className="rt-mini-blip" style={{ transform: `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)` }}>
            {n ? (
              <>
                <line x1={0} y1={0} x2={-p.x} y2={-p.y} stroke="var(--accent-9)" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
                <circle r={9} fill="var(--accent-9)" opacity={0.2} />
                <circle r={5.5} fill="var(--accent-9)" stroke="var(--rt-blip-edge)" />
                <text x={8} y={-6} className="rt-mini-num">
                  {n}
                </text>
              </>
            ) : (
              <circle r={shared ? 3.5 : 2.5} fill={shared ? 'var(--gray-10)' : 'var(--gray-8)'} opacity={shared ? 0.9 : 0.6} />
            )}
          </g>
        );
      })}
      <circle r={6} fill="var(--accent-9)" stroke="var(--rt-disc-2)" strokeWidth={2} />
      {typed && !reduced && (
        <circle r={6} fill="none" stroke="var(--accent-9)" strokeWidth={1.5}>
          <animate attributeName="r" values="6;18" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      <text x={0} y={22} textAnchor="middle" className="rt-mini-you">
        {typed ? 'YOUR DRAFT' : 'START TYPING'}
      </text>
    </svg>
  );
}
