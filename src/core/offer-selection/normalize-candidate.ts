import { extractEvidence } from "./evidence";
import type {
  CandidateDecisionV2,
  MarketplaceV2,
  RawCandidateInput,
} from "./types";

function normalizeMarketplaceName(value: unknown): MarketplaceV2 {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "amazon") return "Amazon";
  if (text === "shopee") return "Shopee";
  if (text === "mercado livre" || text === "mercadolivre") return "Mercado Livre";
  return "Mercado Livre";
}

function resolveNativeIdentity(marketplace: MarketplaceV2, input: RawCandidateInput): string {
  const metrics = (input.marketplaceMetrics ?? {}) as Record<string, unknown>;
  const raw = (input.rawPayload ?? {}) as Record<string, unknown>;

  if (marketplace === "Amazon") {
    const asin = String(metrics.asin || metrics.product_id || raw.asin || input.sourceItemId || input.nativeIdentity || "").trim();
    return asin;
  }
  if (marketplace === "Mercado Livre") {
    const mlb = String(metrics.item_id || metrics.itemId || raw.id || input.sourceItemId || input.nativeIdentity || "").trim();
    return mlb;
  }
  if (marketplace === "Shopee") {
    const id = String(metrics.shopee_item_id || metrics.itemId || raw.item_id || input.sourceItemId || input.nativeIdentity || "").trim();
    return id;
  }
  return String(input.sourceItemId || input.nativeIdentity || "").trim();
}

export function normalizeCandidateToV2(
  input: RawCandidateInput,
  options: {
    correlationId?: string;
    discoveredAt?: string;
    evaluatedAt?: string;
  } = {},
): CandidateDecisionV2 {
  const marketplace = normalizeMarketplaceName(input.marketplace);
  const nativeIdentity = resolveNativeIdentity(marketplace, input);
  const sourceItemId = String(input.sourceItemId ?? nativeIdentity).trim();
  const evidence = extractEvidence(input);
  const now = new Date().toISOString();

  const title = String(input.title ?? "").trim();
  const sourceUrl = String(input.sourceUrl || input.url || input.link || "").trim();
  const imageUrl = String(input.imageUrl ?? "").trim();
  const intentId = input.intentId || input.intent || null;

  return Object.freeze({
    contractVersion: "candidate-decision/v2",
    candidateId: `${marketplace.toLowerCase()}:${nativeIdentity || sourceItemId}`,
    marketplace,
    nativeIdentity,
    sourceItemId,
    sourceUrl,
    imageUrl,
    title,
    intentId,
    productRole: input.productRole ?? "main_product",
    classification: {
      status: input.classification?.status ?? "classified",
      productType: input.classification?.productType ?? null,
    },
    identityGroup: {
      exactKey: `${marketplace.toLowerCase()}|${nativeIdentity}`,
      familyKey: null,
      crossMarketplaceKey: null,
      confidence: 1.0,
    },
    evidence,
    freshness: {
      state: "new",
      eligible: true,
      reason: "initial_admission",
    },
    decision: "selected",
    score: {
      total: 0,
      semantic: 0,
      evidence: 0,
      value: 0,
      logistics: 0,
      freshness: 0,
      version: "candidate-decision/v2",
    },
    reasons: Object.freeze([]),
    trace: Object.freeze({
      correlationId: options.correlationId || "discovery-v2-trace",
      discoveredAt: options.discoveredAt || now,
      evaluatedAt: options.evaluatedAt || now,
    }),
  });
}
