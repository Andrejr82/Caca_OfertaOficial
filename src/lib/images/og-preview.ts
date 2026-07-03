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
    productBoxWidth: 860,
    productBoxHeight: 860,
    quality: 90,
  },
};

const MARKETPLACE_COLORS: Record<string, { bg: string; accent: string; label: string }> = {
  amazon: { bg: "#232f3e", accent: "#ff9900", label: "AMAZON" },
  "mercado livre": { bg: "#fff159", accent: "#3483fa", label: "MERCADO LIVRE" },
  mercadolivre: { bg: "#fff159", accent: "#3483fa", label: "MERCADO LIVRE" },
  shopee: { bg: "#ee4d2d", accent: "#ffffff", label: "SHOPEE" },
  magalu: { bg: "#0086ff", accent: "#ffffff", label: "MAGALU" },
  aliexpress: { bg: "#d71920", accent: "#ffffff", label: "ALIEXPRESS" },
  "casas bahia": { bg: "#0046be", accent: "#ffffff", label: "CASAS BAHIA" },
  casasbahia: { bg: "#0046be", accent: "#ffffff", label: "CASAS BAHIA" },
  shein: { bg: "#111111", accent: "#ffffff", label: "SHEIN" },
  netshoes: { bg: "#5a2d82", accent: "#ffffff", label: "NETSHOES" },
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizePlatform(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
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
  return MARKETPLACE_COLORS[key] || { bg: "#f8fafc", accent: "#059669", label: normalizeText(offer.platform) || "OFERTA" };
}

function buildFallbackSvg(offer: OfferForPreview, variant: PreviewVariant) {
  const theme = getMarketplaceTheme(offer);
  const config = PREVIEW_CONFIG[variant];
  const coupon = isCouponOffer(offer);
  const title = coupon ? "CUPOM LIBERADO" : "OFERTA ESPECIAL";
  const subtitle = cleanOfferTitle(offer.product_name) || "Caça Oferta Oficial";
  const price = coupon ? normalizeText(offer.coupon) || "RESGATE DIRETO" : formatPrice(offer.current_price) || "CONFIRA";

  if (variant === "whatsapp") {
    return Buffer.from(`
<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${config.width}" height="${config.height}" fill="#f3f4f6"/>
  <rect x="36" y="36" width="${config.width - 72}" height="${config.height - 72}" rx="54" fill="#ffffff"/>
  <rect x="78" y="78" width="310" height="64" rx="32" fill="${theme.accent}"/>
  <text x="233" y="120" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="${theme.accent === "#ffffff" ? "#111827" : "#ffffff"}">${escapeXml(theme.label)}</text>
  <text x="${config.width / 2}" y="420" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="900" fill="#111827">${escapeXml(title)}</text>
  <text x="${config.width / 2}" y="510" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="#4b5563">${escapeXml(subtitle.slice(0, 44))}</text>
  <text x="${config.width / 2}" y="646" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="900" fill="#059669">${escapeXml(price)}</text>
  <rect x="${config.width / 2 - 170}" y="${config.height - 172}" width="340" height="58" rx="29" fill="#111827"/>
  <text x="${config.width / 2}" y="${config.height - 134}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#ffffff">Caça Oferta Oficial</text>
</svg>`);
  }

  return Buffer.from(`
<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${config.width}" height="${config.height}" fill="${theme.bg}"/>
  <rect x="54" y="54" width="${config.width - 108}" height="${config.height - 108}" rx="42" fill="#ffffff" opacity="0.96"/>
  <circle cx="${config.width - 168}" cy="130" r="96" fill="${theme.accent}" opacity="0.18"/>
  <circle cx="160" cy="${config.height - 128}" r="128" fill="${theme.accent}" opacity="0.12"/>
  <text x="90" y="128" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="${theme.accent}">${escapeXml(theme.label)}</text>
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
  const theme = getMarketplaceTheme(offer);
  const title = cleanOfferTitle(offer.product_name) || "Oferta";
  const shortTitle = title.length > 40 ? `${title.slice(0, 37).trimEnd()}...` : title;
  const badgeTextColor = theme.accent === "#ffffff" ? "#111827" : "#ffffff";

  return Buffer.from(`
<svg width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="26" y="26" width="${config.width - 52}" height="${config.height - 52}" rx="58" fill="none" stroke="#e5e7eb" stroke-width="4"/>
  <rect x="76" y="76" width="292" height="58" rx="29" fill="${theme.accent}" opacity="0.96"/>
  <text x="222" y="113" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="${badgeTextColor}">${escapeXml(theme.label)}</text>
  <rect x="${config.width - 368}" y="76" width="292" height="58" rx="29" fill="#111827" opacity="0.94"/>
  <text x="${config.width - 222}" y="112" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">Caça Oferta Oficial</text>
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
    const imageUrl = normalizeText(offer.image_url);
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

  let pipeline = sharp(buildBaseBackground(config.width, config.height), {
    raw: {
      width: config.width,
      height: config.height,
      channels: 3,
    },
  }).composite([{ input: productLayer, left, top }]);

  if (variant === "whatsapp" && source === "remote") {
    pipeline = pipeline.composite([{ input: buildWhatsAppOverlay(offer), left: 0, top: 0 }]);
  }

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
