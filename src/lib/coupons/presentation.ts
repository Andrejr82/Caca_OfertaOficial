type CouponOfferLike = {
  platform?: string | null;
  product_name?: string | null;
  image_url?: string | null;
  coupon?: string | null;
  notes?: string | null;
  original_url?: string | null;
  current_price?: number | null;
  old_price?: number | null;
};

const COUPON_FALLBACKS: Record<string, string> = {
  // The old marketplace icons were 16–48px and became visibly pixelated
  // when rendered in the social approval cards. Use the 144px neutral card
  // until a real product image is available.
  amazon: "/coupon-assets/default-coupon.png",
  shopee: "/coupon-assets/default-coupon.png",
  magalu: "/coupon-assets/default-coupon.png",
  "mercado livre": "/coupon-assets/mercadolivre-coupon.png",
  mercadolivre: "/coupon-assets/mercadolivre-coupon.png",
  shein: "/coupon-assets/default-coupon.png"
};

const INVALID_IMAGE_HINTS = [
  ".svg",
  "favicon",
  "placeholder",
  "spacer",
  "sprite",
  "avatar",
  "icon",
  "logo",
  "banner",
  "pixel",
  "1x1",
  "blank"
];

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizePlatform(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

export function isCouponOffer(offer: Partial<CouponOfferLike> | null | undefined) {
  if (!offer) return false;

  const title = normalizeText(offer.product_name);
  const notes = normalizeText(offer.notes);

  return title.startsWith("[CUPOM]") || notes.includes("Robô de Cupons");
}

export function getCouponFallbackAsset(platform: string | null | undefined) {
  return COUPON_FALLBACKS[normalizePlatform(platform)] || "/coupon-assets/default-coupon.png";
}

export function isValidCouponImageUrl(imageUrl: string | null | undefined) {
  const url = normalizeText(imageUrl);
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;

  const lower = url.toLowerCase();
  if (INVALID_IMAGE_HINTS.some((hint) => lower.includes(hint))) {
    return false;
  }

  return true;
}

export function getAbsoluteCouponFallbackUrl(
  platform: string | null | undefined,
  request?: Request
) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    (request ? new URL(request.url).origin : "http://localhost:3000");

  return new URL(getCouponFallbackAsset(platform), baseUrl).toString();
}

export function getCouponPublishImageUrl(
  offer: Partial<CouponOfferLike> | null | undefined,
  request?: Request
) {
  if (!offer) {
    return getAbsoluteCouponFallbackUrl(null, request);
  }

  return isValidCouponImageUrl(offer.image_url)
    ? normalizeText(offer.image_url)
    : getAbsoluteCouponFallbackUrl(offer.platform, request);
}

export async function resolveCouponPublishImageUrl(
  offer: Partial<CouponOfferLike> | null | undefined,
  request?: Request
) {
  // Prefer the product image supplied by the marketplace. The branded asset
  // remains the safe fallback when the source is absent or invalid.
  return isValidCouponImageUrl(offer?.image_url)
    ? normalizeText(offer?.image_url)
    : getAbsoluteCouponFallbackUrl(offer?.platform, request);
}

export function getCouponCardImageSources(offer: Partial<CouponOfferLike> | null | undefined) {
  const fallbackSrc = getCouponFallbackAsset(offer?.platform);
  const remoteSrc = isValidCouponImageUrl(offer?.image_url)
    ? `/api/images/proxy?url=${encodeURIComponent(normalizeText(offer?.image_url))}`
    : fallbackSrc;

  return {
    initialSrc: remoteSrc,
    fallbackSrc
  };
}

export function cleanCouponTitle(title: string | null | undefined) {
  return normalizeText(title).replace(/^\[CUPOM\]\s*/i, "") || "Cupom disponível";
}

function extractCouponProduct(text: string | null | undefined) {
  const value = normalizeText(text);
  const product = value.match(/Produto:\s*(.+?)(?:\s*\|\s*|$)/i)?.[1];
  return normalizeText(product || "").replace(/[|.]$/, "");
}

function getCouponBenefit(offer: Partial<CouponOfferLike> | null | undefined) {
  const title = cleanCouponTitle(offer?.product_name);
  return normalizeText(title.split(/\s+-\s+/, 1)[0]) || "Cupom disponível";
}

export function buildCouponSocialMessage(
  offer: Partial<CouponOfferLike> | null | undefined,
  affiliateLink: string
) {
  const marketplace = normalizeText(offer?.platform) || "Marketplace parceiro";
  const benefit = getCouponBenefit(offer);
  const product = extractCouponProduct(offer?.notes) || extractCouponProduct(offer?.product_name);
  const coupon = normalizeText(offer?.coupon);
  const codeLine = coupon
    ? `🎟️ *Código:* ${coupon}`
    : "🎟️ Resgate direto no marketplace";
  const productLine = product ? `🛍️ *${product}*\n` : "";

  return [
    `🎫 *${benefit}*`,
    productLine.trimEnd(),
    `🏪 ${marketplace}`,
    codeLine,
    `🔗 ${affiliateLink}`,
    "⚡ Resgate enquanto estiver disponível."
  ].filter(Boolean).join("\n");
}

export function buildCouponWhatsappMessage(
  offer: Partial<CouponOfferLike> | null | undefined,
  affiliateLink: string
) {
  return buildCouponSocialMessage(offer, affiliateLink);
}

export function parseCouponDetails(notes: string | null | undefined) {
  const noteText = normalizeText(notes);
  const rulesMatch = noteText.match(/Regras:\s*(.+)$/i);
  const description = normalizeText(rulesMatch?.[1] || noteText)
    .replace(/^Plataforma original:\s*[^.]+\.\s*/i, "")
    .replace(/^Importado automaticamente via Robô de Cupons \([^)]+\)\.\s*/i, "");

  const validityMatch = description.match(
    /(válid[oa]\s+até[^.]*|vence\s+em[^.]*|expira\s+em[^.]*|até\s+\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/i
  );

  return {
    description: description || "Cupom público disponível no marketplace.",
    validity: validityMatch ? validityMatch[1].trim() : null
  };
}
