import type { Offer } from "@/types/domain";

function valueOf(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeIdentifier(value: unknown): string | null {
  return valueOf(value)?.toUpperCase() ?? null;
}

function canonicalUrl(value: unknown): string | null {
  const raw = valueOf(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
    return `${url.protocol.toLowerCase()}//${hostname}${pathname}`;
  } catch {
    return raw.split(/[?#]/, 1)[0].replace(/\/+$/, "").toLowerCase();
  }
}

function extractShopeeItemId(url: unknown): string | null {
  const raw = valueOf(url);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/(?:product|opaanlp)\/\d+\/(\d+)/i)
      || parsed.pathname.match(/(?:^|\/)[^/]*-i\.\d+\.(\d+)(?:\/|$)/i)
      || parsed.pathname.match(/\/i\.\d+\.(\d+)/i);
    return normalizeIdentifier(match?.[1] || parsed.searchParams.get("item_id"));
  } catch {
    return null;
  }
}

function extractAmazonAsin(url: unknown): string | null {
  const raw = valueOf(url);
  if (!raw) return null;
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname);
    const match = pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    return normalizeIdentifier(match?.[1]);
  } catch {
    return null;
  }
}

function extractMercadoLivreCatalogId(url: unknown): string | null {
  const raw = valueOf(url);
  if (!raw) return null;
  try {
    const match = decodeURIComponent(new URL(raw).pathname).match(/\/p\/(MLB\d+)/i);
    return normalizeIdentifier(match?.[1]);
  } catch {
    return null;
  }
}

/** Single authority for the identity represented by one commercial panel card. */
export function getCommercialProductIdentity(offer: Partial<Offer>): string {
  const platform = valueOf(offer.platform)?.toLowerCase().replace(/\s+/g, "-") || "unknown";
  const url = canonicalUrl(offer.original_url);

  if (offer.platform === "Shopee") {
    const itemId = normalizeIdentifier(offer.shopee_item_id) || extractShopeeItemId(offer.original_url);
    if (itemId) return `shopee:item:${itemId}`;
    if (url) return `shopee:url:${url}`;
  } else if (offer.platform === "Amazon") {
    const asin = normalizeIdentifier(offer.product_id) || extractAmazonAsin(offer.original_url);
    if (asin) return `amazon:asin:${asin}`;
    if (url) return `amazon:url:${url}`;
  } else if (offer.platform === "Mercado Livre") {
    const productId = normalizeIdentifier(offer.product_id);
    const catalogId = productId || extractMercadoLivreCatalogId(offer.original_url);
    if (catalogId) return `mercado-livre:catalog:${catalogId}`;
    const itemId = normalizeIdentifier(offer.item_id);
    if (itemId) return `mercado-livre:item:${itemId}`;
    if (url) return `mercado-livre:url:${url}`;
  } else if (url) {
    return `${platform}:url:${url}`;
  }

  return `${platform}:offer:${valueOf(offer.id) || "unknown"}`;
}

/** Backwards-compatible name used by selection code. */
export function getMarketplaceCatalogKey(offer: Partial<Offer>): string {
  return getCommercialProductIdentity(offer);
}

export function selectCatalogWinner(offers: Offer[]): Offer {
  if (offers.length === 0) {
    throw new Error("Não é possível selecionar vencedor de uma lista vazia.");
  }
  if (offers.length === 1) return offers[0];

  return offers.slice().sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : -Infinity;
    const scoreB = typeof b.score === "number" ? b.score : -Infinity;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const discountA = (a.old_price && a.old_price > a.current_price) ? (a.old_price - a.current_price) : 0;
    const discountB = (b.old_price && b.old_price > b.current_price) ? (b.old_price - b.current_price) : 0;
    if (discountB !== discountA) return discountB - discountA;
    const priceA = typeof a.current_price === "number" ? a.current_price : Infinity;
    const priceB = typeof b.current_price === "number" ? b.current_price : Infinity;
    if (priceA !== priceB) return priceA - priceB;
    const posA = typeof a.source_position === "number" ? a.source_position : Infinity;
    const posB = typeof b.source_position === "number" ? b.source_position : Infinity;
    if (posA !== posB) return posA - posB;
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    const validTimeA = Number.isNaN(timeA) ? 0 : timeA;
    const validTimeB = Number.isNaN(timeB) ? 0 : timeB;
    if (validTimeB !== validTimeA) return validTimeB - validTimeA;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/** Returns display winners only; persistence rows remain untouched. */
export function deduplicateCommercialOffers<T extends Offer>(offers: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const offer of offers) {
    const identity = getCommercialProductIdentity(offer);
    const group = groups.get(identity) || [];
    group.push(offer);
    groups.set(identity, group);
  }
  return [...groups.values()].map((group) => selectCatalogWinner(group) as T);
}
