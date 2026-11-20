/**
 * The radar scope (SVG). A sweep turns over the queue; every request is a blip that pings as the sweep crosses it.
 * Distance from the centre is rank (closer = higher score), sector is team, size is supporters, the trail is how
 * long it has waited, and stale untriaged blips blink. Hover or focus a blip for its score breakdown; click opens it
 * (on touch the first tap selects it). The camera flies to the focused blip by animating the viewBox.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { plural } from '@x10/shared/lib';
import { cx, LinkButton } from '@x10/shared/ui';

import { SCORE, STATUS_LABEL, URGENCY_LABEL } from '../config';
import { formatScore, scoreParts } from '../domain/score';
import { isOpen } from '../domain/status';
import {
  arcPath,
  blipColor,
  isHollow,
  polar,
  R,
  R_CORE,
  R_LABEL,
  R_OPEN,
  relation,
  teamColor,
  trailDegrees,
  VIEW,
  wedgePath,
  type Blip,
  type LensKey,
  type Perspective,
  type RadarLayout,
} from './model';
import { StatusMark } from '../components';

/** Seconds per sweep revolution. */
export const SWEEP = 6;

interface Camera {
  cx: number;
  cy: number;
  /** Half-width of the visible square in SVG units. */
  half: number;
}

const HOME: Camera = { cx: 0, cy: 0, half: VIEW };
const viewBoxOf = (c: Camera) => `${c.cx - c.half} ${c.cy - c.half} ${c.half * 2} ${c.half * 2}`;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const norm = (deg: number) => ((deg % 360) + 360) % 360;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The part of the radar's box not covered by the stage's floating panels (title, search, legend, the phone Today
 * button, a docked card). Each overlapping panel is cut away from whichever side keeps the most area, so a corner
 * panel trims a side, not the whole width. Coordinates are relative to `host`.
 */
export function safeArea(host: HTMLElement, extraTop = 0): Rect {
  const h = host.getBoundingClientRect();
  const safe: Rect = { left: 0, top: extraTop, right: h.width, bottom: h.height };
  const stage = host.closest('.x-stage-root') ?? host.parentElement;
  const panels = Array.from(stage?.querySelectorAll<HTMLElement>('.x-glass') ?? []).filter((el) => !host.contains(el) && !el.closest('aside'));
  for (const el of panels) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const o = { left: r.left - h.left, top: r.top - h.top, right: r.right - h.left, bottom: r.bottom - h.top };
    if (o.right <= safe.left || o.left >= safe.right || o.bottom <= safe.top || o.top >= safe.bottom) continue;
    const cuts: Rect[] = [
      { ...safe, top: Math.max(safe.top, o.bottom + 8) },
      { ...safe, bottom: Math.min(safe.bottom, o.top - 8) },
      { ...safe, left: Math.max(safe.left, o.right + 8) },
      { ...safe, right: Math.min(safe.right, o.left - 8) },
    ];
    const area = (c: Rect) => Math.max(0, c.right - c.left) * Math.max(0, c.bottom - c.top);
    Object.assign(safe, cuts.reduce((a, b) => (area(b) > area(a) ? b : a)));
  }
  return safe;
}

/** Height reserved at the top of a phone stage for the docked card. */
const DOCK_H = 184;

export function blipLabel(b: Blip): string {
  const r = b.item.request;
  const parts = [
    b.rank ? `Rank ${b.rank}` : STATUS_LABEL[r.status],
    r.title,
    r.team,
    `score ${formatScore(b.item.score)}`,
    plural(b.item.supporters, 'supporter'),
    `waited ${plural(b.ageDays, 'day')}`,
  ];
  if (b.rank) parts.push(STATUS_LABEL[r.status]);
  if (b.item.needsTriage) parts.push('needs triage');
  return parts.join(', ');
}

