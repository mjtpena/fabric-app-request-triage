/**
 * A request: what was asked and why, its score (the same breakdown as the radar), where it sits in the queue, the
 * triage controls for the data team, the black box (status recorder: time in each status and the append-only log),
 * comments and supporters.
 */
import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronUp, Pencil, Radar as RadarIcon } from 'lucide-react';

import { describeError, formatDateTime, formatRelative, hasErrors, plural, useAsync, type Errors } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Callout,
  cx,
  Dialog,
  ErrorPanel,
  Field,
  InlineError,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Skeleton,
  Tag,
  TextArea,
  Toast,
  useIsDesktop,
} from '@x10/shared/ui';

import { EffortChip, FLIGHT_STATUS, MoveDialog, NeedsTriageChip, StaleBanner, StatusChip, StatusMark } from '../components';
import { EFFORT_LABEL, SCORE, STATUS_LABEL, URGENCY_LABEL, VALUE_LABEL } from '../config';
import {
  addComment,
  editRequest,
  loadQueue,
  loadRequestDetail,
  toggleSupport,
  updateTriage,
  validateComment,
  validateRequestInput,
  type RequestDetail,
  type RequestInput,
} from '../domain/requests';
import { formatScore } from '../domain/score';
import { allowedNext, isOpen, needsEffort } from '../domain/status';
import { daysByStatus, segments, shortDuration, stagesFor } from '../lib/blackbox';
import { formatTarget, inputToTarget, isOverdue, targetToInput } from '../lib/dates';
import { EFFORTS, limits, URGENCIES, type Effort, type Schema, type Status, type Urgency } from '../model';
import { STATUS_COLOR } from '../radar/model';

interface Position {
  rank: number | null;
  open: number;
}

