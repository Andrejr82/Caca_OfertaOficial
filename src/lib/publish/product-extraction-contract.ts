import { extractMLId } from "@/lib/platforms/mercadolivre";
import type { UrlResolveResult } from "./express-url-resolver";

export type ProductFallbackDetails = {
  title?: string;
  price?: number;
  imageUrl?: string;
  canonicalUrl?: string;
};

export type ProductResolutionOutcome =
  | {
      status: "confirmed_identity";
      itemId: string;
      resolvedUrl: string;
      fallbackDetails?: ProductFallbackDetails;
    }
  | {
      status: "ready";
      resolvedUrl: string;
    }
  | {
      status: "rejected";
      code: NonNullable<UrlResolveResult["errorCode"]>;
    };

type MLIdentity = { type: "item" | "product"; id: string };

type NordicIdentityResult =
  | { status: "absent" }
  | { status: "valid"; itemId: string; fallbackDetails?: ProductFallbackDetails }
  | { status: "invalid" };

function decodeHtmlUrl(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x3a;/gi, ":")
    .replace(/&#58;/g, ":")
    .trim();
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeHtmlUrl(match[1]) : null;
}

function normalizeMlId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace("-", "").toUpperCase();
  return /^MLB[U]?\d+$/.test(normalized) ? normalized : null;
}

function extractMlIdentityFromAllowedUrl(rawUrl: string, baseUrl: string): MLIdentity | null {
  try {
    const absoluteUrl = new URL(decodeHtmlUrl(rawUrl), baseUrl);
    const host = absoluteUrl.hostname.toLowerCase().replace(/^www\./, "");
    if (
      host !== "mercadolivre.com.br"
      && !host.endsWith(".mercadolivre.com.br")
      && host !== "mercadolibre.com"
      && !host.endsWith(".mercadolibre.com")
    ) {
      return null;
    }
    return extractMLId(absoluteUrl.toString());
  } catch {
    return null;
  }
}

function extractMlIdFromAllowedUrl(rawUrl: string, baseUrl: string): string | null {
  return extractMlIdentityFromAllowedUrl(rawUrl, baseUrl)?.id || null;
}

function extractMlIdsFromTrustedHtmlMetadata(htmlBody: string | undefined, baseUrl: string): string[] {
  if (!htmlBody) return [];

  const ids = new Set<string>();
  const tags = htmlBody.match(/<(?:meta|link)\b[^>]*>/gi) || [];

  for (const tag of tags) {
    const rel = readAttribute(tag, "rel")?.toLowerCase();
    const property = (readAttribute(tag, "property") || readAttribute(tag, "name"))?.toLowerCase();
    const isCanonical = rel === "canonical";
    const isTrustedUrlMeta = property === "og:url" || property === "twitter:url";
    if (!isCanonical && !isTrustedUrlMeta) continue;

    const rawUrl = isCanonical ? readAttribute(tag, "href") : readAttribute(tag, "content");
    if (!rawUrl) continue;

    const id = extractMlIdFromAllowedUrl(rawUrl, baseUrl);
    if (id) ids.add(id);
  }

  return [...ids];
}

function extractMlIdsFromTrustedNavigation(htmlBody: string | undefined, baseUrl: string): string[] {
  if (!htmlBody) return [];

  const ids = new Set<string>();
  const metaTags = htmlBody.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const httpEquiv = readAttribute(tag, "http-equiv")?.toLowerCase();
    if (httpEquiv !== "refresh") continue;
    const content = readAttribute(tag, "content");
    if (!content) continue;
    const urlMatch = content.match(/(?:^|;)\s*url\s*=\s*["']?([^"';]+)["']?/i);
    if (!urlMatch) continue;
    const id = extractMlIdFromAllowedUrl(urlMatch[1], baseUrl);
    if (id) ids.add(id);
  }

  const scriptUrlPatterns = [
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
    /(?:window\.)?location\.replace\(\s*["']([^"']+)["']\s*\)/gi,
    /(?:window\.)?location\.assign\(\s*["']([^"']+)["']\s*\)/gi,
  ];

  for (const pattern of scriptUrlPatterns) {
    for (const match of htmlBody.matchAll(pattern)) {
      const id = extractMlIdFromAllowedUrl(match[1], baseUrl);
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

function extractBalancedJsonObject(value: string, searchFrom: number): string | null {
  const start = value.indexOf("{", searchFrom);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index++) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth++;
      continue;
    }

    if (char === "}") {
      depth--;
      if (depth === 0) return value.slice(start, index + 1);
      if (depth < 0) return null;
    }
  }

  return null;
}

