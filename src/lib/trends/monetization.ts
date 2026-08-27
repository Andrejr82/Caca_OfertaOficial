import {
  isMercadoLivreMonetizedUrl,
  resolveGoAffiliateDestination,
  resolveTrackedOfferDestination,
} from "@/lib/tracking/go-request";

function isAmazonBrazilHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "amazon.com.br" || host.endsWith(".amazon.com.br");
}

export function isAmazonMonetizedUrl(rawUrl: string): boolean {
  const safeUrl = resolveGoAffiliateDestination(rawUrl);
  if (!safeUrl) return false;

  try {
    const parsed = new URL(safeUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "amzn.to" || host === "a.co" || host === "link.amazon") return true;
    return isAmazonBrazilHost(host) && Boolean(parsed.searchParams.get("tag")?.trim());
  } catch {
    return false;
  }
}

export function buildAmazonAffiliateUrl(
  rawUrl: string,
  partnerTag = process.env.AMAZON_PARTNER_TAG || "",
): string | null {
  const value = String(rawUrl || "").trim();
  const tag = String(partnerTag || "").trim();
  if (!value || !tag) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !isAmazonBrazilHost(parsed.hostname)) return null;
    parsed.hash = "";
    parsed.searchParams.set("tag", tag);
    const affiliateUrl = parsed.toString();
    return isAmazonMonetizedUrl(affiliateUrl) ? affiliateUrl : null;
  } catch {
    return null;
  }
}

export function buildMercadoLivreAffiliateUrl(
  rawUrl: string,
  affiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID || "cacaofertaoficial",
): string | null {
  const value = String(rawUrl || "").trim();
  const id = String(affiliateId || "").trim();
  if (!value || !id) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !/(^|\.)mercadolivre\.com\.br$/i.test(parsed.hostname)) {
      return null;
    }

    if (isMercadoLivreMonetizedUrl(value)) return value;

    parsed.hash = "";
    parsed.searchParams.set("partner_id", id);
    parsed.searchParams.set("utm_source", "caca_oferta");
    parsed.searchParams.set("utm_medium", "afiliado");
    parsed.searchParams.set("utm_campaign", "trend_publication");

    const affiliateUrl = parsed.toString();
    return isMercadoLivreMonetizedUrl(affiliateUrl) ? affiliateUrl : null;
  } catch {
    return null;
  }
}

export function resolveTrendMonetizedDestination(input: {
  platform?: string | null;
  originalUrl?: string | null;
  affiliateUrl?: string | null;
}): string | null {
  const platform = String(input.platform || "").trim().toLowerCase();

  if (platform === "amazon") {
    for (const candidate of [input.affiliateUrl, input.originalUrl]) {
      const value = String(candidate || "").trim();
      if (isAmazonMonetizedUrl(value)) return resolveGoAffiliateDestination(value);
    }
    return null;
  }

  return resolveTrackedOfferDestination({
    platform: input.platform,
    originalUrl: input.originalUrl,
    affiliateUrl: input.affiliateUrl,
  });
}
