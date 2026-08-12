import type { TrendOfferCandidate } from "@/core/trends/offer-matching";
import { persistRadarOffer, type RadarPersistenceCandidate, type RadarPersistenceResult } from "@/lib/trends/radar-persistence";

export interface MultimarketplaceApprovalProduct {
  id: string;
  priority: number;
  product_term: string;
  normalized_product_term?: string | null;
  category: string | null;
  evidence_status: "verified" | "partial" | "unverified" | "rejected";
  commercial_score: number | null;
  confidence: number | null;
}

export interface MarketplaceApprovalCandidate {
  radarProduct: MultimarketplaceApprovalProduct;
  candidate: TrendOfferCandidate;
}

interface ApprovalClient {
  from(table: string): any;
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function radarInput(runId: string, product: MultimarketplaceApprovalProduct): RadarPersistenceResult {
  return {
    radar_date: new Date().toISOString().slice(0, 10),
    product_term: product.product_term,
    normalized_product_term: product.normalized_product_term || product.product_term,
    evidence_status: product.evidence_status,
    strategy_version: "daily-commercial-radar-v1",
    source_urls: [],
    direct_evidence: [{ claim: "Candidato descoberto no Radar.", radar_run_id: runId }],
    observed_at: new Date().toISOString(),
    category: product.category,
    marketplaces: ["Shopee", "Mercado Livre"],
    source_types: ["official_marketplace_search"],
    source_count: 1,
    confidence: Number(product.confidence ?? 0)
  };
}

export async function persistTrendMarketplaceApprovalCandidates(
  client: ApprovalClient,
  userId: string,
  runId: string,
  candidates: MarketplaceApprovalCandidate[],
) {
  const byMarketplace = {
    Shopee: { inserted: 0, updated: 0, failed: 0, readyOfferIds: [] as string[] },
    "Mercado Livre": { inserted: 0, updated: 0, failed: 0, readyOfferIds: [] as string[] }
  };
  for (const entry of candidates) {
    try {
      const offerId = await persistRadarOffer(client, userId, radarInput(runId, entry.radarProduct), entry.candidate as RadarPersistenceCandidate);
      byMarketplace[entry.candidate.marketplace as "Shopee" | "Mercado Livre"].readyOfferIds.push(offerId);
      byMarketplace[entry.candidate.marketplace as "Shopee" | "Mercado Livre"].inserted += 1;
    } catch {
      byMarketplace[entry.candidate.marketplace as "Shopee" | "Mercado Livre"].failed += 1;
    }
  }
  return byMarketplace;
}

export const persistTrendMercadoLivreApprovalCandidates = persistTrendMarketplaceApprovalCandidates;
