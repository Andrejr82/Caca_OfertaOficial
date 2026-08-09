import { parseSheinOneLinkHtml } from "./shein-link";
import { discoverSheinImages, type SheinImageCandidate } from "./shein-image-discovery";

export type SheinAdapterErrorCode = "SHEIN_IDENTITY_AMBIGUOUS" | "SHEIN_PRICE_AMBIGUOUS" | "SHEIN_IMAGE_AMBIGUOUS";

export interface SheinManualConfirmation {
  title: string;
  price: number;
  imageUrl: string;
}

export interface SheinExpressProduct {
  canonicalUrl: string;
  productId?: string;
  sku?: string;
  title: string;
  price: number;
  imageUrl: string;
  priceSource: "AUTOMATIC_METADATA" | "MANUAL_CONFIRMATION";
}

export interface ParseSheinExpressProductInput {
  inputUrl: string;
  resolvedUrl: string;
  html?: string;
  productHtml?: string;
  manualConfirmation?: SheinManualConfirmation;
}

export interface ResolveSheinExpressProductInput extends ParseSheinExpressProductInput {
  fetcher?: typeof fetch;
}

export class SheinAdapterError extends Error {
  readonly code: SheinAdapterErrorCode;
  readonly imageCandidates: SheinImageCandidate[];

  constructor(code: SheinAdapterErrorCode, imageCandidates: SheinImageCandidate[] = []) {
    super(code);
    this.name = "SheinAdapterError";
    this.code = code;
    this.imageCandidates = imageCandidates;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readMeta(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  );
  return match ? decodeHtml(match[1].trim()) : "";
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^\d,.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readJsonLd(html: string): { names: string[]; images: string[]; prices: number[] } {
  const names: string[] = [];
  const images: string[] = [];
  const prices: number[] = [];
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];

  for (const block of blocks) {
    try {
      const json = block.replace(/<script[^>]*>|<\/script>/gi, "").trim();
      const value = JSON.parse(json);
      const entries = Array.isArray(value) ? value : [value];
      for (const entry of entries) {
        if (typeof entry?.name === "string" && entry.name.trim()) names.push(decodeHtml(entry.name.trim()));
        const image = Array.isArray(entry?.image) ? entry.image[0] : entry?.image;
        if (typeof image === "string" && image.trim()) images.push(image.trim());
        const offers = Array.isArray(entry?.offers) ? entry.offers : [entry?.offers];
        for (const offer of offers) {
          const price = parsePrice(offer?.price);
          if (price !== null) prices.push(price);
        }
        const directPrice = parsePrice(entry?.price);
        if (directPrice !== null) prices.push(directPrice);
      }
    } catch {
      // Invalid structured data is ignored; it cannot authorize a price.
    }
  }

  return { names, images, prices };
}

function isSheinHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "shein.com" || host.endsWith(".shein.com");
}

function canonicalizeProductUrl(value: string): { url: string; productId?: string; sku?: string } | null {
  try {
    const parsed = new URL(value);
    if (!isSheinHost(parsed.hostname)) return null;
    const productId = parsed.pathname.match(/(?:^|-)p-(\d+)(?:-|\.|\/|$)/i)?.[1];
    const sku = parsed.searchParams.get("sku") || parsed.searchParams.get("skucode") || undefined;
    const isProductPath = Boolean(productId) || /\/product\//i.test(parsed.pathname);
    if (!isProductPath && !sku) return null;
    parsed.search = "";
    parsed.hash = "";
    return { url: parsed.toString(), productId, sku };
  } catch {
    return null;
  }
}

function resolveIdentity(inputUrl: string, resolvedUrl: string, html: string): { url: string; productId?: string; sku?: string } | null {
  const embedded = parseSheinOneLinkHtml(html);
  const candidates = [embedded?.productUrl, resolvedUrl, inputUrl].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const identity = canonicalizeProductUrl(candidate);
    if (identity) return identity;
  }
  return null;
}

export async function resolveSheinExpressProduct(input: ResolveSheinExpressProductInput): Promise<SheinExpressProduct> {
  let productHtml = input.productHtml;
  const embedded = parseSheinOneLinkHtml(input.html || "");
  const candidateUrl = /-p-\d+/i.test(input.resolvedUrl)
    ? input.resolvedUrl
    : embedded?.productUrl || input.resolvedUrl;
  if (!productHtml && candidateUrl !== input.resolvedUrl) {
    try {
      const response = await (input.fetcher || fetch)(candidateUrl, {
        redirect: "follow",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) productHtml = await response.text();
    } catch {
      // A challenge or network failure is handled by the fail-closed parser/manual path.
    }
  }
  const product = parseSheinExpressProduct({ ...input, productHtml });
  if (product.priceSource === "AUTOMATIC_METADATA") {
    const discovery = await discoverSheinImages({
      canonicalUrl: product.canonicalUrl,
      productId: product.productId,
      html: productHtml || input.html || "",
    });
    if (discovery.validProductImages.length === 0) {
      throw new SheinAdapterError("SHEIN_IMAGE_AMBIGUOUS", discovery.candidates);
    }
    return { ...product, imageUrl: discovery.validProductImages[0].url };
  }
  return product;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(4))))];
}

export function parseSheinExpressProduct(input: ParseSheinExpressProductInput): SheinExpressProduct {
  const html = input.html || "";
  const identity = resolveIdentity(input.inputUrl, input.resolvedUrl, html);

  const sourceHtml = input.productHtml || html;
  const structured = readJsonLd(sourceHtml);
  const title = readMeta(sourceHtml, "og:title")
    || readMeta(sourceHtml, "twitter:title")
    || structured.names[0]
    || "";
  const imageUrl = readMeta(sourceHtml, "og:image")
    || readMeta(sourceHtml, "twitter:image")
    || structured.images[0]
    || "";
  const metadataPrices = [
    parsePrice(readMeta(sourceHtml, "product:price:amount")),
    parsePrice(readMeta(sourceHtml, "og:price:amount")),
    ...structured.prices,
  ].filter((value): value is number => value !== null);
  const prices = uniqueNumbers(metadataPrices);

  const manual = input.manualConfirmation;
  const manualIsValid = Boolean(
    manual?.title.trim()
      && Number.isFinite(manual.price)
      && manual.price > 0
      && manual.imageUrl.trim(),
  );

  if (manual && manualIsValid) {
    return {
      canonicalUrl: identity?.url || input.resolvedUrl || input.inputUrl,
      productId: identity?.productId,
      sku: identity?.sku,
      title: manual.title.trim(),
      price: manual.price,
      imageUrl: manual.imageUrl.trim(),
      priceSource: "MANUAL_CONFIRMATION",
    };
  }

  if (!identity) throw new SheinAdapterError("SHEIN_IDENTITY_AMBIGUOUS");
  if (prices.length > 1) throw new SheinAdapterError("SHEIN_PRICE_AMBIGUOUS");

  if (prices.length !== 1) throw new SheinAdapterError("SHEIN_PRICE_AMBIGUOUS");
  if (!title.trim() || !imageUrl.trim()) throw new SheinAdapterError("SHEIN_PRICE_AMBIGUOUS");

  return {
    canonicalUrl: identity.url,
    productId: identity.productId,
    sku: identity.sku,
    title: title.trim(),
    price: prices[0],
    imageUrl: imageUrl.trim(),
    priceSource: "AUTOMATIC_METADATA",
  };
}
