/**
 * Flight plan: file a data request. As the title is typed, the duplicate radar pulls similar open requests towards
 * your draft (two or more shared key words) and lists them with "Back this instead". A projected score shows where
 * the request would enter the queue before the data team sizes it.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, PlaneTakeoff } from 'lucide-react';

import { describeError, hasErrors, plural, useAsync, type Errors } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Breadcrumb,
  Button,
  ErrorPanel,
  Field,
  InlineError,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Stat,
  StatStrip,
  TextArea,
  useIsDesktop,
  useReducedMotion,
} from '@x10/shared/ui';

import { StatusChip } from '../components';
import { SCORE, URGENCY_LABEL, VALUE_LABEL } from '../config';
import { findDuplicates, type DuplicateMatch } from '../domain/duplicates';
import { backRequest, loadQueue, submitRequest, teamsOf, validateRequestInput, type QueueItem, type RequestInput } from '../domain/requests';
import { formatScore, scoreParts } from '../domain/score';
import { isOpen } from '../domain/status';
import { limits, URGENCIES, type DataRequest, type Schema, type Urgency } from '../model';
import { MiniRadar } from '../radar/MiniRadar';

export function SubmitPage() {
  const { store, me } = useApp<Schema>();
  const queue = useAsync(() => loadQueue(store, me), [store, me.sub]);
  return (
    <>
      <PageHeader
        eyebrow={<Breadcrumb items={[{ label: 'Radar', to: '/' }, { label: 'Flight plan' }]} />}
        title="Flight plan"
        subtitle="Say what data you need and why. Similar open requests close in on the radar as you type."
      />
      {queue.error && !queue.data ? (
        <ErrorPanel error={queue.error} onRetry={() => void queue.reload()} />
      ) : !queue.data ? (
        <SubmitSkeleton />
      ) : (
        <SubmitForm items={queue.data} />
      )}
    </>
  );
}

const blank: RequestInput = { title: '', description: '', team: '', value: 3, urgency: 'normal' };

function SubmitForm({ items }: { items: QueueItem[] }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [form, setForm] = useState<RequestInput>(blank);
  const [errors, setErrors] = useState<Errors<RequestInput>>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ids = { title: useId(), description: useId(), team: useId(), teams: useId(), value: useId(), urgency: useId() };
  const requests = useMemo(() => items.map((i) => i.request), [items]);
  const teams = useMemo(() => teamsOf(requests), [requests]);
  const matches = useMemo(() => findDuplicates(form.title, requests), [form.title, requests]);
  const open = useMemo(() => items.filter((i) => isOpen(i.request.status)), [items]);

  const update = (patch: Partial<RequestInput>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (tried) setErrors(validateRequestInput(next));
  };

  const submit = async () => {
    setTried(true);
    const e = validateRequestInput(form);
    setErrors(e);
    if (hasErrors(e)) return;
    setBusy(true);
    setFailure(null);
    try {
      const created = await submitRequest(store, me, form);
      navigate(`/requests/${created.id}`, { state: { flash: 'Flight plan filed. Your request is on the radar for the data team.' } });
    } catch (err) {
      setFailure(describeError(err).message);
      setBusy(false);
    }
  };

  const duplicatePanel = <DuplicatePanel title={form.title} team={form.team} open={open.map((i) => i.request)} matches={matches} />;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form
        noValidate
        className="min-w-0 rounded-xl border border-line bg-surface"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="p-4 sm:p-6">
          <Field label="Title" htmlFor={ids.title} required error={errors.title} counter={{ value: form.title.length, max: limits.title.max }} hint="For example “Weekly returns by store”.">
            <Input id={ids.title} value={form.title} onChange={(e) => update({ title: e.target.value })} invalid={!!errors.title} autoComplete="off" controlSize="lg" />
          </Field>
          {!desktop && <div className="mb-5">{duplicatePanel}</div>}
          <Field
            label="Description"
            htmlFor={ids.description}
            required
            error={errors.description}
            counter={{ value: form.description.length, max: limits.description.max }}
            hint="The decision it supports, the fields and filters, how often it should refresh."
          >
            <TextArea id={ids.description} rows={6} value={form.description} onChange={(e) => update({ description: e.target.value })} invalid={!!errors.description} />
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="Team" htmlFor={ids.team} required error={errors.team} counter={{ value: form.team.length, max: limits.team.max }}>
              <Input id={ids.team} list={ids.teams} value={form.team} onChange={(e) => update({ team: e.target.value })} invalid={!!errors.team} />
              <datalist id={ids.teams}>
                {teams.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Value to your team" htmlFor={ids.value} required error={errors.value}>
              <Select id={ids.value} value={form.value} onChange={(e) => update({ value: Number(e.target.value) })} invalid={!!errors.value}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {VALUE_LABEL[v]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Urgency" htmlFor={ids.urgency} required error={errors.urgency}>
              <Select id={ids.urgency} value={form.urgency} onChange={(e) => update({ urgency: e.target.value as Urgency })}>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {URGENCY_LABEL[u]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Projection form={form} open={open} />
          <InlineError error={failure} />
        </div>
        <div className="sticky bottom-[var(--x-bottom-inset)] z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-4 py-3 backdrop-blur-md sm:px-6">
          <span className="hidden text-ui text-muted sm:inline">The data team sizes, plans and moves it from here.</span>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={busy} icon={<PlaneTakeoff aria-hidden="true" />} className="flex-[2] sm:flex-none">
              Submit request
            </Button>
          </div>
        </div>
      </form>
      {desktop && <aside className="lg:sticky lg:top-[calc(var(--header-h)+24px)]">{duplicatePanel}</aside>}
    </div>
  );
}

/** Where the draft would enter the queue today: its score with 0 supporters and the default effort. */
function Projection({ form, open }: { form: RequestInput; open: QueueItem[] }) {
  const p = scoreParts({ value: form.value, urgency: form.urgency, effort: null }, 0);
  const rank = open.filter((i) => i.score > p.score).length + 1;
  return (
    <div className="mb-1 mt-2 rounded-lg bg-surface-sunken" data-testid="projection">
      <StatStrip bare columns={3}>
        <Stat size="sm" label="Projected score" value={formatScore(p.score)} hint={`(${p.valuePoints} + ${p.urgencyPoints}) ÷ ${p.effortWeight}`} />
        <Stat size="sm" label="Enters the queue at" value={`#${rank}`} hint={`of ${open.length + 1} open`} />
        <Stat size="sm" label="Effort" value={SCORE.defaultEffort} hint="Assumed until sized" />
      </StatStrip>
    </div>
  );
}

