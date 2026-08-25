import type { OfficialAIChannel } from "./types";
import type { CopyV5Facts, CopyV5Plan, CopyV5RenderedResult } from "./copy-v5-types";
import {
  calculateDiscountPercent,
  formatBRL,
  persistedStrings,
  semantic,
} from "./copy-v5-validator";
import { buildChannelNativeNarrative } from "./copy-v5-social-director";

export function getMarketplaceCtaPrefix(marketplace?: string | null): string {
  const norm = marketplace?.trim().toLowerCase();
  if (norm === "mercado livre") return "👉 Ver no Mercado Livre:";
  if (norm === "shopee") return "👉 Ver na Shopee:";
  if (norm === "amazon") return "👉 Ver na Amazon:";
  if (norm === "magalu") return "👉 Ver no Magalu:";
  if (norm === "shein") return "👉 Ver na Shein:";
  return "👉 Ver oferta:";
}

export function renderPriceBlock(facts: CopyV5Facts): string | null {
  if (!(facts.currentPrice > 0)) return null;
  if (facts.originalPrice && facts.originalPrice > facts.currentPrice) {
    return `De ${formatBRL(facts.originalPrice)}\nPor ${formatBRL(facts.currentPrice)}`;
  }
  return formatBRL(facts.currentPrice);
}

export function couponFromEvidence(facts: CopyV5Facts): string | null {
  if (!facts.evidence || typeof facts.evidence !== "object") return null;
  const ev = facts.evidence as Record<string, unknown>;
  const directCoupon = ev.coupon ?? ev.cupom ?? ev.coupon_code ?? ev.couponCode;
  const directRule = ev.coupon_rule ?? ev.couponRule ?? ev.regra_cupom;
  if (typeof directCoupon === "string" && directCoupon.trim().length > 0) {
    const code = directCoupon.trim().toUpperCase();
    if (typeof directRule === "string" && directRule.trim().length > 0) return `🎟️ Cupom: ${code} — ${directRule.trim()}`;
    return `🎟️ Cupom: ${code}`;
  }
  const strings = persistedStrings(facts.evidence).join(" ");
  const match = strings.match(/\bcupom(?:\s+de)?[:\s]+([A-Z0-9_-]{3,24})\b/iu);
  if (match) return `🎟️ Cupom: ${match[1].toUpperCase()}`;
  return null;
}

export function shippingFromEvidence(facts: CopyV5Facts): string | null {
  if (facts.freeShipping === true) return "📦 Frete grátis";
  if (facts.evidence && typeof facts.evidence === "object") {
    const ev = facts.evidence as Record<string, unknown>;
    if (ev.freeShipping === true || ev.free_shipping === true || ev.frete_gratis === true) return "📦 Frete grátis";
  }
  return null;
}

export function officialStoreFromEvidence(facts: CopyV5Facts): string | null {
  if (!facts.evidence || typeof facts.evidence !== "object") return null;
  const ev = facts.evidence as Record<string, unknown>;
  const isOfficialFlag = Boolean(ev.official_store === true || ev.is_official_store === true || ev.officialStore === true || ev.isOfficialStore === true);
  const officialStoreName = typeof ev.official_store_name === "string" && ev.official_store_name.trim().length > 0
    ? ev.official_store_name.trim()
    : typeof ev.officialStoreName === "string" && ev.officialStoreName.trim().length > 0 ? ev.officialStoreName.trim() : null;
  const sellerName = typeof ev.seller_name === "string" && ev.seller_name.trim().length > 0
    ? ev.seller_name.trim()
    : typeof ev.sellerName === "string" && ev.sellerName.trim().length > 0
      ? ev.sellerName.trim()
      : typeof ev.store_name === "string" && ev.store_name.trim().length > 0
        ? ev.store_name.trim()
        : typeof ev.storeName === "string" && ev.storeName.trim().length > 0 ? ev.storeName.trim() : null;
  if (officialStoreName) return `🏪 Loja oficial ${officialStoreName}`;
  if (isOfficialFlag) return sellerName ? `🏪 Loja oficial ${sellerName}` : "🏪 Loja oficial no marketplace";
  const strings = persistedStrings(facts.evidence).join(" ");
  if (/\bloja\s+oficial\b|\bofficial\s+store\b/iu.test(strings)) {
    const match = strings.match(/\bloja\s+oficial\s+([A-Za-z0-9À-ÿ\s]{2,30})/iu);
    if (match && !/no marketplace|identificada/iu.test(match[1])) return `🏪 Loja oficial ${match[1].trim()}`;
    return "🏪 Loja oficial no marketplace";
  }
  return null;
}

function appendTrustBlocks(blocks: string[], plan: CopyV5Plan, facts: CopyV5Facts) {
  const coupon = couponFromEvidence(facts);
  if (coupon) blocks.push(coupon);
  const shipping = shippingFromEvidence(facts);
  if (shipping) blocks.push(shipping);
  const store = officialStoreFromEvidence(facts);
  if (store) blocks.push(store);
  if (plan.optionalProofAngle) blocks.push(plan.optionalProofAngle);
}

export function buildCopyV5Blocks(
  plan: CopyV5Plan,
  facts: CopyV5Facts,
  channel: OfficialAIChannel,
  trackedUrl?: string | null
): { blocks: string[]; firstComment?: string | null } {
  let firstComment: string | null = null;

  if (channel === "facebook" || channel === "instagram") {
    const blocks = buildChannelNativeNarrative(plan, facts, channel);
    appendTrustBlocks(blocks, plan, facts);
    if (channel === "facebook") {
      blocks.push("👉 Link da oferta no primeiro comentário. 👇");
      if (trackedUrl) firstComment = `👉 Link da oferta: ${trackedUrl}`;
    } else {
      blocks.push("🔎 Link da oferta na bio. 👇");
    }
    return { blocks, firstComment };
  }

  // WhatsApp / Telegram permanecem estáveis nesta etapa.
  const blocks: string[] = [plan.hook];
  const hookSem = semantic(plan.hook);
  const prodSem = semantic(plan.shortProductName);
  const isHookJustProductName = hookSem === prodSem || hookSem.replace(/^[^\p{L}\p{N}]+/gu, "").trim() === prodSem;
  if (!isHookJustProductName && plan.shortProductName) blocks.push(plan.shortProductName);

  const price = renderPriceBlock(facts);
  if (price) blocks.push(price);
  const discountPercent = calculateDiscountPercent(facts.currentPrice, facts.originalPrice);
  if (discountPercent !== null && discountPercent >= 50 && !plan.hook.includes("% OFF")) blocks.push(`🔥 ${discountPercent}% OFF`);
  appendTrustBlocks(blocks, plan, facts);
  if (plan.selectedAttributes && plan.selectedAttributes.length > 0) blocks.push(plan.selectedAttributes.join(" • "));

  const ctaPrefix = getMarketplaceCtaPrefix(facts.marketplace);
  blocks.push(trackedUrl ? `${ctaPrefix}\n${trackedUrl}` : `${ctaPrefix}\n👉`);
  return { blocks, firstComment };
}

export function renderCopyV5ChannelCopy(
  plan: CopyV5Plan,
  facts: CopyV5Facts,
  channel: OfficialAIChannel,
  trackedUrl?: string | null
): CopyV5RenderedResult {
  const { blocks, firstComment } = buildCopyV5Blocks(plan, facts, channel, trackedUrl);
  return { feed: blocks.join("\n\n"), firstComment, trackedUrl, plan };
}
