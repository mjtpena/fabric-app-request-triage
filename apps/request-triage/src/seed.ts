import type { DataStore } from '@x10/shared/data';
import { DAY, HOUR } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import { declineNotice } from './domain/requests';
import type { Effort, Schema, Status, Urgency } from './model';

/**
 * Fictional, generic seed data. Dates are computed from ctx.now. Runs once (runSeed checks a marker row).
 *
 * 25 requests across 5 teams in every status (6 new, 4 triaged, 4 planned, 3 in progress, 5 delivered, 3 declined),
 * 40 supporters, 30 comments and a full StatusChange trail for each request. Edge cases: two near-duplicate titles
 * (r01 / r02), two new requests past the "needs triage" threshold (r12, r13), a request edited by its requester after
 * triage (r19), a request moved back from in progress to planned (r20), an overdue target date (r22) and a request
 * declined while it had supporters, with the notice comment (r10).
 */

/** Seed-only colleagues (not demo personas) so supporters and requesters come from five teams. */
export const SEED_COLLEAGUES = [
  { sub: 'demo-member-lena', name: 'Lena Brooks', email: 'lena@example.com' },
  { sub: 'demo-member-tom', name: 'Tom Becker', email: 'tom@example.com' },
  { sub: 'demo-member-aisha', name: 'Aisha Rahman', email: 'aisha@example.com' },
  { sub: 'demo-member-diego', name: 'Diego Morales', email: 'diego@example.com' },
  { sub: 'demo-member-grace', name: 'Grace Kim', email: 'grace@example.com' },
] as const;

/** Requester keys: 1–3 are the requester personas, 4–8 the seed colleagues above, 0 the data-team admin. */
type Who = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface SeedRequest {
  key: string;
  title: string;
  description: string;
  team: string;
  by: Who;
  value: number;
  urgency: Urgency;
  effort: Effort | null;
  assignee?: string;
  /** Target date in days from now (negative = in the past). */
  target?: number;
  /** Status trail: [status, days ago, note?]. The first entry is the submission ("new"). */
  trail: [Status, number, string?][];
  declineReason?: string;
  supporters: number;
  comments: [Who, string][];
  /** Requester edit after triage: appended to the description, days ago. */
  edit?: [string, number];
}

