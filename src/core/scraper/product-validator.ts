import { isBlacklistedTitle, isBlacklistedImage } from "@/core/scraper/blacklist";
import { SCRAPER_LIMITS, SCRAPER_STRICT_MODE } from "@/core/scraper/constants";
import { logScraperMetrics } from "@/core/scraper/telemetry";
import type { Platform } from "@/types/domain";

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  rejectReason: string | null;
}

export interface OfferValidationInput {
  product_name?: string | null;
  title?: string | null;
  platform?: string | null;
  marketplace?: string | null;
  original_url?: string | null;
  url?: string | null;
  image_url?: string | null;
  image?: string | null;
  current_price?: number | string | null;
  price?: number | string | null;
}

export interface StrongOfferValidationResult extends ValidationResult {
  canonicalUrl: string | null;
  contentHash: string | null;
  normalizedTitle: string | null;
  platform: Platform | null;
  price: number | null;
}

const VALID_MARKETPLACES = new Set(["Shopee", "Amazon", "Magalu", "Mercado Livre", "Shein", "Netshoes"]);
const TRACKING_PARAMS = [
  "tag",
  "ascsubtag",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "sub_id",
  "subid",
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
];

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeProductTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(azul|preto|branco|bege|verde|vermelho|rosa|cinza|masculino|feminino)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseOfferPrice(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || "")
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function canonicalizeOfferUrl(url: string): string | null {
  try {
    let parsedUrl = new URL(url.trim());
    const unwrapParam = ["murl", "url", "u"].find((param) => parsedUrl.searchParams.get(param)?.startsWith("http"));
    if (unwrapParam) {
      parsedUrl = new URL(parsedUrl.searchParams.get(unwrapParam) as string);
    }

    TRACKING_PARAMS.forEach((param) => parsedUrl.searchParams.delete(param));
    parsedUrl.hash = "";
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "");

    return parsedUrl.toString().toLowerCase();
  } catch {
    return null;
  }
}

export function buildOfferContentHash(input: { platform: string; normalizedTitle: string; price: number; canonicalUrl: string }): string {
  const roundedPrice = Math.round(input.price * 100) / 100;
  return hashString(`${input.platform}|${input.normalizedTitle}|${roundedPrice}|${input.canonicalUrl}`);
}

function isAmazonSource(source: string): boolean {
  return source.trim().toLowerCase().includes("amazon");
}

function isGenericAmazonTitle(title: string): boolean {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^loja oficial\s+/i, "")
    .replace(/[|:-]+$/g, "");

  return [
    "amazon",
    "amazon.com.br",
    "amazon brasil",
    "amazon.com",
  ].includes(normalized);
}

function isPromotionalAmazonImage(imageUrl: string): boolean {
  const lower = imageUrl.trim().toLowerCase();
  if (!lower) return true;

  return (
    lower.includes("/s/al-na") ||
    lower.includes("sponsored-ads.amazon") ||
    lower.includes("aax-us-east-retail") ||
    lower.includes("nav-sprite") ||
    lower.includes("sprite") ||
    lower.includes("banner") ||
    lower.includes("logo") ||
    lower.includes("icon") ||
    lower.includes("pixel") ||
    lower.includes("placeholder") ||
    lower.endsWith(".gif")
  );
}

function getBadImageReason(imageUrl: string): string | null {
  const lower = imageUrl.trim().toLowerCase();
  if (!lower || lower === "null" || lower.length < 5) return "SEM_IMAGEM";
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return "IMAGEM_URL_INVALIDA";
  if (lower.startsWith("data:")) return "IMAGEM_DATA_URI";
  if (lower.includes(".svg") || lower.endsWith("svg")) return "IMAGEM_SVG";
  if (
    lower.includes("placeholder") ||
    lower.includes("via.placeholder") ||
    lower.includes("picsum") ||
    lower.includes("unsplash")
  ) return "IMAGEM_PLACEHOLDER";
  if (
    lower.includes("favicon") ||
    lower.includes("logo") ||
    lower.includes("sprite") ||
    lower.includes("icon") ||
    lower.includes("banner") ||
    lower.includes("nav-sprite") ||
    lower.includes("/s/al-na") ||
    lower.includes("sponsored-ads.amazon") ||
    lower.includes("aax-us-east-retail")
  ) return "IMAGEM_PROMOCIONAL_OU_LOGO";
  if (lower.includes("pixel") || /[?&](w|width|h|height)=1(&|$)/.test(lower) || /[\/_-]1x1[\/_.-]/.test(lower)) {
    return "IMAGEM_1X1";
  }

  const dimensions = lower.match(/(?:^|[\/_-])(\d{1,4})x(\d{1,4})(?:[\/_.-]|$)/);
  if (dimensions) {
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    if (width <= 100 || height <= 100) return "IMAGEM_PEQUENA";
  }

  return null;
}

