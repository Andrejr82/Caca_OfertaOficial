import type {
  OfferQualityAffiliateLink,
  OfferQualityCandidateInput,
  OfferQualityMarketplace,
} from "./types";

type JsonRecord = Record<string, unknown>;

export interface PersistedAffiliateLinkRow {
  channel?: string | null;
  tracked_url?: string | null;
  trackedUrl?: string | null;
  sub_id?: string | null;
  subId?: string | null;
}

export interface PersistedOfferRow {
  id?: string | null;
  platform: string;
  product_name?: string | null;
  original_url?: string | null;
  image_url?: string | null;
  current_price?: number | string | null;
  old_price?: number | string | null;
  status?: string | null;
  item_id?: string | null;
  product_id?: string | null;
  shopee_item_id?: string | null;
  marketplace_metrics?: JsonRecord | null;
  explainability?: JsonRecord | null;
  affiliate_links?: readonly PersistedAffiliateLinkRow[] | null;
}

const CHANNELS = new Set<OfferQualityAffiliateLink["channel"]>([
  "telegram",
  "whatsapp",
  "facebook",
  "instagram",
]);

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function marketplace(value: string): OfferQualityMarketplace | null {
  return value === "Mercado Livre" || value === "Amazon" || value === "Shopee"
    ? value
    : null;
}

function nativeIdentity(
  platform: OfferQualityMarketplace,
  row: PersistedOfferRow,
  metrics: JsonRecord,
): string | null {
  if (platform === "Mercado Livre") {
    return text(row.item_id) ?? text(row.product_id) ?? text(metrics.itemId) ?? text(metrics.productId);
  }
  if (platform === "Amazon") {
    return text(row.product_id) ?? text(metrics.asin) ?? text(metrics.productId);
  }
  return text(row.shopee_item_id) ?? text(metrics.shopee_item_id) ?? text(metrics.itemId);
}

function affiliateLinks(rows: readonly PersistedAffiliateLinkRow[] | null | undefined): OfferQualityAffiliateLink[] {
  return (rows ?? []).flatMap((row) => {
    const channel = text(row.channel);
    const trackedUrl = text(row.tracked_url) ?? text(row.trackedUrl);
    if (!channel || !CHANNELS.has(channel as OfferQualityAffiliateLink["channel"]) || !trackedUrl) return [];
    return [{
      channel: channel as OfferQualityAffiliateLink["channel"],
      trackedUrl,
      subId: text(row.sub_id) ?? text(row.subId),
    }];
  });
}

function discountEvidence(explainability: JsonRecord, metrics: JsonRecord): JsonRecord | null {
  const explicit = explainability.discount_evidence ?? metrics.discountEvidence;
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) return explicit as JsonRecord;
  if (explainability.price_history_verified === true || metrics.priceHistoryVerified === true) {
    return { source: "price_history_verified" };
  }
  // discount_reason=VALID only proves old_price > current_price; it is not historical proof.
  return null;
}

export function toOfferQualityCandidateInput(row: PersistedOfferRow): OfferQualityCandidateInput | null {
  const platform = marketplace(row.platform);
  if (!platform) return null;

  const explainability = record(row.explainability);
  const metrics = {
    ...record(row.marketplace_metrics),
    ...record(explainability.marketplace_metrics),
  };
  const identity = nativeIdentity(platform, row, metrics);

  return {
    marketplace: platform,
    nativeIdentity: identity,
    sourceItemId: identity,
    title: text(row.product_name) ?? "",
    sourceUrl: text(row.original_url) ?? "",
    imageUrl: text(row.image_url) ?? "",
    currentPrice: Number(row.current_price),
    originalPrice: row.old_price == null ? null : Number(row.old_price),
    marketplaceMetrics: metrics,
    currentFlowStatus: row.status ?? null,
    discountEvidence: discountEvidence(explainability, metrics),
    affiliateLinks: affiliateLinks(row.affiliate_links),
  };
}
