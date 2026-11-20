import { tokens } from '@x10/shared/lib';

import { DUPLICATE_MAX_SUGGESTIONS, DUPLICATE_MIN_SHARED } from '../config';
import type { DataRequest } from '../model';
import { isOpen } from './status';

/**
 * English function words only (articles, prepositions, conjunctions, pronouns, auxiliaries). Content words such as
 * "data", "report" or "sales" always count, so "Monthly sales report" and "Weekly sales report" share two words.
 */
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it',
  'its', 'me', 'my', 'of', 'on', 'or', 'our', 'per', 'so', 'than', 'that', 'the', 'their', 'this', 'to', 'us', 'vs',
  'we', 'with',
]);

/** Light normalisation so "regions" matches "region" and "categories" matches "category". */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/** Distinct meaningful words of a title: lowercased, stopwords removed, lightly stemmed. */
export function titleTokens(title: string): string[] {
  return [...new Set(tokens(title).filter((w) => !STOPWORDS.has(w)).map(stem))];
}

/** Meaningful words two titles have in common. */
export function sharedTokens(a: string, b: string): string[] {
  const right = new Set(titleTokens(b));
  return titleTokens(a).filter((w) => right.has(w));
}

export interface DuplicateMatch {
  request: DataRequest;
  shared: string[];
}

/**
 * Open requests whose titles share at least DUPLICATE_MIN_SHARED meaningful words with `title`.
 * Best first (most shared words, then the larger share of the candidate's own words, then newest). Closed requests
 * (delivered, declined) and `excludeId` are never suggested.
 */
export function findDuplicates(
  title: string,
  candidates: DataRequest[],
  opts: { excludeId?: string; min?: number; max?: number } = {},
): DuplicateMatch[] {
  const min = opts.min ?? DUPLICATE_MIN_SHARED;
  const max = opts.max ?? DUPLICATE_MAX_SUGGESTIONS;
  const mine = new Set(titleTokens(title));
  if (mine.size < min) return [];
  const out: (DuplicateMatch & { ratio: number })[] = [];
  for (const r of candidates) {
    if (r.id === opts.excludeId || !isOpen(r.status)) continue;
    const theirs = titleTokens(r.title);
    const shared = theirs.filter((w) => mine.has(w));
    if (shared.length >= min) out.push({ request: r, shared, ratio: shared.length / Math.max(1, theirs.length) });
  }
  out.sort(
    (a, b) =>
      b.shared.length - a.shared.length || b.ratio - a.ratio || b.request.createdAt.localeCompare(a.request.createdAt),
  );
  return out.slice(0, max).map(({ request, shared }) => ({ request, shared }));
}
