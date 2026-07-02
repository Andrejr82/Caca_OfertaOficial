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
  "shopee": {
    targetUrl: "https://shopee.com.br/m/cupons-diarios",
    promptHint: "Extraia apenas cupons ativos visiveis na pagina. Ignore paginas expiradas, login, navegacao e placeholders.",
    blockedMarkers: ["essa campanha expirou", "pagina indisponivel", "parece que voce ainda nao esta logado"]
  },
  "mercado livre": {
    targetUrl: "https://www.mercadolivre.com.br/cupons",
    promptHint: "Extraia apenas cupons ativos visiveis publicamente. Ignore telas de login, recaptcha e navegacao.",
    blockedMarkers: ["reCAPTCHA", "nao sou um robo", "iniciar sessao", "digite seu e-mail ou telefone"]
  },
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
