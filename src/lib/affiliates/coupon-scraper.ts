export interface ScrapedCoupon {
  code: string;
  discount: string;
  rules: string;
  link: string;
  marketplace: string;
}

const MARKETPLACE_COUPON_URLS: Record<string, string> = {
  "shopee": "https://shopee.com.br/m/cupons-diarios",
  "mercado livre": "https://www.mercadolivre.com.br/cupons",
  "amazon": "https://www.amazon.com.br/b?node=19694467011",
  "magalu": "https://www.magazineluiza.com.br/cupons",
  "shein": "https://br.shein.com/campaigns/coupon_center",
};

export async function fetchMarketplaceCoupons(marketplace: string, limit = 5): Promise<ScrapedCoupon[]> {
  const normalizedMarketplace = marketplace.toLowerCase().trim();
  const targetUrl = MARKETPLACE_COUPON_URLS[normalizedMarketplace];

  if (!targetUrl) {
    console.warn(`[COUPON-SCRAPER] Marketplace desconhecido ou sem suporte: ${marketplace}`);
    return [];
  }

  console.log(`[COUPON-SCRAPER] Iniciando busca de cupons em: ${normalizedMarketplace} (${targetUrl})`);
  
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.warn("[COUPON-SCRAPER] FIRECRAWL_API_KEY não configurada.");
    return [];
  }

  const promptText = `Você é um assistente caçador de Cupons. Extraia os ${limit} melhores e maiores cupons de desconto ativos nesta página da ${marketplace}. Para cada cupom, identifique o código promocional em si (code) (ex: SHP20, GANHE10, FRETEGRATIS. Se não houver texto explícito de código mas for um botão de resgate automático, deixe o code como 'RESGATE DIRETO'), o valor do desconto (discount) (ex: R$20 OFF, 15% OFF), a regra principal de uso (rules) (ex: Para compras acima de R$100, ou Válido na primeira compra), e o link direto para a página de resgate ou para a loja (link). Ignore cupons expirados se houver indicativo.`;

  let retries = 3;
  let delay = 1500;
  let fcData = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[COUPON-SCRAPER] Tentativa ${attempt} via Firecrawl...`);
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          url: targetUrl,
          formats: ["extract"],
          waitFor: 3000, // Waits a bit for dynamic coupon rendering
          timeout: 60000,
          extract: {
            prompt: promptText,
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
                      link: { type: "string" }
                    },
                    required: ["code", "discount"]
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
        console.warn(`[COUPON-SCRAPER] Firecrawl retornou status ${fcResponse.status}`);
        break; 
      }

      fcData = await fcResponse.json();
      break;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[COUPON-SCRAPER] Erro na tentativa ${attempt}: ${msg}`);
      if (attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  if (!fcData || !fcData.success || !fcData.data?.extract?.coupons?.length) {
    console.warn(`[COUPON-SCRAPER] Nenhum cupom extraído para ${marketplace}.`);
    return [];
  }

  const rawCoupons = fcData.data.extract.coupons;
  
  return rawCoupons.slice(0, limit).map((c: any) => ({
    code: c.code || "RESGATE DIRETO",
    discount: c.discount || "Desconto Especial",
    rules: c.rules || "Verifique no site",
    link: c.link && c.link.startsWith("http") ? c.link : targetUrl,
    marketplace: marketplace
  }));
}
