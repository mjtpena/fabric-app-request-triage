/**
 * The radar's accessible equivalent: the same queue as a ranked list with filters (status, team, mine, search),
 * supporters and the score. Used in the Radar page's list view.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp } from 'lucide-react';

import { describeError, plural } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Badge, Button, Checkbox, cx, EmptyState, FilterSelect, SearchInput, Toast, Toolbar, Tooltip } from '@x10/shared/ui';

import { EffortChip, NeedsTriageChip, StatusChip } from '../components';
import { STATUS_LABEL } from '../config';
import { DEFAULT_FILTER, filterQueue, teamsOf, toggleSupport, type QueueFilter, type QueueItem, type StatusFilter } from '../domain/requests';
import { formatScore } from '../domain/score';
import { isOpen } from '../domain/status';
import { formatTarget, isOverdue } from '../lib/dates';
import { STATUSES, type Schema } from '../model';
import { ageDays } from '../radar/model';

const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All statuses' },
  ...STATUSES.map((s) => ({ value: s as StatusFilter, label: STATUS_LABEL[s] })),
];

export function QueueList({
  items,
  reload,
  focus,
  onFocus,
}: {
  items: QueueItem[];
  reload: () => Promise<void>;
  focus: string | null;
  onFocus?: (id: string) => void;
}) {
  const { store, me } = useApp<Schema>();
  const [filter, setFilter] = useState<QueueFilter>(DEFAULT_FILTER);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const set = (patch: Partial<QueueFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const teams = useMemo(() => teamsOf(items.map((i) => i.request)), [items]);
  const shown = filterQueue(items, filter);
  const ranked = items.filter((i) => isOpen(i.request.status));
  const late = items.filter((i) => i.needsTriage).length;
  const now = new Date();

  const back = async (item: QueueItem) => {
    setBusyId(item.request.id);
    try {
      const on = await toggleSupport(store, me, item.request.id);
      setToast(on ? `You back “${item.request.title}”.` : `You no longer back “${item.request.title}”.`);
      await reload();
    } catch (e) {
      setToast(describeError(e).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <p className="mt-0 mb-3 text-ui text-muted num" data-testid="queue-summary">
        {plural(ranked.length, 'open request')} ranked by score · {late} waiting too long for triage
      </p>
      <Toolbar>
        <SearchInput value={filter.search} onChange={(v) => set({ search: v })} label="Search requests" placeholder="Search titles, people…" shortcut="/" />
        <FilterSelect label="Status" value={filter.status} onChange={(v) => set({ status: v })} options={statusOptions} />
        <FilterSelect
          label="Team"
          value={filter.team}
          onChange={(v) => set({ team: v })}
          options={[{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t, label: t }))]}
        />
        <Checkbox label="Only mine" checked={filter.mine} onChange={(v) => set({ mine: v })} />
      </Toolbar>
      {shown.length === 0 ? (
        <EmptyState title="Nothing matches these filters" action={<Button onClick={() => set(DEFAULT_FILTER)}>Clear filters</Button>}>
          Try another status or team, or clear the search.
        </EmptyState>
      ) : (
        <ol
          className="m-0 list-none divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface p-0"
          aria-label="Ranked requests"
          data-testid="queue-list"
        >
          <li aria-hidden="true" className="hidden grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.5rem_4rem] gap-x-3 bg-surface-sunken px-4 py-2 sm:grid">
            <span className="x-legend-label text-right text-faint">Rank</span>
            <span className="x-legend-label text-faint">Request</span>
            <span className="x-legend-label text-right text-faint">Waiting</span>
            <span className="x-legend-label text-right text-faint">Backers</span>
            <span className="x-legend-label text-right text-faint">Score</span>
          </li>
          {shown.map((item) => {
            const r = item.request;
            const rank = ranked.indexOf(item) + 1;
            const mine = r.requesterSub === me.sub;
            const canBack = isOpen(r.status) && !mine;
            const overdue = isOverdue(r.targetDate, now) && isOpen(r.status);
            const days = ageDays(item, now);
            return (
              <li
                key={r.id}
                className={cx(
                  'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 px-3 py-3 transition-colors duration-[120ms] hover:bg-[var(--row-hover)] sm:grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_4.5rem_4rem] sm:items-center sm:px-4',
                  focus === r.id && 'bg-accent-2',
                )}
                data-testid="queue-item"
              >
                <div className="pt-0.5 text-right font-mono text-ui text-muted num sm:pt-0">
                  {rank ? (
                    <>
                      <span className="sr-only">Rank </span>#{rank}
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">–</span>
                      <span className="sr-only">Closed, not ranked</span>
                    </>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link to={`/requests/${r.id}`} className="font-medium text-fg no-underline break-words hover:underline">
                      {r.title}
                    </Link>
                    {item.needsTriage && <NeedsTriageChip />}
                    {item.mine && (
                      <Badge tone="brand" variant="soft" size="sm">
                        Yours
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
                    <StatusChip status={r.status} />
                    <span>{r.team}</span>
                    <span>{r.requesterName}</span>
                    <EffortChip effort={r.effort} />
                    {r.targetDate && (
                      <span className={overdue ? 'font-medium text-bad-text' : undefined}>
                        Target {formatTarget(r.targetDate)}
                        {overdue ? ' (overdue)' : ''}
                      </span>
                    )}
                    {onFocus && isOpen(r.status) && (
                      <button type="button" className="cursor-pointer text-ui text-accent-11 hover:underline" onClick={() => onFocus(r.id)}>
                        Show on radar
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col-reverse items-end gap-1 sm:contents">
                  <div className="hidden text-right font-mono text-ui text-muted num sm:block" title="Days since submitted">
                    {days}d
                  </div>
                  <div className="sm:text-right">
                    <Tooltip content={!canBack ? (mine ? 'Your own request' : 'Closed requests take no supporters') : item.backedByMe ? 'Stop backing' : 'Back this request'}>
                      <Button
                        size="sm"
                        variant={item.backedByMe ? 'soft' : 'ghost'}
                        aria-pressed={item.backedByMe}
                        aria-label={`${item.backedByMe ? 'Stop backing' : 'Back'} “${r.title}”, ${plural(item.supporters, 'supporter')}`}
                        disabled={!canBack}
                        busy={busyId === r.id}
                        icon={<ChevronUp aria-hidden="true" />}
                        className="font-mono num"
                        onClick={() => void back(item)}
                      >
                        {item.supporters}
                      </Button>
                    </Tooltip>
                  </div>
                  <div className="text-right" title="(value × 2 + urgency + supporters, max 5) ÷ effort weight">
                    <span className="font-mono text-base font-semibold num" data-testid="score">
                      {formatScore(item.score)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
