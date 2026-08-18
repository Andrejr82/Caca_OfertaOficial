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

function extractMlIdFromAllowedUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const absoluteUrl = new URL(decodeHtmlUrl(rawUrl), baseUrl);
    const host = absoluteUrl.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "mercadolivre.com.br" && !host.endsWith(".mercadolivre.com.br") && host !== "mercadolibre.com" && !host.endsWith(".mercadolibre.com")) {
      return null;
    }
    return extractMLId(absoluteUrl.toString())?.id || null;
  } catch {
    return null;
  }
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

  // /social/ não é prova suficiente de vitrine. Só recuperamos quando todas as
  // evidências confiáveis apontam para exatamente um produto individual.
  // Ausência ou conflito continua fail-closed.
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
