import type { TrendMatchingMarketplace, TrendOfferCandidate } from "@/core/trends/offer-matching";
import { discoverMarketplaceCandidates, type MarketplaceDiscoveryStatus } from "@/lib/trends/targeted-marketplace-discovery";
import { filterTrendCommercialCandidates } from "@/lib/trends/trend-candidate-filters";
import { calculateCommercialScore } from "@/core/trends/commercial-score";

export interface TrendMarketplaceIntent {
  normalizedProductTerm: string;
  productIdentity: string;
  category?: string | null;
  queryVariants?: string[];
}

export interface MultimarketplaceDiscoveryInput {
  runId: string;
  intents: TrendMarketplaceIntent[];
  maxConcurrentJobs?: number;
  correlationId?: string;
  searchShopee?: (query: string) => Promise<TrendOfferCandidate[]>;
  searchMercadoLivre?: (query: string) => Promise<TrendOfferCandidate[]>;
}

export interface MarketplaceDiscoveryCounter {
  intents: number;
  found: number;
  noCandidates: number;
  unavailable: number;
  failed: number;
}

export interface MarketplaceDiscoveryError {
  marketplace: TrendMatchingMarketplace;
  code: "discovery_failed";
  correlationId: string;
  message: "Falha na descoberta comercial.";
}

export interface MarketplaceDiscoveryResult {
  runId: string;
  candidates: TrendOfferCandidate[];
  counters: Record<TrendMatchingMarketplace, MarketplaceDiscoveryCounter>;
  candidateCounts: Record<TrendMatchingMarketplace, { raw: number; accepted: number; rejected: number }>;
  errors: MarketplaceDiscoveryError[];
  results: Array<{
    marketplace: TrendMatchingMarketplace;
    normalizedProductTerm: string;
    queryUsed: string[];
    status: MarketplaceDiscoveryStatus;
    candidateCount: number;
    rejectedCandidateCount: number;
    correlationId: string;
  }>;
}

const DEFAULT_MAX_CONCURRENT_JOBS = 2;

function maxConcurrentJobs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CONCURRENT_JOBS;
  return Math.min(4, Math.max(1, Math.trunc(value as number)));
}

function emptyCounter(): MarketplaceDiscoveryCounter {
  return { intents: 0, found: 0, noCandidates: 0, unavailable: 0, failed: 0 };
}

function incrementStatus(counter: MarketplaceDiscoveryCounter, status: MarketplaceDiscoveryStatus) {
  if (status === "found") counter.found += 1;
  if (status === "no_candidates") counter.noCandidates += 1;
  if (status === "source_unavailable") counter.unavailable += 1;
}

export async function discoverTrendMarketplaceCandidates(
  input: MultimarketplaceDiscoveryInput
): Promise<MarketplaceDiscoveryResult> {
  const counters: Record<TrendMatchingMarketplace, MarketplaceDiscoveryCounter> = {
    Shopee: emptyCounter(),
    "Mercado Livre": emptyCounter()
  };
  const candidateCounts: MarketplaceDiscoveryResult["candidateCounts"] = {
    Shopee: { raw: 0, accepted: 0, rejected: 0 },
    "Mercado Livre": { raw: 0, accepted: 0, rejected: 0 }
  };
  const candidates: TrendOfferCandidate[] = [];
  const errors: MarketplaceDiscoveryError[] = [];
  const results: MarketplaceDiscoveryResult["results"] = [];
  const jobs = input.intents.flatMap((intent, intentIndex) => (
    (["Shopee", "Mercado Livre"] as const).map((marketplace) => ({ intent, intentIndex, marketplace }))
  ));

  for (const marketplace of ["Shopee", "Mercado Livre"] as const) {
    counters[marketplace].intents = input.intents.length;
  }

  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const correlationId = input.correlationId
        ? `${input.correlationId}:${job.intentIndex}:${job.marketplace}`
        : `${input.runId}:${job.intentIndex}:${job.marketplace}`;
      const search = job.marketplace === "Shopee" ? input.searchShopee : input.searchMercadoLivre;
      try {
        const discovery = await discoverMarketplaceCandidates({
          marketplace: job.marketplace,
          normalizedProductTerm: job.intent.normalizedProductTerm,
          productIdentity: job.intent.productIdentity,
          queryVariants: job.intent.queryVariants,
          searchShopee: job.marketplace === "Shopee" ? search : undefined,
          searchMercadoLivre: job.marketplace === "Mercado Livre" ? search : undefined
        });
        incrementStatus(counters[job.marketplace], discovery.discovery_status);
        if (discovery.discovery_status === "source_unavailable") {
          errors.push({ marketplace: job.marketplace, code: "discovery_failed", correlationId, message: "Falha na descoberta comercial." });
        }
        const filtered = filterTrendCommercialCandidates(job.intent.normalizedProductTerm, discovery.candidates);
        const eligible = filtered.accepted.filter((candidate) => calculateCommercialScore(candidate).queueEligible);
        candidateCounts[job.marketplace].raw += discovery.candidates.length;
        candidateCounts[job.marketplace].accepted += eligible.length;
        candidateCounts[job.marketplace].rejected += filtered.rejected.length + filtered.accepted.length - eligible.length;
        candidates.push(...eligible);
        results.push({
          marketplace: job.marketplace,
          normalizedProductTerm: job.intent.normalizedProductTerm,
          queryUsed: discovery.query_used,
          status: discovery.discovery_status,
          candidateCount: eligible.length,
          rejectedCandidateCount: filtered.rejected.length + filtered.accepted.length - eligible.length,
          correlationId
        });
      } catch {
        counters[job.marketplace].failed += 1;
        errors.push({ marketplace: job.marketplace, code: "discovery_failed", correlationId, message: "Falha na descoberta comercial." });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxConcurrentJobs(input.maxConcurrentJobs), jobs.length) }, () => worker()));

  const seen = new Set<string>();
  return {
    runId: input.runId,
    candidates: candidates.filter((candidate) => {
      const identity = `${candidate.marketplace}:${candidate.id}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }),
    counters,
    candidateCounts,
    errors,
    results
  };
}
