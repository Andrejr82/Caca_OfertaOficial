import type { TrendOfferCandidate } from "@/core/trends/offer-matching";
import { calculateCommercialScore } from "@/core/trends/commercial-score";

export interface RadarPersistenceResult {
  radar_date: string;
  radar_run_id?: string;
  product_term: string;
  normalized_product_term: string;
  evidence_status: "verified" | "partial" | "unverified" | "rejected";
  strategy_version: string;
  source_urls: string[];
  direct_evidence: Array<Record<string, unknown>>;
  observed_at: string | null;
  category?: string | null;
  marketplaces?: string[];
  source_types?: string[];
  source_count: number;
  confidence: number;
}

export type RadarPersistenceCandidate = TrendOfferCandidate;

function requireText(value: unknown, field: string): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${field} obrigatório para persistência Radar.`);
  return result;
}

function requirePrice(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error("current_price obrigatório para persistência Radar.");
  return result;
}

function nativeIdentity(candidate: RadarPersistenceCandidate): { itemId: string | null; productId: string | null; shopeeItemId: string | null } {
  return {
    itemId: candidate.itemId ? String(candidate.itemId) : null,
    productId: candidate.productId ? String(candidate.productId) : null,
    shopeeItemId: candidate.shopeeItemId ? String(candidate.shopeeItemId) : null
  };
}

export function buildRadarOrigin(userId: string, radar: RadarPersistenceResult) {
  const productTerm = requireText(radar.product_term, "product_term");
  const radarDate = requireText(radar.radar_date, "radar_date");
  return {
    user_id: requireText(userId, "user_id"),
    source_type: "external",
    source_name: "external_radar",
    source: "external_radar",
    region: "BR",
    external_id: `${radarDate}:${radar.normalized_product_term.toLocaleLowerCase("pt-BR")}`,
    title: productTerm,
    term: productTerm,
    evidence: {
      provenance: "external_radar",
      radar_date: radar.radar_date,
      evidence_status: radar.evidence_status,
      strategy_version: radar.strategy_version,
      source_urls: radar.source_urls,
      direct_evidence: radar.direct_evidence,
      source_count: radar.source_count,
      confidence: radar.confidence,
      category: radar.category ?? null,
      marketplaces: radar.marketplaces ?? [],
      source_types: radar.source_types ?? []
    },
    observed_at: radar.observed_at ?? new Date().toISOString(),
    captured_at: new Date().toISOString(),
    trend_strength: null,
    trend_direction: null,
    offer_id: null
  };
}

export function buildRadarOfferRow(userId: string, radar: RadarPersistenceResult, candidate: RadarPersistenceCandidate) {
  if (candidate.marketplace !== "Shopee" && candidate.marketplace !== "Mercado Livre") throw new Error("Marketplace fora do escopo Radar.");
  const identity = nativeIdentity(candidate);
  if (candidate.marketplace === "Shopee" && !identity.shopeeItemId) throw new Error("shopee_item_id obrigatório para persistência Radar.");
  if (candidate.marketplace === "Mercado Livre" && !identity.itemId && !identity.productId) throw new Error("item_id ou product_id obrigatório para persistência Radar.");
  const url = requireText(candidate.permalink, "original_url");
  if (!/^https?:\/\//i.test(url)) throw new Error("original_url inválida para persistência Radar.");
  return {
    user_id: requireText(userId, "user_id"),
    platform: candidate.marketplace,
    product_name: requireText(candidate.productName, "product_name"),
    category: candidate.category ?? radar.category ?? null,
    original_url: url,
    image_url: typeof candidate.marketplaceMetrics?.imageUrl === "string" ? candidate.marketplaceMetrics.imageUrl : null,
    current_price: requirePrice(candidate.currentPrice),
    old_price: candidate.oldPrice == null ? null : Number(candidate.oldPrice),
    // `offers.score` uses the operational scale 0–10, while the Radar
    // commercial score is calculated on a 0–100 scale.
    score: Number((calculateCommercialScore(candidate).commercialScore / 10).toFixed(2)),
    status: "pending_manual_review",
    explainability: {
      provenance: "external_radar",
      radar_date: radar.radar_date,
      radar_run_id: radar.radar_run_id ?? null,
      product_term: radar.product_term,
      evidence_status: radar.evidence_status,
      strategy_version: radar.strategy_version,
      discovery_source: candidate.marketplace === "Shopee" ? "shopee_v1_official" : "mercado_livre_official",
      marketplace_identity: identity,
      editorial_eligible: false
    },
    notes: "AI Radar: identidade canônica, fora do cohort editorial.",
    item_id: identity.itemId,
    product_id: identity.productId,
    shopee_item_id: identity.shopeeItemId,
    shopee_shop_id: typeof candidate.marketplaceMetrics?.shopId === "string" ? candidate.marketplaceMetrics.shopId : null,
    seller_id: typeof candidate.marketplaceMetrics?.sellerId === "string" ? candidate.marketplaceMetrics.sellerId : null,
    marketplace_metrics: candidate.marketplaceMetrics ?? {}
  };
}

export function buildRadarOpportunityRow(input: {
  userId: string;
  signalId: string;
  offerId: string;
  radar: RadarPersistenceResult;
  candidate: RadarPersistenceCandidate;
  discoveryQueries: string[];
  discoverySource: string;
  matchReason: string;
}) {
  return {
    user_id: requireText(input.userId, "user_id"),
    signal_id: requireText(input.signalId, "signal_id"),
    classification_id: null,
    offer_id: requireText(input.offerId, "offer_id"),
    marketplace: input.candidate.marketplace,
    normalized_product_term: input.radar.normalized_product_term,
    match_status: "matched",
    match_reason: JSON.stringify({
      reason: input.matchReason,
      provenance: "external_radar",
      evidence_status: input.radar.evidence_status,
      discovery_source: input.discoverySource,
      discovery_queries: input.discoveryQueries,
      marketplace_identity: nativeIdentity(input.candidate)
    }),
    match_confidence: 100,
    score: null,
    status: "matched",
    experiment_id: null,
    strategy_version: input.radar.strategy_version,
    final_decision: null
  };
}

interface RadarPersistenceClient {
  from(table: string): any;
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function persistRadarOrigin(client: RadarPersistenceClient, userId: string, radar: RadarPersistenceResult): Promise<string> {
  if (radar.evidence_status !== "verified") throw new Error("Somente Radar verified pode originar oportunidade.");
  const { data, error } = await client.from("trend_signals").upsert(buildRadarOrigin(userId, radar), { onConflict: "user_id,source_name,external_id" }).select("id").single();
  if (error || !data?.id) throw new Error(`Falha ao persistir origem Radar: ${error?.message || "id ausente"}`);
  return data.id;
}

export async function persistRadarOffer(client: RadarPersistenceClient, userId: string, radar: RadarPersistenceResult, candidate: RadarPersistenceCandidate): Promise<string> {
  const row = buildRadarOfferRow(userId, radar, candidate);
  const { error } = await client.rpc("upsert_trend_radar_offers_v2", { p_marketplace: candidate.marketplace, p_rows: [row] });
  if (error) throw new Error(`Falha ao persistir oferta Radar: ${error.message}`);
  const identity = nativeIdentity(candidate);
  let query = client.from("offers").select("id").eq("user_id", userId).eq("platform", candidate.marketplace);
  query = candidate.marketplace === "Shopee" ? query.eq("shopee_item_id", identity.shopeeItemId) : identity.itemId ? query.eq("item_id", identity.itemId) : query.eq("product_id", identity.productId);
  const { data, error: readError } = await query.maybeSingle();
  if (readError || !data?.id) throw new Error(`Oferta Radar persistida sem id canônico: ${readError?.message || "id ausente"}`);
  return data.id;
}

export async function persistRadarOpportunity(client: RadarPersistenceClient, row: ReturnType<typeof buildRadarOpportunityRow>): Promise<string> {
  const { data, error } = await client.from("trend_opportunities").upsert(row, { onConflict: "user_id,signal_id,offer_id,strategy_version" }).select("id").single();
  if (error || !data?.id) throw new Error(`Falha ao persistir oportunidade Radar: ${error?.message || "id ausente"}`);
  return data.id;
}