function parseJsonAssignment(candidate: string, pattern: RegExp): unknown | null {
  const assignment = pattern.exec(candidate);
  if (!assignment || assignment.index === undefined) return null;

  const objectText = extractBalancedJsonObject(candidate, assignment.index + assignment[0].length);
  if (!objectText) return null;

  try {
    return JSON.parse(objectText);
  } catch {
    return null;
  }
}

function parseNordicContext(htmlBody: string | undefined): unknown | null {
  if (!htmlBody) return null;
  const scripts = htmlBody.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];

  for (const script of scripts) {
    const openTag = script.match(/^<script\b[^>]*>/i)?.[0];
    if (!openTag || !/__NORDIC_RENDERING_CTX__/i.test(openTag)) continue;

    const rawBody = script.slice(openTag.length).replace(/<\/script>\s*$/i, "").trim();
    const candidates = [rawBody, decodeHtmlUrl(rawBody)];

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        const assignmentPatterns = [
          /(?:window\.)?__NORDIC_RENDERING_CTX__\s*=\s*/i,
          /(?:window\.)?_n\.ctx\.r\s*=\s*/i,
        ];

        for (const pattern of assignmentPatterns) {
          const parsed = parseJsonAssignment(candidate, pattern);
          if (parsed) return parsed;
        }
      }
    }
  }

  return null;
}

function isFeaturedMarker(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "/home/card-featured/element";
}

function urlFragmentsHaveFeaturedMarker(value: unknown): boolean {
  if (typeof value !== "string") return false;

  try {
    const params = new URLSearchParams(decodeHtmlUrl(value).replace(/^\?/, ""));
    return isFeaturedMarker(params.get("c_id"));
  } catch {
    return false;
  }
}

function objectHasFeaturedMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (isFeaturedMarker(object.c_id)) return true;

  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;

  const meta = metadata as Record<string, unknown>;
  return isFeaturedMarker(meta.c_id) || urlFragmentsHaveFeaturedMarker(meta.url_fragments);
}

function validateNordicFeaturedCard(card: unknown, baseUrl: string): string | null {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const metadata = (card as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const meta = metadata as Record<string, unknown>;
  const itemId = normalizeMlId(meta.id);
  const productId = normalizeMlId(meta.product_id);
  const userProductId = normalizeMlId(meta.user_product_id);
  const rawUrl = typeof meta.url === "string" ? meta.url : "";
  if (!itemId || !rawUrl) return null;

  const urlIdentity = extractMlIdentityFromAllowedUrl(rawUrl, baseUrl);
  if (!urlIdentity) return null;

  if (urlIdentity.type === "item") {
    return urlIdentity.id === itemId ? itemId : null;
  }

  if (productId && productId === urlIdentity.id) {
    return itemId;
  }

  if (userProductId && userProductId === urlIdentity.id) {
    return itemId;
  }

  return null;
}

function extractNordicCardDetails(card: unknown, htmlBody?: string): ProductFallbackDetails | undefined {
  if (!card || typeof card !== "object" || Array.isArray(card)) return undefined;
  const meta = ((card as Record<string, unknown>).metadata || {}) as Record<string, unknown>;
  const rawUrl = typeof meta.url === "string" ? meta.url : undefined;

  const cardComponents = Array.isArray((card as Record<string, unknown>).components)
    ? ((card as Record<string, unknown>).components as unknown[])
    : Object.values(((card as Record<string, unknown>).components || {}) as Record<string, unknown>);

  const titleComp = cardComponents.find(
    (c: any) => c && (c.type === "title" || c.id === "title")
  ) as any;
  const ogTitle = htmlBody
    ? (htmlBody.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || htmlBody.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i))?.[1]
    : undefined;
  const title = titleComp?.title?.text || ogTitle;

  const priceComp = cardComponents.find(
    (c: any) => c && (c.type === "price" || c.id === "price")
  ) as any;
  const priceVal = typeof priceComp?.price?.current_price?.value === "number"
    ? priceComp.price.current_price.value
    : undefined;
  const tracksMeta = meta.tracks as any;
  const tracksPrice = typeof tracksMeta?.price?.price === "number" ? tracksMeta.price.price : undefined;
  const price = priceVal ?? tracksPrice;

  const pictures = (card as Record<string, unknown>).pictures as any[];
  const pictureObj = Array.isArray(pictures) ? pictures[0] : undefined;
  const ogImage = htmlBody
    ? (htmlBody.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || htmlBody.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i))?.[1]
    : undefined;
  const imageUrl = pictureObj?.url || pictureObj?.secure_url || ogImage;

  if (!title && price === undefined && !imageUrl) return undefined;

  const details: ProductFallbackDetails = {};
  if (typeof title === "string" && title.trim()) details.title = title.trim();
  if (typeof price === "number" && price > 0) details.price = price;
  if (typeof imageUrl === "string" && imageUrl.trim()) details.imageUrl = imageUrl.trim();
  if (typeof rawUrl === "string" && rawUrl.trim()) details.canonicalUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  return details;
}

