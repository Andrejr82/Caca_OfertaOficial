// @ts-ignore sharp exports its runtime types in a path TypeScript does not resolve in this project setup.
import sharp from "sharp";

type OfferForOgPreview = {
  id: string;
  product_name: string | null;
  platform: string | null;
  image_url: string | null;
  coupon: string | null;
  current_price: number | null;
  old_price: number | null;
};

export type OgPreviewResult = {
  buffer: Buffer;
  contentType: "image/jpeg";
  width: 1200;
  height: 630;
  bytes: number;
  source: "remote" | "fallback";
  fallbackReason: string | null;
};

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const PRODUCT_BOX_WIDTH = 760;
const PRODUCT_BOX_HEIGHT = 510;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const MARKETPLACE_COLORS: Record<string, { bg: string; accent: string; label: string }> = {
  amazon: { bg: "#232f3e", accent: "#ff9900", label: "AMAZON" },
  "mercado livre": { bg: "#fff159", accent: "#3483fa", label: "MERCADO LIVRE" },
  mercadolivre: { bg: "#fff159", accent: "#3483fa", label: "MERCADO LIVRE" },
  shopee: { bg: "#ee4d2d", accent: "#ffffff", label: "SHOPEE" },
  magalu: { bg: "#0086ff", accent: "#ffffff", label: "MAGALU" },
  shein: { bg: "#111111", accent: "#ffffff", label: "SHEIN" },
  netshoes: { bg: "#5a2d82", accent: "#ffffff", label: "NETSHOES" },
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizePlatform(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function isCouponOffer(offer: OfferForOgPreview) {
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

function getMarketplaceTheme(offer: OfferForOgPreview) {
  const key = normalizePlatform(offer.platform);
  return MARKETPLACE_COLORS[key] || { bg: "#f8fafc", accent: "#059669", label: normalizeText(offer.platform) || "OFERTA" };
}

function buildFallbackSvg(offer: OfferForOgPreview) {
  const theme = getMarketplaceTheme(offer);
  const coupon = isCouponOffer(offer);
  const title = coupon ? "CUPOM LIBERADO" : "OFERTA ESPECIAL";
  const subtitle = normalizeText(offer.product_name).replace(/^\[CUPOM\]\s*/i, "") || "Caça Oferta Oficial";
  const price = coupon ? normalizeText(offer.coupon) || "RESGATE DIRETO" : formatPrice(offer.current_price) || "CONFIRA";

  return Buffer.from(`
<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${theme.bg}"/>
  <rect x="54" y="54" width="1092" height="522" rx="42" fill="#ffffff" opacity="0.96"/>
  <circle cx="1032" cy="130" r="96" fill="${theme.accent}" opacity="0.18"/>
  <circle cx="160" cy="502" r="128" fill="${theme.accent}" opacity="0.12"/>
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
      "User-Agent": "Mozilla/5.0 (compatible; CacaOfertaOG/1.0)",
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

async function buildProductLayer(input: Buffer) {
  return sharp(input)
    .rotate()
    .resize({
      width: PRODUCT_BOX_WIDTH,
      height: PRODUCT_BOX_HEIGHT,
      fit: "inside",
      withoutEnlargement: false,
      background: "#ffffff",
    })
    .flatten({ background: "#ffffff" })
    .toColorspace("srgb")
    .png()
    .toBuffer();
}

function buildWhitePremiumBackground() {
  const raw = Buffer.allocUnsafe(CANVAS_WIDTH * CANVAS_HEIGHT * 3);

  for (let y = 0; y < CANVAS_HEIGHT; y++) {
    for (let x = 0; x < CANVAS_WIDTH; x++) {
      const offset = (y * CANVAS_WIDTH + x) * 3;
      const vignette = Math.round(((x - CANVAS_WIDTH / 2) ** 2 + (y - CANVAS_HEIGHT / 2) ** 2) / 180000);
      const texture = ((x * 13 + y * 17 + ((x * y) % 29)) % 37) - 18;
      const value = Math.max(224, Math.min(255, 244 + texture - vignette));

      raw[offset] = value;
      raw[offset + 1] = value;
      raw[offset + 2] = value;
    }
  }

  return raw;
}

export async function generateOfferOgPreview(offer: OfferForOgPreview): Promise<OgPreviewResult> {
  let source: OgPreviewResult["source"] = "remote";
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
    imageInput = buildFallbackSvg(offer);
  }

  const productLayer = await buildProductLayer(imageInput);
  const metadata = await sharp(productLayer).metadata();
  const left = Math.round((CANVAS_WIDTH - (metadata.width || PRODUCT_BOX_WIDTH)) / 2);
  const top = Math.round((CANVAS_HEIGHT - (metadata.height || PRODUCT_BOX_HEIGHT)) / 2);

  const buffer = await sharp(buildWhitePremiumBackground(), {
    raw: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
    },
  })
    .composite([{ input: productLayer, left, top }])
    .toColorspace("srgb")
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return {
    buffer,
    contentType: "image/jpeg",
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    bytes: buffer.length,
    source,
    fallbackReason,
  };
}
