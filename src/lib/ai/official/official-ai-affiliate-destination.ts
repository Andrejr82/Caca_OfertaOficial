import { classifyMLAffiliateInput } from "@/lib/platforms/mercadolivre-affiliate";
import type { OfficialAIOffer } from "@/core/ai";

export type OfficialAIAffiliateSource =
  | "existing_affiliate_link"
  | "offer_explainability"
  | "official_input";

export type OfficialAIAffiliateDestinationResult =
  | {
      ok: true;
      affiliateUrl: string;
      source: OfficialAIAffiliateSource;
    }
  | {
      ok: false;
      reasonCode: "ML_AFFILIATE_DESTINATION_NOT_CONFIRMED";
    };

/**
 * Normaliza e identifica se o marketplace é Mercado Livre.
 */
export function isMercadoLivreMarketplace(marketplace: string | null | undefined): boolean {
  if (!marketplace) return false;
  const normalized = marketplace.trim().toLowerCase();
  return (
    normalized === "mercado livre" ||
    normalized === "mercadolivre" ||
    normalized === "mercadolibre"
  );
}

/**
 * Determina o destino comercial afiliado para o fluxo Official AI / Oracle.
 *
 * Para Mercado Livre:
 * - Separa identificação de produto da autoridade de monetização (produto identificado != produto monetizado).
 * - Uma URL comum de produto (ex: /p/MLB...) NÃO pode ser usada como destino de affiliate_links.
 * - Ordem de prioridade:
 *   1. Link afiliado persistido existente para o canal, se monetizado.
 *   2. explainability.manual_resolution.affiliate_url da oferta (Publicação Expressa), se monetizado.
 *   3. originalUrl da oferta se for link oficial comprovado (meli.la ou matt_tool + ua).
 *   4. Fail-closed com ML_AFFILIATE_DESTINATION_NOT_CONFIRMED.
 *
 * Para outros marketplaces (Shopee, Amazon, Shein, etc.):
 * - Preserva integralmente o comportamento existente (utiliza originalUrl).
 */
export function resolveOfficialAIAffiliateDestination(
  offer: Pick<OfficialAIOffer, "marketplace" | "originalUrl" | "explainability"> & {
    affiliateLinks?: readonly { channel: string; trackedUrl: string; subId?: string; originalUrl?: string }[];
  },
  channel?: string,
  persistedLink?: { channel: string; trackedUrl: string; subId?: string; originalUrl?: string }
): OfficialAIAffiliateDestinationResult {
  // Não-Mercado Livre: preserva o comportamento existente
  if (!isMercadoLivreMarketplace(offer.marketplace)) {
    return {
      ok: true,
      affiliateUrl: offer.originalUrl,
      source: "official_input",
    };
  }

  // 1. Link existente persistido no canal
  const link = persistedLink ?? (channel ? offer.affiliateLinks?.find((l) => l.channel === channel) : undefined);
  if (link?.originalUrl) {
    const classification = classifyMLAffiliateInput(link.originalUrl);
    if (classification.monetized && classification.affiliateUrl) {
      return {
        ok: true,
        affiliateUrl: classification.affiliateUrl,
        source: "existing_affiliate_link",
      };
    }
  }

  // 2. explainability / manual_resolution (Publicação Expressa)
  const explainability = offer.explainability as Record<string, any> | undefined;
  const manualResolution = explainability?.manual_resolution as Record<string, any> | undefined;
  const candidateFromExplainability =
    (typeof manualResolution?.affiliate_url === "string" ? manualResolution.affiliate_url : undefined) ||
    (typeof manualResolution?.affiliateUrl === "string" ? manualResolution.affiliateUrl : undefined) ||
    (typeof explainability?.affiliate_url === "string" ? explainability.affiliate_url : undefined) ||
    (typeof explainability?.affiliateUrl === "string" ? explainability.affiliateUrl : undefined);

  if (candidateFromExplainability) {
    const classification = classifyMLAffiliateInput(candidateFromExplainability);
    if (classification.monetized && classification.affiliateUrl) {
      return {
        ok: true,
        affiliateUrl: classification.affiliateUrl,
        source: "offer_explainability",
      };
    }
  }

  // 3. originalUrl da própria oferta
  if (offer.originalUrl) {
    const classification = classifyMLAffiliateInput(offer.originalUrl);
    if (classification.monetized && classification.affiliateUrl) {
      return {
        ok: true,
        affiliateUrl: classification.affiliateUrl,
        source: "official_input",
      };
    }
  }

  // 4. Fail-closed
  return {
    ok: false,
    reasonCode: "ML_AFFILIATE_DESTINATION_NOT_CONFIRMED",
  };
}
