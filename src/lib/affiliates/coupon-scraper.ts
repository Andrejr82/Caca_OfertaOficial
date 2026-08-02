export interface ScrapedCoupon {
  code: string;
  discount: string;
  rules: string;
  link: string;
  marketplace: string;
  image_url?: string | null;
}

export type CouponSourceStatus = {
  available: boolean;
  source: "official_api" | "unsupported";
  message: string;
};

export type ShopeeCouponSearchOptions = {
  page?: number;
  excludeLinks?: readonly string[];
};

export function classifyCouponCode(value: unknown) {
  const code = normalizeText(value);
  if (!code || /^SHOPEE-[0-9A-F]{8}$/i.test(code)) {
    return "RESGATE DIRETO";
  }
  return code;
}

export function addAmazonAffiliateTag(rawUrl: string, partnerTag = process.env.AMAZON_PARTNER_TAG || "") {
  if (!rawUrl || !partnerTag) return rawUrl;

  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)amazon\.com\.br$/i.test(url.hostname)) return rawUrl;
    url.searchParams.set("tag", partnerTag);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildShopeeCouponVariables(page: number, limit: number) {
  return {
    keyword: "",
    page,
    limit,
    sortType: 2,
    isAMSOffer: true
  };
}

// =======================
// SHOPEE (NATIVE GRAPHQL)
// =======================
export async function fetchShopeeCoupons(limit = 5, options: ShopeeCouponSearchOptions = {}): Promise<ScrapedCoupon[]> {
  void limit;
  void options;
  console.info("[COUPON-SCRAPER][SHOPEE] Sem busca de cupom: productOfferV2 retorna ofertas de produto, não cupons.");
  return [];
}

// =======================
// MERCADO LIVRE (sem feed público oficial para terceiros)
// =======================
export async function fetchMercadoLivreCoupons(limit = 5): Promise<ScrapedCoupon[]> {
  void limit;
  console.info("[COUPON-SCRAPER][ML] Sem busca pública: cupons de terceiros não possuem API oficial disponível.");
  return [];
}

// =======================
// AMAZON (sem catálogo público de cupons na API de afiliados)
// =======================
export async function fetchAmazonCoupons(limit = 5): Promise<ScrapedCoupon[]> {
  void limit;
  console.info("[COUPON-SCRAPER][AMAZON] Sem busca pública: Creators API/PA-API não expõem catálogo de cupons.");
  return [];
}

export function getCouponSourceStatus(marketplace: string): CouponSourceStatus {
  const normalized = marketplace.toLowerCase().trim();
  if (normalized === "shopee") {
    return {
      available: false,
      source: "unsupported",
      message: "A API oficial disponível retorna ofertas de produto, não cupons públicos."
    };
  }
  if (normalized === "mercado livre") {
    return {
      available: false,
      source: "unsupported",
      message: "A API oficial de cupons exige OAuth de vendedor; não há feed público de cupons de terceiros."
    };
  }
  if (normalized === "amazon") {
    return {
      available: false,
      source: "unsupported",
      message: "Creators API/PA-API expõem ofertas do produto, mas não catálogo público de cupons."
    };
  }
  return { available: false, source: "unsupported", message: "Marketplace sem fonte oficial de cupons configurada." };
}

// =======================
// ENTRYPOINT
// =======================
export async function fetchMarketplaceCoupons(
  marketplace: string,
  limit = 5,
  options: ShopeeCouponSearchOptions = {}
): Promise<ScrapedCoupon[]> {
  const normalizedMarketplace = marketplace.toLowerCase().trim();

  if (normalizedMarketplace === "shopee") return fetchShopeeCoupons(limit, options);
  if (normalizedMarketplace === "mercado livre") return fetchMercadoLivreCoupons(limit);
  if (normalizedMarketplace === "amazon") return fetchAmazonCoupons(limit);

  console.warn(`[COUPON-SCRAPER] Marketplace desconhecido ou sem suporte: ${marketplace}`);
  return [];
}
