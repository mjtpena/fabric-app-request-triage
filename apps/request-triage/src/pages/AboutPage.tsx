import { Link } from 'react-router-dom';

import { AppLogo } from '@x10/shared/runtime';
import { PageHeader, Section, TableWrap } from '@x10/shared/ui';

import { FLIGHT_STATUS, StatusChip } from '../components';
import {
  DUPLICATE_MAX_SUGGESTIONS,
  DUPLICATE_MIN_SHARED,
  EFFORT_LABEL,
  NEEDS_TRIAGE_WORKING_DAYS,
  SCORE,
  TRANSITIONS,
  URGENCY_LABEL,
} from '../config';
import { EFFORTS, STATUSES, URGENCIES } from '../model';

/** About: what the app is for, how to read the radar, the rules and thresholds from config.ts, and audience notes. */
export function AboutPage() {
  const example = (4 * SCORE.valueWeight + SCORE.urgencyPoints.high + SCORE.supporterCap) / SCORE.effortWeight.M;
  return (
    <>
      <PageHeader title="About Data Request Triage" subtitle="A transparent queue for data asks, ranked by value and effort." />
      <div className="flex max-w-[72ch] gap-4">
        <AppLogo size={40} className="hidden shrink-0 sm:flex" />
        <div>
          <p className="mt-0 text-base leading-7">
            Data teams get the same question every week: “can you get me this data?”. Asks arrive by chat and email, nobody
            can see the backlog, and a request that was declined just goes quiet. Data Request Triage puts every ask on one
            public radar. Stakeholders file requests and back each other's asks; the data team sizes, plans and moves them;
            everyone can see what is coming next and why something was declined.
          </p>
          <p className="mb-0 text-ui text-muted">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
        </div>
      </div>

      <Section title="Reading the radar">
        <dl className="m-0 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {[
            ['Distance from the centre', 'Rank in the queue. The closer a blip, the higher its priority score.'],
            ['Sector', 'The team that asked. Five teams, five sectors.'],
            ['Blip size', 'Supporters: everyone who backed the request.'],
            ['Trail', 'How long the request has waited, one degree of trail per day.'],
            ['Blinking ring', `Still new after ${NEEDS_TRIAGE_WORKING_DAYS} working days: it needs triage.`],
            ['Outer band', 'Closed requests: delivered (diamond) and declined (cross).'],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-line pt-3">
              <dt className="text-sm font-medium">{k}</dt>
              <dd className="m-0 mt-1 text-ui text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-0 mt-4 text-ui text-muted">
          Lenses re-colour the same blips by score, age, team, effort or status (keys 1 to 5). The{' '}
          <Link to="/?view=list">list view</Link> shows the same queue as a table.
        </p>
      </Section>

      <Section title="How to use it">
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <div>
            <h3 className="m-0 mb-2 text-sm font-semibold">If you need data</h3>
            <ol className="m-0 space-y-1.5 pl-5 text-ui">
              <li>
                Open <Link to="/submit">Flight plan</Link> and type a title. Similar open requests close in on the duplicate
                radar; if one fits, choose <em>Back this instead</em>.
              </li>
              <li>Otherwise describe the decision the data supports, pick your team, the value and the urgency, and submit.</li>
              <li>Back other people's requests you need too, from the radar's list or a request page.</li>
              <li>Comment to add context. Once triaged, you can still edit your description.</li>
            </ol>
          </div>
          <div>
            <h3 className="m-0 mb-2 text-sm font-semibold">If you are on the data team</h3>
            <ol className="m-0 space-y-1.5 pl-5 text-ui">
              <li>Start from Today on the radar: stale requests, overdue targets and the highest unsized ask.</li>
              <li>On a request page, size the effort, set an assignee and a target date, and move it on.</li>
              <li>
                On the <Link to="/board">flight board</Link>, use <em>Move</em> on a card. Only allowed moves are offered.
              </li>
              <li>Decline with a reason everyone can read. Supporters get a comment naming them.</li>
            </ol>
          </div>
        </div>
      </Section>

      <Section title="Priority score">
        <p className="m-0 rounded-xl bg-surface-sunken px-4 py-3 font-mono text-sm">
          score = (value × {SCORE.valueWeight} + urgency + min(supporters, {SCORE.supporterCap})) ÷ effort
        </p>
        <p className="text-ui text-muted">
          The queue is sorted by score, highest first; ties go to the request that has waited longer. A request that has not
          been sized yet counts as effort {SCORE.defaultEffort}. Example: value 4, high urgency, 7 supporters, effort M = (8 +{' '}
          {SCORE.urgencyPoints.high} + {SCORE.supporterCap}) ÷ {SCORE.effortWeight.M} = {example}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TableWrap label="Urgency points">
            <table className="x-table is-compact">
              <caption className="sr-only">Urgency points</caption>
              <thead>
                <tr>
                  <th scope="col">Urgency</th>
                  <th scope="col" className="num">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody>
                {URGENCIES.map((u) => (
                  <tr key={u}>
                    <td>{URGENCY_LABEL[u]}</td>
                    <td className="num">+{SCORE.urgencyPoints[u]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <TableWrap label="Effort weights">
            <table className="x-table is-compact">
              <caption className="sr-only">Effort weights</caption>
              <thead>
                <tr>
                  <th scope="col">Effort</th>
                  <th scope="col" className="num">
                    Divide by
                  </th>
                </tr>
              </thead>
              <tbody>
                {EFFORTS.map((e) => (
                  <tr key={e}>
                    <td>{EFFORT_LABEL[e]}</td>
                    <td className="num">{SCORE.effortWeight[e]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </Section>

      <Section title="Status rules">
        <ul className="m-0 list-none divide-y divide-[var(--line)] rounded-xl border border-line bg-surface p-0">
          {STATUSES.map((s) => (
            <li key={s} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="x-legend-label w-24 text-faint">{FLIGHT_STATUS[s]}</span>
              <StatusChip status={s} />
              <span aria-hidden="true" className="text-faint">
                →
              </span>
              {TRANSITIONS[s].length ? (
                TRANSITIONS[s].map((t) => <StatusChip key={t} status={t} />)
              ) : (
                <span className="text-ui text-muted">closed, no further moves</span>
              )}
            </li>
          ))}
        </ul>
        <ul className="mb-0 mt-4 space-y-1.5 pl-5 text-ui">
          <li>Only the data team changes status, effort, assignee and target date. Requesters set value and urgency.</li>
          <li>Leaving “New” for the delivery path needs an effort size. Declining needs a reason.</li>
          <li>Every move is written to the request's black box, which is append-only.</li>
          <li>A move from an out-of-date page (another tab or a colleague moved the request first) is refused, explained, and the page reloads.</li>
          <li>Once triaged, the requester can change only the description. Delivered and declined requests are frozen.</li>
          <li>A request still new after {NEEDS_TRIAGE_WORKING_DAYS} working days (Monday to Friday) gets a “Needs triage” chip and blinks on the radar.</li>
          <li>
            Duplicate help suggests up to {DUPLICATE_MAX_SUGGESTIONS} open requests whose titles share at least {DUPLICATE_MIN_SHARED} key words with
            yours (function words such as “the”, “of” or “for” do not count).
          </li>
        </ul>
      </Section>

      <Section title="Privacy and audience">
        <ul className="m-0 space-y-1.5 pl-5 text-ui">
          <li>
            Everyone who can open this app sees every request, who asked for it, who backs it and every comment. That is the
            point: the queue is public inside your organisation. Do not put personal or confidential data in a request.
          </li>
          <li>Sign-in is your Microsoft Fabric (Entra ID) account. Users need access to the app item; workspace members have it by default.</li>
          <li>Data lives in the app's own Fabric SQL database. Nothing is sent anywhere else.</li>
          <li>Times are stored in UTC and shown in your local time. Target dates are calendar dates.</li>
        </ul>
      </Section>
    </>
  );
}