const REQUESTS: SeedRequest[] = [
  {
    key: 'r01', title: 'Weekly sales pipeline by region', team: 'Sales', by: 2, value: 5, urgency: 'high', effort: 'M',
    description: 'Regional sales leads need one weekly view of open pipeline by stage and region, with the change since last week. Today each region builds its own spreadsheet from CRM exports on Monday mornings.',
    assignee: 'Jordan Lee', target: 10,
    trail: [['new', 40], ['triaged', 37, 'Clear ask, CRM tables already in the lakehouse.'], ['planned', 30, 'Next sprint.']],
    supporters: 7,
    comments: [[4, 'Marketing would use this too, to time campaigns against thin pipeline.'], [0, 'We will build it on the CRM snapshot table so week-over-week numbers are stable.'], [7, 'Can region managers get it by email on Monday?']],
  },
  {
    key: 'r02', title: 'Sales pipeline by region with weekly snapshots', team: 'Sales', by: 7, value: 4, urgency: 'normal', effort: null,
    description: 'A weekly snapshot of the pipeline per region so we can compare this week with last week. Stage conversion would be a bonus.',
    trail: [['new', 2]], supporters: 1,
    comments: [[2, 'This looks like the weekly pipeline request already planned. Worth backing that one?']],
  },
  {
    key: 'r03', title: 'Monthly close variance report for cost centres', team: 'Finance', by: 1, value: 4, urgency: 'high', effort: 'L',
    description: 'Actual against budget per cost centre at month end, with variances over 5% flagged and a comment column for owners. Needed for the close meeting on working day 4.',
    assignee: 'Jordan Lee', target: 5,
    trail: [['new', 50], ['triaged', 47], ['planned', 40], ['in_progress', 12, 'Model built; validating against the ledger.']],
    supporters: 3,
    comments: [[6, 'Please include the prior-year column as well.'], [0, 'First cut is in test. Finance owners, please check your cost centres.']],
  },
  {
    key: 'r04', title: 'Customer churn drivers dashboard', team: 'Marketing', by: 4, value: 5, urgency: 'normal', effort: 'XL',
    description: 'Which customer behaviours predict churn in the 90 days before cancellation? Usage, support tickets and billing events are the likely signals.',
    trail: [['new', 20], ['triaged', 16, 'Needs data science time; sized XL.']],
    supporters: 5,
    comments: [[8, 'Retention campaigns depend on this.'], [0, 'Sized XL because support tickets are not in the lakehouse yet.']],
  },
  {
    key: 'r05', title: 'Headcount and attrition by department', team: 'People', by: 5, value: 3, urgency: 'normal', effort: 'M',
    description: 'Monthly headcount, starters, leavers and rolling 12-month attrition per department for the leadership pack.',
    assignee: 'Riley Chen', target: -45,
    trail: [['new', 70], ['triaged', 68], ['planned', 60], ['in_progress', 50], ['delivered', 42, 'Published to the People workspace.']],
    supporters: 2,
    comments: [[5, 'Delivered and already used in the leadership pack. Thank you!']],
  },
  {
    key: 'r06', title: 'Warehouse stock ageing extract', team: 'Operations', by: 3, value: 4, urgency: 'high', effort: 'S',
    description: 'A daily extract of stock older than 90 days by warehouse and product family, so we can plan clearance before the quarter ends.',
    assignee: 'Riley Chen', target: -25,
    trail: [['new', 30], ['triaged', 29], ['planned', 28], ['in_progress', 27], ['delivered', 24]],
    supporters: 2,
    comments: [[0, 'Delivered as a scheduled extract to the Operations lakehouse folder.']],
  },
  {
    key: 'r07', title: 'Campaign attribution by channel', team: 'Marketing', by: 8, value: 3, urgency: 'normal', effort: 'L',
    description: 'Revenue attributed to each marketing channel with a simple position-based model, monthly.',
    assignee: 'Riley Chen', target: 30,
    trail: [['new', 25], ['triaged', 22], ['planned', 15]],
    supporters: 2,
    comments: [[4, 'Last-touch would be fine for a first version.']],
  },
  {
    key: 'r08', title: 'Supplier on-time delivery scorecard', team: 'Operations', by: 3, value: 4, urgency: 'normal', effort: 'M',
    description: 'On-time and in-full rates per supplier per month, with the worst ten highlighted for the supplier review.',
    assignee: 'Riley Chen', target: 7,
    trail: [['new', 35], ['triaged', 33], ['planned', 26], ['in_progress', 8]],
    supporters: 2,
    comments: [[3, 'The supplier review is on the 15th, so a draft before then would help.']],
  },
  {
    key: 'r09', title: 'Daily cash position feed', team: 'Finance', by: 6, value: 5, urgency: 'high', effort: 'S',
    description: 'Closing balance per bank account each morning in one table, replacing four bank portal downloads.',
    assignee: 'Jordan Lee', target: -18,
    trail: [['new', 21], ['triaged', 20], ['planned', 19], ['in_progress', 18], ['delivered', 17, 'Live; refreshes at 7:00.']],
    supporters: 3,
    comments: [[1, 'This saves us half an hour every morning.'], [0, 'Refresh runs at 7:00 local time; alerts go to the Finance channel if a bank file is late.']],
  },
  {
    key: 'r10', title: 'Lead response time by sales rep', team: 'Sales', by: 2, value: 2, urgency: 'low', effort: 'M',
    description: 'Median hours from a new lead to the first call, per rep and per week.',
    trail: [['new', 28], ['triaged', 25], ['declined', 20]],
    declineReason: 'The CRM already has a response-time report per rep; we will not duplicate it.',
    supporters: 2,
    comments: [[7, 'Would help coaching conversations.']],
  },
  {
    key: 'r11', title: 'Export of all customer emails for a mailing', team: 'Marketing', by: 4, value: 2, urgency: 'normal', effort: null,
    description: 'A one-off export of every customer email address for a newsletter.',
    trail: [['new', 18], ['declined', 17]],
    declineReason: 'Personal data exports go through the privacy team and the consent tool, not the data team.',
    supporters: 0,
    comments: [[0, 'Declined: please raise this with the privacy team, who can send through the consent tool.']],
  },
  {
    key: 'r12', title: 'Training completion rates by team', team: 'People', by: 5, value: 3, urgency: 'normal', effort: null,
    description: 'Share of mandatory training completed per team, refreshed weekly, for the compliance check-in.',
    trail: [['new', 14]], supporters: 2,
    comments: [[1, 'Finance would like this too for the audit file.']],
  },
  {
    key: 'r13', title: 'Returns rate by product category', team: 'Operations', by: 3, value: 3, urgency: 'normal', effort: null,
    description: 'Return rate and top return reasons per product category, monthly, to brief the category managers.',
    trail: [['new', 10]], supporters: 1,
    comments: [[3, 'Is anyone looking at this one? Happy to walk through the returns system.']],
  },
  {
    key: 'r14', title: 'Budget versus actuals for marketing spend', team: 'Marketing', by: 8, value: 4, urgency: 'normal', effort: null,
    description: 'Monthly marketing spend against budget by channel and campaign.',
    trail: [['new', 6]], supporters: 0, comments: [],
  },
  {
    key: 'r15', title: 'Quarterly revenue bridge for the board pack', team: 'Finance', by: 1, value: 5, urgency: 'high', effort: null,
    description: 'Revenue bridge from last quarter to this quarter: volume, price, mix and currency effects, in the board pack format.',
    trail: [['new', 1]], supporters: 2,
    comments: [[6, 'The board meets in three weeks, so timing matters here.']],
  },
  {
    key: 'r16', title: 'Overtime hours trend by site', team: 'Operations', by: 3, value: 2, urgency: 'low', effort: null,
    description: 'Overtime hours per site per week for the last year, to support the staffing plan.',
    trail: [['new', 3]], supporters: 0, comments: [],
  },
  {
    key: 'r17', title: 'Sales forecast accuracy tracker', team: 'Sales', by: 7, value: 4, urgency: 'normal', effort: 'L',
    description: 'Forecast submitted at the start of each month against actual bookings, per rep and region.',
    trail: [['new', 12], ['triaged', 9]],
    supporters: 2,
    comments: [[0, 'Sized L because forecast snapshots are only kept for six months.']],
  },
  {
    key: 'r18', title: 'Onboarding time to productivity', team: 'People', by: 5, value: 3, urgency: 'low', effort: 'XL',
    description: 'How long new starters take to reach full productivity, by role family.',
    trail: [['new', 15], ['triaged', 11, 'Needs a definition of productivity per role first.']],
    supporters: 0,
    comments: [[0, 'We need one agreed productivity measure per role family before we can build this.']],
  },
  {
    key: 'r19', title: 'Invoice processing backlog by approver', team: 'Finance', by: 1, value: 4, urgency: 'high', effort: 'M',
    description: 'Invoices waiting for approval per approver and age band, so we can chase before payment terms are missed.',
    edit: ['Update: the approver list is in the finance shared drive; only invoices over the approval threshold matter.', 4],
    trail: [['new', 9], ['triaged', 6]],
    supporters: 1,
    comments: [[1, 'Added the approver list detail to the description.'], [0, 'Thanks, that narrows it down nicely.']],
  },
  {
    key: 'r20', title: 'Website conversion funnel by device', team: 'Marketing', by: 4, value: 3, urgency: 'normal', effort: 'M',
    description: 'Visit to sign-up conversion per step of the website funnel, split by device type.',
    assignee: 'Riley Chen', target: 20,
    trail: [['new', 45], ['triaged', 42], ['planned', 38], ['in_progress', 30], ['planned', 25, 'Paused until the tracking fix ships.']],
    supporters: 1,
    comments: [[0, 'Paused: the mobile tracking tag drops events. We restart once the fix ships.']],
  },
  {
    key: 'r21', title: 'Discount approval rates by deal size', team: 'Sales', by: 2, value: 3, urgency: 'normal', effort: 'S',
    description: 'Share of discount requests approved, by deal size band and approver.',
    assignee: 'Jordan Lee', target: 14,
    trail: [['new', 16], ['triaged', 14], ['planned', 10]],
    supporters: 0,
    comments: [[2, 'A simple table is enough for the pricing committee.']],
  },
  {
    key: 'r22', title: 'Payroll cost forecast by department', team: 'Finance', by: 6, value: 4, urgency: 'normal', effort: 'L',
    description: 'Twelve-month payroll cost forecast per department, including planned hires and pay review.',
    assignee: 'Riley Chen', target: -2,
    trail: [['new', 55], ['triaged', 52], ['planned', 45], ['in_progress', 20]],
    supporters: 1,
    comments: [[6, 'The target date has passed. Is there a new estimate?']],
  },
  {
    key: 'r23', title: 'Customer segment definitions in the semantic model', team: 'Marketing', by: 8, value: 4, urgency: 'normal', effort: 'M',
    description: 'Add the agreed customer segments to the shared semantic model so every report uses the same definitions.',
    assignee: 'Jordan Lee', target: -58,
    trail: [['new', 90], ['triaged', 88], ['planned', 80], ['in_progress', 70], ['delivered', 56]],
    supporters: 1,
    comments: [[0, 'Segments are live in the shared model. Reports pick them up on the next refresh.']],
  },
  {
    key: 'r24', title: 'Store footfall versus sales', team: 'Sales', by: 7, value: 3, urgency: 'low', effort: 'L',
    description: 'Daily footfall counter data next to store sales, to see conversion per store.',
    assignee: 'Riley Chen', target: -62,
    trail: [['new', 120], ['triaged', 115], ['planned', 100], ['in_progress', 80], ['delivered', 60]],
    supporters: 0,
    comments: [[7, 'Store managers now review this every Monday.']],
  },
  {
    key: 'r25', title: 'Real-time stock levels on the intranet', team: 'Operations', by: 3, value: 3, urgency: 'normal', effort: 'XL',
    description: 'Live stock levels per store on the intranet home page.',
    trail: [['new', 60], ['triaged', 58], ['planned', 50], ['declined', 44]],
    declineReason: 'Needs a streaming source we do not have yet. We will revisit after the event streaming project.',
    supporters: 0,
    comments: [[3, 'Understood. The daily ageing extract covers most of what we needed.']],
  },
];

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const now = ctx.now.getTime();
  const people = store.repo('Person');
  const existing = await people.list();
  const colleagues = [];
  for (const [i, c] of SEED_COLLEAGUES.entries()) {
    const found = existing.find((p) => p.sub === c.sub);
    colleagues.push(
      found ??
        (await people.create({
          sub: c.sub,
          displayName: c.name,
          email: c.email,
          isAdmin: null,
          createdAt: new Date(now - (200 - i) * DAY).toISOString(),
        })),
    );
  }
  // Who: 0 admin, 1–3 requester personas, 4–8 colleagues.
  const who = [...ctx.people.slice(0, 4), ...colleagues].map((p) => ({ sub: p.sub, name: p.displayName }));
  const voters = who.slice(1); // the data-team admin does not vote in the seed

  for (const [i, s] of REQUESTS.entries()) {
    // Same hour offset for every timestamp of one request keeps the day counts whole.
    const shift = ((i * 5) % 9) * HOUR + ((i * 13) % 50) * 60_000;
    const ago = (days: number, extraMin = 0) => new Date(now - days * DAY - shift + extraMin * 60_000).toISOString();
    const requester = who[s.by];
    const createdAt = ago(s.trail[0][1]);
    const last = s.trail[s.trail.length - 1];
    const status = last[0];
    const lastChangeAt = ago(last[1]);
    const editedAt = s.edit ? ago(s.edit[1]) : null;

    const req = await store.repo('DataRequest').create({
      title: s.title,
      description: s.edit ? `${s.description}\n\n${s.edit[0]}` : s.description,
      team: s.team,
      requesterSub: requester.sub,
      requesterName: requester.name,
      value: s.value,
      urgency: s.urgency,
      effort: s.effort,
      status,
      assigneeName: s.assignee ?? null,
      targetDate: s.target === undefined ? null : middayUtc(now + s.target * DAY),
      declineReason: s.declineReason ?? null,
      duplicateOfId: null,
      createdAt,
      updatedAt: editedAt && editedAt > lastChangeAt ? editedAt : lastChangeAt,
    });

    let prev: Status | null = null;
    for (const [to, days, note] of s.trail) {
      const by = to === 'new' ? requester : who[0];
      await store.repo('StatusChange').create({
        requestId: req.id,
        fromStatus: prev,
        toStatus: to,
        bySub: by.sub,
        byName: by.name,
        note: to === 'new' ? 'Submitted' : to === 'declined' ? (note ?? s.declineReason ?? null) : (note ?? null),
        at: ago(days),
      });
      prev = to;
    }

    // Supporters: the next N voters after the requester in a rotating order, never the requester.
    const pool = voters.filter((v) => v.sub !== requester.sub);
    const backers = Array.from({ length: s.supporters }, (_, k) => pool[(i + k) % pool.length]);
    for (const [k, v] of backers.entries()) {
      await store.repo('Supporter').create({
        requestId: req.id,
        voterSub: v.sub,
        createdAt: ago(s.trail[0][1], 60 * (k + 1) * 7),
      });
    }

    // Comments spread between submission and the last change (or now for open requests).
    const span = Math.max(1, s.trail[0][1] - (isClosed(status) ? last[1] : 0));
    for (const [k, [w, body]] of s.comments.entries()) {
      const day = s.trail[0][1] - (span * (k + 1)) / (s.comments.length + 1);
      await store.repo('RequestComment').create({
        requestId: req.id,
        authorSub: who[w].sub,
        authorName: who[w].name,
        body,
        createdAt: ago(day),
      });
    }
    if (status === 'declined' && backers.length) {
      await store.repo('RequestComment').create({
        requestId: req.id,
        authorSub: who[0].sub,
        authorName: who[0].name,
        body: declineNotice(s.declineReason!, backers.map((b) => b.name)),
        createdAt: ago(last[1], 1),
      });
    }
  }
}

const isClosed = (s: Status) => s === 'delivered' || s === 'declined';

/** Target dates are calendar dates; store them at 12:00 UTC so they show as the same day in every time zone. */
function middayUtc(ms: number): string {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)).toISOString();
}
