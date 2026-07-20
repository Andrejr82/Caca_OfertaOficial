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
  amazon: "/coupon-assets/amazon-coupon.png",
  shopee: "/coupon-assets/shopee-coupon.png",
  magalu: "/coupon-assets/magalu-coupon.png",
  "mercado livre": "/coupon-assets/mercadolivre-coupon.png",
  mercadolivre: "/coupon-assets/mercadolivre-coupon.png",
  shein: "/coupon-assets/shein-coupon.png"
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
  // Coupon publication uses the official marketplace artwork. This prevents
  // broken remote coupon thumbnails from becoming the red generic alert card.
  return getAbsoluteCouponFallbackUrl(offer?.platform, request);
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

export function buildCouponWhatsappMessage(
  offer: Partial<CouponOfferLike> | null | undefined,
  affiliateLink: string
) {
  const marketplace = normalizeText(offer?.platform) || "Marketplace parceiro";
  const coupon = normalizeText(offer?.coupon) || "Resgate direto no marketplace";
  const benefit = cleanCouponTitle(offer?.product_name);
  const details = parseCouponDetails(offer?.notes).description;

  return `🚨 *CUPOM LIBERADO*

🏷 *MARKETPLACE*
${marketplace}

🎟 *CUPOM*
${coupon}

💰 *BENEFÍCIO*
${benefit}

📌 ${details}

🔗 *LINK DA OFERTA*
${affiliateLink}

👇 *CTA*
Abra o link e resgate antes que acabe.`;
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
