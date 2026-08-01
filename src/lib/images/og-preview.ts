// @ts-expect-error sharp exports its runtime types in a path TypeScript does not resolve in this project setup.
import sharp from "sharp";

type OfferForPreview = {
  id: string;
  product_name: string | null;
  platform: string | null;
  image_url: string | null;
  coupon: string | null;
  current_price: number | null;
  old_price: number | null;
};

type PreviewVariant = "og" | "whatsapp";

type PreviewVariantConfig = {
  width: number;
  height: number;
  productBoxWidth: number;
  productBoxHeight: number;
  quality: number;
};

export type OfferPreviewResult = {
  buffer: Buffer;
  contentType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  source: "remote" | "fallback";
  fallbackReason: string | null;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const PREVIEW_CONFIG: Record<PreviewVariant, PreviewVariantConfig> = {
  og: {
    width: 1200,
    height: 630,
    productBoxWidth: 760,
    productBoxHeight: 510,
    quality: 92,
  },
  whatsapp: {
    width: 1200,
    height: 1200,
    productBoxWidth: 1040,
    productBoxHeight: 920,
    quality: 90,
  },
};

const MARKETPLACE_COLORS: Record<string, { bg: string; accent: string }> = {
  amazon: { bg: "#232f3e", accent: "#ff9900" },
  "mercado livre": { bg: "#fff159", accent: "#3483fa" },
  mercadolivre: { bg: "#fff159", accent: "#3483fa" },
  shopee: { bg: "#ee4d2d", accent: "#ffffff" },
  magalu: { bg: "#0086ff", accent: "#ffffff" },
  aliexpress: { bg: "#d71920", accent: "#ffffff" },
  "casas bahia": { bg: "#0046be", accent: "#ffffff" },
  casasbahia: { bg: "#0046be", accent: "#ffffff" },
  shein: { bg: "#111111", accent: "#ffffff" },
  netshoes: { bg: "#5a2d82", accent: "#ffffff" },
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizePlatform(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

/** Remove marketplace resize tokens while preserving the original image host/path. */
export function normalizeSourceImageUrl(value: string) {
  const url = normalizeText(value);
  if (!/amazon\./i.test(url)) return url;

  return url
    .replace(/\._AC_[^/?#]+_/i, "")
    .replace(/_AC_[^/?#]+_/i, "")
    .replace(/_(?:SL|SX|SY|UF|QL)\d+(?:,\d+)?_/gi, "");
}

function isCouponOffer(offer: OfferForPreview) {
  return Boolean(offer.coupon) || normalizeText(offer.product_name).startsWith("[CUPOM]");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cleanOfferTitle(value: string | null | undefined) {
  return normalizeText(value).replace(/^\[CUPOM\]\s*/i, "");
}

function getMarketplaceTheme(offer: OfferForPreview) {
  const key = normalizePlatform(offer.platform);
  return MARKETPLACE_COLORS[key] || { bg: "#f8fafc", accent: "#059669" };
}

/** Marketplace remains in copy metadata, never as a product-image badge. */
export function resolvePreviewBadgeLabel(templateLabel: string | null) {
  return templateLabel || "OFERTA";
}

type VisualTemplate = "default" | "coupon" | "prime_day" | "black_friday" | "flash_sale" | "free_shipping" | "cashback" | "official_store" | "exclusive";

const VISUAL_TEMPLATES: Record<VisualTemplate, { accent: string | null; label: string | null }> = {
  default: { accent: null, label: null },
  coupon: { accent: "#059669", label: "CUPOM" },
  prime_day: { accent: "#00a8e1", label: "PRIME DAY" },
  black_friday: { accent: "#111827", label: "BLACK FRIDAY" },
  flash_sale: { accent: "#dc2626", label: "RELÂMPAGO" },
  free_shipping: { accent: "#2563eb", label: "FRETE GRÁTIS" },
  cashback: { accent: "#059669", label: "CASHBACK" },
  official_store: { accent: "#7c3aed", label: "LOJA OFICIAL" },
  exclusive: { accent: "#ea580c", label: "EXCLUSIVA" },
};

function resolveVisualTemplate(offer: OfferForPreview): VisualTemplate {
  const title = normalizeText(offer.product_name).toUpperCase();
  if (title.includes("BLACK FRIDAY")) return "black_friday";
  if (title.includes("PRIME DAY")) return "prime_day";
  if (title.includes("RELÂMPAGO") || title.includes("RELAMPAGO")) return "flash_sale";
  if (title.includes("FRETE GRÁTIS") || title.includes("FRETE GRATIS")) return "free_shipping";
  if (title.includes("CASHBACK")) return "cashback";
  if (title.includes("LOJA OFICIAL")) return "official_store";
  if (title.includes("EXCLUSIVA") || title.includes("EXCLUSIVO")) return "exclusive";
  if (isCouponOffer(offer)) return "coupon";
  return "default";
}

function buildFallbackSvg(offer: OfferForPreview, variant: PreviewVariant) {
  const theme = getMarketplaceTheme(offer);
  const templateKey = resolveVisualTemplate(offer);
  const template = VISUAL_TEMPLATES[templateKey];

  const badgeBg = template.accent || theme.accent;
  const badgeLabel = resolvePreviewBadgeLabel(template.label);

  const config = PREVIEW_CONFIG[variant];
  const coupon = isCouponOffer(offer);
  
  let title = "OFERTA ESPECIAL";
  if (templateKey !== "default") {
    title = template.label === "CUPOM" ? "CUPOM LIBERADO" : (template.label || "OFERTA ESPECIAL");
  }

  const subtitle = cleanOfferTitle(offer.product_name) || "Caça Oferta Oficial";
  const price = coupon ? normalizeText(offer.coupon) || "RESGATE DIRETO" : formatPrice(offer.current_price) || "CONFIRA";

  if (variant === "whatsapp") {
    return Buffer.from(`
<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${config.width}" height="${config.height}" fill="#f3f4f6"/>
  <rect x="36" y="36" width="${config.width - 72}" height="${config.height - 72}" rx="54" fill="#ffffff"/>
  <rect x="78" y="78" width="310" height="64" rx="32" fill="${badgeBg}"/>
  <text x="233" y="120" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="${badgeBg === "#ffffff" ? "#111827" : "#ffffff"}">${escapeXml(badgeLabel)}</text>
  <text x="${config.width - 76}" y="86" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#000000" opacity="0.85">Caça Oferta Oficial</text>
  <text x="${config.width / 2}" y="420" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="900" fill="#111827">${escapeXml(title)}</text>
  <text x="${config.width / 2}" y="510" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#4b5563">${escapeXml(subtitle.slice(0, 44))}</text>
  <text x="${config.width / 2}" y="646" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="900" fill="#059669">${escapeXml(price)}</text>
</svg>`);
  }

  return Buffer.from(`
<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${config.width}" height="${config.height}" fill="${theme.bg}"/>
  <rect x="54" y="54" width="${config.width - 108}" height="${config.height - 108}" rx="42" fill="#ffffff" opacity="0.96"/>
  <circle cx="${config.width - 168}" cy="130" r="96" fill="${badgeBg}" opacity="0.18"/>
  <circle cx="160" cy="${config.height - 128}" r="128" fill="${badgeBg}" opacity="0.12"/>
  <text x="90" y="128" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="${badgeBg}">${escapeXml(badgeLabel)}</text>
  <text x="90" y="244" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="900" fill="#111827">${escapeXml(title)}</text>
  <text x="90" y="322" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#374151">${escapeXml(subtitle.slice(0, 52))}</text>
  <text x="90" y="438" font-family="Arial, Helvetica, sans-serif" font-size="66" font-weight="900" fill="#059669">${escapeXml(price)}</text>
  <text x="90" y="520" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#111827">Caça Oferta Oficial</text>
</svg>`);
}

async function fetchRemoteImage(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CacaOfertaImage/1.0)",
      "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`REMOTE_HTTP_${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/") || contentType.includes("svg")) {
    throw new Error(`INVALID_CONTENT_TYPE_${contentType || "unknown"}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error("REMOTE_IMAGE_TOO_LARGE");
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("REMOTE_IMAGE_TOO_LARGE");
  }

  return Buffer.from(arrayBuffer);
}

async function buildProductLayer(input: Buffer, variant: PreviewVariant) {
  const config = PREVIEW_CONFIG[variant];

  return sharp(input)
    .trim({ threshold: 15 })
    .rotate()
    .resize({
      width: config.productBoxWidth,
      height: config.productBoxHeight,
      fit: "inside",
      withoutEnlargement: false,
      background: "#ffffff",
    })
    .flatten({ background: "#ffffff" })
    .toColorspace("srgb")
    .png()
    .toBuffer();
}

function buildBaseBackground(width: number, height: number) {
  const raw = Buffer.allocUnsafe(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      const vignette = Math.round(((x - width / 2) ** 2 + (y - height / 2) ** 2) / (width * height * 0.24));
      const texture = ((x * 13 + y * 17 + ((x * y) % 29)) % 31) - 15;
      const value = Math.max(232, Math.min(255, 246 + texture - vignette));

      raw[offset] = value;
      raw[offset + 1] = value;
      raw[offset + 2] = value;
    }
  }

  return raw;
}

function buildWhatsAppOverlay(offer: OfferForPreview) {
  const config = PREVIEW_CONFIG.whatsapp;

  const title = cleanOfferTitle(offer.product_name) || "Oferta";
  const shortTitle = title.length > 40 ? `${title.slice(0, 37).trimEnd()}...` : title;

  return Buffer.from(`
<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="26" y="26" width="${config.width - 52}" height="${config.height - 52}" rx="58" fill="none" stroke="#e5e7eb" stroke-width="4"/>
  <text x="${config.width - 56}" y="76" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#000000" opacity="0.85">Caça Oferta Oficial</text>
  <text x="${config.width / 2}" y="${config.height - 78}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#4b5563">${escapeXml(shortTitle)}</text>
</svg>`);
}

async function generateOfferPreview(
  offer: OfferForPreview,
  variant: PreviewVariant
): Promise<OfferPreviewResult> {
  const config = PREVIEW_CONFIG[variant];
  let source: OfferPreviewResult["source"] = "remote";
  let fallbackReason: string | null = null;
  let imageInput: Buffer;

  try {
    const imageUrl = normalizeSourceImageUrl(offer.image_url || "");
    if (!/^https?:\/\//i.test(imageUrl)) {
      throw new Error("MISSING_REMOTE_IMAGE");
    }
    imageInput = await fetchRemoteImage(imageUrl);
  } catch (error) {
    source = "fallback";
    fallbackReason = error instanceof Error ? error.message : "REMOTE_IMAGE_FAILED";
    imageInput = buildFallbackSvg(offer, variant);
  }

  const productLayer = await buildProductLayer(imageInput, variant);
  const metadata = await sharp(productLayer).metadata();
  const left = Math.round((config.width - (metadata.width || config.productBoxWidth)) / 2);
  const top = Math.round((config.height - (metadata.height || config.productBoxHeight)) / 2);

  const composites: sharp.OverlayOptions[] = [{ input: productLayer, left, top }];

  if (variant === "whatsapp" && source === "remote") {
    composites.push({ input: buildWhatsAppOverlay(offer), left: 0, top: 0 });
  }

  const pipeline = sharp(buildBaseBackground(config.width, config.height), {
    raw: {
      width: config.width,
      height: config.height,
      channels: 3,
    },
  }).composite(composites);

  const buffer = await pipeline
    .toColorspace("srgb")
    .jpeg({ quality: config.quality, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    contentType: "image/jpeg",
    width: config.width,
    height: config.height,
    bytes: buffer.length,
    source,
    fallbackReason,
  };
}

export async function generateOfferOgPreview(offer: OfferForPreview): Promise<OfferPreviewResult> {
  return generateOfferPreview(offer, "og");
}

export async function generateOfferWhatsAppPreview(offer: OfferForPreview): Promise<OfferPreviewResult> {
  return generateOfferPreview(offer, "whatsapp");
}