export function validateOfferForPersistence(product: OfferValidationInput): StrongOfferValidationResult {
  if (!product || typeof product !== "object") {
    return { valid: false, confidence: 0, rejectReason: "OBJETO_INVALIDO", canonicalUrl: null, contentHash: null, normalizedTitle: null, platform: null, price: null };
  }

  const title = String(product.product_name || product.title || "").trim();
  const platform = String(product.platform || product.marketplace || "").trim() as Platform;
  const price = parseOfferPrice(product.current_price ?? product.price);
  const rawUrl = String(product.original_url || product.url || "").trim();
  const image = String(product.image_url || product.image || "").trim();
  const canonicalUrl = canonicalizeOfferUrl(rawUrl);
  const normalizedTitle = title ? normalizeProductTitle(title) : null;

  if (!title || title.length < SCRAPER_LIMITS.MIN_TITLE_LENGTH || title.length > SCRAPER_LIMITS.MAX_TITLE_LENGTH) {
    return { valid: false, confidence: 0, rejectReason: "TITULO_INVALIDO", canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (isBlacklistedTitle(title) || (!title.includes(" ") && title.length > 15)) {
    return { valid: false, confidence: 0, rejectReason: "TITULO_INVALIDO", canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (price <= 0 || price > SCRAPER_LIMITS.MAX_PRICE) {
    return { valid: false, confidence: 0, rejectReason: "PRECO_INVALIDO", canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (!VALID_MARKETPLACES.has(platform)) {
    return { valid: false, confidence: 0, rejectReason: "MARKETPLACE_INVALIDO", canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (!canonicalUrl) {
    return { valid: false, confidence: 0, rejectReason: "URL_INVALIDA", canonicalUrl, contentHash: null, normalizedTitle, platform, price };
  }

  const badImageReason = getBadImageReason(image);
  if (badImageReason) {
    return { valid: false, confidence: 0, rejectReason: badImageReason, canonicalUrl, contentHash: null, normalizedTitle, platform, price };
  }
  if (isBlacklistedImage(image)) {
    return { valid: false, confidence: 0, rejectReason: "BLACKLIST_IMAGE", canonicalUrl, contentHash: null, normalizedTitle, platform, price };
  }

  const contentHash = buildOfferContentHash({ platform, normalizedTitle: normalizedTitle || "", price, canonicalUrl });
  return { valid: true, confidence: 100, rejectReason: null, canonicalUrl, contentHash, normalizedTitle, platform, price };
}

export function validateProduct(product: any, source: string): ValidationResult {
  if (!SCRAPER_STRICT_MODE) {
    return { valid: true, confidence: 100, rejectReason: null };
  }

  // 1. Campos Obrigatórios
  if (!product || typeof product !== "object") {
    return { valid: false, confidence: 0, rejectReason: "OBJETO_INVALIDO" };
  }

  const title = (product.title || product.product_name || "").trim();
  
  let price = 0;
  if (typeof product.price === 'number') {
    price = product.price;
  } else if (typeof product.current_price === 'number') {
    price = product.current_price;
  } else {
    // Tenta fazer o parse de string, caso o LLM retorne "R$ 1.299,99"
    const rawPrice = product.price || product.current_price || "0";
    const cleaned = String(rawPrice).replace(/[R$\s.]/g, '').replace(',', '.');
    price = parseFloat(cleaned) || 0;
  }
  
  // Sprint 2: Validação Centralizada de Preço e Desconto
  let oldPrice = 0;
  if (typeof product.old_price === 'number') {
    oldPrice = product.old_price;
  } else if (product.old_price != null) {
    const rawOld = String(product.old_price).replace(/[R$\s.]/g, '').replace(',', '.');
    oldPrice = parseFloat(rawOld) || 0;
  }

  if (!product.explainability) {
    product.explainability = {};
  }

  if (!oldPrice) {
    product.old_price = null;
    product.discount_percent = null;
    product.explainability.discount_reason = "OLD_PRICE_MISSING";
  } else if (oldPrice <= price) {
    product.old_price = null;
    product.discount_percent = null;
    product.explainability.discount_reason = oldPrice === price ? "OLD_PRICE_EQUAL_CURRENT" : "OLD_PRICE_BELOW_CURRENT";
  } else {
    const discountPct = (oldPrice - price) / oldPrice;
    if (discountPct > 0.8) {
      product.old_price = null;
      product.discount_percent = null;
      product.explainability.discount_reason = "DISCOUNT_SUSPICIOUS";
    } else {
      product.old_price = oldPrice;
      product.discount_percent = Math.round(discountPct * 100);
      product.explainability.discount_reason = "VALID";
    }
  }


  const image = (product.image || product.image_url || "").trim();
  const url = (product.url || product.original_url || "").trim();
  const amazonSource = isAmazonSource(source);

  if (!title) {
    return { valid: false, confidence: 5, rejectReason: "SEM_TITULO" };
  }

  if (amazonSource && isGenericAmazonTitle(title)) {
    return { valid: false, confidence: 0, rejectReason: "AMAZON_TITULO_GENERICO" };
  }

  if (price < SCRAPER_LIMITS.MIN_PRICE || price > SCRAPER_LIMITS.MAX_PRICE) {
    return { valid: false, confidence: 10, rejectReason: amazonSource ? "AMAZON_PRECO_INVALIDO" : "PRECO_INVALIDO" };
  }

  // 2. Validação de Título (Blacklist e Tamanho)
  if (title.length < SCRAPER_LIMITS.MIN_TITLE_LENGTH) {
    return { valid: false, confidence: 20, rejectReason: "TITULO_MUITO_CURTO" };
  }
  if (title.length > SCRAPER_LIMITS.MAX_TITLE_LENGTH) {
    return { valid: false, confidence: 30, rejectReason: "TITULO_MUITO_LONGO" };
  }

  if (isBlacklistedTitle(title)) {
    return { valid: false, confidence: 0, rejectReason: "BLACKLIST_TITLE" };
  }

  // Verificação semântica simples: se o título não tiver espaços, provavelmente é um placeholder ou erro (exceto marcas específicas curtas, mas <5 chars já cortou)
  if (!title.includes(" ") && title.length > 15) {
    return { valid: false, confidence: 15, rejectReason: "TITULO_SEM_ESPACOS" };
  }

  // 3. Validação de Imagem
  if (!image || image === "null" || image.length < 5) {
    return { valid: false, confidence: 0, rejectReason: "SEM_IMAGEM" };
  }

  if (amazonSource && isPromotionalAmazonImage(image)) {
    return { valid: false, confidence: 0, rejectReason: "AMAZON_IMAGEM_PROMOCIONAL" };
  }

  const badImageReason = getBadImageReason(image);
  if (badImageReason) {
    return { valid: false, confidence: 0, rejectReason: badImageReason };
  }
  
  if (isBlacklistedImage(image)) {
    return { valid: false, confidence: 10, rejectReason: "BLACKLIST_IMAGE" };
  }

  // 4. Validação de URL
  if (!url) {
    return { valid: false, confidence: 0, rejectReason: "SEM_URL" };
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { valid: false, confidence: 0, rejectReason: "PROTOCOLO_URL_INVALIDO" };
    }

    if (amazonSource) {
      const host = parsedUrl.hostname.toLowerCase();
      const isAmazonHost = host === "www.amazon.com.br" || host === "amazon.com.br" || host === "amzn.to";
      if (!isAmazonHost) {
        return { valid: false, confidence: 0, rejectReason: "AMAZON_URL_INVALIDA" };
      }
    }
  } catch (err) {
    return { valid: false, confidence: 0, rejectReason: "URL_MALFORMADA" };
  }

  // 5. Calcula Confidence Score (0 a 100)
  let confidence = 100;
  
  if (title.length < 15) confidence -= 15;
  if (!product.category) confidence -= 1;
  if (!product.rating) confidence -= 2;
  if (!product.brand) confidence -= 1;
  if (!product.old_price) confidence -= 4;

  // Limite de segurança: Confidence deve ser > 40 para ser aprovado (heurística)
  if (confidence < 40) {
    return { valid: false, confidence, rejectReason: "CONFIDENCE_MUITO_BAIXO" };
  }

  return { valid: true, confidence, rejectReason: null };
}
