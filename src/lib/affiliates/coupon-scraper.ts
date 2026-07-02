import { createHash } from "node:crypto";

export interface ScrapedCoupon {
  code: string;
  discount: string;
  rules: string;
  link: string;
  marketplace: string;
  image_url?: string | null;
}

type MarketplaceCouponConfig = {
  targetUrl: string;
  promptHint: string;
  blockedMarkers?: string[];
};

const MARKETPLACE_COUPON_CONFIGS: Record<string, MarketplaceCouponConfig> = {
  "amazon": {
    targetUrl: "https://www.amazon.com.br/coupons",
    promptHint: "Extraia cupons e promocoes com selo de cupom ativos da Amazon Brasil. Quando nao houver codigo literal, use RESGATE DIRETO.",
    blockedMarkers: ["nao conseguimos encontrar esta pagina"]
  },
  "magalu": {
    targetUrl: "https://www.magazineluiza.com.br/selecao/cuponsgenericos/",
    promptHint: "Extraia cupons ativos do Magalu. O campo code pode repetir o texto do beneficio quando a pagina mostrar apenas o selo de desconto.",
    blockedMarkers: ["oops! achei que essa pagina tambem estava por aqui"]
  },
  "shein": {
    targetUrl: "https://br.shein.com/campaigns/coupon_center",
    promptHint: "Extraia cupons ativos da Shein. Quando houver resgate sem codigo textual, use RESGATE DIRETO.",
    blockedMarkers: ["please log in", "sign in"]
  }
};

type FirecrawlCouponResponse = {
  success?: boolean;
  data?: {
    extract?: { coupons?: unknown[] };
    llm_extraction?: { coupons?: unknown[] };
    json?: { coupons?: unknown[] };
    markdown?: string;
    html?: string;
  };
};

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

function formatShopeeRules(node: ShopeeProductOfferNode) {
  const fragments = [
    node.shopName ? `Loja: ${node.shopName}` : null,
    typeof node.sales === "number" ? `Vendas: ${node.sales}` : null
  ].filter(Boolean);
  return fragments.length > 0 ? fragments.join(" | ") : "Promoção oficial Shopee.";
}

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
            code: buildShopeeRedeemCode(productLink),
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

export async function fetchMercadoLivreCoupons(): Promise<ScrapedCoupon[]> {
  console.warn("[COUPON-SCRAPER][MERCADO LIVRE] Nenhuma fonte oficial adequada de cupons/promocoes foi encontrada na API pública/oficial validada para este fluxo. Provider mantido desativado.");
  return [];
}

