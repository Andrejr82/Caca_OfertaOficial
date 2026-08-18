export type MLAffiliateLinkKind =
  | "official_meli_shortlink"
  | "official_affiliate_full_url"
  | "internally_generated_affiliate_url"
  | "plain_product_url"
  | "unknown";

export interface MLAffiliateClassification {
  kind: MLAffiliateLinkKind;
  monetized: boolean;
  affiliateUrl?: string;
  host?: string;
  reasonCode:
    | "OFFICIAL_MELI_SHORTLINK"
    | "OFFICIAL_AFFILIATE_FULL_URL"
    | "LEGACY_INTERNAL_LINK_REQUIRES_VALIDATION"
    | "PLAIN_PRODUCT_URL_NOT_MONETIZED"
    | "UNKNOWN_OR_INVALID_URL";
}

const ML_HOSTS = new Set([
  "mercadolivre.com.br",
  "www.mercadolivre.com.br",
  "produto.mercadolivre.com.br",
  "mercadolibre.com",
  "www.mercadolibre.com",
]);

function normalizeHost(hostname: string) {
  return hostname.trim().toLowerCase();
}

function isMercadoLivreHost(hostname: string) {
  const host = normalizeHost(hostname);
  if (ML_HOSTS.has(host)) return true;
  return host.endsWith(".mercadolivre.com.br") || host.endsWith(".mercadolibre.com");
}

/**
 * Classifica uma URL de Mercado Livre sem resolver redirects e sem reescrever
 * parâmetros. Este contrato separa identificação de produto de monetização.
 *
 * Regras fail-closed da Task 1:
 * - meli.la é preservado como shortlink oficial da Central;
 * - URL completa do domínio ML só é aprovada quando contém os marcadores
 *   oficiais observados no fluxo da Central (matt_tool + ua);
 * - links legados gerados internamente por partner_id são identificados, mas
 *   NÃO são aprovados como monetizados até existir contrato oficial comprovado;
 * - URL comum de produto nunca é considerada monetizada por inferência.
 */
export function classifyMLAffiliateInput(rawUrl: string): MLAffiliateClassification {
  const value = rawUrl?.trim();
  if (!value) {
    return {
      kind: "unknown",
      monetized: false,
      reasonCode: "UNKNOWN_OR_INVALID_URL",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      kind: "unknown",
      monetized: false,
      reasonCode: "UNKNOWN_OR_INVALID_URL",
    };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      kind: "unknown",
      monetized: false,
      host: normalizeHost(url.hostname),
      reasonCode: "UNKNOWN_OR_INVALID_URL",
    };
  }

  const host = normalizeHost(url.hostname);

  if (host === "meli.la" || host.endsWith(".meli.la")) {
    return {
      kind: "official_meli_shortlink",
      monetized: true,
      affiliateUrl: value,
      host,
      reasonCode: "OFFICIAL_MELI_SHORTLINK",
    };
  }

  if (!isMercadoLivreHost(host)) {
    return {
      kind: "unknown",
      monetized: false,
      host,
      reasonCode: "UNKNOWN_OR_INVALID_URL",
    };
  }

  const mattTool = url.searchParams.get("matt_tool")?.trim();
  const ua = url.searchParams.get("ua")?.trim();
  if (mattTool && ua) {
    return {
      kind: "official_affiliate_full_url",
      monetized: true,
      affiliateUrl: value,
      host,
      reasonCode: "OFFICIAL_AFFILIATE_FULL_URL",
    };
  }

  if (url.searchParams.get("partner_id")?.trim()) {
    return {
      kind: "internally_generated_affiliate_url",
      monetized: false,
      host,
      reasonCode: "LEGACY_INTERNAL_LINK_REQUIRES_VALIDATION",
    };
  }

  return {
    kind: "plain_product_url",
    monetized: false,
    host,
    reasonCode: "PLAIN_PRODUCT_URL_NOT_MONETIZED",
  };
}
