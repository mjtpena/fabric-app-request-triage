import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronDown } from 'lucide-react';

import { describeError } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Badge, Button, Callout, cx, Dialog, Field, InlineError, Input, Select, StatusDot, Tag, TextArea, type Tone } from '@x10/shared/ui';

import { EFFORT_LABEL, NEEDS_TRIAGE_WORKING_DAYS, STATUS_LABEL } from './config';
import { StaleStateError, transitionRequest } from './domain/requests';
import { allowedNext, needsEffort, STATUS_TONE } from './domain/status';
import { inputToTarget, targetToInput } from './lib/dates';
import { EFFORTS, limits, type DataRequest, type Effort, type Schema, type Status } from './model';

/** Flight-board captions for each status (the departures-board wording next to the real status). */
export const FLIGHT_STATUS: Record<Status, string> = {
  new: 'Check-in',
  triaged: 'Boarding',
  planned: 'Scheduled',
  in_progress: 'In flight',
  delivered: 'Landed',
  declined: 'Cancelled',
};

export const statusTone = (s: Status): Tone => STATUS_TONE[s];

/** Just the coloured dot for a status (decoration next to a text label). */
export function StatusMark({ status, size = 7 }: { status: Status; size?: number }) {
  return <StatusDot tone={STATUS_TONE[status]} size={size} />;
}

/** Status as dot + label. */
export function StatusChip({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function NeedsTriageChip() {
  return (
    <Badge tone="warn" variant="soft" title={`New for more than ${NEEDS_TRIAGE_WORKING_DAYS} working days`}>
      Needs triage
    </Badge>
  );
}

export function EffortChip({ effort }: { effort: Effort | null }) {
  return (
    <Tag mono size="sm" title={effort ? `Effort ${EFFORT_LABEL[effort]}` : 'Not sized yet'}>
      {effort ? `Effort ${effort}` : 'Unsized'}
    </Tag>
  );
}

/** Three-letter team code for the flight board ("SAL", "FIN"). */
export function teamCode(team: string): string {
  const letters = team.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || '—').padEnd(3, '·');
}

/** Banner shown after a refused move from a stale view. */
export function StaleBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid="stale-alert" className="mb-4">
      <Callout
        tone="warn"
        title="Not moved"
        action={
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        }
      >
        {message}
      </Callout>
    </div>
  );
}

/**
 * "Move to…" menu button: lists only the moves the transition table allows from the card's status. The menu opens
 * in the top layer (never clipped by a scrolling lane). Keyboard: Enter/Space/ArrowDown opens and focuses the first
 * item, arrows move, Home/End jump, Escape closes and returns focus.
 */
