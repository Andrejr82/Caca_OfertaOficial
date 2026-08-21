import {
  isMercadoLivreMonetizedUrl,
  resolveTrackedOfferDestination,
} from "@/lib/tracking/go-request";

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
  return resolveTrackedOfferDestination({
    platform: input.platform,
    originalUrl: input.originalUrl,
    affiliateUrl: input.affiliateUrl,
  });
}
