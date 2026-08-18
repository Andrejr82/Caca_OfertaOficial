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
    .replace(/&#x3a;/gi, ":")
    .replace(/&#58;/g, ":")
    .trim();
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? decodeHtmlUrl(match[1]) : null;
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

    try {
      const absoluteUrl = new URL(rawUrl, baseUrl).toString();
      const id = extractMLId(absoluteUrl)?.id;
      if (id) ids.add(id);
    } catch {
      // Metadado inválido não deve virar autoridade de identidade.
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

  // Só recuperamos a identidade quando todas as evidências confiáveis apontam
  // para exatamente um produto. Conflito ou ausência continua fail-closed.
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
