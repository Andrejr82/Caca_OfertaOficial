import type { TrendSignalClassification } from "@/core/trends/types";
import { matchTrendClassification, type TrendMatchResult, type TrendOfferCandidate } from "@/core/trends/offer-matching";

export interface TrendOpportunityRow {
  user_id: string;
  signal_id: string;
  classification_id: string;
  offer_id: string;
  marketplace: "Shopee" | "Mercado Livre";
  normalized_product_term: string;
  match_status: "matched";
  match_reason: string;
  match_confidence: 100;
  score: null;
  status: "matched";
  experiment_id: null;
  strategy_version: string;
  final_decision: null;
}

export function toTrendOpportunityRows(
  userId: string,
  classification: TrendSignalClassification,
  result: TrendMatchResult
): TrendOpportunityRow[] {
  const normalizedProductTerm = classification.normalizedProductTerm;
  if (result.status !== "matched" || !normalizedProductTerm) return [];
  return result.validCandidates.map((match) => ({
    user_id: userId,
    signal_id: classification.signalId,
    classification_id: classification.id,
    offer_id: match.offerId,
    marketplace: match.marketplace,
    normalized_product_term: normalizedProductTerm,
    match_status: "matched",
    match_reason: match.reason,
    match_confidence: 100,
    score: null,
    status: "matched",
    experiment_id: null,
    strategy_version: classification.strategyVersion,
    final_decision: null
  }));
}

interface TrendMatchingClient {
  from(table: string): any;
}

export type TrendTargetedDiscovery = (classification: TrendSignalClassification) => Promise<TrendOfferCandidate[]>;

export interface TrendMatchingSummary {
  eligibleSignals: number;
  matchedSignals: number;
  noMatchSignals: number;
  validMatches: number;
  rejectedFalseMatches: number;
  opportunitiesCreated: number;
  skippedExisting: number;
  results: Array<{ classificationId: string; term: string; result: TrendMatchResult }>;
}

function signalClassification(row: any): TrendSignalClassification {
  return {
    id: row.id,
    signalId: row.trend_signal_id,
    commercialRelevance: Number(row.commercial_relevance),
    isProductIntent: row.is_product_intent,
    normalizedProductTerm: row.normalized_product_term,
    categoryHint: row.category_hint,
    decision: row.decision,
    reason: row.reason,
    aiModel: row.ai_model,
    strategyVersion: row.strategy_version,
    classifiedAt: row.classified_at
  };
}

function offerCandidate(row: any): TrendOfferCandidate {
  return {
    id: row.id,
    marketplace: row.platform,
    productName: row.product_name,
    category: row.category,
    currentPrice: row.current_price,
    oldPrice: row.old_price,
    itemId: row.item_id,
    productId: row.product_id,
    shopeeItemId: row.shopee_item_id,
    marketplaceMetrics: row.marketplace_metrics ?? {}
  };
}

export async function persistTrendOpportunities(client: TrendMatchingClient, rows: TrendOpportunityRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await client.from("trend_opportunities").upsert(rows, { onConflict: "user_id,signal_id,offer_id,strategy_version" });
  if (error) throw new Error(`Falha ao persistir oportunidades de tendência: ${error.message}`);
  return rows.length;
}

export async function matchTrendSignalsForUser(client: TrendMatchingClient, userId: string, targetedDiscovery?: TrendTargetedDiscovery): Promise<TrendMatchingSummary> {
  const classificationsQuery = await client.from("trend_signal_classifications")
    .select("id,trend_signal_id,commercial_relevance,is_product_intent,normalized_product_term,category_hint,decision,reason,ai_model,strategy_version,classified_at")
    .eq("user_id", userId)
    .eq("decision", "eligible");
  if (classificationsQuery.error) throw new Error(`Falha ao carregar classificações: ${classificationsQuery.error.message}`);
  const rows = classificationsQuery.data ?? [];
  const existingQuery = await client.from("trend_opportunities")
    .select("signal_id,offer_id,classification_id,strategy_version")
    .eq("user_id", userId);
  if (existingQuery.error) throw new Error(`Falha ao carregar oportunidades existentes: ${existingQuery.error.message}`);
  const existing = new Set((existingQuery.data ?? []).map((row: any) => `${row.signal_id}:${row.offer_id}:${row.strategy_version}`));

  const offersQuery = await client.from("offers")
    .select("id,platform,product_name,category,current_price,old_price,item_id,product_id,shopee_item_id,marketplace_metrics")
    .eq("user_id", userId)
    .in("platform", ["Shopee", "Mercado Livre"])
    .limit(5000);
  if (offersQuery.error) throw new Error(`Falha ao carregar ofertas candidatas: ${offersQuery.error.message}`);
  const persistedCandidates = (offersQuery.data ?? []).map(offerCandidate) as TrendOfferCandidate[];
  const nativeIdToOfferId = new Map<string, string>();
  for (const candidate of persistedCandidates) {
    for (const nativeId of [candidate.itemId, candidate.productId, candidate.shopeeItemId]) {
      if (nativeId) nativeIdToOfferId.set(`${candidate.marketplace}:${nativeId}`, candidate.id);
    }
  }

  const results: TrendMatchingSummary["results"] = [];
  const opportunityRows: TrendOpportunityRow[] = [];
  let rejectedFalseMatches = 0;
  let noMatchSignals = 0;
  let matchedSignals = 0;

  for (const rawClassification of rows) {
    const classification = signalClassification(rawClassification);
    const term = classification.normalizedProductTerm ?? "";
    let result = matchTrendClassification(classification, persistedCandidates);

    if (result.status !== "matched" && targetedDiscovery) {
      const discoveredCandidates = await targetedDiscovery(classification);
      // Opportunity.offer_id is a foreign key. Current official results without
      // a corresponding persisted offer remain discovery evidence, not writes.
      const resolvedDiscoveredCandidates = discoveredCandidates.flatMap((candidate) => {
        const nativeId = candidate.shopeeItemId || candidate.itemId || candidate.productId;
        const offerId = nativeId ? nativeIdToOfferId.get(`${candidate.marketplace}:${nativeId}`) : null;
        return offerId ? [{ ...candidate, id: offerId }] : [];
      });
      if (resolvedDiscoveredCandidates.length > 0) {
        result = matchTrendClassification(classification, [...persistedCandidates, ...resolvedDiscoveredCandidates]);
      }
    }

    results.push({ classificationId: classification.id, term, result });
    rejectedFalseMatches += result.rejectedCandidates.length;
    if (result.status === "matched") matchedSignals += 1;
    else noMatchSignals += 1;
    for (const row of toTrendOpportunityRows(userId, classification, result)) {
      const key = `${row.signal_id}:${row.offer_id}:${row.strategy_version}`;
      if (existing.has(key)) continue;
      opportunityRows.push(row);
    }
  }

  const opportunitiesCreated = await persistTrendOpportunities(client, opportunityRows);
  return {
    eligibleSignals: rows.length,
    matchedSignals,
    noMatchSignals,
    validMatches: opportunityRows.length,
    rejectedFalseMatches,
    opportunitiesCreated,
    skippedExisting: existing.size,
    results
  };
}