function extractMlIdentityFromNordicFeaturedCard(
  htmlBody: string | undefined,
  baseUrl: string
): NordicIdentityResult {
  const context = parseNordicContext(htmlBody);
  if (!context) return { status: "absent" };

  const featuredCards: unknown[] = [];
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }

    const object = value as Record<string, unknown>;
    const polycards = object.polycards;
    if (Array.isArray(polycards)) {
      const containerFeatured = objectHasFeaturedMarker(object);
      for (const card of polycards) {
        if (containerFeatured || objectHasFeaturedMarker(card)) featuredCards.push(card);
      }
    }

    for (const child of Object.values(object)) visit(child);
  };

  visit(context);
  if (featuredCards.length === 0) return { status: "absent" };
  if (featuredCards.length !== 1) return { status: "invalid" };

  const itemId = validateNordicFeaturedCard(featuredCards[0], baseUrl);
  if (!itemId) return { status: "invalid" };

  const fallbackDetails = extractNordicCardDetails(featuredCards[0], htmlBody);
  return fallbackDetails
    ? { status: "valid", itemId, fallbackDetails }
    : { status: "valid", itemId };
}

type RecoveredShowcaseIdentity = {
  itemId: string;
  fallbackDetails?: ProductFallbackDetails;
};

function recoverMlIdentityFromShowcase(result: UrlResolveResult): RecoveredShowcaseIdentity | null {
  if (result.marketplace !== "Mercado Livre") return null;

  const ids = new Set<string>();
  if (result.finalItemId) ids.add(result.finalItemId);

  for (const id of extractMlIdsFromTrustedHtmlMetadata(result.htmlBody, result.resolvedUrl)) {
    ids.add(id);
  }

  for (const id of extractMlIdsFromTrustedNavigation(result.htmlBody, result.resolvedUrl)) {
    ids.add(id);
  }

  let fallbackDetails: ProductFallbackDetails | undefined;
  const nordicIdentity = extractMlIdentityFromNordicFeaturedCard(result.htmlBody, result.resolvedUrl);
  if (nordicIdentity.status === "invalid") return null;
  if (nordicIdentity.status === "valid") {
    ids.add(nordicIdentity.itemId);
    fallbackDetails = nordicIdentity.fallbackDetails;
  }

  if (ids.size === 1) {
    return fallbackDetails ? { itemId: [...ids][0], fallbackDetails } : { itemId: [...ids][0] };
  }

  return null;
}

export function classifyResolution(result: UrlResolveResult): ProductResolutionOutcome {
  if (result.errorCode === "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID" && result.selectedItemId) {
    return {
      status: "confirmed_identity",
      itemId: result.selectedItemId,
      resolvedUrl: result.resolvedUrl,
    };
  }

  if (result.errorCode === "AFFILIATE_SHOWCASE_NOT_PRODUCT") {
    const recovered = recoverMlIdentityFromShowcase(result);
    if (recovered) {
      return {
        status: "confirmed_identity",
        itemId: recovered.itemId,
        resolvedUrl: result.resolvedUrl,
        ...(recovered.fallbackDetails ? { fallbackDetails: recovered.fallbackDetails } : {}),
      };
    }
  }

  if (result.errorCode) {
    return { status: "rejected", code: result.errorCode };
  }

  return { status: "ready", resolvedUrl: result.resolvedUrl };
}