export function RequestPage() {
  const { id = '' } = useParams();
  const { store, me } = useApp<Schema>();
  const location = useLocation();
  const navigate = useNavigate();
  const detail = useAsync(async () => {
    const [d, queue] = await Promise.all([loadRequestDetail(store, me, id), loadQueue(store, me)]);
    const open = queue.filter((i) => isOpen(i.request.status));
    const k = open.findIndex((i) => i.request.id === id);
    return { d, pos: { rank: k >= 0 ? k + 1 : null, open: open.length } as Position };
  }, [store, id, me.sub]);
  const [toast, setToast] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);

  useEffect(() => {
    const flash = (location.state as { flash?: string } | null)?.flash;
    if (flash) {
      setToast(flash);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  return (
    <>
      <StaleBanner message={stale} onDismiss={() => setStale(null)} />
      {detail.error && !detail.data ? (
        <>
          <ErrorPanel error={detail.error} onRetry={() => void detail.reload()} title={detail.error.category === 'not_found' ? 'This request is not on the radar' : undefined} />
          <p className="mt-4">
            <LinkButton to="/" icon={<RadarIcon aria-hidden="true" />}>
              Back to the radar
            </LinkButton>
          </p>
        </>
      ) : !detail.data ? (
        <RequestSkeleton />
      ) : (
        <RequestView
          d={detail.data.d}
          pos={detail.data.pos}
          reload={detail.reload}
          notify={setToast}
          onStale={async (msg) => {
            setStale(msg);
            await detail.reload();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function RequestView({
  d,
  pos,
  reload,
  notify,
  onStale,
}: {
  d: RequestDetail;
  pos: Position;
  reload: () => Promise<void>;
  notify: (m: string) => void;
  onStale: (m: string) => Promise<void>;
}) {
  const { store, me, isAdmin } = useApp<Schema>();
  const desktop = useIsDesktop();
  const r = d.request;
  const [editing, setEditing] = useState(false);
  const [backing, setBacking] = useState(false);
  const mine = r.requesterSub === me.sub;
  const canBack = isOpen(r.status) && !mine;

  const toggle = async () => {
    setBacking(true);
    try {
      const on = await toggleSupport(store, me, r.id);
      notify(on ? 'You back this request. Its score went up.' : 'You no longer back this request.');
      await reload();
    } catch (e) {
      notify(describeError(e).message);
    } finally {
      setBacking(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb
            items={[
              { label: 'Radar', to: '/' },
              { label: `${r.team} sector`, to: isOpen(r.status) ? `/?focus=${r.id}` : '/?view=list' },
              { label: pos.rank ? `#${pos.rank} of ${pos.open}` : STATUS_LABEL[r.status] },
            ]}
          />
        }
        title={r.title}
        meta={
          <>
            <StatusChip status={r.status} />
            {d.needsTriage && <NeedsTriageChip />}
            <EffortChip effort={r.effort} />
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={r.requesterName} size={18} />
              {r.requesterName}
              {mine ? ' (you)' : ''} · {formatRelative(r.createdAt)}
            </span>
            {isOpen(r.status) && (
              <Link to={`/?focus=${r.id}`} className="inline-flex items-center gap-1 text-accent-11 no-underline hover:underline">
                <RadarIcon aria-hidden="true" className="size-3.5" />
                Show on radar
              </Link>
            )}
          </>
        }
        actions={
          <>
            {mine && isOpen(r.status) && (
              <Button icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(true)}>
                Edit request
              </Button>
            )}
            {canBack && (
              <Button
                variant={d.backedByMe ? 'soft' : 'primary'}
                aria-pressed={d.backedByMe}
                busy={backing}
                icon={<ChevronUp aria-hidden="true" />}
                onClick={toggle}
              >
                {d.backedByMe ? 'You back this' : 'Back this request'}
              </Button>
            )}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {!desktop && <ScorePanel d={d} pos={pos} />}
          {r.status === 'declined' && (
            <div data-testid="decline-reason">
              <Callout tone="bad" title="Declined">
                {r.declineReason}
                {d.duplicateOf && (
                  <span className="mt-1.5 block">
                    Duplicate of <Link to={`/requests/${d.duplicateOf.id}`}>{d.duplicateOf.title}</Link>. Back that request instead.
                  </span>
                )}
              </Callout>
            </div>
          )}

          <section aria-labelledby="desc-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <h2 id="desc-h" className="x-legend-label m-0 mb-2 text-muted">
              The ask
            </h2>
            <p className="m-0 max-w-[68ch] whitespace-pre-wrap break-words text-base leading-6">{r.description}</p>
            {d.duplicates.length > 0 && (
              <p className="mb-0 mt-3 text-ui text-muted">
                Also asked as:{' '}
                {d.duplicates.map((x, i) => (
                  <span key={x.id}>
                    {i > 0 && ', '}
                    <Link to={`/requests/${x.id}`}>{x.title}</Link>
                  </span>
                ))}
              </p>
            )}
          </section>

          {isAdmin && <TriagePanel d={d} reload={reload} notify={notify} onStale={onStale} />}

          <BlackBox d={d} />
          <Comments d={d} reload={reload} />
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--header-h)+24px)]" aria-label="Score and details">
          {desktop && <ScorePanel d={d} pos={pos} />}
          <DetailsPanel d={d} />
          <SupportersPanel d={d} canBack={canBack} />
        </aside>
      </div>
      <EditDialog
        d={d}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          notify('Request updated.');
          await reload();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ score */

function ScorePanel({ d, pos }: { d: RequestDetail; pos: Position }) {
  const p = d.parts;
  const rows: [string, string][] = [
    [`Value ${d.request.value} × ${SCORE.valueWeight}`, `${p.valuePoints}`],
    [`Urgency ${URGENCY_LABEL[d.request.urgency].toLowerCase()}`, `+${p.urgencyPoints}`],
    [`Supporters ${d.supporters.length}${d.supporters.length > SCORE.supporterCap ? ` (max ${SCORE.supporterCap})` : ''}`, `+${p.supporterPoints}`],
    [`Effort ${p.effort}${p.effortAssumed ? ' (assumed until sized)' : ''}`, `÷${p.effortWeight}`],
  ];
  return (
    <section aria-labelledby="score-h" className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="score-h" className="x-legend-label m-0 text-muted">
            Priority score
          </h2>
          <div className="mt-2 font-mono text-4xl font-semibold leading-none tracking-[-0.04em] num" data-testid="detail-score">
            {formatScore(p.score)}
          </div>
        </div>
        <div className="text-right">
          <div className="x-legend-label text-muted">Range</div>
          <div className="mt-2 font-mono text-xl font-semibold leading-none num">{pos.rank ? `#${pos.rank}` : '—'}</div>
          <div className="mt-1 text-xs text-muted num">{pos.rank ? `of ${pos.open} open` : 'Closed'}</div>
        </div>
      </div>
      {pos.rank && <RangeBar rank={pos.rank} open={pos.open} />}
      <table className="mt-3 w-full border-t border-line pt-1 font-mono text-[12px]">
        <caption className="sr-only">How the score is calculated</caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row" className="py-1 text-left font-normal text-muted">
                {k}
              </th>
              <td className="py-1 text-right text-fg num">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The request's range on the radar: one tick per open request, closest (highest score) on the left. */
function RangeBar({ rank, open }: { rank: number; open: number }) {
  return (
    <div className="mt-4" aria-hidden="true">
      <div className="relative flex h-5 items-center gap-[3px]">
        {Array.from({ length: open }, (_, i) => (
          <span
            key={i}
            className={cx('h-2.5 flex-1 rounded-[2px]', i + 1 === rank ? 'h-5 bg-accent-9' : i + 1 < rank ? 'bg-accent-5' : 'bg-gray-4')}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-faint">
        <span>Next up</span>
        <span>Back of queue</span>
      </div>
    </div>
  );
}

function DetailsPanel({ d }: { d: RequestDetail }) {
  const r = d.request;
  const now = new Date();
  const overdue = isOverdue(r.targetDate, now) && isOpen(r.status);
  const rows: [string, React.ReactNode][] = [
    ['Team', r.team],
    ['Value', VALUE_LABEL[r.value] ?? r.value],
    ['Urgency', URGENCY_LABEL[r.urgency]],
    ['Effort', r.effort ? EFFORT_LABEL[r.effort] : 'Not sized yet'],
    ['Assignee', r.assigneeName ?? '—'],
    [
      'Target date',
      <span key="t" className={overdue ? 'font-medium text-bad-text' : undefined}>
        {formatTarget(r.targetDate)}
        {overdue ? ' (overdue)' : ''}
      </span>,
    ],
    ['Filed', formatDateTime(r.createdAt)],
    ['Updated', formatDateTime(r.updatedAt)],
  ];
  return (
    <section aria-labelledby="details-h" className="rounded-xl border border-line bg-surface p-4">
      <h2 id="details-h" className="x-legend-label m-0 mb-3 text-muted">
        Details
      </h2>
      <dl className="m-0 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-ui">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 text-fg">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SupportersPanel({ d, canBack }: { d: RequestDetail; canBack: boolean }) {
  const { me } = useApp<Schema>();
  return (
    <section aria-labelledby="supporters-heading" className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="supporters-heading" className="x-legend-label m-0 text-muted">
          Supporters
        </h2>
        <span className="font-mono text-ui font-semibold num">{d.supporters.length}</span>
      </div>
      {d.supporters.length === 0 ? (
        <p className="m-0 text-ui text-muted">{canBack ? 'No one has backed this yet. Need it too? Back it to raise its score.' : 'No supporters.'}</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0 text-ui" aria-labelledby="supporters-heading" data-testid="supporters">
          {d.supporters.map((s) => (
            <li key={s.sub} className="flex items-center gap-2">
              <Avatar name={s.name} size={22} />
              <span className="min-w-0 flex-1 truncate">
                {s.name}
                {s.sub === me.sub ? ' (you)' : ''}
              </span>
              <span className="text-xs text-muted">{formatRelative(s.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ triage (data team) */

function TriagePanel({
  d,
  reload,
  notify,
  onStale,
}: {
  d: RequestDetail;
  reload: () => Promise<void>;
  notify: (m: string) => void;
  onStale: (m: string) => Promise<void>;
}) {
  const { store, me } = useApp<Schema>();
  const r = d.request;
  const [moveTo, setMoveTo] = useState<Status | null>(null);
  const [effort, setEffort] = useState<Effort | ''>(r.effort ?? '');
  const [assignee, setAssignee] = useState(r.assigneeName ?? '');
  const [target, setTarget] = useState(targetToInput(r.targetDate));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { effort: useId(), assignee: useId(), target: useId() };

  useEffect(() => {
    setEffort(r.effort ?? '');
    setAssignee(r.assigneeName ?? '');
    setTarget(targetToInput(r.targetDate));
  }, [r.effort, r.assigneeName, r.targetDate]);

  const next = allowedNext(r.status);
  const save = async () => {
    if (assignee.trim().length > limits.assigneeName.max) return setErr(`Assignee must be ${limits.assigneeName.max} characters or fewer.`);
    setBusy(true);
    setErr(null);
    try {
      await updateTriage(store, me, r.id, { effort: effort || null, assigneeName: assignee, targetDate: inputToTarget(target) });
      notify('Triage details saved.');
      await reload();
    } catch (e) {
      setErr(describeError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="triage-h"
      className="relative overflow-hidden rounded-xl border border-accent-7 bg-surface p-4 sm:p-5"
      data-testid="triage-panel"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-accent-9" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="triage-h" className="m-0 text-base font-semibold">
          Triage
        </h2>
        <Badge tone="brand" variant="soft" size="sm">
          Data team
        </Badge>
      </div>
      {next.length === 0 ? (
        <p className="m-0 text-ui text-muted">This request is {STATUS_LABEL[r.status]}, so it is closed. Its black box stays below.</p>
      ) : (
        <>
          <p className="m-0 mb-2.5 text-ui text-muted">
            Allowed from {STATUS_LABEL[r.status]}: {next.map((s) => STATUS_LABEL[s]).join(' or ')}.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {next.map((to) => (
              <Button
                key={to}
                variant={to === 'declined' ? 'danger' : 'primary'}
                icon={to === 'declined' ? undefined : <ArrowRight aria-hidden="true" />}
                onClick={() => setMoveTo(to)}
              >
                {to === 'declined' ? 'Decline…' : `Move to ${STATUS_LABEL[to]}…`}
              </Button>
            ))}
          </div>
          <form
            className="grid gap-x-3 border-t border-line pt-4 sm:grid-cols-[10.5rem_minmax(0,1fr)_10rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label="Effort" htmlFor={ids.effort}>
              <Select id={ids.effort} value={effort} onChange={(e) => setEffort(e.target.value as Effort | '')}>
                {!needsEffort(r.status) && <option value="">Not sized</option>}
                {EFFORTS.map((x) => (
                  <option key={x} value={x}>
                    {EFFORT_LABEL[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee" htmlFor={ids.assignee} counter={assignee.length > 80 ? { value: assignee.length, max: limits.assigneeName.max } : undefined}>
              <Input id={ids.assignee} value={assignee} onChange={(e) => setAssignee(e.target.value)} />
            </Field>
            <Field label="Target date" htmlFor={ids.target}>
              <Input id={ids.target} type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            <div className="mb-4">
              <Button type="submit" busy={busy}>
                Save triage details
              </Button>
            </div>
            <div className="sm:col-span-4">
              <InlineError error={err} />
            </div>
          </form>
        </>
      )}
      <MoveDialog
        request={moveTo ? r : null}
        to={moveTo}
        supporters={d.supporters.length}
        candidates={d.others}
        onClose={() => setMoveTo(null)}
        onMoved={async (m) => {
          notify(m);
          await reload();
        }}
        onStale={onStale}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ black box */

const logFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const logTime = (iso: string) => logFmt.format(new Date(iso));

function BlackBox({ d }: { d: RequestDetail }) {
  const r = d.request;
  const now = new Date();
  const segs = segments(r, d.changes, now);
  const total = segs.reduce((a, s) => a + s.days, 0);
  const held = daysByStatus(segs);
  const reached = new Set(d.changes.map((c) => c.toStatus));
  const stages = stagesFor(r.status);
  const logNewestFirst = [...d.changes].reverse();
  return (
    <section aria-labelledby="bb-h" className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
        <h2 id="bb-h" className="m-0 text-base font-semibold">
          Black box
        </h2>
        <span className="x-legend-label text-faint">Status recorder · append-only</span>
      </div>

      {/* Flight path: the stages, what was reached, and time held in each. */}
      <ol className="m-0 mt-4 grid list-none grid-cols-5 gap-1 px-4 sm:px-5" aria-label="Stages">
        {stages.map((s, i) => {
          const hit = reached.has(s);
          const current = r.status === s;
          return (
            <li key={s} className="relative min-w-0">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={cx('absolute right-1/2 top-[7px] -z-0 h-0.5 w-full', hit ? 'bg-[var(--seg)]' : 'bg-line')}
                  style={{ ['--seg' as string]: STATUS_COLOR[s] }}
                />
              )}
              <div className="relative flex flex-col items-center text-center">
                <span
                  className={cx('grid size-4 place-items-center rounded-full ring-4 ring-[var(--surface)]', hit ? '' : 'border-2 border-line-strong bg-surface')}
                  style={hit ? { background: STATUS_COLOR[s] } : undefined}
                >
                  {current && isOpen(s) && <span className="size-1.5 animate-pulse rounded-full bg-[var(--surface)]" />}
                </span>
                <span className={cx('mt-2 truncate text-[11px] font-medium sm:text-ui', hit ? 'text-fg' : 'text-faint')}>{STATUS_LABEL[s]}</span>
                <span className="x-legend-label hidden text-[9px] text-faint sm:block">{FLIGHT_STATUS[s]}</span>
                <span className="mt-0.5 font-mono text-[11px] text-muted num">{held[s] !== undefined && (held[s]! > 0 || current) ? shortDuration(held[s]!) : hit ? '·' : '—'}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* The tape: every segment of the request's life, to scale. */}
      {total > 0 && (
        <div className="px-4 pt-4 sm:px-5">
          <div className="rt-tape flex h-3 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-line" role="img" aria-label={`${shortDuration(total)} on record`}>
            {segs.map((s, i) =>
              s.days > 0 ? (
                <span
                  key={i}
                  title={`${STATUS_LABEL[s.status]} · ${shortDuration(s.days)}`}
                  className="h-full border-r-2 border-[var(--surface)] last:border-0"
                  style={{ width: `${(s.days / total) * 100}%`, background: STATUS_COLOR[s.status] }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-faint num">
            <span>Filed {formatRelative(r.createdAt)}</span>
            <span>{shortDuration(total)} on record</span>
          </div>
        </div>
      )}

      {/* The log, newest first. */}
      <ol className="m-0 mt-4 list-none border-t border-line p-0" data-testid="timeline">
        {logNewestFirst.map((c) => (
          <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:px-5">
            <time dateTime={c.at} className="order-2 text-right font-mono text-[11px] leading-5 text-muted num sm:order-none sm:text-left">
              {logTime(c.at)}
            </time>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ui">
                {c.fromStatus ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusMark status={c.fromStatus} />
                      {STATUS_LABEL[c.fromStatus]}
                    </span>
                    <span aria-label="to" className="text-faint">
                      →
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <StatusMark status={c.toStatus} />
                      {STATUS_LABEL[c.toStatus]}
                    </span>
                    <span className="text-muted">by {c.byName}</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <StatusMark status={c.toStatus} />
                      {STATUS_LABEL[c.toStatus]}
                    </span>
                    <span className="text-muted">submitted by {c.byName}</span>
                  </>
                )}
              </div>
              {c.note && c.note !== 'Submitted' && <p className="m-0 mt-1 text-ui text-muted">“{c.note}”</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0 border-t border-line bg-surface-sunken px-4 py-2 text-xs text-muted sm:px-5">
        {plural(d.changes.length, 'entry', 'entries')}. Entries are never edited or removed.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ comments */

function Comments({ d, reload }: { d: RequestDetail; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const post = async () => {
    const msg = validateComment(body);
    setErr(msg);
    if (msg) return;
    setBusy(true);
    try {
      await addComment(store, me, d.request.id, body);
      setBody('');
      await reload();
    } catch (e) {
      setErr(describeError(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="comments-h" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="comments-h" className="m-0 text-base font-semibold">
          Comments
        </h2>
        <span className="font-mono text-ui text-muted num">{d.comments.length}</span>
      </div>
      {d.comments.length === 0 ? (
        <p className="mt-0 text-ui text-muted">No comments yet. Add context, ask a question, or say how you would use the data.</p>
      ) : (
        <ul className="m-0 mb-4 list-none space-y-4 p-0" data-testid="comments">
          {d.comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.authorName} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-ui">
                  <span className="font-medium">{c.authorName}</span>
                  {c.authorSub === d.request.requesterSub && (
                    <Tag size="sm" mono>
                      requester
                    </Tag>
                  )}
                  <span className="text-xs text-muted" title={formatDateTime(c.createdAt)}>
                    {formatRelative(c.createdAt)}
                  </span>
                </div>
                <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        className="border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
      >
        <Field label="Add a comment" htmlFor={id} error={err} counter={{ value: body.length, max: limits.comment.max }}>
          <TextArea id={id} rows={3} value={body} onChange={(e) => setBody(e.target.value)} invalid={!!err} />
        </Field>
        <Button type="submit" busy={busy}>
          Post comment
        </Button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ edit */

function EditDialog({ d, open, onClose, onSaved }: { d: RequestDetail; open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const r = d.request;
  const asInput = (): RequestInput => ({ title: r.title, description: r.description, team: r.team, value: r.value, urgency: r.urgency });
  const [form, setForm] = useState<RequestInput>(asInput);
  const [errors, setErrors] = useState<Errors<RequestInput>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { title: useId(), description: useId(), team: useId(), value: useId(), urgency: useId() };
  const locked = r.status !== 'new';

  useEffect(() => {
    if (open) {
      setForm(asInput());
      setErrors({});
      setFailure(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const e = validateRequestInput(form);
    setErrors(e);
    if (hasErrors(e)) return;
    setBusy(true);
    setFailure(null);
    try {
      await editRequest(store, me, r.id, form);
      await onSaved();
    } catch (err) {
      setFailure(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (p: Partial<RequestInput>) => setForm((f) => ({ ...f, ...p }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit request"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      {locked && (
        <Callout tone="info" className="mb-4">
          The data team has triaged this request, so only the description can change. Ask in a comment for anything else.
        </Callout>
      )}
      <Field label="Title" htmlFor={ids.title} required error={errors.title} counter={locked ? undefined : { value: form.title.length, max: limits.title.max }}>
        <Input id={ids.title} value={form.title} disabled={locked} onChange={(e) => set({ title: e.target.value })} invalid={!!errors.title} />
      </Field>
      <Field label="Description" htmlFor={ids.description} required error={errors.description} counter={{ value: form.description.length, max: limits.description.max }}>
        <TextArea id={ids.description} rows={6} value={form.description} onChange={(e) => set({ description: e.target.value })} invalid={!!errors.description} />
      </Field>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Team" htmlFor={ids.team} required error={errors.team}>
          <Input id={ids.team} value={form.team} disabled={locked} onChange={(e) => set({ team: e.target.value })} invalid={!!errors.team} />
        </Field>
        <Field label="Value" htmlFor={ids.value} required>
          <Select id={ids.value} value={form.value} disabled={locked} onChange={(e) => set({ value: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {VALUE_LABEL[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Urgency" htmlFor={ids.urgency} required>
          <Select id={ids.urgency} value={form.urgency} disabled={locked} onChange={(e) => set({ urgency: e.target.value as Urgency })}>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABEL[u]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <InlineError error={failure} />
    </Dialog>
  );
}

function RequestSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton width={220} height={12} />
      <Skeleton width="60%" height={28} className="mt-3" />
      <Skeleton width="40%" height={14} className="mt-3" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Skeleton height={140} className="rounded-xl" />
          <Skeleton height={260} className="rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton height={200} className="rounded-xl" />
          <Skeleton height={240} className="rounded-xl" />
        </div>
      </div>
    </div>
  );
}
