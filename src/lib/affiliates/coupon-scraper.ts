import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

export interface ScrapedCoupon {
  code: string;
  discount: string;
  rules: string;
  link: string;
  marketplace: string;
  image_url?: string | null;
}

type ShopeeGraphQLResponse<TNode> = {
  data?: {
    productOfferV2?: {
      nodes?: TNode[];
      pageInfo?: {
        page?: number;
        limit?: number;
        hasNextPage?: boolean;
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type ShopeeProductOfferNode = {
  productName?: string;
  productLink?: string;
  offerLink?: string;
  imageUrl?: string;
  priceMin?: string;
  priceMax?: string;
  priceDiscountRate?: number;
  sales?: number;
  shopName?: string;
};

function parseShopeeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const normalized = Number(value.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function formatPercentDiscount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${Math.round(value)}% OFF`;
  }
  return "Oferta Shopee";
}

function buildShopeeRedeemCode(link: string) {
  const digest = createHash("sha1").update(link).digest("hex").slice(0, 8).toUpperCase();
  return `SHOPEE-${digest}`;
}

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

function formatShopeeRules(node: ShopeeProductOfferNode) {
  const fragments = [
    node.shopName ? `Loja: ${node.shopName}` : null,
    typeof node.sales === "number" ? `Vendas: ${node.sales}` : null
  ].filter(Boolean);
  return fragments.length > 0 ? fragments.join(" | ") : "Promoção oficial Shopee.";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeCoupons(coupons: ScrapedCoupon[]) {
  const seen = new Set<string>();
  return coupons.filter((coupon) => {
    const key = `${coupon.code.toLowerCase()}|${coupon.discount.toLowerCase()}|${coupon.link.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// =======================
// SHOPEE (NATIVE GRAPHQL)
// =======================
export async function fetchShopeeCoupons(limit = 5): Promise<ScrapedCoupon[]> {
  const appId = process.env.SHOPEE_APP_ID || "";
  const appSecret = process.env.SHOPEE_APP_SECRET || "";

  if (!appId || !appSecret) {
    console.warn("[COUPON-SCRAPER][SHOPEE] SHOPEE_APP_ID/SHOPEE_APP_SECRET ausentes.");
    return [];
  }

  const requestBody = JSON.stringify({
    query: "query ShopeePromotionOffers($keyword: String, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { productName productLink offerLink imageUrl priceMin priceMax priceDiscountRate sales shopName } pageInfo { page limit hasNextPage } } }",
    variables: {
      keyword: "",
      page: 1,
      limit,
      sortType: 2,
      isAMSOffer: true
    }
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256")
    .update(`${appId}${timestamp}${requestBody}${appSecret}`)
    .digest("hex");

  try {
    const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
      },
      body: requestBody
    });

    const data = (await response.json()) as ShopeeGraphQLResponse<ShopeeProductOfferNode>;
    const errors = Array.isArray(data.errors) ? data.errors.map((item) => item?.message).filter(Boolean) : [];

    if (!response.ok || errors.length > 0) {
      console.warn(`[COUPON-SCRAPER][SHOPEE] Falha na API oficial: HTTP ${response.status} ${errors.join(" | ")}`);
      return [];
    }

    const nodes = Array.isArray(data.data?.productOfferV2?.nodes) ? data.data?.productOfferV2?.nodes : [];

    return dedupeCoupons(
      nodes
        .map((node) => {
          const productName = normalizeText(node.productName);
          const productLink = normalizeText(node.offerLink) || normalizeText(node.productLink);
          if (!productName || !productLink) {
            return null;
          }

          const currentPrice = parseShopeeMoney(node.priceMin);
          const oldPrice = parseShopeeMoney(node.priceMax);
          const discount = formatPercentDiscount(node.priceDiscountRate);
          const rules = [
            formatShopeeRules(node),
            currentPrice ? `Preço atual: R$ ${currentPrice.toFixed(2)}` : null,
            oldPrice && currentPrice && oldPrice > currentPrice ? `Preço anterior: R$ ${oldPrice.toFixed(2)}` : null,
            `Produto: ${productName}`
          ]
            .filter(Boolean)
            .join(" | ");

          return {
            code: classifyCouponCode(buildShopeeRedeemCode(productLink)),
            discount,
            rules,
            link: productLink,
            marketplace: "Shopee",
            image_url: normalizeText(node.imageUrl) || null
          } satisfies ScrapedCoupon;
        })
        .filter(Boolean) as ScrapedCoupon[]
    ).slice(0, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[COUPON-SCRAPER][SHOPEE] Erro ao consultar API oficial: ${msg}`);
    return [];
  }
}

// =======================
// MERCADO LIVRE (NATIVE)
// =======================
export async function fetchMercadoLivreCoupons(limit = 5): Promise<ScrapedCoupon[]> {
  console.log(`[COUPON-SCRAPER] Iniciando busca de cupons em: mercado livre`);
  try {
    const url = "https://www.mercadolivre.com.br/ofertas/cupons";
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.warn(`[COUPON-SCRAPER][ML] HTTP ${response.status}`);
      return [];
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const coupons: ScrapedCoupon[] = [];

    $('.poly-card').each((_, el) => {
      if (coupons.length >= limit) return;
      const title = $(el).find('h2, .poly-component__title').text().trim();
      const link = $(el).find('a').attr('href') || url;
      const discountNode = $(el).find('.andes-money-amount__discount, .promotion-item__discount-text').first();
      const discountText = discountNode.text().trim();

      // Enforcing that it looks like a discount or offer since ML coupons page lists products
      if (title && (discountText.toUpperCase().includes('OFF') || discountText)) {
        coupons.push({
          code: "RESGATE DIRETO",
          discount: discountText || "Oferta Especial",
          rules: title,
          link: link,
          marketplace: "Mercado Livre",
          image_url: null
        });
      }
    });

    return dedupeCoupons(coupons).slice(0, limit);
  } catch (error) {
    console.warn(`[COUPON-SCRAPER][ML] Erro nativo:`, error);
    return [];
  }
}

// =======================
// AMAZON (NATIVE)
// =======================
export async function fetchAmazonCoupons(limit = 5): Promise<ScrapedCoupon[]> {
  console.log(`[COUPON-SCRAPER] Iniciando busca de cupons em: amazon`);
  try {
    const url = "https://www.amazon.com.br/coupons";
    let html = "";
    
    // Tenta fetch direto
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      html = await response.text();
    }
    
    if (!html) {
      console.warn(`[COUPON-SCRAPER][AMAZON] Fallback: Scraping falhou ou vazio`);
      return [];
    }

    const $ = cheerio.load(html);
    const coupons: ScrapedCoupon[] = [];

    // Amazon geralmente usa .sg-col, .s-result-item ou cards similares na página de coupons.
    // Como os cupons Amazon dependem de JS, se não renderizar os blocos, capturamos destaques
    $('[class*="coupon"], [class*="deal"], .a-section').each((_, el) => {
      if (coupons.length >= limit) return;
      const text = $(el).text().trim();
      // Heurística básica caso JS não renderize os cards
      if (text.includes('OFF') || text.includes('Cupom') || text.includes('Desconto')) {
         const titleNode = $(el).find('[class*="title"], h2, h3').first();
         const title = titleNode.text().trim() || "Oferta Amazon";
         const discountNode = $(el).find(':contains("OFF"), :contains("Cupom")').first();
         const discountText = discountNode.text().trim().substring(0, 30) || "Resgate Direto";
         const link = $(el).find('a').attr('href');
         
         if (link) {
           const fullLink = link.startsWith('http') ? link : `https://www.amazon.com.br${link}`;
           coupons.push({
             code: "RESGATE DIRETO",
             discount: discountText,
             rules: title,
             link: addAmazonAffiliateTag(fullLink),
             marketplace: "Amazon",
             image_url: null
           });
         }
      }
    });

    return dedupeCoupons(coupons).slice(0, limit);
  } catch (error) {
    console.warn(`[COUPON-SCRAPER][AMAZON] Erro nativo:`, error);
    return [];
  }
}

// =======================
// ENTRYPOINT
// =======================
export async function fetchMarketplaceCoupons(marketplace: string, limit = 5): Promise<ScrapedCoupon[]> {
  const normalizedMarketplace = marketplace.toLowerCase().trim();

  if (normalizedMarketplace === "shopee") return fetchShopeeCoupons(limit);
  if (normalizedMarketplace === "mercado livre") return fetchMercadoLivreCoupons(limit);
  if (normalizedMarketplace === "amazon") return fetchAmazonCoupons(limit);

  console.warn(`[COUPON-SCRAPER] Marketplace desconhecido ou sem suporte: ${marketplace}`);
  return [];
}
