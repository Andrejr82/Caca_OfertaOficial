import { buildDeterministicFallbackPlan } from "@/core/ai/copy-v5-planner";
import { renderCopyV5ChannelCopy } from "@/core/ai/copy-v5-renderer";
import type { CopyV5Facts } from "@/core/ai/copy-v5-types";
import type { OfficialAIChannel } from "@/core/ai/types";
import type { AffiliateLink, Offer } from "@/types/domain";

export type OfferSignals = {
  hasRealDiscount: boolean;
  discountPercent?: number;
  hasPixBenefit: boolean;
  pixSavings?: number;
  hasInstallments: boolean;
  installmentCount?: number;
  installmentValue?: number;
  interestFreeConfirmed: boolean;
  hasCoupon: boolean;
  couponCode?: string;
  couponStage?: string;
  hasFreeShipping: boolean;
  isPrimeOnly: boolean;
  hasSubscriptionPrice: boolean;
  isOfficialStore: boolean;
  hasVariationRestriction: boolean;
  isBestSeller: boolean;
  hasLimitedTimeEvidence: boolean;
};

function numberOrUndefined(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function commercialData(offer: Offer) {
  const direct = offer as Offer & Record<string, unknown>;
  const explainability = (offer.explainability ?? {}) as Record<string, unknown>;
  const marketplaceMetrics = (direct.marketplace_metrics ?? {}) as Record<string, unknown>;
  return {
    pix_price: explainability.pix_price ?? marketplaceMetrics.pix_price,
    installment_count: explainability.installment_count ?? marketplaceMetrics.installment_count,
    installment_value: explainability.installment_value ?? marketplaceMetrics.installment_value,
    installment_interest_free: explainability.installment_interest_free ?? marketplaceMetrics.installment_interest_free,
    coupon_code: offer.coupon ?? explainability.coupon_code ?? marketplaceMetrics.coupon_code,
    coupon_application_stage: explainability.coupon_application_stage ?? marketplaceMetrics.coupon_application_stage,
    free_shipping: direct.shipping_free ?? explainability.free_shipping ?? marketplaceMetrics.free_shipping,
    prime_only: explainability.prime_only ?? marketplaceMetrics.prime_only,
    subscription_price: explainability.subscription_price ?? marketplaceMetrics.subscription_price,
    official_store: explainability.official_store ?? marketplaceMetrics.official_store,
    variation_condition: explainability.variation_condition ?? marketplaceMetrics.variation_condition,
    best_seller: explainability.best_seller ?? marketplaceMetrics.best_seller,
    flash_sale: explainability.flash_sale ?? marketplaceMetrics.flash_sale,
  };
}

export function deriveOfferSignals(offer: Offer, data: Record<string, unknown> = commercialData(offer)): OfferSignals {
  const currentPrice = Number(offer.current_price);
  const oldPrice = numberOrUndefined(offer.old_price);
  const hasRealDiscount = Boolean(oldPrice && oldPrice > currentPrice);
  const pixPrice = numberOrUndefined(data.pix_price);
  const hasPixBenefit = Boolean(pixPrice && pixPrice < currentPrice);
  const installmentCount = numberOrUndefined(data.installment_count);
  const installmentValue = numberOrUndefined(data.installment_value);
  return {
    hasRealDiscount,
    discountPercent: hasRealDiscount ? Math.round(((oldPrice! - currentPrice) / oldPrice!) * 100) : undefined,
    hasPixBenefit,
    pixSavings: hasPixBenefit ? currentPrice - pixPrice! : undefined,
    hasInstallments: Boolean(installmentCount && installmentValue),
    installmentCount,
    installmentValue,
    interestFreeConfirmed: data.installment_interest_free === true,
    hasCoupon: Boolean(data.coupon_code || data.coupon_application_stage),
    couponCode: typeof data.coupon_code === "string" ? data.coupon_code : undefined,
    couponStage: typeof data.coupon_application_stage === "string" ? data.coupon_application_stage : undefined,
    hasFreeShipping: data.free_shipping === true,
    isPrimeOnly: data.prime_only === true,
    hasSubscriptionPrice: Boolean(numberOrUndefined(data.subscription_price)),
    isOfficialStore: data.official_store === true,
    hasVariationRestriction: Boolean(data.variation_condition),
    isBestSeller: data.best_seller === true,
    hasLimitedTimeEvidence: data.flash_sale === true,
  };
}

export function selectPrimaryAngle(signals: OfferSignals): string {
  if (signals.hasCoupon) return "coupon";
  if (signals.hasRealDiscount) return "discount";
  if (signals.hasPixBenefit) return "pix";
  if (signals.hasInstallments) return "installment";
  if (signals.hasFreeShipping) return "free_shipping";
  if (signals.hasSubscriptionPrice) return "subscription";
  if (signals.isPrimeOnly) return "prime";
  if (signals.isOfficialStore) return "official_store";
  if (signals.isBestSeller) return "best_seller";
  return "simple_offer";
}

export function selectStableCall(angle: string, _offerId: string | undefined, _channel: string, signals: OfferSignals): string {
  if (angle === "coupon" && signals.couponCode) return `🎟️ Cupom: ${signals.couponCode}`;
  if (angle === "free_shipping") return "📦 Frete grátis";
  if (angle === "installment" && signals.installmentCount && signals.installmentValue) {
    return signals.interestFreeConfirmed
      ? `💳 ${signals.installmentCount}x sem juros`
      : `💳 Dá para dividir em ${signals.installmentCount}x`;
  }
  if (angle === "pix") return "💸 Condição no PIX";
  if (angle === "discount" && signals.discountPercent) return `🔥 ${signals.discountPercent}% OFF`;
  return "";
}

function copyFacts(offer: Offer): CopyV5Facts {
  const direct = offer as Offer & Record<string, unknown>;
  const explainability = (offer.explainability ?? {}) as Record<string, unknown>;
  const marketplaceMetrics = (direct.marketplace_metrics ?? {}) as Record<string, unknown>;
  return {
    productName: offer.product_name,
    marketplace: offer.platform,
    category: offer.category,
    currentPrice: Number(offer.current_price),
    originalPrice: offer.old_price == null ? null : Number(offer.old_price),
    freeShipping: direct.shipping_free === true ? true : null,
    evidence: {
      ...explainability,
      marketplace_metrics: marketplaceMetrics,
      ...(offer.coupon ? { coupon: offer.coupon } : {}),
      ...(direct.seller_name ? { seller_name: direct.seller_name } : {}),
      ...(direct.rating ? { rating: direct.rating } : {}),
    },
  };
}

function assertTrackedUrl(link: Pick<AffiliateLink, "tracked_url"> | { tracked_url: string }) {
  const value = link.tracked_url?.trim();
  if (!value) throw new Error("NO_MONETIZED_LINK");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("NO_MONETIZED_LINK");
  }
  if (parsed.protocol !== "https:") throw new Error("NO_MONETIZED_LINK");
  return parsed.toString();
}

