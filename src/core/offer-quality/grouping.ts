import type {
  GroupKeyResult,
  OfferQualityCandidate,
  ValidationResult,
} from "./types";

const AMAZON_ASIN = /^[A-Z0-9]{10}$/i;
const HTTPS_URL = /^https:\/\//i;

function invalid(...reasons: string[]): ValidationResult {
  return { valid: false, code: reasons[0] ?? "invalid_candidate", reasons };
}

function valid(): ValidationResult {
  return { valid: true, reasons: [] };
}

export function validateNativeIdentity(candidate: OfferQualityCandidate): ValidationResult {
  const metrics = candidate.marketplaceMetrics ?? {};
  const identity = String(candidate.nativeIdentity || "").trim();

  if (!identity || /^(null|undefined)$/i.test(identity) || /https?:\/\//i.test(identity) || identity.includes("/")) {
    return invalid("invalid_native_identity");
  }

  if (candidate.marketplace === "Mercado Livre") {
    const itemId = String(metrics.item_id ?? metrics.itemId ?? identity).trim();
    return itemId && !/^(null|undefined)$/i.test(itemId) ? valid() : invalid("missing_ml_item_id");
  }

  if (candidate.marketplace === "Amazon") {
    const asin = String(metrics.asin ?? metrics.product_id ?? identity).trim();
    return AMAZON_ASIN.test(asin) ? valid() : invalid("invalid_amazon_asin");
  }

  if (candidate.marketplace === "Shopee") {
    const itemId = String(metrics.itemId ?? metrics.shopee_item_id ?? identity).trim();
    return itemId && !/^(null|undefined)$/i.test(itemId) ? valid() : invalid("missing_shopee_item_id");
  }

  return invalid("unsupported_marketplace");
}

export function validateCandidateBasics(candidate: OfferQualityCandidate): ValidationResult {
  const reasons: string[] = [];
  if (!HTTPS_URL.test(candidate.sourceUrl)) reasons.push("invalid_source_url");
  if (!HTTPS_URL.test(candidate.imageUrl)) reasons.push("invalid_image_url");
  if (candidate.title.trim().length < 5) reasons.push("invalid_title");
  if (!Number.isFinite(candidate.currentPrice) || candidate.currentPrice <= 0) reasons.push("invalid_price");
  if (candidate.originalPrice != null && (
    !Number.isFinite(candidate.originalPrice) ||
    candidate.originalPrice < candidate.currentPrice
  )) reasons.push("invalid_original_price");
  return reasons.length ? invalid(...reasons) : valid();
}

export function getGroupKey(candidate: OfferQualityCandidate): GroupKeyResult {
  const metrics = candidate.marketplaceMetrics ?? {};

  if (candidate.marketplace === "Mercado Livre") {
    const match = candidate.sourceUrl.match(/\/p\/(MLB\d+)/i);
    if (match) {
      return {
        key: `ml:catalog:/p/${match[1].toLowerCase()}`,
        evidence: ["catalog_url"],
        confidence: 100,
      };
    }
    return {
      key: `ml:item:${candidate.nativeIdentity.toUpperCase()}`,
      evidence: ["native_item_id"],
      confidence: 100,
    };
  }

  if (candidate.marketplace === "Amazon") {
    const asin = String(metrics.asin ?? metrics.product_id ?? candidate.nativeIdentity).toUpperCase();
    return {
      key: `amazon:asin:${asin}`,
      evidence: ["asin"],
      confidence: 100,
    };
  }

  const itemId = String(metrics.itemId ?? metrics.shopee_item_id ?? candidate.nativeIdentity);
  const shopId = String(metrics.shopId ?? metrics.shop_id ?? "unknown");
  return {
    key: `shopee:item:${itemId}:shop:${shopId}`,
    evidence: shopId === "unknown" ? ["item_id_without_shop_id"] : ["item_id", "shop_id"],
    confidence: shopId === "unknown" ? 70 : 100,
  };
}