function buildPrompt(marketplace: string, limit: number, promptHint: string) {
  return [
    `Voce e um assistente cacador de cupons da ${marketplace}.`,
    `Extraia no maximo ${limit} cupons ativos reais visiveis na pagina.`,
    promptHint,
    "Para cada cupom retorne:",
    "- code: codigo promocional. Se nao houver codigo textual, use RESGATE DIRETO.",
    "- discount: beneficio textual como R$20 OFF, 10% OFF, frete gratis.",
    "- rules: regra principal resumida.",
    "- link: link direto da oferta/cupom/produto promocional.",
    "- image_url: imagem principal se existir.",
    "Ignore login, captcha, navegacao, campanhas expiradas e blocos sem beneficio."
  ].join(" ");
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanupDiscount(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeCoupon(rawCoupon: any, marketplace: string, targetUrl: string): ScrapedCoupon | null {
  const discount = cleanupDiscount(normalizeText(rawCoupon?.discount));
  const code = cleanupDiscount(normalizeText(rawCoupon?.code)) || "RESGATE DIRETO";
  const rules = cleanupDiscount(normalizeText(rawCoupon?.rules)) || "Verifique no site";
  const link = normalizeText(rawCoupon?.link).startsWith("http") ? normalizeText(rawCoupon?.link) : targetUrl;
  const imageUrlCandidate = normalizeText(rawCoupon?.image_url) || normalizeText(rawCoupon?.image);
  const imageUrl = imageUrlCandidate.startsWith("http") ? imageUrlCandidate : null;

  if (!discount) {
    return null;
  }

  return {
    code,
    discount,
    rules,
    link,
    marketplace,
    image_url: imageUrl
  };
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

function extractCouponsFromResponse(fcData: FirecrawlCouponResponse, marketplace: string, targetUrl: string) {
  const extractedCoupons =
    fcData?.data?.extract?.coupons ||
    fcData?.data?.llm_extraction?.coupons ||
    fcData?.data?.json?.coupons ||
    [];

  if (!Array.isArray(extractedCoupons)) {
    return [];
  }

  return dedupeCoupons(
    extractedCoupons
      .map((coupon) => sanitizeCoupon(coupon, marketplace, targetUrl))
      .filter(Boolean) as ScrapedCoupon[]
  );
}

function extractCouponsFromMarkdown(markdown: string, marketplace: string, targetUrl: string) {
  if (!markdown) {
    return [];
  }

  const coupons: ScrapedCoupon[] = [];
  const lines = markdown
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const linkMatch = line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
    const discountMatch = line.match(/((?:R\$\s?\d+[.,]?\d*\s*(?:OFF|off))|(?:\d{1,2}%\s*(?:OFF|off))|(?:frete gr[aá]tis))/i);
    if (!linkMatch || !discountMatch) {
      continue;
    }

    const discount = cleanupDiscount(discountMatch[1]);
    coupons.push({
      code: discount.toUpperCase().includes("OFF") ? discount : "RESGATE DIRETO",
      discount,
      rules: line,
      link: linkMatch[2] || targetUrl,
      marketplace,
      image_url: null
    });
  }

  return dedupeCoupons(coupons);
}

function hasBlockedContent(fcData: FirecrawlCouponResponse, blockedMarkers: string[] = []) {
  const markdown = (fcData?.data?.markdown || "").toLowerCase();
  const html = (fcData?.data?.html || "").toLowerCase();
  return blockedMarkers.some((marker) => {
    const normalizedMarker = marker.toLowerCase();
    return markdown.includes(normalizedMarker) || html.includes(normalizedMarker);
  });
}

export async function fetchMarketplaceCoupons(marketplace: string, limit = 5): Promise<ScrapedCoupon[]> {
  const normalizedMarketplace = marketplace.toLowerCase().trim();

  if (normalizedMarketplace === "shopee") {
    return fetchShopeeCoupons(limit);
  }

  if (normalizedMarketplace === "mercado livre") {
    return fetchMercadoLivreCoupons();
  }

  const config = MARKETPLACE_COUPON_CONFIGS[normalizedMarketplace];

  if (!config) {
    console.warn(`[COUPON-SCRAPER] Marketplace desconhecido ou sem suporte: ${marketplace}`);
    return [];
  }

  console.log(`[COUPON-SCRAPER] Iniciando busca de cupons em: ${normalizedMarketplace} (${config.targetUrl})`);

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.warn("[COUPON-SCRAPER] FIRECRAWL_API_KEY não configurada.");
    return [];
  }

  let retries = 3;
  let delay = 1500;
  let fcData: FirecrawlCouponResponse | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[COUPON-SCRAPER] Tentativa ${attempt} via Firecrawl para ${marketplace}...`);
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: config.targetUrl,
          formats: ["json", "markdown", "html"],
          waitFor: 5000,
          timeout: 60000,
          onlyMainContent: false,
          jsonOptions: {
            prompt: buildPrompt(marketplace, limit, config.promptHint),
            schema: {
              type: "object",
              properties: {
                coupons: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      code: { type: "string" },
                      discount: { type: "string" },
                      rules: { type: "string" },
                      link: { type: "string" },
                      image_url: { type: "string" }
                    },
                    required: ["discount", "link"]
                  }
                }
              },
              required: ["coupons"]
            }
          }
        }),
        signal: AbortSignal.timeout(65000)
      });

      if (!fcResponse.ok) {
        if (fcResponse.status === 408 || fcResponse.status === 429 || fcResponse.status >= 500) {
          throw new Error(`HTTP Status ${fcResponse.status}`);
        }
        console.warn(`[COUPON-SCRAPER] Firecrawl retornou status ${fcResponse.status} para ${marketplace}`);
        break;
      }

      fcData = (await fcResponse.json()) as FirecrawlCouponResponse;
      break;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[COUPON-SCRAPER] Erro na tentativa ${attempt} para ${marketplace}: ${msg}`);
      if (attempt === retries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  if (!fcData || !fcData.success) {
    console.warn(`[COUPON-SCRAPER] Firecrawl sem sucesso para ${marketplace}.`);
    return [];
  }

  if (hasBlockedContent(fcData, config.blockedMarkers)) {
    console.warn(`[COUPON-SCRAPER] Página bloqueada/expirada para ${marketplace}.`);
    return [];
  }

  const extractedFromJson = extractCouponsFromResponse(fcData, marketplace, config.targetUrl);
  if (extractedFromJson.length > 0) {
    return extractedFromJson.slice(0, limit);
  }

  const extractedFromMarkdown = extractCouponsFromMarkdown(fcData.data?.markdown || "", marketplace, config.targetUrl);
  if (extractedFromMarkdown.length > 0) {
    return extractedFromMarkdown.slice(0, limit);
  }

  console.warn(`[COUPON-SCRAPER] Nenhum cupom extraído para ${marketplace}.`);
  return [];
}