function DuplicatePanel({ title, team, open, matches }: { title: string; team: string; open: DataRequest[]; matches: DuplicateMatch[] }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const back = async (r: DataRequest) => {
    setBusyId(r.id);
    setFailure(null);
    try {
      const result = await backRequest(store, me, r.id);
      navigate(`/requests/${r.id}`, {
        state: { flash: result === 'added' ? 'You now back this request instead of filing a new one.' : 'You already back this request.' },
      });
    } catch (err) {
      setFailure(describeError(err).message);
      setBusyId(null);
    }
  };
  return (
    <section aria-labelledby="dup-heading" className="rounded-xl border border-line bg-surface" data-testid="duplicate-panel">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3.5">
        <h2 id="dup-heading" className="m-0 text-sm font-semibold">
          Duplicate radar
        </h2>
        <span className="font-mono text-[11px] text-muted num">{plural(open.length, 'open request')}</span>
      </div>
      <div className="mx-auto w-full max-w-[240px] px-4 py-2 lg:max-w-[300px]">
        <MiniRadar title={title} team={team} open={open} matches={matches} reduced={reduced} />
      </div>
      <div aria-live="polite" className="border-t border-line">
        {matches.length === 0 ? (
          <p className="m-0 px-4 py-3 text-ui text-muted">
            {title.trim() ? 'None found. Titles that share two or more key words close in here.' : 'Start typing a title to check for similar requests.'}
          </p>
        ) : (
          <ol className="m-0 list-none divide-y divide-[var(--line)] p-0">
            {matches.map(({ request: r, shared }, i) => (
              <li key={r.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 px-4 py-3" data-testid="duplicate-suggestion">
                <span className="grid size-5 place-items-center rounded-full bg-accent-9 font-mono text-[11px] font-semibold text-accent-contrast">{i + 1}</span>
                <div className="min-w-0">
                  <Link to={`/requests/${r.id}`} className="text-ui font-medium text-fg no-underline hover:underline">
                    {r.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <StatusChip status={r.status} />
                    <span>{r.team}</span>
                    <span>
                      shares {plural(shared.length, 'word')}: {shared.join(', ')}
                    </span>
                  </div>
                  {r.requesterSub === me.sub ? (
                    <p className="m-0 mt-2 text-xs font-medium text-fg">You filed this one.</p>
                  ) : (
                    <Button size="sm" variant="soft" className="mt-2" busy={busyId === r.id} iconRight={<ArrowUpRight aria-hidden="true" />} onClick={() => void back(r)}>
                      Back this instead
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <InlineError error={failure} className="px-4 pb-3" />
      </div>
    </section>
  );
}

function SubmitSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rounded-xl border border-line bg-surface p-6">
        {[40, 140, 40].map((h, i) => (
          <div key={i} className="mb-5">
            <Skeleton width={90} height={12} />
            <Skeleton height={h} className="mt-2" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <Skeleton width={120} height={14} />
        <Skeleton circle width={240} height={240} className="mx-auto mt-4" />
      </div>
    </div>
  );
}
