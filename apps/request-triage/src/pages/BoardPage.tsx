/**
 * Flight board: every request in a lane by status, highest score first, with the departures-board caption for each
 * status. The data team moves cards with "Move" (only the moves the rules allow); a moved card glides to its new lane.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, Plus, Radar } from 'lucide-react';

import { plural, useAsync, usePolling } from '@x10/shared/lib';
import { LayoutGroup, motion, MotionProvider, layoutSpring } from '@x10/shared/motion';
import { useApp } from '@x10/shared/runtime';
import { cx, EmptyState, ErrorPanel, FilterSelect, LinkButton, PageHeader, Skeleton, Toast } from '@x10/shared/ui';

import { FLIGHT_STATUS, MoveDialog, MoveMenu, NeedsTriageChip, StaleBanner, StatusMark, teamCode } from '../components';
import { STATUS_LABEL } from '../config';
import { loadQueue, teamsOf, type QueueItem } from '../domain/requests';
import { formatScore } from '../domain/score';
import { isOpen } from '../domain/status';
import { formatTarget, isOverdue } from '../lib/dates';
import { STATUSES, type Schema, type Status } from '../model';
import { ageDays, teamColor } from '../radar/model';

/** Closed lanes can grow forever; show the most recent ones. */
const CLOSED_LIMIT = 6;

