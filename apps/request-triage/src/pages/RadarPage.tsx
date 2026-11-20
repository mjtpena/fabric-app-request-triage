/**
 * Home: the radar. The whole queue on one scope, re-painted by five lenses, with a Today panel that flies the camera
 * to the request behind each item, a view-as switch (data team or requester) and the ranked list as its accessible
 * equivalent. Lens, view and focus live in the URL (?lens=age&view=list&focus=<id>) so they survive reloads.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Keyboard, List as ListIcon, Plus, Radar as RadarIcon, RefreshCw, Search, User, Users } from 'lucide-react';

import { plural, useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Button,
  IconButton,
  Input,
  Legend,
  LensBar,
  LinkButton,
  Skeleton,
  StageMessage,
  StagePage,
  TodayPanel,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useIsDesktop,
  useReducedMotion,
  type LegendItem,
  type LensOption,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { EFFORT_LABEL, STATUS_LABEL } from '../config';
import { loadQueue, type QueueItem } from '../domain/requests';
import { isOpen } from '../domain/status';
import { EFFORTS, STATUSES, type Schema } from '../model';
import { Radar } from '../radar/Radar';
import {
  AGE_BANDS,
  ageBand,
  buildToday,
  EFFORT_COLOR,
  layoutRadar,
  LENS_KEYS,
  SCORE_BANDS,
  scoreBand,
  STATUS_COLOR,
  teamColor,
  type Blip,
  type LensKey,
  type Perspective,
  type RadarLayout,
} from '../radar/model';
import { openShortcuts } from '../shortcuts';
import { QueueList } from './QueueList';

const LENSES: LensOption<LensKey>[] = [
  { value: 'score', label: 'Score', swatch: 'var(--accent-9)', description: 'Priority score bands' },
  { value: 'age', label: 'Age', swatch: 'linear-gradient(90deg, var(--gray-8), var(--amber-9), var(--ember-10))', description: 'How long each request has waited' },
  {
    value: 'team',
    label: 'Team',
    swatch: 'conic-gradient(var(--indigo-9) 0 20%, var(--coral-9) 0 40%, var(--gold-9) 0 60%, var(--plum-9) 0 80%, var(--green-9) 0)',
    description: 'Who asked',
  },
  { value: 'effort', label: 'Effort', swatch: 'linear-gradient(90deg, var(--violet-6), var(--violet-11))', description: 'Size set at triage' },
  { value: 'status', label: 'Status', swatch: 'conic-gradient(var(--info-solid) 0 33%, var(--accent-9) 0 66%, var(--warn-solid) 0)', description: 'Where each request is' },
];

const LENS_NAME: Record<LensKey, string> = { score: 'Score', age: 'Age', team: 'Team', effort: 'Effort', status: 'Status' };

const isLens = (v: string | null): v is LensKey => !!v && (LENS_KEYS as string[]).includes(v);

const ENCODINGS: LegendItem[] = [
  { label: 'Closer · higher rank', shape: 'ring', color: 'var(--accent-8)' },
  { label: 'Bigger · more backers', shape: 'dot', color: 'var(--gray-9)' },
  { label: 'Trail · days waiting', shape: 'line', color: 'var(--gray-9)' },
  { label: 'Blinking · needs triage', shape: 'ring', color: 'var(--warn-solid)' },
];

const YOURS: LegendItem[] = [
  { label: 'Ring · yours', shape: 'ring', color: 'var(--world-ink)' },
  { label: 'Dashed · you back it', shape: 'dash', color: 'var(--world-ink)' },
];

function legendFor(lens: LensKey, layout: RadarLayout): LegendItem[] {
  const open = layout.blips.filter((b) => b.rank);
  const count = (pred: (b: Blip) => boolean) => open.filter(pred).length;
  switch (lens) {
    case 'score':
      return SCORE_BANDS.map((band) => ({ label: band.label, color: band.color, value: count((b) => scoreBand(b.item.score) === band) }));
    case 'age':
      return AGE_BANDS.map((band) => ({ label: band.label, color: band.color, value: count((b) => ageBand(b.ageDays) === band) }));
    case 'team':
      return layout.sectors.map((s) => ({ label: s.team, color: teamColor(s.index), value: s.open }));
    case 'effort':
      return [
        ...EFFORTS.map((e) => ({ label: EFFORT_LABEL[e], color: EFFORT_COLOR[e], value: count((b) => b.item.request.effort === e) })),
        { label: 'Not sized', color: 'var(--gray-9)', shape: 'ring' as const, value: count((b) => !b.item.request.effort) },
      ];
    case 'status':
      return STATUSES.map((s) => ({
        label: STATUS_LABEL[s],
        color: STATUS_COLOR[s],
        shape: isOpen(s) ? ('dot' as const) : s === 'delivered' ? ('diamond' as const) : ('square' as const),
        value: layout.blips.filter((b) => b.item.request.status === s).length,
      }));
  }
}

const todayLabel = (d: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);

export function RadarPage() {
  const { store, me, isAdmin } = useApp<Schema>();
  const queue = useAsync(() => loadQueue(store, me), [store, me.sub]);
  usePolling(queue.reload, 15_000);
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const reduced = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const lens: LensKey = isLens(params.get('lens')) ? (params.get('lens') as LensKey) : 'score';
  const view: StageView = params.get('view') === 'list' ? 'list' : 'stage';
  const focus = params.get('focus');
  const [perspective, setPerspective] = useState<Perspective>(isAdmin ? 'team' : 'requester');
  const [find, setFind] = useState('');
  const findRef = useRef<HTMLInputElement>(null);

  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    if (p.get('lens') === 'score') p.delete('lens');
    if (p.get('view') === 'stage') p.delete('view');
    setParams(p, { replace: true });
  };
  const setLens = (l: LensKey) => patch({ lens: l });
  const setView = (v: StageView) => patch({ view: v });
  const setFocus = (id: string | null) => patch({ focus: id });

  const items = queue.data;
  const now = useMemo(() => new Date(), [items]);
  const layout = useMemo(() => (items ? layoutRadar(items, now, { labelGap: desktop ? 12 : 17 }) : null), [items, now, desktop]);
  const today = useMemo(() => (items ? buildToday(items, perspective, now) : []), [items, perspective, now]);
  const focused = layout?.blips.find((b) => b.id === focus) ?? null;
  const openBlips = layout?.blips.filter((b) => b.rank) ?? [];

  const step = (dir: 1 | -1) => {
    if (!openBlips.length) return;
    const i = openBlips.findIndex((b) => b.id === focus);
    const next = i < 0 ? (dir === 1 ? 0 : openBlips.length - 1) : (i + dir + openBlips.length) % openBlips.length;
    setFocus(openBlips[next].id);
  };
  useHotkeys(
    {
      j: () => step(1),
      k: () => step(-1),
      escape: focus ? () => setFocus(null) : undefined,
      '/': () => findRef.current?.focus(),
    },
    { enabled: view === 'stage' },
  );
  // Enter opens the focused request, but only when nothing else has keyboard focus (links and buttons keep Enter).
  useEffect(() => {
    if (view !== 'stage' || !focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.tagName !== 'svg') return;
      navigate(`/requests/${focus}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, focus, navigate]);

  const flyTo = (e: React.FormEvent) => {
    e.preventDefault();
    const q = find.trim().toLowerCase();
    if (!q || !items) return;
    const hit = items.find((i) => i.request.title.toLowerCase().includes(q)) ?? items.find((i) => i.request.team.toLowerCase().includes(q));
    if (hit) {
      setFocus(hit.request.id);
      setFind('');
      findRef.current?.blur();
    }
  };

  const openCount = openBlips.length;
  const late = items?.filter((i) => i.needsTriage).length ?? 0;
  const closed = (items?.length ?? 0) - openCount;
  const mine = items?.filter((i) => i.mine && isOpen(i.request.status)) ?? [];
  const todayItems: TodayItem[] = today.map((t) => ({
    id: t.id,
    title: t.title,
    severity: t.severity,
    value: t.value,
    unit: t.unit,
    lens: LENS_NAME[t.lens],
    meta: t.meta,
  }));

  const stage = queue.error && !items ? (
    <StageMessage
      icon={<RadarIcon />}
      title="The radar lost contact"
      action={
        <Button icon={<RefreshCw aria-hidden="true" />} onClick={() => void queue.reload()}>
          Retry
        </Button>
      }
    >
      {queue.error.message}
    </StageMessage>
  ) : !layout ? (
    <RadarSkeleton />
  ) : layout.blips.length === 0 ? (
    <StageMessage
      icon={<RadarIcon />}
      title="Clear skies"
      action={
        <LinkButton to="/submit" variant="primary" icon={<Plus aria-hidden="true" />}>
          File the first flight plan
        </LinkButton>
      }
    >
      No requests on the radar yet.
    </StageMessage>
  ) : (
    <Radar
      layout={layout}
      lens={lens}
      perspective={perspective}
      focus={focus}
      onFocus={setFocus}
      onOpen={(id) => navigate(`/requests/${id}`)}
      reduced={reduced}
      zoom={desktop ? 1.6 : 1.5}
      compact={!desktop}
      className={desktop ? 'w-[calc(100%-var(--side-w,0px))]! top-14! bottom-16!' : undefined}
    />
  );

  const meta = items ? (
    <>
      <span className="num">
        {openCount} open · {closed} closed
      </span>
      {late > 0 && <span className="text-warn-text num">{plural(late, 'needs', 'need')} triage</span>}
      {perspective === 'requester' && mine.length > 0 && <span className="num">Yours: {mine.map((m) => `#${openBlips.findIndex((b) => b.id === m.request.id) + 1}`).join(', ')}</span>}
    </>
  ) : (
    <Skeleton width={160} height={14} />
  );

  return (
    <StagePage
      label="Request radar"
      view={view}
      breadcrumb={[
        { label: 'Radar', onClick: () => setFocus(null) },
        { label: focused ? `${focused.team} sector` : 'All sectors' },
      ]}
      title="Request radar"
      meta={meta}
      topRight={
        <>
          <form onSubmit={flyTo} className="relative w-full sm:w-auto" role="search">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-faint" />
            <label htmlFor="rt-find" className="sr-only">
              Find a request
            </label>
            <Input
              ref={findRef}
              id="rt-find"
              list="rt-find-list"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find a request…"
              autoComplete="off"
              className={view === 'stage' && desktop ? 'x-glass w-52 rounded-full! pl-8' : 'w-full pl-8 sm:w-52'}
            />
            <datalist id="rt-find-list">
              {items?.map((i) => <option key={i.request.id} value={i.request.title} />)}
            </datalist>
          </form>
          <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Radar" stageIcon={<RadarIcon />} listIcon={<ListIcon />} />
          {desktop && (
            <IconButton
              label="Keyboard shortcuts (?)"
              icon={<Keyboard />}
              variant="ghost"
              className={view === 'stage' ? 'x-glass rounded-full!' : undefined}
              onClick={openShortcuts}
            />
          )}
          <LinkButton to="/submit" variant="primary" icon={<Plus aria-hidden="true" />} className={view === 'stage' && desktop ? 'rounded-full! shadow-[var(--shadow-float)]' : undefined}>
            Flight plan
          </LinkButton>
        </>
      }
      lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} showLabel={!desktop} />}
      legend={
        layout && (
          <Legend
            key={desktop ? 'd' : 'm'}
            title={`${LENS_NAME[lens]} lens`}
            items={[
              ...legendFor(lens, layout),
              ...(desktop ? ENCODINGS : []),
              ...(perspective === 'requester' ? YOURS : []),
            ]}
            collapsible
            defaultOpen={desktop}
          />
        )
      }
      bottomRight={
        <ViewAsSwitch
          value={perspective}
          onChange={setPerspective}
          options={[
            { value: 'team', label: 'Data team', icon: desktop ? undefined : <Users /> },
            { value: 'requester', label: 'Requester', icon: desktop ? undefined : <User /> },
          ]}
        />
      }
      side={
        <TodayPanel
          bare
          items={todayItems}
          date={todayLabel(now)}
          activeId={focus}
          empty={perspective === 'team' ? 'Nothing waiting on the data team.' : 'Nothing of yours on the radar.'}
          onSelect={(it) => {
            const t = today.find((x) => x.id === it.id);
            patch({ focus: it.id, lens: t?.lens ?? lens, view: null });
          }}
        />
      }
      sideCount={todayItems.length}
      stage={stage}
      list={items ? <QueueList items={items} reload={queue.reload} focus={focus} onFocus={(id) => patch({ focus: id, view: null })} /> : <ListSkeleton />}
    />
  );
}

function RadarSkeleton() {
  return (
    <div role="status" aria-label="Loading the radar" className="absolute inset-0 grid place-items-center">
      <div className="relative aspect-square h-[min(70%,560px)] max-w-[86%] rounded-full border border-line bg-[color-mix(in_oklab,var(--accent-3)_60%,transparent)]">
        <div className="absolute inset-[18%] rounded-full border border-line" />
        <div className="absolute inset-[36%] rounded-full border border-line" />
        <div className="rt-skeleton-sweep absolute inset-0 rounded-full" />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-[var(--line)] rounded-xl border border-line bg-surface">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton width={24} height={14} />
          <div className="flex-1">
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={12} className="mt-2" />
          </div>
          <Skeleton width={40} height={20} />
        </div>
      ))}
    </div>
  );
}

export type { QueueItem };
