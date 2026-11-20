import type { DataRequest, Status } from '../model';
import { findDuplicates, sharedTokens, stem, titleTokens } from './duplicates';

let n = 0;
function req(title: string, status: Status = 'new', createdAt = '2026-11-01T00:00:00.000Z'): DataRequest {
  n++;
  return {
    id: `r${n}`,
    title,
    description: '',
    team: 'Sales',
    requesterSub: 'x',
    requesterName: 'X',
    value: 3,
    urgency: 'normal',
    effort: null,
    status,
    assigneeName: null,
    targetDate: null,
    declineReason: null,
    duplicateOfId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('duplicate matcher', () => {
  it('drops function words only and stems plurals', () => {
    expect(titleTokens('The data report for Sales regions, per week')).toEqual(['data', 'report', 'sale', 'region', 'week']);
    expect(stem('categories')).toBe('category');
    expect(stem('status')).toBe('status');
    expect(stem('process')).toBe('process');
  });

  it('counts shared meaningful words only', () => {
    expect(sharedTokens('Weekly sales pipeline by region', 'Sales pipeline by region with weekly snapshots')).toEqual([
      'weekly',
      'sale',
      'pipeline',
      'region',
    ]);
    expect(sharedTokens('Of the and for', 'The and of for')).toEqual([]);
  });

  it('suggests an open request sharing two or more words', () => {
    const pipeline = req('Weekly sales pipeline by region', 'planned');
    const other = req('Headcount by department');
    const hits = findDuplicates('Pipeline per region', [pipeline, other]);
    expect(hits.map((h) => h.request.id)).toEqual([pipeline.id]);
    expect(hits[0].shared).toEqual(['pipeline', 'region']);
  });

  it('counts content words like "report" (spec example: two shared words)', () => {
    const weekly = req('Weekly sales report');
    const hits = findDuplicates('Monthly sales report', [weekly]);
    expect(hits.map((h) => h.request.id)).toEqual([weekly.id]);
    expect(hits[0].shared).toEqual(['sale', 'report']);
  });

  it('does not suggest on a single shared word or on function words alone', () => {
    const pipeline = req('Weekly sales pipeline by region');
    expect(findDuplicates('Pipeline health', [pipeline])).toEqual([]);
    expect(findDuplicates('By the region', [req('In the region')])).toEqual([]);
    expect(findDuplicates('For the and of', [req('The and of for')])).toEqual([]);
  });

  it('never suggests delivered or declined requests, or the excluded one', () => {
    const done = req('Stock ageing extract by warehouse', 'delivered');
    const no = req('Stock ageing extract weekly', 'declined');
    const open = req('Stock ageing per warehouse', 'triaged');
    expect(findDuplicates('Stock ageing extract', [done, no, open]).map((h) => h.request.id)).toEqual([open.id]);
    expect(findDuplicates('Stock ageing extract', [open], { excludeId: open.id })).toEqual([]);
  });

  it('returns at most three, best match first', () => {
    const a = req('Customer churn by segment');
    const b = req('Customer churn drivers by segment and month');
    const c = req('Customer churn monthly');
    const d = req('Customer churn by product');
    const e = req('Customer churn segment drivers');
    const hits = findDuplicates('Customer churn drivers by segment', [a, b, c, d, e]);
    expect(hits).toHaveLength(3);
    expect(hits[0].request.id).toBe(e.id); // 4 shared, all of its own words
    expect(hits[1].request.id).toBe(b.id); // 4 shared, fewer of its own words
  });
});
