import { extractMLId } from "@/lib/platforms/mercadolivre";
import type { UrlResolveResult } from "./express-url-resolver";

export type ProductResolutionOutcome =
  | {
      status: "confirmed_identity";
      itemId: string;
      resolvedUrl: string;
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
  | { status: "valid"; itemId: string }
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
  return /^MLB\d+$/.test(normalized) ? normalized : null;
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
          /(?:window\.)?__NORDIC_RENDERING_CTX__\s*=\s*([\s\S]+?);?\s*$/i,
          /(?:window\.)?_n\.ctx\.r\s*=\s*([\s\S]+?);?\s*$/i,
        ];

        for (const pattern of assignmentPatterns) {
          const assignment = candidate.match(pattern);
          if (!assignment) continue;
          try {
            return JSON.parse(assignment[1]);
          } catch {
            // Contexto inválido não vira autoridade de identidade.
          }
        }
      }
    }
  }

  return null;
}

function isFeaturedMarker(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "/home/card-featured/element";
}

function objectHasFeaturedMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (isFeaturedMarker(object.c_id)) return true;
  const metadata = object.metadata;
  return Boolean(
    metadata
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && isFeaturedMarker((metadata as Record<string, unknown>).c_id)
  );
}

function validateNordicFeaturedCard(card: unknown, baseUrl: string): string | null {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const metadata = (card as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const meta = metadata as Record<string, unknown>;
  const itemId = normalizeMlId(meta.id);
  const productId = normalizeMlId(meta.product_id);
  const rawUrl = typeof meta.url === "string" ? meta.url : "";
  if (!itemId || !rawUrl) return null;

  const urlIdentity = extractMlIdentityFromAllowedUrl(rawUrl, baseUrl);
  if (!urlIdentity) return null;

  if (urlIdentity.type === "item") {
    return urlIdentity.id === itemId ? itemId : null;
  }

  return productId && productId === urlIdentity.id ? itemId : null;
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
  return itemId ? { status: "valid", itemId } : { status: "invalid" };
}

function recoverMlIdentityFromShowcase(result: UrlResolveResult): string | null {
  if (result.marketplace !== "Mercado Livre") return null;

  const ids = new Set<string>();
  if (result.finalItemId) ids.add(result.finalItemId);

  for (const id of extractMlIdsFromTrustedHtmlMetadata(result.htmlBody, result.resolvedUrl)) {
    ids.add(id);
  }

  for (const id of extractMlIdsFromTrustedNavigation(result.htmlBody, result.resolvedUrl)) {
    ids.add(id);
  }

  const nordicIdentity = extractMlIdentityFromNordicFeaturedCard(result.htmlBody, result.resolvedUrl);
  if (nordicIdentity.status === "invalid") return null;
  if (nordicIdentity.status === "valid") ids.add(nordicIdentity.itemId);

  return ids.size === 1 ? [...ids][0] : null;
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
    const recoveredItemId = recoverMlIdentityFromShowcase(result);
    if (recoveredItemId) {
      return {
        status: "confirmed_identity",
        itemId: recoveredItemId,
        resolvedUrl: result.resolvedUrl,
      };
    }
  }

  if (result.errorCode) {
    return { status: "rejected", code: result.errorCode };
  }

  return { status: "ready", resolvedUrl: result.resolvedUrl };
}