export function MoveMenu({ request, onPick, compact }: { request: DataRequest; onPick: (to: Status) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const options = allowedNext(request.status);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = button.current?.getBoundingClientRect();
      const m = menu.current;
      if (!b || !m) return;
      const w = m.offsetWidth;
      const h = m.offsetHeight;
      const left = Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8));
      const below = b.bottom + 4;
      const top = below + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 4) : below;
      setPos({ top, left });
    };
    const m = menu.current as (HTMLDivElement & { showPopover?: () => void }) | null;
    try {
      m?.showPopover?.();
    } catch {
      /* already open */
    }
    place();
    items.current[0]?.focus();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  if (!options.length) return null;

  const close = (refocus = true) => {
    setOpen(false);
    setPos(null);
    if (refocus) button.current?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'Home') list[0]?.focus();
    else if (e.key === 'End') list[list.length - 1]?.focus();
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') return close(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="relative" ref={wrap}>
      <Button
        ref={button}
        size="sm"
        variant={compact ? 'ghost' : 'secondary'}
        icon={<ArrowRightLeft aria-hidden="true" />}
        iconRight={<ChevronDown aria-hidden="true" />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Move “${request.title}” to…`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        Move
      </Button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          popover="manual"
          aria-label={`Move “${request.title}” to`}
          onKeyDown={onMenuKey}
          className="x-panel m-0 min-w-44 p-1"
          style={{ position: 'fixed', inset: 'auto', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
        >
          <div className="x-legend-label px-2 pb-1 pt-1.5 text-faint">Move to</div>
          {options.map((to, i) => (
            <button
              key={to}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="menuitem"
              type="button"
              className={cx(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-gray-3 focus-visible:bg-gray-3',
                to === 'declined' ? 'text-bad' : 'text-fg',
              )}
              onClick={() => {
                close(false);
                onPick(to);
              }}
            >
              <StatusMark status={to} />
              {STATUS_LABEL[to]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Confirms a status move and collects what it needs: an effort size to triage, an optional plan (assignee, target
 * date) when planning, a reason (and optional original) when declining, and an optional note. Calls the one domain
 * transition function; a stale view is reported through onStale.
 */
export function MoveDialog({
  request,
  to,
  supporters,
  candidates,
  onClose,
  onMoved,
  onStale,
}: {
  request: DataRequest | null;
  to: Status | null;
  supporters: number;
  /** Requests that can be named as the original when declining a duplicate. */
  candidates: DataRequest[];
  onClose: () => void;
  onMoved: (message: string, moved: { id: string; to: Status }) => void | Promise<void>;
  onStale: (message: string) => void | Promise<void>;
}) {
  const { store, me } = useApp<Schema>();
  const open = !!request && !!to;
  const [effort, setEffort] = useState<Effort | ''>('');
  const [assignee, setAssignee] = useState('');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [dupOf, setDupOf] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { effort: useId(), assignee: useId(), target: useId(), reason: useId(), dup: useId(), note: useId() };

  useEffect(() => {
    if (!request) return;
    setEffort(request.effort ?? '');
    setAssignee(request.assigneeName ?? me.displayName);
    setTarget(targetToInput(request.targetDate));
    setReason('');
    setDupOf('');
    setNote('');
    setErrors({});
    setFailure(null);
  }, [request, to, me.displayName]);

  if (!request || !to) return <Dialog open={false} onClose={onClose} title="Move request">{null}</Dialog>;

  const askEffort = needsEffort(to) && (to === 'triaged' || !request.effort);
  const askPlan = to === 'planned';
  const declining = to === 'declined';
  const original = candidates.filter((c) => c.id !== request.id && c.status !== 'declined');

  const submit = async () => {
    const e: Record<string, string> = {};
    if (askEffort && !effort) e.effort = 'Choose an effort size to triage this request.';
    if (askPlan && assignee.trim().length > limits.assigneeName.max)
      e.assignee = `Assignee must be ${limits.assigneeName.max} characters or fewer.`;
    if (declining && !reason.trim()) e.reason = 'A decline reason is required. Requesters and supporters will see it.';
    if (reason.trim().length > limits.declineReason.max) e.reason = `Reason must be ${limits.declineReason.max} characters or fewer.`;
    if (note.trim().length > limits.note.max) e.note = `Note must be ${limits.note.max} characters or fewer.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFailure(null);
    try {
      await transitionRequest(store, me, {
        requestId: request.id,
        from: request.status,
        to,
        note: declining ? null : note,
        declineReason: declining ? reason : null,
        duplicateOfId: declining && dupOf ? dupOf : null,
        ...(askEffort ? { effort: effort || null } : {}),
        ...(askPlan ? { assigneeName: assignee, targetDate: inputToTarget(target) } : {}),
      });
      onClose();
      await onMoved(`Moved “${request.title}” to ${STATUS_LABEL[to]}.`, { id: request.id, to });
    } catch (err) {
      if (err instanceof StaleStateError) {
        onClose();
        await onStale(err.message);
      } else {
        setFailure(describeError(err).message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Move to ${STATUS_LABEL[to]}`}
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-fg">{request.title}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <StatusMark status={request.status} /> {STATUS_LABEL[request.status]}
          </span>
          <span aria-hidden="true">→</span>
          <span className="inline-flex items-center gap-1.5">
            <StatusMark status={to} /> {STATUS_LABEL[to]}
          </span>
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={declining ? 'danger' : 'primary'} busy={busy} onClick={submit}>
            {declining ? 'Decline request' : `Move to ${STATUS_LABEL[to]}`}
          </Button>
        </>
      }
    >
      {askEffort && (
        <Field label="Effort size" htmlFor={ids.effort} required error={errors.effort} hint="Divides the priority score: S 1, M 2, L 4, XL 8.">
          <Select id={ids.effort} value={effort} onChange={(e) => setEffort(e.target.value as Effort | '')} invalid={!!errors.effort}>
            <option value="">Choose…</option>
            {EFFORTS.map((x) => (
              <option key={x} value={x}>
                {EFFORT_LABEL[x]}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {askPlan && (
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Assignee" htmlFor={ids.assignee} error={errors.assignee}>
            <Input id={ids.assignee} value={assignee} onChange={(e) => setAssignee(e.target.value)} />
          </Field>
          <Field label="Target date" htmlFor={ids.target}>
            <Input id={ids.target} type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
        </div>
      )}
      {declining && (
        <>
          <Field
            label="Reason (shown to everyone)"
            htmlFor={ids.reason}
            required
            error={errors.reason}
            counter={{ value: reason.length, max: limits.declineReason.max }}
          >
            <TextArea id={ids.reason} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!errors.reason} />
          </Field>
          <Field label="Duplicate of (optional)" htmlFor={ids.dup} hint="Points requesters at the request to back instead.">
            <Select id={ids.dup} value={dupOf} onChange={(e) => setDupOf(e.target.value)}>
              <option value="">Not a duplicate</option>
              {original.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({STATUS_LABEL[c.status]})
                </option>
              ))}
            </Select>
          </Field>
          {supporters > 0 && (
            <div data-testid="decline-notice" className="mb-3">
              <Callout tone="info">
                {supporters === 1 ? '1 supporter backs' : `${supporters} supporters back`} this request. A comment naming them and
                giving your reason will be posted so they are notified.
              </Callout>
            </div>
          )}
        </>
      )}
      {!declining && (
        <Field label="Note (optional)" htmlFor={ids.note} error={errors.note} counter={{ value: note.length, max: limits.note.max }}>
          <TextArea id={ids.note} rows={2} value={note} onChange={(e) => setNote(e.target.value)} invalid={!!errors.note} />
        </Field>
      )}
      <InlineError error={failure} />
    </Dialog>
  );
}
