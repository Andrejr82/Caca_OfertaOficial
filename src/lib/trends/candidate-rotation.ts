import type { TrendOfferCandidate } from "@/core/trends/offer-matching";

export type TrendExposureStatus = "exposed" | "pending" | "approved" | "rejected" | "published";

export interface TrendExposureLookup {
  marketplace: string;
  nativeProductId: string;
  exposureStatus: TrendExposureStatus;
}

export interface CandidateRotationInput {
  runId: string;
  intentKey: string;
  candidates: TrendOfferCandidate[];
  exposureHistory?: TrendExposureLookup[];
  limit?: number;
  pageSize?: number;
  maxPages?: number;
  allowRepeatFallback?: boolean;
}

export interface CandidateRotationResult {
  selected: TrendOfferCandidate[];
  nextPage: number;
  offset: number;
  pagesToQuery: number[];
  fallbackUsed: boolean;
  repeatedCandidateIds: string[];
}

const BLOCKING_STATUSES = new Set<TrendExposureStatus>(["exposed", "pending", "approved", "rejected", "published"]);

function positiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(value as number)));
}

export function candidateNativeIdentity(candidate: TrendOfferCandidate): { marketplace: string; nativeProductId: string } {
  const metrics = candidate.marketplaceMetrics ?? {};
  const nativeId = candidate.marketplace === "Shopee"
    ? candidate.shopeeItemId || candidate.itemId || metrics.shopee_item_id || metrics.itemId || candidate.id
    : candidate.itemId || candidate.productId || metrics.itemId || metrics.item_id || metrics.productId || candidate.id;
  return { marketplace: candidate.marketplace, nativeProductId: String(nativeId) };
}

function identity(candidate: TrendOfferCandidate): string {
  const native = candidateNativeIdentity(candidate);
  return `${native.marketplace}:${native.nativeProductId}`;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function rotateTrendCandidates(input: CandidateRotationInput): CandidateRotationResult {
  const limit = positiveInteger(input.limit, 10, 100);
  const pageSize = positiveInteger(input.pageSize, 20, 50);
  const maxPages = positiveInteger(input.maxPages, 10, 100);
  const nextPage = (hash(`${input.runId}\u0000${input.intentKey}`) % maxPages) + 1;
  const offset = (nextPage - 1) * pageSize;
  const seen = new Set<string>();
  const uniqueCandidates = input.candidates.filter((candidate) => {
    const key = identity(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const history = new Map(
    (input.exposureHistory ?? []).map((item) => [`${item.marketplace}:${item.nativeProductId}`, item.exposureStatus]),
  );
  const ordered = [...uniqueCandidates].sort((left, right) => {
    const leftHash = hash(`${input.runId}\u0000${input.intentKey}\u0000${identity(left)}`);
    const rightHash = hash(`${input.runId}\u0000${input.intentKey}\u0000${identity(right)}`);
    return leftHash - rightHash || identity(left).localeCompare(identity(right));
  });
  const fresh = ordered.filter((candidate) => !BLOCKING_STATUSES.has(history.get(identity(candidate)) as TrendExposureStatus));
  const repeated = ordered.filter((candidate) => history.has(identity(candidate)));
  const selected = fresh.slice(0, limit);
  const fallback = selected.length < limit && input.allowRepeatFallback ? repeated.slice(0, limit - selected.length) : [];
  const pagesToQuery = [...new Set([nextPage, nextPage === maxPages ? 1 : nextPage + 1])];
  return {
    selected: [...selected, ...fallback],
    nextPage,
    offset,
    pagesToQuery,
    fallbackUsed: fallback.length > 0,
    repeatedCandidateIds: fallback.map((candidate) => candidate.id)
  };
}