export function Radar({
  layout,
  lens,
  perspective,
  focus,
  onFocus,
  onOpen,
  reduced,
  zoom = 2,
  compact = false,
  className,
}: {
  layout: RadarLayout;
  lens: LensKey;
  perspective: Perspective;
  focus: string | null;
  onFocus: (id: string | null) => void;
  onOpen: (id: string) => void;
  reduced: boolean;
  zoom?: number;
  /** Phones: bigger type in the scope and the card docked at the top of the stage. */
  compact?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const cam = useRef<Camera>(HOME);
  const [hover, setHover] = useState<string | null>(null);
  const [settled, setSettled] = useState(0);
  const [moving, setMoving] = useState(false);
  const pointer = useRef<string>('mouse');
  const { blips, sectors, rings, openCount } = layout;
  const focused = blips.find((b) => b.id === focus) ?? null;

  // Camera flight to the focused blip (a jump when motion is reduced).
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const from = { ...cam.current };
    let to: Camera = HOME;
    const host = root.current;
    if (focused && host) {
      // Fit the flight to the safe area inside the overlays: centre the blip there and zoom so the neighbourhood
      // around it (and its sector label when it is close) stays clear of the title panel, legend and buttons.
      const W = host.clientWidth || 1;
      const H = host.clientHeight || 1;
      const base = Math.min(W, H) / (2 * VIEW);
      const safe = safeArea(host, compact ? 0 : 0);
      if (compact) safe.top += DOCK_H;
      const sw = Math.max(80, safe.right - safe.left);
      const sh = Math.max(80, safe.bottom - safe.top);
      const sector = sectors.find((x) => x.team === focused.team);
      const lp = sector ? polar(R_LABEL, sector.mid) : { x: focused.x, y: focused.y };
      const toLabel = Math.hypot(lp.x - focused.x, lp.y - focused.y);
      const reach = Math.min(190, Math.max(95, toLabel < 170 ? toLabel + 40 : 95));
      const scale = Math.max(base, Math.min(base * zoom, Math.min(sw, sh) / (2 * reach)));
      const dx = (safe.left + safe.right) / 2 - W / 2;
      const dy = (safe.top + safe.bottom) / 2 - H / 2;
      to = { cx: focused.x - dx / scale, cy: focused.y - dy / scale, half: Math.min(W, H) / (2 * scale) };
    }
    if (reduced) {
      cam.current = to;
      el.setAttribute('viewBox', viewBoxOf(to));
      setSettled((n) => n + 1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = 620;
    setMoving(true);
    const step = (t: number) => {
      const k = ease(Math.min(1, (t - t0) / dur));
      const c = { cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k, half: from.half + (to.half - from.half) * k };
      cam.current = c;
      el.setAttribute('viewBox', viewBoxOf(c));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        setMoving(false);
        setSettled((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setMoving(false);
    };
    // Re-fly only when the focused request or its position changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id, focused?.x, focused?.y, reduced, zoom, compact, sectors]);

  // Keep the card in place when the stage resizes (side panel, window).
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setSettled((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = blips.find((b) => b.id === (hover ?? focus)) ?? null;

  const onBlipPointerDown = (e: ReactPointerEvent) => {
    pointer.current = e.pointerType;
  };
  const activate = (b: Blip) => {
    if (pointer.current === 'touch' && focus !== b.id) {
      onFocus(b.id);
      return;
    }
    onOpen(b.id);
  };

  const begin = (b: Blip) => `${(norm(b.angle) / 360) * SWEEP}s`;
  const ordered = focused ? [...blips.filter((b) => b.id !== focused.id), focused] : blips;

  return (
    <div ref={root} className={cx('absolute inset-0', className)}>
      <svg
        ref={svg}
        viewBox={viewBoxOf(cam.current)}
        preserveAspectRatio="xMidYMid meet"
        className={cx('rt-scope absolute inset-0 h-full w-full select-none', compact && 'is-compact')}
        role="group"
        aria-label={`Radar: ${plural(openCount, 'open request')}, ranked by priority score. Closer to the centre is higher.`}
        onClick={(e) => {
          if (!(e.target as Element).closest('a')) onFocus(null);
        }}
      >
        <defs>
          <radialGradient id="rt-disc" r="0.5" cx="0.5" cy="0.5">
            <stop offset="0" style={{ stopColor: 'var(--rt-disc-1)' }} />
            <stop offset="0.82" style={{ stopColor: 'var(--rt-disc-2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--rt-disc-3)' }} />
          </radialGradient>
          <filter id="rt-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          {blips.map((b, i) => {
            if (!b.rank) return null;
            const tail = polar(b.radius, b.angle - trailDegrees(b.ageDays));
            return (
              <linearGradient key={b.id} id={`rt-trail-${i}`} gradientUnits="userSpaceOnUse" x1={tail.x} y1={tail.y} x2={b.x} y2={b.y}>
                <stop offset="0" style={{ stopColor: blipColor(b, lens), stopOpacity: 0 }} />
                <stop offset="1" style={{ stopColor: blipColor(b, lens), stopOpacity: 0.75 }} />
              </linearGradient>
            );
          })}
        </defs>

        {/* The scope: disc, closed band, team sectors, rank rings, bearing ticks, crosshair. */}
        <g aria-hidden="true" pointerEvents="none">
          <circle r={R + 6} fill="none" stroke="var(--rt-rim)" strokeWidth={12} opacity={0.5} />
          <circle r={R} fill="url(#rt-disc)" stroke="var(--rt-line-strong)" strokeWidth={1.25} />
          {lens === 'team' &&
            sectors.map((s) => (
              <path key={s.team} d={wedgePath(R_CORE * 0.5, R_OPEN + 12, s.start, s.end)} fill={teamColor(s.index)} opacity={0.07} />
            ))}
          <circle r={(R_OPEN + 14 + R) / 2} fill="none" stroke="var(--rt-band)" strokeWidth={R - R_OPEN - 14} />
          <circle r={R_OPEN + 14} fill="none" stroke="var(--rt-line)" strokeWidth={1} strokeDasharray="2 4" />
          {rings.map((r) => (
            <circle key={r.rank} r={r.radius} fill="none" stroke="var(--rt-line)" strokeWidth={1} />
          ))}
          {sectors.map((s) => {
            const a = polar(R_CORE * 0.5, s.start);
            const b = polar(R, s.start);
            return <line key={s.team} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--rt-line)" strokeWidth={1} />;
          })}
          {Array.from({ length: 72 }, (_, k) => {
            const deg = k * 5;
            const major = deg % 30 === 0;
            const a = polar(R - (major ? 10 : 5), deg);
            const b = polar(R, deg);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--rt-line-strong)" strokeWidth={major ? 1.25 : 0.75} opacity={major ? 0.9 : 0.55} />;
          })}
          <line x1={-12} y1={0} x2={12} y2={0} stroke="var(--rt-line-strong)" strokeWidth={1} />
          <line x1={0} y1={-12} x2={0} y2={12} stroke="var(--rt-line-strong)" strokeWidth={1} />
          {rings.map((r) => {
            const bearing = sectors[0]?.end ?? 36;
            const p = polar(r.radius, bearing);
            return (
              <text key={r.rank} x={p.x + 4} y={p.y - 3} className="rt-ring-label">
                #{r.rank}
              </text>
            );
          })}
          {sectors.map((s) => {
            // On phones the side labels hug the rim and run inward, so they never leave the viewBox.
            const side = compact && Math.abs(Math.sin((s.mid * Math.PI) / 180)) > 0.6;
            const p = polar(side ? R - 10 : R_LABEL, s.mid);
            const anchor = side ? (p.x > 0 ? 'end' : 'start') : 'middle';
            return (
              <text
                key={s.team}
                x={p.x}
                y={p.y}
                dy="0.35em"
                textAnchor={anchor}
                className="rt-sector-label"
                style={lens === 'team' ? { fill: teamColor(s.index) } : undefined}
              >
                {s.team.toUpperCase()}
                <tspan className="rt-sector-count"> {s.open}</tspan>
              </text>
            );
          })}
        </g>

        {/* The sweep. */}
        {!reduced && (
          <g aria-hidden="true" pointerEvents="none" className="rt-sweep">
            {Array.from({ length: 14 }, (_, k) => (
              <path key={k} d={wedgePath(0, R - 1, -3 * (k + 1), -3 * k)} fill="var(--rt-sweep)" opacity={0.2 * Math.pow(1 - k / 14, 2.2)} />
            ))}
            <line x1={0} y1={0} x2={0} y2={-(R - 1)} stroke="var(--rt-sweep)" strokeWidth={1.75} strokeLinecap="round" opacity={0.9} />
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur={`${SWEEP}s`} repeatCount="indefinite" />
          </g>
        )}

        {/* Age trails: angular persistence behind each open blip, one degree per day waited. */}
        <g aria-hidden="true" pointerEvents="none">
          {blips.map((b, i) => {
            if (!b.rank || b.ageDays < 1) return null;
            const dim = perspective === 'requester' && !relation(b);
            return (
              <path
                key={b.id}
                d={arcPath(b.radius, b.angle - trailDegrees(b.ageDays), b.angle)}
                fill="none"
                stroke={`url(#rt-trail-${i})`}
                strokeWidth={lens === 'age' ? Math.max(3, b.size * 0.9) : Math.max(2, b.size * 0.55)}
                strokeLinecap="round"
                opacity={dim ? 0.25 : 1}
              />
            );
          })}
        </g>

        {/* Blips. */}
        <g>
          {ordered.map((b) => {
            const r = b.item.request;
            const color = blipColor(b, lens);
            const open = isOpen(r.status);
            const rel = relation(b);
            const dim = (perspective === 'requester' && !rel) || (focus !== null && focus !== b.id && !hover);
            const isFocus = focus === b.id;
            const hollow = isHollow(b, lens);
            const stale = b.item.needsTriage;
            return (
              <a
                key={b.id}
                href={`#/requests/${b.id}`}
                aria-label={blipLabel(b)}
                aria-current={isFocus || undefined}
                data-testid="radar-blip"
                data-rank={b.rank ?? undefined}
                className="rt-blip"
                onPointerDown={onBlipPointerDown}
                onPointerEnter={() => setHover(b.id)}
                onPointerLeave={() => setHover((h) => (h === b.id ? null : h))}
                onFocus={() => setHover(b.id)}
                onBlur={() => setHover((h) => (h === b.id ? null : h))}
                onClick={(e) => {
                  e.preventDefault();
                  activate(b);
                }}
                style={{ opacity: dim ? (perspective === 'requester' && !rel ? 0.3 : 0.45) : 1 }}
              >
                <g transform={`translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`}>
                  <circle r={b.size + 10} fill="transparent" />
                  {open && !hollow && <circle r={b.size * 1.9} fill={color} opacity={0.22} filter="url(#rt-glow)" />}
                  {stale && (
                    <circle r={b.size + 5.5} fill="none" stroke="var(--warn-solid)" strokeWidth={1.75} strokeDasharray={reduced ? '3 2.5' : undefined} className={reduced ? undefined : 'rt-blink'} />
                  )}
                  {open && !reduced && (
                    <circle r={b.size} fill="none" stroke={color} strokeWidth={1.5} opacity={0}>
                      <animate attributeName="r" values={`${b.size};${b.size + 16};${b.size + 16}`} keyTimes="0;0.22;1" dur={`${SWEEP}s`} begin={begin(b)} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0;0" keyTimes="0;0.22;1" dur={`${SWEEP}s`} begin={begin(b)} repeatCount="indefinite" />
                    </circle>
                  )}
                  {open ? (
                    <circle
                      className="rt-core"
                      r={b.size}
                      fill={hollow ? 'var(--rt-disc-2)' : color}
                      stroke={hollow ? color : 'var(--rt-blip-edge)'}
                      strokeWidth={hollow ? 2 : 1}
                      strokeDasharray={hollow ? '3 2' : undefined}
                    >
                      {!reduced && !hollow && (
                        <animate attributeName="opacity" values="1;0.72;0.72;1" keyTimes="0;0.45;0.97;1" dur={`${SWEEP}s`} begin={begin(b)} repeatCount="indefinite" />
                      )}
                    </circle>
                  ) : r.status === 'delivered' ? (
                    <rect className="rt-core" x={-4} y={-4} width={8} height={8} transform="rotate(45)" fill={color} rx={1} />
                  ) : (
                    <g className="rt-core" stroke={color} strokeWidth={2} strokeLinecap="round">
                      <line x1={-4} y1={-4} x2={4} y2={4} />
                      <line x1={4} y1={-4} x2={-4} y2={4} />
                    </g>
                  )}
                  {rel === 'mine' && <circle r={b.size + 4} fill="none" stroke="var(--rt-ink)" strokeWidth={1.75} />}
                  {rel === 'backed' && <circle r={b.size + 4} fill="none" stroke="var(--rt-ink)" strokeWidth={1} strokeDasharray="2 2" />}
                  {isFocus && (
                    <circle r={b.size + 9} fill="none" stroke="var(--accent-9)" strokeWidth={2}>
                      {!reduced && <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />}
                    </circle>
                  )}
                  {b.rank && (
                    <text x={b.size + 3} y={-b.size + 1} className={cx('rt-rank', isFocus && 'is-focus')}>
                      {b.rank}
                    </text>
                  )}
                </g>
              </a>
            );
          })}
        </g>
      </svg>
      {shown && !moving && (
        <BlipCard
          key={shown.id}
          blip={shown}
          root={root}
          pinned={!hover || hover === focus}
          docked={compact}
          tick={settled}
          onOpen={() => onOpen(shown.id)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ hover / focus card */

function BlipCard({
  blip,
  root,
  pinned,
  docked,
  tick,
  onOpen,
}: {
  blip: Blip;
  root: React.RefObject<HTMLDivElement | null>;
  pinned: boolean;
  docked: boolean;
  tick: number;
  onOpen: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const r = blip.item.request;
  const p = scoreParts(r, blip.item.supporters);

  useLayoutEffect(() => {
    const host = root.current;
    const el = card.current;
    const dot = host?.querySelector(`a[href="#/requests/${blip.id}"] .rt-core`);
    if (!host || !el || !dot) return;
    const h = host.getBoundingClientRect();
    const safe = safeArea(host);
    if (docked) {
      setPos({ left: 8, top: safe.top + 8 });
      return;
    }
    const d = dot.getBoundingClientRect();
    const w = el.offsetWidth;
    const ht = el.offsetHeight;
    const gap = 18;
    const cx = d.left - h.left + d.width / 2;
    const cy = d.top - h.top + d.height / 2;
    let left = cx + d.width / 2 + gap;
    if (left + w > h.width - 8) left = cx - d.width / 2 - gap - w;
    left = Math.max(8, Math.min(left, h.width - w - 8));
    const lo = safe.bottom - safe.top >= ht + 16 ? safe.top + 8 : 8;
    const hi = safe.bottom - safe.top >= ht + 16 ? safe.bottom - ht - 8 : h.height - ht - 8;
    const top = Math.max(lo, Math.min(cy - ht / 2, hi));
    setPos({ left, top });
  }, [blip.id, blip.x, blip.y, tick, root, docked]);

  return (
    <div
      ref={card}
      data-testid="blip-card"
      className={cx(
        'x-glass absolute z-10 p-3.5 transition-opacity duration-[160ms]',
        docked ? 'right-2 w-auto' : 'w-[264px]',
        pinned ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, opacity: pos ? 1 : 0 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="x-legend-label text-muted">
          {blip.rank ? `#${blip.rank} · ` : ''}
          {r.team}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <StatusMark status={r.status} />
          {STATUS_LABEL[r.status]}
        </span>
      </div>
      <div className="mt-1.5 text-sm font-semibold leading-5 text-fg">{r.title}</div>
      <dl className="m-0 mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 font-mono text-[12px] leading-4">
        <dt className="text-muted">
          Value {r.value} × {SCORE.valueWeight}
        </dt>
        <dd className="m-0 text-right num">{p.valuePoints}</dd>
        <dt className="text-muted">Urgency {URGENCY_LABEL[r.urgency].toLowerCase()}</dt>
        <dd className="m-0 text-right num">+{p.urgencyPoints}</dd>
        <dt className="text-muted">
          Supporters {blip.item.supporters}
          {blip.item.supporters > SCORE.supporterCap ? ` (max ${SCORE.supporterCap})` : ''}
        </dt>
        <dd className="m-0 text-right num">+{p.supporterPoints}</dd>
        <dt className="text-muted">
          Effort {p.effort}
          {p.effortAssumed ? ' (assumed)' : ''}
        </dt>
        <dd className="m-0 text-right num">÷{p.effortWeight}</dd>
        <dt className="border-t border-line pt-1.5 font-sans text-ui font-medium text-fg">Score</dt>
        <dd className="m-0 border-t border-line pt-1.5 text-right text-base font-semibold text-fg num">{formatScore(p.score)}</dd>
      </dl>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="num">
          {isOpen(r.status) ? 'Waiting' : 'Took'} {plural(blip.ageDays, 'day')}
          {blip.item.needsTriage ? ' · needs triage' : ''}
        </span>
        {pinned && (
          <LinkButton to={`/requests/${blip.id}`} size="sm" variant="soft" iconRight={<ArrowUpRight aria-hidden="true" />} onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}>
            Open
          </LinkButton>
        )}
      </div>
    </div>
  );
}