export function BoardPage() {
  const { store, me, isAdmin } = useApp<Schema>();
  const board = useAsync(() => loadQueue(store, me), [store, me.sub]);
  // Keep the board fresh while it is open, so stale moves are rare (they are still refused if they happen).
  usePolling(board.reload, 15_000);
  const [team, setTeam] = useState('');
  const [moving, setMoving] = useState<{ item: QueueItem; to: Status } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const items = board.data;
  const teams = useMemo(() => teamsOf((items ?? []).map((i) => i.request)), [items]);
  const open = items?.filter((i) => isOpen(i.request.status)).length ?? 0;
  const late = items?.filter((i) => i.needsTriage).length ?? 0;

  return (
    <>
      <PageHeader
        title="Flight board"
        meta={
          items ? (
            <>
              <span className="num">
                {open} open · {(items.length ?? 0) - open} closed
              </span>
              {late > 0 && <span className="text-warn-text num">{plural(late, 'needs', 'need')} triage</span>}
              <span>{isAdmin ? 'Highest score first in every lane' : 'The data team moves the cards'}</span>
            </>
          ) : undefined
        }
        actions={
          <>
            <FilterSelect
              label="Team"
              value={team}
              onChange={setTeam}
              options={[{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t, label: t }))]}
            />
            <LinkButton to="/" icon={<Radar aria-hidden="true" />} className="max-sm:hidden">
              Radar
            </LinkButton>
          </>
        }
      />
      <StaleBanner message={stale} onDismiss={() => setStale(null)} />
      {board.error && !items ? (
        <ErrorPanel error={board.error} onRetry={() => void board.reload()} />
      ) : !items ? (
        <BoardSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Radar />}
          title="The board is empty"
          action={
            <LinkButton to="/submit" variant="primary" icon={<Plus aria-hidden="true" />}>
              File a flight plan
            </LinkButton>
          }
        >
          Requests appear here as soon as they are filed.
        </EmptyState>
      ) : (
        <Board
          items={team ? items.filter((i) => i.request.team === team) : items}
          canMove={isAdmin}
          landed={landed}
          onMove={(item, to) => {
            setStale(null);
            setMoving({ item, to });
          }}
        />
      )}
      <MoveDialog
        request={moving?.item.request ?? null}
        to={moving?.to ?? null}
        supporters={moving?.item.supporters ?? 0}
        candidates={(items ?? []).map((i) => i.request)}
        onClose={() => setMoving(null)}
        onMoved={async (m, moved) => {
          setToast(m);
          setLanded(moved.id);
          window.setTimeout(() => setLanded((l) => (l === moved.id ? null : l)), 2400);
          await board.reload();
        }}
        onStale={async (m) => {
          setStale(m);
          await board.reload();
        }}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Board({
  items,
  canMove,
  landed,
  onMove,
}: {
  items: QueueItem[];
  canMove: boolean;
  landed: string | null;
  onMove: (item: QueueItem, to: Status) => void;
}) {
  const teams = useMemo(() => teamsOf(items.map((i) => i.request)), [items]);
  const ranked = items.filter((i) => isOpen(i.request.status));
  const now = new Date();
  return (
    <MotionProvider>
      <LayoutGroup>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 xl:overflow-visible" data-testid="flight-board">
          {STATUSES.map((status) => {
            const all = items.filter((i) => i.request.status === status);
            const list = isOpen(status)
              ? all
              : [...all].sort((a, b) => b.request.updatedAt.localeCompare(a.request.updatedAt)).slice(0, CLOSED_LIMIT);
            const headingId = `col-${status}`;
            return (
              <section
                key={status}
                aria-labelledby={headingId}
                className="flex w-[84%] shrink-0 snap-start flex-col rounded-xl bg-[color-mix(in_oklab,var(--surface-sunken)_70%,transparent)] p-1.5 ring-1 ring-inset ring-line sm:w-[264px] xl:w-auto xl:min-w-0 xl:flex-1"
                data-testid={`column-${status}`}
              >
                <header className="flex items-start justify-between gap-2 px-2 pb-2.5 pt-2">
                  <div className="min-w-0">
                    <h2 id={headingId} className="m-0 flex items-center gap-2 text-ui font-semibold text-fg">
                      <StatusMark status={status} size={8} />
                      {STATUS_LABEL[status]}
                    </h2>
                    <div className="x-legend-label mt-1 text-faint">{FLIGHT_STATUS[status]}</div>
                  </div>
                  <span
                    className="rounded-md bg-gray-12 px-1.5 py-0.5 font-mono text-ui font-semibold leading-5 text-gray-1 num shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)]"
                    aria-label={plural(all.length, 'request')}
                  >
                    {String(all.length).padStart(2, '0')}
                  </span>
                </header>
                {list.length === 0 ? (
                  <p className="m-0 rounded-lg border border-dashed border-line px-3 py-5 text-center text-ui text-muted">
                    No {STATUS_LABEL[status].toLowerCase()} requests
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {list.map((item) => (
                      <BoardCard
                        key={item.request.id}
                        item={item}
                        rank={ranked.indexOf(item) + 1}
                        teamIndex={teams.indexOf(item.request.team)}
                        canMove={canMove}
                        landed={landed === item.request.id}
                        now={now}
                        onMove={onMove}
                      />
                    ))}
                  </ul>
                )}
                {all.length > list.length && (
                  <Link to="/?view=list" className="mt-2 px-2 pb-1 text-xs text-muted hover:text-fg">
                    {all.length - list.length} older in the list
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      </LayoutGroup>
    </MotionProvider>
  );
}

function BoardCard({
  item,
  rank,
  teamIndex,
  canMove,
  landed,
  now,
  onMove,
}: {
  item: QueueItem;
  rank: number;
  teamIndex: number;
  canMove: boolean;
  landed: boolean;
  now: Date;
  onMove: (item: QueueItem, to: Status) => void;
}) {
  const r = item.request;
  const open = isOpen(r.status);
  const overdue = open && isOverdue(r.targetDate, now);
  const days = ageDays(item, now);
  return (
    <motion.li
      layout="position"
      layoutId={r.id}
      transition={layoutSpring}
      className={cx(
        'group rounded-lg border bg-surface px-3 py-2.5 shadow-xs transition-[border-color,box-shadow] duration-[160ms] hover:border-line-strong',
        landed ? 'border-accent-8 shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-9)_22%,transparent)]' : 'border-line',
      )}
      data-testid="board-card"
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[11px] leading-4 text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-1.5 rounded-full" style={{ background: teamColor(Math.max(0, teamIndex)) }} />
          <span title={r.team}>{teamCode(r.team)}</span>
          {rank > 0 && <span className="text-faint">#{rank}</span>}
        </span>
        <span className="text-ui font-semibold text-fg num" title="Priority score">
          {formatScore(item.score)}
        </span>
      </div>
      <Link to={`/requests/${r.id}`} className="mt-1 line-clamp-2 block text-ui font-medium leading-[18px] text-fg no-underline break-words hover:underline">
        {r.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-0.5 num" title={plural(item.supporters, 'supporter')}>
          <ChevronUp aria-hidden="true" className="size-3" />
          {item.supporters}
        </span>
        <span className="num" title={open ? 'Days waiting' : 'Days from filing to closing'}>
          {days}d
        </span>
        <span className="font-mono" title={r.effort ? `Effort ${r.effort}` : 'Not sized yet'}>
          {r.effort ?? '—'}
        </span>
        {r.targetDate && open && <span className={cx('num', overdue && 'font-medium text-bad-text')}>{overdue ? 'Overdue' : formatTarget(r.targetDate)}</span>}
      </div>
      {(item.needsTriage || (canMove && open)) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {item.needsTriage ? <NeedsTriageChip /> : <span />}
          {canMove && open && <MoveMenu request={r} onPick={(to) => onMove(item, to)} compact />}
        </div>
      )}
    </motion.li>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading the board" className="flex gap-3 overflow-hidden">
      {STATUSES.map((s) => (
        <div key={s} className="w-[84%] shrink-0 rounded-xl bg-surface-sunken p-2 sm:w-[264px] xl:w-auto xl:flex-1">
          <Skeleton width="50%" height={14} />
          <Skeleton width="30%" height={10} className="mt-2" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} height={84} className="mt-2 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