function renderOffer(offer: Offer, link: Pick<AffiliateLink, "tracked_url">, channel: OfficialAIChannel) {
  const trackedUrl = assertTrackedUrl(link);
  const facts = copyFacts(offer);
  const plan = buildDeterministicFallbackPlan(facts);
  return renderCopyV5ChannelCopy(plan, facts, channel, trackedUrl);
}

/** Compatibility façade: final copy is always rendered by Copy V5. */
export function generateTelegramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return renderOffer(offer, link, "telegram").feed;
}

/** Compatibility façade: Facebook body remains URL-free under Copy V5. */
export function generateFacebookMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return renderOffer(offer, link, "facebook").feed;
}

/** Compatibility façade: final copy is always rendered by Copy V5. */
export function generateWhatsAppMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  return renderOffer(offer, link, "whatsapp").feed;
}

export function generateInstagramMessage(offer: Offer, link: Pick<AffiliateLink, "tracked_url">) {
  const rendered = renderOffer(offer, link, "instagram");
  return { feed: rendered.feed, stories: [] as string[], reels: [] as string[], carousel: [] as string[] };
}

function linkForChannel(links: AffiliateLink[], channel: OfficialAIChannel) {
  return links.find((link) => link.channel === channel) ?? null;
}

export function generateAllMessages(offer: Offer, links: AffiliateLink[]) {
  const telegram = linkForChannel(links, "telegram");
  const whatsapp = linkForChannel(links, "whatsapp");
  const facebook = linkForChannel(links, "facebook");
  const instagram = linkForChannel(links, "instagram");
  return {
    telegram: telegram ? generateTelegramMessage(offer, telegram) : "",
    whatsapp: whatsapp ? generateWhatsAppMessage(offer, whatsapp) : "",
    facebook: facebook ? generateFacebookMessage(offer, facebook) : "",
    instagram: instagram ? generateInstagramMessage(offer, instagram) : null,
  };
}
