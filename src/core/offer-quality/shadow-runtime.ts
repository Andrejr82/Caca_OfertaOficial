import { evaluateCandidates } from "./common-evaluator";
import type { OfferQualityCandidateInput } from "./types";

type JsonRecord = Record<string, unknown>;

interface DiscoveryProduct {
  marketplace?: string;
  sourceItemId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  currentPrice?: number | string | null;
  originalPrice?: number | string | null;
  marketplaceMetrics?: JsonRecord | null;
  affiliateLinks?: Array<{ channel?: string; trackedUrl?: string; tracked_url?: string; subId?: string | null; sub_id?: string | null }>;
}

interface ShadowQueue {
  selected?: DiscoveryProduct[];
  skipped?: Array<{ sourceItemId?: string | null; reason?: string }>;
  deferred?: DiscoveryProduct[];
}

const MARKETPLACES = new Set(["Mercado Livre", "Amazon", "Shopee"]);
const CHANNELS = new Set(["telegram", "whatsapp", "facebook", "instagram"]);

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizeMarketplace(value: unknown): "Mercado Livre" | "Amazon" | "Shopee" | null {
  const result = text(value);
  return result && MARKETPLACES.has(result) ? result as "Mercado Livre" | "Amazon" | "Shopee" : null;
}

function identity(product: DiscoveryProduct, marketplace: string): string | null {
  const metrics = product.marketplaceMetrics ?? {};
  if (marketplace === "Amazon") return text(metrics.asin) ?? text(product.sourceItemId);
  if (marketplace === "Mercado Livre") return text(metrics.itemId) ?? text(metrics.item_id) ?? text(product.sourceItemId);
  return text(metrics.itemId) ?? text(metrics.shopee_item_id) ?? text(product.sourceItemId);
}

function links(product: DiscoveryProduct) {
  return (product.affiliateLinks ?? []).flatMap((link) => {
    const channel = text(link.channel);
    const trackedUrl = text(link.trackedUrl) ?? text(link.tracked_url);
    if (!channel || !CHANNELS.has(channel) || !trackedUrl) return [];
    return [{ channel: channel as "telegram" | "whatsapp" | "facebook" | "instagram", trackedUrl, subId: text(link.subId) ?? text(link.sub_id) }];
  });
}

function toCandidate(product: DiscoveryProduct): OfferQualityCandidateInput | null {
  const marketplace = normalizeMarketplace(product.marketplace);
  if (!marketplace) return null;
  const nativeIdentity = identity(product, marketplace);
  if (!nativeIdentity || !text(product.title) || !text(product.sourceUrl) || !text(product.imageUrl)) return null;
  return {
    marketplace,
    nativeIdentity,
    sourceItemId: nativeIdentity,
    title: text(product.title)!,
    sourceUrl: text(product.sourceUrl)!,
    imageUrl: text(product.imageUrl)!,
    currentPrice: Number(product.currentPrice),
    originalPrice: product.originalPrice == null ? null : Number(product.originalPrice),
    marketplaceMetrics: product.marketplaceMetrics ?? {},
    affiliateLinks: links(product),
  };
}

export function evaluateDiscoveryShadow(
  rawProducts: readonly DiscoveryProduct[],
  queue: ShadowQueue,
  options: { runId: string; generatedAt: string },
) {
  const candidates = rawProducts.map(toCandidate).filter((candidate): candidate is OfferQualityCandidateInput => candidate !== null);
  const report = evaluateCandidates(candidates, options);
  const v1Selected = new Set((queue.selected ?? []).map((product) => text(product.sourceItemId)).filter((id): id is string => Boolean(id)));
  const v2Winners = new Set(report.winners.map((decision) => decision.winnerSourceItemId).filter((id): id is string => Boolean(id)));
  const v1Only = [...v1Selected].filter((id) => !v2Winners.has(id)).length;
  const v2Only = [...v2Winners].filter((id) => !v1Selected.has(id)).length;
  return Object.freeze({
    recordCount: candidates.length,
    v1Selected: v1Selected.size,
    v2Winners: v2Winners.size,
    v1Only,
    v2Only,
    groups: report.groupCount,
    rejected: report.decisions.filter((decision) => decision.decision === "rejected").length,
    duplicates: report.decisions.filter((decision) => decision.decision === "duplicate").length,
    incompleteMonetization: report.decisions.filter((decision) => decision.monetizationStatus === "incomplete").length,
    persistAttempts: report.persistAttemptCount,
  });
}
