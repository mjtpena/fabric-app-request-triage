import { pct, plural, useAsync } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { DataState, EmptyState, LinkButton, PageHeader, Section, Skeleton, Stat, StatStrip, TableWrap } from '@x10/shared/ui';

import { BarsChart, ValueEffortScatter } from '../charts';
import { EFFORT_LABEL, NEEDS_TRIAGE_WORKING_DAYS } from '../config';
import type { Insights } from '../domain/insights';
import { loadInsights } from '../domain/requests';
import type { Schema } from '../model';

const days = (n: number | null) => (n === null ? '—' : `${n} ${n === 1 ? 'day' : 'days'}`);

export function InsightsPage() {
  const { store } = useApp<Schema>();
  const insights = useAsync(() => loadInsights(store), [store]);
  return (
    <>
      <PageHeader title="Insights" subtitle="What people ask for, how it is sized, and how long delivery takes." />
      <DataState
        state={insights}
        skeleton={<InsightsSkeleton />}
        isEmpty={(d) => d.total === 0}
        empty={
          <EmptyState title="No requests to analyse yet" action={<LinkButton to="/submit" variant="primary">File a flight plan</LinkButton>}>
            Charts appear once requests come in.
          </EmptyState>
        }
      >
        {(d) => <InsightsView d={d} />}
      </DataState>
    </>
  );
}

function InsightsView({ d }: { d: Insights }) {
  const funnelTop = d.funnel[0]?.count ?? 0;
  return (
    <>
      <StatStrip>
        <Stat label="Requests" value={<span data-testid="kpi-total">{d.total}</span>} hint={`${d.declined} declined`} />
        <Stat label="Open" value={<span data-testid="kpi-open">{d.open}</span>} hint="New to in progress" />
        <Stat
          label="Need triage"
          value={<span data-testid="kpi-needs-triage">{d.needsTriage}</span>}
          tone={d.needsTriage ? 'warn' : undefined}
          hint={`New for over ${NEEDS_TRIAGE_WORKING_DAYS} working days`}
        />
        <Stat
          label="Median days to deliver"
          value={<span data-testid="kpi-median">{d.medianDaysToDeliver ?? '—'}</span>}
          hint={`${plural(d.delivered, 'request')} delivered`}
        />
      </StatStrip>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ValueEffortScatter
          title="Value against effort (hover a dot for its title)"
          summary={`${d.scatter.length} sized requests. ${d.scatter.map((p) => `${p.title}: value ${p.value}, effort ${p.effort}`).join('; ')}.`}
          data={d.scatter}
        />
        <BarsChart
          title="Requests per team"
          summary={d.perTeam.map((t) => `${t.team}: ${t.count}`).join(', ')}
          data={d.perTeam}
          categoryKey="team"
          valueKey="count"
          valueLabel="Requests"
          height={280}
        />
        <BarsChart
          title="Funnel: requests that reached each stage"
          summary={d.funnel.map((f) => `${f.stage}: ${f.count}`).join(', ')}
          data={d.funnel}
          categoryKey="stage"
          valueKey="count"
          valueLabel="Requests"
          horizontal
          colorIndex={1}
        />
        <BarsChart
          title="Median days from submission to delivery, by effort"
          summary={d.medianByEffort.map((m) => `${m.effort}: ${days(m.days)} (${plural(m.delivered, 'delivered request')})`).join(', ')}
          data={d.medianByEffort.map((m) => ({ effort: m.effort, days: m.days }))}
          categoryKey="effort"
          valueKey="days"
          valueLabel="Median days"
          colorIndex={2}
        />
      </div>

      <Section title="The numbers behind the charts">
        <div className="grid gap-4 md:grid-cols-2">
          <TableWrap label="Funnel">
            <table className="x-table is-compact" data-testid="funnel-table">
              <caption className="sr-only">Requests that reached each stage</caption>
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col" className="num">Reached</th>
                  <th scope="col" className="num">Of all</th>
                </tr>
              </thead>
              <tbody>
                {d.funnel.map((f) => (
                  <tr key={f.status}>
                    <th scope="row" className="border-b border-line bg-transparent! font-normal text-fg!">{f.stage}</th>
                    <td className="num">{f.count}</td>
                    <td className="num text-muted">{pct(f.count, funnelTop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <TableWrap label="Delivery time by effort">
            <table className="x-table is-compact" data-testid="median-table">
              <caption className="sr-only">Median days from submission to delivery by effort size</caption>
              <thead>
                <tr>
                  <th scope="col">Effort</th>
                  <th scope="col" className="num">Delivered</th>
                  <th scope="col" className="num">Median</th>
                </tr>
              </thead>
              <tbody>
                {d.medianByEffort.map((m) => (
                  <tr key={m.effort}>
                    <th scope="row" className="border-b border-line bg-transparent! font-normal text-fg!">{EFFORT_LABEL[m.effort]}</th>
                    <td className="num">{m.delivered}</td>
                    <td className="num">{days(m.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
        <p className="mb-0 mt-2 text-xs text-muted">
          Funnel counts come from the status history, so a request that went back from in progress to planned still counts
          as having reached in progress. Declined requests leave the funnel at the stage they were declined from.
        </p>
      </Section>
    </>
  );
}

function InsightsSkeleton() {
  return (
    <>
      <Skeleton height={96} className="rounded-xl" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={300} className="rounded-xl" />
        ))}
      </div>
    </>
  );
}
