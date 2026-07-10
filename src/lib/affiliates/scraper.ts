import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Offer } from "@/types/domain";
import { generateMLAffiliateLink } from "@/lib/platforms/mercadolivre";
import { curateOfferScore } from "@/lib/offers/curation-engine";
import { normalizeCategory, MAIN_CATEGORY_NAMES } from "@/lib/offers/category-taxonomy";
import { getNextViralTarget } from "@/lib/offers/discovery-config";
import { callLLM } from "@/lib/ai/groq";

const USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export interface MarketplaceMetrics {
  found: number;
  discarded: number;
  captchas: number;
  failures: number;
  successRate: number;
}

export const scraperMetrics: Record<string, MarketplaceMetrics> = {
  "Mercado Livre": { found: 0, discarded: 0, captchas: 0, failures: 0, successRate: 100 },
  "Amazon": { found: 0, discarded: 0, captchas: 0, failures: 0, successRate: 100 },
  "Shopee": { found: 0, discarded: 0, captchas: 0, failures: 0, successRate: 100 },
  "Shein": { found: 0, discarded: 0, captchas: 0, failures: 0, successRate: 100 },
  "Magalu": { found: 0, discarded: 0, captchas: 0, failures: 0, successRate: 100 }
};

export function updateMetrics(marketplace: string, type: keyof Omit<MarketplaceMetrics, "successRate">, count = 1) {
  const m = scraperMetrics[marketplace];
  if (m) {
    m[type] += count;
    const total = m.found + m.failures + m.captchas;
    m.successRate = total > 0 ? Math.round((m.found / total) * 100) : 100;
  }
}

export interface ScrapedProduct {
  product_name: string;
  original_url: string;
  image_url: string | null;
  current_price: number;
  old_price: number | null;
  discount_badge?: string | null;
  rating: number | null;
  category?: string | null;
  subcategory?: string | null;
}

/**
 * Função utilitária para forçar a maior resolução e compatibilidade possível
 * das imagens das lojas, garantindo ótima qualidade no Instagram.
 */
function enhanceImageUrl(url: string | null): string | null {
  if (!url) return null;
  let enhanced = url;

  // Força HTTPS
  if (enhanced.startsWith("//")) {
    enhanced = "https:" + enhanced;
  }

  // Removida a substituição de formato -O.jpg do ML, pois algumas imagens recentes da CDN retornam 404 (Broken Image) se a tag alta resolução não existir. Usamos a URL extraída originalmente.

  // Magalu: Remove as dimensões fixas baixas da URL para pegar a original
  if (enhanced.includes("mlcdn.com.br")) {
    enhanced = enhanced.replace(/\/\d+x\d+\//, "/orig/");
  }

  // Netshoes: Remove parâmetros da query para pegar a imagem original de alta resolução
  if (enhanced.includes("netshoes.com.br") && enhanced.includes("?")) {
    enhanced = enhanced.split("?")[0];
  }

  return enhanced;
}

function hasTokenOptimizedContent(payload: any): boolean {
  return Boolean(payload?.title && (payload?.price != null || payload?.imageUrl || payload?.seller || payload?.specs?.length));
}

function logTokenOptimizationPayload(marketplace: string, payload: any) {
  console.log(
    `[Token Optimization] ${marketplace} source=${payload?.source || "fallback"} title=${payload?.title ? "sim" : "nao"} price=${payload?.price != null ? "sim" : "nao"} image=${payload?.imageUrl ? "sim" : "nao"}`
  );
}

function buildTokenOptimizedLlmInput(oracleData: any, marketplace: string): string {
  const normalized = oracleData?.data?.extract?.normalized;
  if (normalized) {
    if (!hasTokenOptimizedContent(normalized)) {
      console.log(`[Token Optimization] fallback usado para ${marketplace}`);
    }
    logTokenOptimizationPayload(marketplace, normalized);
    return JSON.stringify(normalized, null, 2);
  }

  const fallbackText = String(oracleData?.data?.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  const fallbackPayload = {
    marketplace,
    title: null,
    price: null,
    oldPrice: null,
    discount: null,
    rating: null,
    reviews: null,
    imageUrl: null,
    url: null,
    seller: null,
    specs: fallbackText ? [fallbackText] : [],
    source: "fallback",
    tokenOptimized: true,
    fallbackText
  };

  console.log(`[Token Optimization] fallback usado para ${marketplace}`);
  logTokenOptimizationPayload(marketplace, fallbackPayload);
  return JSON.stringify(fallbackPayload, null, 2);
}

function getOracleApiBaseUrl(): string {
  const configured = process.env.ORACLE_REMOTE_URL || "http://193.122.242.178:3002/api/scrape";
  return configured.replace(/\/api\/scrape\/?$/i, "");
}

async function callOracleRuntime<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const oracleKey = process.env.ORACLE_API_KEY;
  if (!oracleKey) {
    throw new Error("ORACLE_API_KEY não configurada.");
  }

  const response = await fetch(`${getOracleApiBaseUrl()}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, token: oracleKey }),
  });

  if (!response.ok) {
    throw new Error(`Falha na Oracle API ${endpoint}: ${response.status}`);
  }

  const data = await response.json();
  if (!data?.success) {
    throw new Error(data?.error || `Resposta inválida da Oracle API ${endpoint}`);
  }

  return data as T;
}

function normalizeShopeeComparableUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url).trim().replace(/\/$/, "");
  }
}

function mapShopeeCandidateToScrapedProduct(candidate: any): ScrapedProduct {
  const { category: cat, subcategory: sub } = normalizeCategory(candidate.category || candidate.productName || "");
  return {
    product_name: candidate.productName,
    original_url: candidate.productLink,
    image_url: enhanceImageUrl(candidate.image || null),
    current_price: candidate.currentPrice,
    old_price: candidate.originalPrice && candidate.originalPrice > candidate.currentPrice ? candidate.originalPrice : null,
    discount_badge: candidate.discount || null,
    rating: candidate.rating ? parseFloat(String(candidate.rating)) : null,
    category: cat,
    subcategory: sub
  };
}

export async function fetchShopeeTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][SHOPEE][TRENDS] Iniciando busca oficial da Shopee...");
  try {
    const targetCategory = category || "Todas";
    const payload = await callOracleRuntime<{ candidates: any[]; telemetry?: any }>("/api/shopee/trends", {
      category: targetCategory,
      limit: Math.max(limit * 4, limit)
    });
    const { candidates, telemetry } = payload;

    if (!candidates?.length) {
      console.log(`[Shopee Official] query_sem_resultado query=${targetCategory}`);
      return [];
    }

    const products = candidates.slice(0, limit).map(mapShopeeCandidateToScrapedProduct);

    console.log(`[SCRAPER][SHOPEE][TRENDS] Sucesso oficial: ${products.length} tendências encontradas. returned=${telemetry?.returned ?? products.length}`);
    return products;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][SHOPEE][TRENDS] Falha oficial ao buscar tendências: ${errorMsg}`);
    return [];
  }
}

export async function fetchSheinTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][SHEIN][TRENDS] Iniciando busca de tendências da Shein via Oracle API...");
  try {
    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) {
      throw new Error("ORACLE_API_KEY não configurada.");
    }

    const fetchLimit = limit * 4;
    const targetUrl = category ? `https://br.shein.com/pdsearch/${encodeURIComponent(category + " venda flash")}/` : "https://br.shein.com/promotion/flash-sale";
    const promptText = getScrapingPrompt();

    const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, token: oracleKey }),
    });

    if (!oracleRes.ok) throw new Error(`Falha na Oracle API Shein Trends: ${oracleRes.status}`);
    const oracleData = await oracleRes.json();
    if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) throw new Error("Sem texto extraído da Shein pela Oracle API");

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
    if (!validateHtml(textToAnalyze, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return []; }
    if (!validateHtml(textToAnalyze, "Trends_API")) return [];

    const schemaObj = {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              image: { type: "string" },
              price: { type: "number" },
              old_price: { type: "number", nullable: true },
              discount_badge: { type: "string", nullable: true },
              rating: { type: "number", nullable: true },
              category: { type: "string" }
            },
            required: ["title", "url", "price"]
          }
        }
      },
      required: ["products"]
    };

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 120000), schemaObj, 0.2, 4000);
    const fcData = JSON.parse(rawResult);

    if (!fcData.products) throw new Error("Sem produtos extraídos da Shein pela IA");

    const validProducts = sanitizeScrapedData(fcData.products, "Trends_API");

    const products = validProducts.slice(0, limit).map((p: any) => {
      const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
      return {
        product_name: p.title,
        original_url: p.url.startsWith("http") ? p.url : `https://br.shein.com${p.url}`,
        image_url: enhanceImageUrl(p.image || null),
        current_price: p.price,
        old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
        discount_badge: p.discount_badge || null,
        rating: p.rating ? parseFloat(String(p.rating)) : null,
        category: cat,
        subcategory: sub
      };
    });

    console.log(`[SCRAPER][SHEIN][TRENDS] Sucesso: ${products.length} tendências encontradas.`);
    return products;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][SHEIN][TRENDS] Falha ao buscar tendências: ${errorMsg}`);
    return [];
  }
}

export async function fetchMagaluTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][MAGALU][TRENDS] Iniciando busca de tendências do Magalu via Oracle API...");
  try {
    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) {
      throw new Error("ORACLE_API_KEY não configurada.");
    }

    const fetchLimit = limit * 4;
    const urls = category
      ? [`https://www.magazineluiza.com.br/busca/${encodeURIComponent(category + " oferta do dia")}/`]
      : [
          "https://www.magazineluiza.com.br/selecao/ofertasdodia/"
        ];

    const promptText = getScrapingPrompt();

    for (const url of urls) {
      try {
        console.log(`[SCRAPER][MAGALU][TRENDS] Tentando URL: ${url}`);
        
        const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, token: oracleKey }),
        });

        if (!oracleRes.ok) {
          console.warn(`[SCRAPER][MAGALU][TRENDS] Oracle API retornou status ${oracleRes.status} para ${url}`);
          continue;
        }

        const oracleData = await oracleRes.json();
        
        if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
          console.warn(`[SCRAPER][MAGALU][TRENDS] Sem texto extraído de ${url}. Tentando próxima URL...`);
          continue;
        }

        const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
        if (!validateHtml(textToAnalyze, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return []; }
        if (!validateHtml(textToAnalyze, "Trends_API")) return [];

        const schemaObj = {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  url: { type: "string" },
                  image: { type: "string" },
                  price: { type: "number" },
                  old_price: { type: "number", nullable: true },
                  discount_badge: { type: "string", nullable: true },
                  rating: { type: "number", nullable: true },
                  category: { type: "string" }
                },
                required: ["title", "url", "price"]
              }
            }
          },
          required: ["products"]
        };

        const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 120000), schemaObj, 0.2, 4000);
        const fcData = JSON.parse(rawResult);

        if (!fcData.products || !fcData.products.length) {
          console.warn(`[SCRAPER][MAGALU][TRENDS] IA não encontrou produtos para ${url}. Tentando próxima URL...`);
          continue;
        }

        const validProducts = sanitizeScrapedData(fcData.products, "Trends_API");

        const products = validProducts.slice(0, limit)
          .map((p: any) => {
            const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
            return {
              product_name: p.title,
              original_url: p.url?.startsWith("http") ? p.url : `https://www.magazineluiza.com.br${p.url || ""}`,
              image_url: enhanceImageUrl(p.image || null),
              current_price: p.price,
              old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
              discount_badge: p.discount_badge || null,
              rating: p.rating ? parseFloat(String(p.rating)) : null, // rating real ou null (sem hardcode)
              category: cat,
              subcategory: sub
            };
          });

        if (products.length > 0) {
          console.log(`[SCRAPER][MAGALU][TRENDS] Sucesso: ${products.length} tendências encontradas via ${url}.`);
          return products;
        }
      } catch (urlError) {
        const msg = urlError instanceof Error ? urlError.message : String(urlError);
        console.warn(`[SCRAPER][MAGALU][TRENDS] Erro na URL ${url}: ${msg}`);
      }
    }

    console.warn("[SCRAPER][MAGALU][TRENDS] Nenhuma URL retornou produtos.");
    return [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][MAGALU][TRENDS] Falha ao buscar tendências: ${errorMsg}`);
    return [];
  }
}

/**
 * Coleta os links e detalhes dos produtos mais vendidos no Mercado Livre diretamente da página principal
>>>>,StartLine:45,TargetContent:
 * Evita fazer requisições extras para páginas individuais de produtos, contornando bloqueios de captcha.
 * Híbrido: Extrai os dados publicamente e depois injeta a tag de afiliado.
 */
export async function fetchTrendingProductsFromLanding(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Iniciando busca de tendências do Mercado Livre...");
  // Se rodando local (development), ignora a chave da Oracle para forçar o fetch direto com seu IP Residencial
  const oracleKey = process.env.NODE_ENV !== 'production' ? null : process.env.ORACLE_API_KEY;

  // === ESTRATÉGIA 1: Oracle API + IA Local (mais resiliente) ===
  if (oracleKey) {
    try {
      console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1: Oracle API + IA...");
      const fetchLimit = limit * 4;
      const defaultUrls = [
        "https://www.mercadolivre.com.br/ofertas",
        "https://www.mercadolivre.com.br/mais-vendidos",
        "https://www.mercadolivre.com.br/ofertas?domain_id=MLB-CELLPHONES",
        "https://www.mercadolivre.com.br/ofertas?domain_id=MLB-TELEVISIONS",
        "https://www.mercadolivre.com.br/ofertas?domain_id=MLB-COMPUTERS"
      ];
      const randomUrl = defaultUrls[Math.floor(Math.random() * defaultUrls.length)];
      const targetUrl = category ? `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(category)}` : randomUrl;
      const promptText = getScrapingPrompt();

      const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, token: oracleKey }),
      });

      if (oracleRes.ok) {
        const oracleData = await oracleRes.json();
        if (oracleData.success && (oracleData.data?.text || oracleData.data?.html)) {
          const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
          if (!validateHtml(textToAnalyze, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return []; }
          if (!validateHtml(textToAnalyze, "Trends_API")) return [];

          const schemaObj = {
            type: "object",
            properties: {
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    image: { type: "string" },
                    price: { type: "number" },
                    old_price: { type: "number", nullable: true },
                    discount_badge: { type: "string", nullable: true },
                    rating: { type: "number", nullable: true },
                    category: { type: "string" }
                  },
                  required: ["title", "url", "price"]
                }
              }
            },
            required: ["products"]
          };

          const rawResult = await callLLM(promptText, textToAnalyze, schemaObj, 0.2, 4000);
          const fcData = JSON.parse(rawResult);

          if (fcData.products && fcData.products.length > 0) {
            const validProducts = sanitizeScrapedData(fcData.products, "Trends_API");

            const products = validProducts.slice(0, limit)
              .map((p: any) => {
                const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
                return {
                  product_name: p.title,
                  original_url: p.url?.startsWith("http") ? p.url : `https://www.mercadolivre.com.br${p.url || ""}`,
                  image_url: enhanceImageUrl(p.image || null),
                  current_price: p.price,
                  old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
                  discount_badge: p.discount_badge || null,
                  rating: p.rating ? parseFloat(String(p.rating)) : null,
                  category: cat,
                  subcategory: sub
                };
              });

            if (products.length > 0) {
              console.log(`[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1 (IA) OK: ${products.length} produtos.`);
              return products;
            }
          }
        }
        console.warn("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1 retornou 0 produtos. Tentando fallback HTML...");
      } else {
        console.warn(`[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1 falhou com status ${oracleRes.status}. Tentando fallback HTML...`);
      }
    } catch (extractError) {
      const msg = extractError instanceof Error ? extractError.message : String(extractError);
      console.warn(`[SCRAPER][MERCADO LIVRE][TRENDS] Erro na Estratégia 1: ${msg}. Tentando fallback HTML...`);
    }
  }

  // === ESTRATÉGIA 2: Oracle API HTML + Regex Parsing (fallback) ===
  try {
    const url = "https://www.mercadolivre.com.br/mais-vendidos";
    let html = "";

    if (oracleKey) {
      console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 2: Oracle API HTML + Regex...");
      const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, token: oracleKey })
      });

      if (!oracleRes.ok) {
        throw new Error(`Falha na Oracle API HTML. Status: ${oracleRes.status}`);
      }

      const oracleData = await oracleRes.json();
      if (!oracleData.success || !oracleData.data?.html) {
        throw new Error("Oracle API não retornou HTML válido.");
      }
      html = oracleData.data.html;
      console.log(`[SCRAPER][MERCADO LIVRE][TRENDS] HTML recebido: ${html.length} bytes.`);
    } else {
      console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 2: Fetch direto (sujeito a bloqueio)...");
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        },
        next: { revalidate: 3600 }
      });

      if (!response.ok) {
        throw new Error(`Falha ao carregar a página. Status: ${response.status}`);
      }
      html = await response.text();
    }

    // Detecta bloqueio/captcha
    const isSmall = html.length < 50000;
    const hasBlockKeywords = html.includes("captcha") || html.includes("tráfego suspeito") || html.includes("verifique que você não é um robô");
    
    if (isSmall && hasBlockKeywords) {
      console.warn("[SCRAPER][MERCADO LIVRE][TRENDS] HTML parece ser captcha ou bloqueio. Abortando fallback HTML.");
      return [];
    }

    const chunks = html.split('<div class="dynamic-carousel__item-container">');
    const results: ScrapedProduct[] = [];

    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      const linkMatch = chunk.match(/href="([^"]+)"/);
      const link = linkMatch ? linkMatch[1] : null;

      let image: string | null = null;
      const dataSrcMatch = chunk.match(/data-src="([^"]+)"/);
      const srcMatch = chunk.match(/<img[^>]+src="([^"]+)"/);
      if (dataSrcMatch && dataSrcMatch[1].startsWith("http")) {
        image = dataSrcMatch[1];
      } else if (srcMatch && srcMatch[1].startsWith("http")) {
        image = srcMatch[1];
      }

      const titleMatch = chunk.match(/<h3 class="dynamic-carousel__title">([^<]+)<\/h3>/) ||
                         chunk.match(/alt="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].trim() : null;

      // Preço: captura o inteiro do span principal e os decimais do sup
      let currentPrice = 0;
      let oldPrice: number | null = null;

      // Tenta extrair preço antigo riscado
      const oldPriceMatch = chunk.match(/dynamic-carousel__oldprice[^>]*>R\$\s*(\d+(?:[.,]\d+)?)/);
      if (oldPriceMatch) {
        oldPrice = parseFloat(oldPriceMatch[1].replace(/\./g, "").replace(",", "."));
      }

      // Preço atual: inteiro + decimais
      const priceIntMatch = chunk.match(/dynamic-carousel__price[^-][^>]*><span>R\$\s*(\d+(?:\.\d+)?)/);
      const priceDecMatch = chunk.match(/dynamic-carousel__price-decimals[^>]*>(\d+)/);
      if (priceIntMatch) {
        const intPart = priceIntMatch[1].replace(/\./g, "");
        const decPart = priceDecMatch ? priceDecMatch[1] : "00";
        currentPrice = parseFloat(`${intPart}.${decPart}`);
      }

      if (title && link && currentPrice > 0) {
        results.push({
          product_name: title,
          original_url: link,
          image_url: enhanceImageUrl(image),
          current_price: currentPrice,
          old_price: oldPrice && oldPrice > currentPrice ? oldPrice : null,
          rating: null // rating não disponível via HTML parsing (sem hardcode)
        });
      }

      if (results.length >= limit) break;
    }

    console.log(`[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 2 (HTML): ${results.length} produtos.`);
    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][MERCADO LIVRE][TRENDS] Falha total: ${errorMsg}`);
    return [];
  }
}

/**
 * Raspa detalhes de um produto individual do Mercado Livre
 * Nota: Pode sofrer redirecionamento para tela de tráfego suspeito dependendo do IP/Rate Limit.
 */
async function scrapeMercadoLivreProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Iniciando raspagem via API oficial: ${productUrl}`);
  try {
    const { fetchMLProductDetails } = await import("@/lib/platforms/mercadolivre");
    
    // fetchMLProductDetails já lida com o token e fallback para App Token
    const metadata = await fetchMLProductDetails(productUrl);
    
    if (metadata && metadata.title && metadata.price && metadata.price > 0) {
      const scraped = {
        product_name: metadata.title || "Produto sem nome",
        original_url: metadata.finalUrl || productUrl,
        image_url: enhanceImageUrl(metadata.imageUrl || null),
        current_price: metadata.price || 0,
        old_price: null,
        discount_badge: null,
        rating: null,
        category: null,
        subcategory: null
      };
      console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Sucesso ao raspar produto (API): ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
      updateMetrics("Mercado Livre", "found", 1);
      return scraped;
    }

    console.warn(`[SCRAPER][MERCADO LIVRE][PRODUCT] API oficial falhou ou sem preço para ${productUrl}. Tentando Oracle API + IA...`);
    const oracleKey = process.env.ORACLE_API_KEY;
    if (oracleKey) {
      const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: productUrl, token: oracleKey }),
        signal: AbortSignal.timeout(60000)
      });
      if (oracleRes.ok) {
        const oracleData = await oracleRes.json();
        if (oracleData.success && (oracleData.data?.text || oracleData.data?.html)) {
          const textToAnalyze = buildTokenOptimizedLlmInput(oracleData, "Mercado Livre");
          const { validateHtml } = await import("@/core/scraper/validator");
          const { callLLM } = await import("@/lib/ai/groq");
          
          if (validateHtml(oracleData.data?.text || oracleData.data?.html, "Trends_API")) {
            const promptText = "Extraia o nome do produto do Mercado Livre, a URL da imagem principal do produto, o preço atual promocional (como número) e o preço antigo cortado (como número). Se não houver preço antigo, retorne null. Responda em formato JSON válido.";
            const schemaObj = {
              type: "object",
              properties: {
                title: { type: "string" },
                image: { type: "string" },
                current_price: { type: "number" },
                old_price: { type: "number", nullable: true }
              },
              required: ["title", "current_price"]
            };
            const rawResult = await callLLM(promptText, textToAnalyze, schemaObj, 0.2, 4000);
            const extract = JSON.parse(rawResult);
            if (extract && extract.title && extract.current_price > 0) {
              const scraped = {
                product_name: extract.title,
                original_url: productUrl,
                image_url: enhanceImageUrl(extract.image || null),
                current_price: extract.current_price,
                old_price: extract.old_price || null,
                rating: 4.8
              };
              console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Sucesso Oracle API: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
              updateMetrics("Mercado Livre", "found", 1);
              return scraped;
            }
          }
        }
      }
    }

    console.warn(`[SCRAPER][MERCADO LIVRE][PRODUCT] Falha total ao extrair produto: ${productUrl}`);
    updateMetrics("Mercado Livre", "failures", 1);
    return null;
  } catch (error) {
    console.error(`[SCRAPER][MERCADO LIVRE][PRODUCT] Erro:`, error);
    updateMetrics("Mercado Livre", "failures", 1);
    return null;
  }
}

async function scrapeMagaluProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  console.log(`[SCRAPER][MAGALU][PRODUCT] Iniciando raspagem de produto: ${productUrl}`);
  try {
    // Resolver redirects de links curtos de app (onelink.me)
    let finalProductUrl = productUrl;
    if (productUrl.includes("onelink.me")) {
      try {
        const redirectRes = await fetch(productUrl, { method: "GET", redirect: "follow" });
        finalProductUrl = redirectRes.url;
        // Limpa a URL de parâmetros inúteis de rastreio para o nosso afiliado
        if (finalProductUrl.includes("?")) {
           finalProductUrl = finalProductUrl.split("?")[0];
        }
        // Se a url final não for magazineluiza, fallback.
        if (!finalProductUrl.includes("magazineluiza") && !finalProductUrl.includes("magazinevoce")) {
           finalProductUrl = productUrl;
        }
      } catch (e) {
        console.warn("[SCRAPER][MAGALU][PRODUCT] Falha ao resolver shortlink do magalu:", e);
      }
    }

    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) {
      console.error("[SCRAPER][MAGALU][PRODUCT] ORACLE_API_KEY não configurada. Impossível raspar.");
      updateMetrics("Magalu", "failures", 1);
      return null;
    }

    console.log(`[SCRAPER][MAGALU][PRODUCT] Usando Oracle API para Magalu: ${productUrl}`);
    const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: finalProductUrl, token: oracleKey })
    });

    if (!oracleRes.ok) {
      throw new Error(`Falha na Oracle API. Status: ${oracleRes.status}`);
    }

    const oracleData = await oracleRes.json();
    if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
      throw new Error("Oracle API não retornou texto ou HTML válidos.");
    }

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
    if (!validateHtml(textToAnalyze, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return null; }
    const promptText = "Extraia o nome do produto, a URL principal da imagem do produto, o preço atual promocional (como número) e o preço original/antigo cortado (como número). Retorne null para o preço antigo se não houver. Responda em formato JSON válido.";
    const schemaObj = {
      type: "object",
      properties: {
        title: { type: "string" },
        image: { type: "string" },
        current_price: { type: "number" },
        old_price: { type: "number", nullable: true }
      },
      required: ["title", "current_price"]
    };

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 120000), schemaObj, 0.2, 4000);
    const extract = JSON.parse(rawResult);

    const isAkamaiBlock = extract && (extract.title || "").toLowerCase().includes("protected by");

    // Fallback se a extração estruturada falhou (título vazio ou preço zerado ou bloqueio Akamai)
    if (!extract || !extract.title || extract.current_price === 0 || isAkamaiBlock) {
      console.log("[SCRAPER][MAGALU][PRODUCT] Extração estruturada falhou ou foi bloqueada. Tentando fallbacks via HTML...");
      const html = oracleData.data?.html || "";
      if (html) {

          // 1. Título via og:title ou <title>
          const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || 
                             html.match(/<title>([^<]+)<\/title>/i);
          const fallbackTitle = titleMatch ? titleMatch[1].replace("- Magazine Luiza", "").trim() : "";

          // 2. Imagem via og:image
          const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          const fallbackImage = imageMatch ? imageMatch[1] : null;

          // 3. Preço promocional e preço original via JSON-LD ou regexes
          let fallbackPrice = 0;
          let fallbackOldPrice: number | null = null;

          const ldJsonMatches = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
          if (ldJsonMatches) {
            for (const scriptTag of ldJsonMatches) {
              try {
                const jsonContent = scriptTag.replace(/<script\s+type=["']application\/ld\+json["']>/i, "").replace(/<\/script>/i, "").trim();
                const parsed = JSON.parse(jsonContent);
                if (parsed["@type"] === "Product" || parsed.offers) {
                  const offer = Array.isArray(parsed.offers) ? parsed.offers[0] : parsed.offers;
                  if (offer && offer.price) {
                    fallbackPrice = parseFloat(offer.price);
                    break;
                  }
                }
              } catch {}
            }
          }

          if (fallbackPrice === 0) {
            const metaPrice = html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i) ||
                              html.match(/<meta\s+itemprop=["']price["']\s+content=["']([^"']+)["']/i) ||
                              html.match(/<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)["']/i);
            if (metaPrice) {
              fallbackPrice = parseFloat(metaPrice[1]);
            } else {
              // Tenta extrair de variáveis JSON no script (ex: "price": 949.05)
              const priceJsonMatch = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/i);
              if (priceJsonMatch) {
                fallbackPrice = parseFloat(priceJsonMatch[1]);
              } else {
                // Tenta extrair formato string (ex: "price": "949,05")
                const priceStringMatch = html.match(/"price"\s*:\s*"([^"]+)"/i);
                if (priceStringMatch) {
                  fallbackPrice = parseFloat(priceStringMatch[1].replace(/\./g, "").replace(",", "."));
                }
              }
            }
          }

          // Tenta extrair o old_price
          const oldPriceMatch = html.match(/"oldPrice"\s*:\s*(\d+(?:\.\d+)?)/i) || 
                                html.match(/"listPrice"\s*:\s*(\d+(?:\.\d+)?)/i);
          if (oldPriceMatch) {
            fallbackOldPrice = parseFloat(oldPriceMatch[1]);
          }

          if (fallbackTitle && fallbackPrice > 0) {
            const scraped = {
              product_name: fallbackTitle,
              original_url: finalProductUrl,
              image_url: enhanceImageUrl(fallbackImage),
              current_price: fallbackPrice,
              old_price: fallbackOldPrice,
              rating: 4.8
            };
            console.log(`[SCRAPER][MAGALU][PRODUCT] Sucesso via HTML Fallback: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
            updateMetrics("Magalu", "found", 1);
            return scraped;
          }
        }

      // Último recurso: Fetch simples direto (caso o Oracle API HTML dê timeout ou falhe)
      console.log("[SCRAPER][MAGALU][PRODUCT] Oracle API HTML falhou ou deu timeout. Tentando fetch direto simples...");
      try {
        const directRes = await fetch(finalProductUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept-Language": "pt-BR,pt;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
          },
          signal: AbortSignal.timeout(5000)
        });
        if (directRes.ok) {
          const html = await directRes.text();
          
          const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || 
                             html.match(/<title>([^<]+)<\/title>/i);
          const fallbackTitle = titleMatch ? titleMatch[1].replace("- Magazine Luiza", "").trim() : "";

          const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          const fallbackImage = imageMatch ? imageMatch[1] : null;

          let directPrice = 0;
          let directOldPrice: number | null = null;

          const metaPrice = html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+itemprop=["']price["']\s+content=["']([^"']+)["']/i) ||
                            html.match(/<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)["']/i);
          if (metaPrice) {
            directPrice = parseFloat(metaPrice[1]);
          } else {
            const priceJsonMatch = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/i);
            if (priceJsonMatch) {
              directPrice = parseFloat(priceJsonMatch[1]);
            } else {
              const priceStringMatch = html.match(/"price"\s*:\s*"([^"]+)"/i);
              if (priceStringMatch) {
                directPrice = parseFloat(priceStringMatch[1].replace(/\./g, "").replace(",", "."));
              }
            }
          }

          const oldPriceMatch = html.match(/"oldPrice"\s*:\s*(\d+(?:\.\d+)?)/i) || 
                                html.match(/"listPrice"\s*:\s*(\d+(?:\.\d+)?)/i);
          if (oldPriceMatch) {
            directOldPrice = parseFloat(oldPriceMatch[1]);
          }

          if (fallbackTitle && directPrice > 0) {
            const scraped = {
              product_name: fallbackTitle,
              original_url: finalProductUrl,
              image_url: enhanceImageUrl(fallbackImage),
              current_price: directPrice,
              old_price: directOldPrice,
              rating: 4.8
            };
            console.log(`[SCRAPER][MAGALU][PRODUCT] Sucesso via Fetch Direto Simples: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
            updateMetrics("Magalu", "found", 1);
            return scraped;
          }
        }
      } catch (e) {
        console.warn("[SCRAPER][MAGALU][PRODUCT] Falha no fetch direto de último recurso:", e);
      }
    }

    if (extract && extract.title && extract.current_price > 0) {
      const scraped = {
        product_name: extract.title,
        original_url: finalProductUrl,
        image_url: enhanceImageUrl(extract.image || null),
        current_price: extract.current_price,
        old_price: extract.old_price || null,
        rating: 4.8
      };
      console.log(`[SCRAPER][MAGALU][PRODUCT] Sucesso ao raspar produto: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
      updateMetrics("Magalu", "found", 1);
      return scraped;
    }

    console.warn(`[SCRAPER][MAGALU][PRODUCT] Falha ao extrair dados válidos do produto: ${productUrl}`);
    updateMetrics("Magalu", "failures", 1);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][MAGALU][PRODUCT] Falha ao raspar produto ${productUrl}: ${errorMsg}`);
    updateMetrics("Magalu", "failures", 1);
    return null;
  }
}

async function scrapeShopeeProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  console.log(`[SCRAPER][SHOPEE][PRODUCT] Iniciando busca oficial de produto: ${productUrl}`);
  try {
    let finalProductUrl = productUrl;
    
    // Resolve shortlinks da Shopee (shp.ee)
    if (productUrl.includes("shp.ee")) {
      try {
        const redirectRes = await fetch(productUrl, { method: "GET", redirect: "follow" });
        finalProductUrl = redirectRes.url;
        if (finalProductUrl.includes("?")) {
           finalProductUrl = finalProductUrl.split("?")[0];
        }
      } catch (e) {
        console.warn("[SCRAPER][SHOPEE][PRODUCT] Falha ao resolver shortlink da Shopee:", e);
      }
    }



    const payload = await callOracleRuntime<{ candidate: any | null }>("/api/shopee/product", {
      productUrl: finalProductUrl
    });
    const matched = payload.candidate;

    if (!matched) {
      console.log(`[Shopee Official] fora_do_escopo url=${finalProductUrl}`);
      updateMetrics("Shopee", "failures", 1);
      return null;
    }

    const scraped = mapShopeeCandidateToScrapedProduct(matched);
    scraped.original_url = finalProductUrl;

    console.log(`[SCRAPER][SHOPEE][PRODUCT] Sucesso ao raspar produto Shopee: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
    updateMetrics("Shopee", "found", 1);
    return scraped;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][SHOPEE][PRODUCT] Falha ao raspar produto Shopee ${productUrl}: ${errorMsg}`);
    updateMetrics("Shopee", "failures", 1);
    return null;
  }
}

async function scrapeSheinProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  console.log(`[SCRAPER][SHEIN][PRODUCT] Iniciando raspagem de produto com Oracle API: ${productUrl}`);
  try {
    let retries = 3;
    let delay = 1000;
    let oracleData = null;
    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) throw new Error("ORACLE_API_KEY não configurada.");

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[SCRAPER][SHEIN][PRODUCT] Tentativa ${attempt} de raspagem Shein via Oracle API...`);
        const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: productUrl, token: oracleKey }),
          signal: AbortSignal.timeout(60000)
        });

        if (!oracleRes.ok) {
          throw new Error(`HTTP Status ${oracleRes.status}`);
        }

        oracleData = await oracleRes.json();
        break;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[SCRAPER][SHEIN][PRODUCT] Tentativa ${attempt} falhou: ${msg}`);
        if (attempt === retries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    if (!oracleData || !oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
      throw new Error("Oracle API não retornou dados válidos para Shein.");
    }

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
    if (!validateHtml(textToAnalyze, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return null; }
    const promptText = "Extraia o nome do produto, a URL da imagem principal do produto e o preço promocional atual do produto (como número). Se houver preço antigo cortado, traga também. Responda em formato JSON válido.";
    const schemaObj = {
      type: "object",
      properties: {
        title: { type: "string" },
        image: { type: "string" },
        current_price: { type: "number" },
        old_price: { type: "number", nullable: true }
      },
      required: ["title", "current_price"]
    };

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 120000), schemaObj, 0.2, 4000);
    const extract = JSON.parse(rawResult);

    const scraped = {
      product_name: extract.title.trim(),
      original_url: productUrl,
      image_url: enhanceImageUrl(extract.image || null),
      current_price: extract.current_price,
      old_price: extract.old_price || null,
      rating: 4.8
    };

    console.log(`[SCRAPER][SHEIN][PRODUCT] Sucesso ao raspar produto Shein: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
    updateMetrics("Shein", "found", 1);
    return scraped;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][SHEIN][PRODUCT] Falha ao raspar produto Shein ${productUrl}: ${errorMsg}`);
    updateMetrics("Shein", "failures", 1);
    return null;
  }
}

async function scrapeAmazonProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  console.log(`[SCRAPER][AMAZON][PRODUCT] Iniciando raspagem de produto: ${productUrl}`);
  try {
    let finalProductUrl = productUrl;
    if (productUrl.includes("amzn.to")) {
      try {
        const redirectRes = await fetch(productUrl, { method: "GET", redirect: "follow" });
        finalProductUrl = redirectRes.url;
        if (finalProductUrl.includes("?")) {
           finalProductUrl = finalProductUrl.split("?")[0];
        }
      } catch (e) {
        console.warn("[SCRAPER][AMAZON][PRODUCT] Falha ao resolver shortlink da Amazon:", e);
      }
    }

    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) {
      console.error("[SCRAPER][AMAZON][PRODUCT] ORACLE_API_KEY não configurada. Impossível raspar.");
      return null;
    }

    console.log(`[SCRAPER][AMAZON][PRODUCT] Usando Oracle API para Amazon: ${productUrl}`);
    const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: finalProductUrl, token: oracleKey })
    });

    if (!oracleRes.ok) {
      throw new Error(`Falha na Oracle API. Status: ${oracleRes.status}`);
    }

    const oracleData = await oracleRes.json();
    if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
      throw new Error("Oracle API não retornou texto ou HTML válidos para Amazon.");
    }

    const rawHtmlOrText = oracleData.data?.text || oracleData.data?.html;
    if (!validateHtml(rawHtmlOrText, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return null; }
    const textToAnalyze = buildTokenOptimizedLlmInput(oracleData, "Amazon");
    const promptText = "Extraia o nome do produto, a URL da imagem principal do produto, o preço atual promocional (somente número, ex: 99.90) e o preço original/antigo cortado (somente número). Se não houver preço antigo, retorne null. Responda em formato JSON válido.";
    const schemaObj = {
      type: "object",
      properties: {
        title: { type: "string" },
        image: { type: "string" },
        current_price: { type: "number" },
        old_price: { type: "number", nullable: true }
      },
      required: ["title", "current_price"]
    };

    const rawResult = await callLLM(promptText, textToAnalyze, schemaObj, 0.2, 4000);
    const extract = JSON.parse(rawResult);
    const titleLower = (extract.title || "").toLowerCase();
    
    // Proteção contra erro 404 / Cachorros da Amazon / Indisponível
    if (
      titleLower.includes("cachorros da amazon") || 
      titleLower.includes("página não encontrada") || 
      titleLower.includes("sorry, we couldn't find that page") || 
      titleLower.includes("cão da amazon") ||
      extract.current_price === 0 || 
      !extract.title
    ) {
      console.warn(`[SCRAPER][AMAZON][PRODUCT] Ignorando página inválida da Amazon (404/Erro): ${extract.title}`);
      return null;
    }

    const scraped = {
      product_name: extract.title,
      original_url: finalProductUrl,
      image_url: enhanceImageUrl(extract.image || null),
      current_price: extract.current_price,
      old_price: extract.old_price || null,
      rating: 4.8 // Nota padrão alta
    };
    console.log(`[SCRAPER][AMAZON][PRODUCT] Sucesso ao raspar produto: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
    return scraped;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][AMAZON][PRODUCT] Falha ao raspar produto ${productUrl}: ${errorMsg}`);
    return null;
  }
}

async function scrapeNetshoesProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  console.log(`[SCRAPER][NETSHOES][PRODUCT] Iniciando raspagem de produto: ${productUrl}`);
  try {
    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) {
      console.error("[SCRAPER][NETSHOES][PRODUCT] ORACLE_API_KEY não configurada. Impossível raspar.");
      return null;
    }

    const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: productUrl, token: oracleKey })
    });

    if (!oracleRes.ok) {
      throw new Error(`Falha na Oracle API. Status: ${oracleRes.status}`);
    }

    const oracleData = await oracleRes.json();
    if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
      throw new Error("Oracle API não retornou texto ou HTML válidos para Netshoes.");
    }

    const rawHtmlOrText = oracleData.data?.text || oracleData.data?.html;
    if (!validateHtml(rawHtmlOrText, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return null; }
    const textToAnalyze = buildTokenOptimizedLlmInput(oracleData, "Netshoes");
    const promptText = "Extraia o nome do produto, a URL da imagem principal (garanta que é a URL real da imagem, frequentemente em data-src, e não um placeholder transparente ou genérico), o preço atual promocional como string (ex: 'R$ 159,99') e o preço antigo cortado como string (ex: 'R$ 199,99'). Se não houver preço antigo, retorne null. Se houver um selo de desconto, extraia-o EXATAMENTE como está no site. Responda em formato JSON válido.";
    const schemaObj = {
      type: "object",
      properties: {
        title: { type: "string" },
        image: { type: "string" },
        current_price: { type: "string" },
        old_price: { type: "string", nullable: true },
        discount_badge: { type: "string", nullable: true }
      },
      required: ["title", "current_price"]
    };

    const rawResult = await callLLM(promptText, textToAnalyze, schemaObj, 0.2, 4000);
    const extract = JSON.parse(rawResult);

    // Converte os valores extraídos de string para número
    const parsePrice = (priceStr: string | number | null | undefined): number | null => {
      if (!priceStr) return null;
      if (typeof priceStr === "number") return priceStr;
      const match = priceStr.match(/\d+(?:[.,]\d+)?/);
      if (match) {
        return parseFloat(match[0].replace(/\./g, "").replace(",", "."));
      }
      return null;
    };

    const currentPriceNum = parsePrice(extract.current_price) || 0;
    const oldPriceNum = parsePrice(extract.old_price);

    const scraped = {
      product_name: extract.title,
      original_url: productUrl,
      image_url: enhanceImageUrl(extract.image || null),
      current_price: currentPriceNum,
      old_price: oldPriceNum,
      rating: 4.8
    };
    console.log(`[SCRAPER][NETSHOES][PRODUCT] Sucesso: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
    return scraped;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][NETSHOES][PRODUCT] Falha ao raspar produto ${productUrl}: ${errorMsg}`);
    return null;
  }
}

/**
 * Raspa detalhes de um produto individual
 * Identifica a loja pelo domínio e direciona para a função correta
 */
export async function scrapeProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  if (productUrl.includes("shopee.com.br") || productUrl.includes("shp.ee")) {
    return scrapeShopeeProductDetails(productUrl);
  }
  if (productUrl.includes("shein.com") || productUrl.includes("shein.top")) {
    return scrapeSheinProductDetails(productUrl);
  }
  if (productUrl.includes("magazineluiza.com.br") || productUrl.includes("magazinevoce.com.br") || productUrl.includes("magazineluiza.onelink.me")) {
    return scrapeMagaluProductDetails(productUrl);
  }
  if (productUrl.includes("amazon.com.br") || productUrl.includes("amzn.to")) {
    return scrapeAmazonProductDetails(productUrl);
  }
  if (productUrl.includes("netshoes.com.br")) {
    return scrapeNetshoesProductDetails(productUrl);
  }
  
  // Default fallback (Mercado Livre)
  return scrapeMercadoLivreProductDetails(productUrl);
}

import * as cheerio from 'cheerio';

export async function fetchAmazonTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][AMAZON][TRENDS] Iniciando busca de tendências da Amazon (Modo Cheerio Parser)...");
  try {
    const parsePriceValue = (raw: string | null | undefined): number | null => {
      if (!raw) return null;
      const numeric = raw.replace(/\u00A0/g, " ").replace(/[^\d.,]/g, "").trim();
      if (!numeric) return null;
      if (numeric.includes(",")) {
        const [intPartRaw, decPartRaw] = numeric.split(",");
        const intPart = (intPartRaw || "").replace(/\./g, "").replace(/[^\d]/g, "");
        const decPart = (decPartRaw || "").replace(/[^\d]/g, "").slice(0, 2);
        const n = Number.parseFloat(`${intPart}.${decPart || "00"}`);
        return Number.isFinite(n) ? n : null;
      }
      const dotParts = numeric.split(".");
      if (dotParts.length === 1) {
        const n = Number.parseFloat(dotParts[0]);
        return Number.isFinite(n) ? n : null;
      }
      const dec = dotParts.pop() || "00";
      const int = dotParts.join("").replace(/[^\d]/g, "");
      const n = Number.parseFloat(`${int}.${dec.replace(/[^\d]/g, "").slice(0, 2) || "00"}`);
      return Number.isFinite(n) ? n : null;
    };

    const extractCurrentPrice = ($: cheerio.CheerioAPI, el: any): number => {
      const offscreenCurrent =
        $(el).find(".a-price:not(.a-text-price) .a-offscreen").first().text().trim() ||
        $(el).find(".a-price .a-offscreen").first().text().trim();
      const parsedOffscreen = parsePriceValue(offscreenCurrent);
      if (parsedOffscreen && parsedOffscreen > 0) return parsedOffscreen;

      const wholeText =
        $(el).find(".a-price:not(.a-text-price) .a-price-whole").first().text().trim() ||
        $(el).find(".a-price-whole").first().text().trim();
      const fractionText =
        $(el).find(".a-price:not(.a-text-price) .a-price-fraction").first().text().trim() ||
        $(el).find(".a-price-fraction").first().text().trim();

      const whole = (wholeText || "").replace(/[^\d]/g, "");
      const fraction = (fractionText || "").replace(/[^\d]/g, "").slice(0, 2);
      if (whole) {
        const n = Number.parseFloat(`${whole}.${fraction || "00"}`);
        if (Number.isFinite(n) && n > 0) return n;
      }

      const fallbackText = $(el).find('[data-a-color="price"]').first().text().trim() || $(el).text();
      const parsedFallback = parsePriceValue(fallbackText);
      if (parsedFallback && parsedFallback > 0) return parsedFallback;

      return 0;
    };

    const extractOldPrice = ($: cheerio.CheerioAPI, el: any, currentPrice: number): number | null => {
      const oldPriceText =
        $(el).find(".a-price.a-text-price .a-offscreen").first().text().trim() ||
        $(el).find(".a-text-price .a-offscreen").first().text().trim() ||
        $(el).find(".a-text-strike").first().text().trim();
      const parsed = parsePriceValue(oldPriceText);
      if (!parsed || parsed <= 0) return null;
      if (currentPrice > 0 && parsed <= currentPrice) return null;
      return parsed;
    };

    const isPlaceholderImage = (url: string): boolean => {
      const u = url.toLowerCase().trim();
      if (!u) return true;
      if (u.startsWith("data:")) return true;
      if (u.includes("sprite") || u.includes("nav-sprite")) return true;
      if (u.includes("transparent") || u.includes("blank") || u.includes("placeholder") || u.includes("pixel")) return true;
      if (u.endsWith(".gif")) return true;
      return false;
    };

    const pickFromDynamicImage = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      const normalized = raw.replace(/&quot;/g, '"').replace(/&#34;/g, '"').trim();
      try {
        const parsed = JSON.parse(normalized) as Record<string, [number, number] | number[]>;
        let bestUrl: string | null = null;
        let bestArea = -1;
        for (const [url, dims] of Object.entries(parsed || {})) {
          if (!url || isPlaceholderImage(url)) continue;
          const width = Array.isArray(dims) ? Number(dims[0]) : 0;
          const height = Array.isArray(dims) ? Number(dims[1]) : 0;
          const area = (Number.isFinite(width) ? width : 0) * (Number.isFinite(height) ? height : 0);
          if (area > bestArea) {
            bestArea = area;
            bestUrl = url;
          }
        }
        return bestUrl;
      } catch {
        return null;
      }
    };

    const pickFromSrcset = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      const parts = raw
        .split(",")
        .map(p => p.trim())
        .filter(Boolean);
      let bestUrl: string | null = null;
      let bestScore = -1;
      for (const part of parts) {
        const [url, descriptor] = part.split(/\s+/);
        if (!url || isPlaceholderImage(url)) continue;
        let score = 0;
        if (descriptor) {
          const m = descriptor.match(/^(\d+(?:\.\d+)?)(w|x)$/i);
          if (m) {
            const value = Number.parseFloat(m[1]);
            score = Number.isFinite(value) ? value : 0;
            if (m[2].toLowerCase() === "x") score *= 1000;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestUrl = url;
        }
      }
      return bestUrl;
    };

    const extractImage = ($: cheerio.CheerioAPI, el: any): string | null => {
      const imgEl = $(el).find("img").first();
      const dynamicRaw = imgEl.attr("data-a-dynamic-image") || $(el).find("img").attr("data-a-dynamic-image");
      const dynamicPicked = pickFromDynamicImage(dynamicRaw);
      if (dynamicPicked) return dynamicPicked;

      const srcsetRaw =
        imgEl.attr("srcset") ||
        imgEl.attr("data-srcset") ||
        $(el).find("img.s-image").attr("srcset") ||
        $(el).find("img.a-dynamic-image").attr("srcset");
      const srcsetPicked = pickFromSrcset(srcsetRaw);
      if (srcsetPicked) return srcsetPicked;

      const dataSrc =
        imgEl.attr("data-src") ||
        imgEl.attr("data-lazy-src") ||
        $(el).find("img.s-image").attr("data-src") ||
        $(el).find("img.a-dynamic-image").attr("data-src");
      if (dataSrc && !isPlaceholderImage(dataSrc)) return dataSrc;

      const src =
        imgEl.attr("src") ||
        $(el).find("img.s-image").attr("src") ||
        $(el).find("img.a-dynamic-image").attr("src") ||
        $(el).find("img").attr("src");
      if (src && !isPlaceholderImage(src)) return src;

      return null;
    };

    const urls = category
      ? [`https://www.amazon.com.br/s?k=${encodeURIComponent(category + " oferta")}`]
      : [
          "https://www.amazon.com.br/deals",
          "https://www.amazon.com.br/gp/movers-and-shakers/electronics",
          "https://www.amazon.com.br/gp/bestsellers/electronics"
        ];

    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) throw new Error("ORACLE_API_KEY não configurada.");

    for (const url of urls) {
      console.log(`[SCRAPER][AMAZON][TRENDS] Tentando URL: ${url}`);
      try {
        const oracleRes = await fetch(`${getOracleApiBaseUrl()}/api/scrape`, {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, token: oracleKey }),
          signal: AbortSignal.timeout(65000)
        });

        if (!oracleRes.ok) {
          console.warn(`[SCRAPER][AMAZON][TRENDS] Oracle API retornou status ${oracleRes.status} para ${url}`);
          continue;
        }

        const oracleData = await oracleRes.json();
        if (!oracleData.success || (!oracleData.data?.html)) {
          console.warn(`[SCRAPER][AMAZON][TRENDS] Sem HTML extraído de ${url}.`);
          continue;
        }

        const html = oracleData.data.html;
        const results: ScrapedProduct[] = [];
        const seenAsins = new Set<string>();
        
        // Parse HTML com Cheerio
        const $ = cheerio.load(html);
        const items = $('div[data-asin]');

        items.each((i, el) => {
          if (results.length >= limit) return false; // Break loop
          
          const asin = $(el).attr('data-asin');
          const normalizedAsin = String(asin || '').trim().toUpperCase();
          if (!/^[A-Z0-9]{10}$/.test(normalizedAsin) || seenAsins.has(normalizedAsin)) return;
          
          // Title
          let title = $(el).find('h2 span').text().trim() || 
                      $(el).find('.a-size-base-plus').text().trim() ||
                      $(el).find('.a-size-medium').text().trim() ||
                      $(el).find('.p13n-sc-truncate').text().trim() ||
                      $(el).find('img').attr('alt');
                      
          const currentPrice = extractCurrentPrice($, el);
          const oldPrice = extractOldPrice($, el, currentPrice);
          
          const image = extractImage($, el);
          
          // Link
          const rawLink = $(el).find('h2 a').attr('href') || $(el).find('a.a-link-normal').attr('href') || '';
          if (/sponsored-ads\.amazon|aax-us-east-retail|\/s\/al-na/i.test(rawLink)) return;
          const link = `https://www.amazon.com.br/dp/${normalizedAsin}`;

          if (title && link && currentPrice > 0) {
             seenAsins.add(normalizedAsin);
             const { category: cat, subcategory: sub } = normalizeCategory(category || title);
             results.push({
               product_name: title,
               original_url: link,
               image_url: enhanceImageUrl(image || null),
               current_price: currentPrice,
               old_price: oldPrice,
               discount_badge: null,
               rating: null,
               category: cat,
               subcategory: sub
             });
          }
        });

        if (results.length > 0) {
          console.log(`[SCRAPER][AMAZON][TRENDS] Sucesso (Cheerio Mode): ${results.length} tendências encontradas via ${url}.`);
          return results;
        }

      } catch (e) {
        console.warn(`[SCRAPER][AMAZON][TRENDS] Falha na url ${url}: ${e}`);
      }
    }

    console.warn("[SCRAPER][AMAZON][TRENDS] Nenhuma URL retornou produtos via Cheerio.");
    return [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][AMAZON][TRENDS] Falha global no extrator Amazon: ${errorMsg}`);
    return [];
  }
}

export async function fetchNetshoesTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][NETSHOES][TRENDS] Iniciando busca de tendências da Netshoes...");
  try {
    try {
      const payload = await callOracleRuntime<{ products: any[] }>("/api/netshoes/trends", {
        category: category || "oferta",
        limit: Math.max(limit * 4, limit)
      });
      const officialProducts = payload.products;
      if (officialProducts?.length) {
        const products = officialProducts.slice(0, limit).map((candidate: any) => {
          const { category: cat, subcategory: sub } = normalizeCategory(candidate.category || candidate.product_name || "");
          return {
            product_name: candidate.product_name,
            original_url: candidate.original_url,
            image_url: enhanceImageUrl(candidate.image_url || null),
            current_price: candidate.current_price,
            old_price: candidate.old_price || null,
            rating: null,
            category: cat,
            subcategory: sub
          };
        });
        console.log(`[SCRAPER][NETSHOES][TRENDS] Sucesso oficial Rakuten: ${products.length} tendências encontradas.`);
        return products;
      }
    } catch (officialError) {
      const msg = officialError instanceof Error ? officialError.message : String(officialError);
      console.warn(`[SCRAPER][NETSHOES][TRENDS] Rakuten indisponível. Seguindo fallback atual. Motivo: ${msg}`);
    }

    const fetchLimit = limit * 4;
    const urls = category
      ? [`https://www.netshoes.com.br/busca?q=${encodeURIComponent(category + " oferta")}`]
      : ["https://www.netshoes.com.br/busca?q=oferta", "https://www.netshoes.com.br/lst/promocoes", "https://www.netshoes.com.br/especial/outlet"];

    const promptText = getScrapingPrompt();

    for (const url of urls) {
      let retries = 3;
      let delay = 1500;
      let fcData = null;

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`[SCRAPER][NETSHOES][TRENDS] Tentando URL (Tentativa ${attempt}): ${url}`);
          const oracleKey = process.env.ORACLE_API_KEY;
          if (!oracleKey) throw new Error("ORACLE_API_KEY não configurada.");

          const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, token: oracleKey }),
            signal: AbortSignal.timeout(60000)
          });

          if (!oracleRes.ok) {
            if (oracleRes.status === 408 || oracleRes.status >= 500 || oracleRes.status === 429 || oracleRes.status === 403) throw new Error(`HTTP Status ${oracleRes.status}`);
            break;
          }

          const oracleData = await oracleRes.json();
          if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
             throw new Error("Sem texto extraído da Netshoes");
          }

          const rawHtmlOrText = oracleData.data?.text || oracleData.data?.html;
          if (!validateHtml(rawHtmlOrText, "Trends_API")) { console.warn("[SCRAPER] HTML Inválido/Captcha detectado"); return []; }
          const textToAnalyze = buildTokenOptimizedLlmInput(oracleData, "Netshoes");

          const schemaObj = {
            type: "object",
            properties: {
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    image: { type: "string" },
                    price: { type: "number" },
                    old_price: { type: "number", nullable: true },
                    discount_badge: { type: "string", nullable: true },
                    category: { type: "string" }
                  },
                  required: ["title", "url", "price"]
                }
              }
            },
            required: ["products"]
          };

          const rawResult = await callLLM(promptText, textToAnalyze, schemaObj, 0.2, 4000);
          fcData = { success: true, data: { extract: JSON.parse(rawResult) } };

          console.log(`[SCRAPER][NETSHOES][TRENDS] Oracle API + IA success=${fcData.success}, products=${fcData?.data?.extract?.products?.length ?? 0}`);
          break;
        } catch (error) {
          if (attempt === retries) break;
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }

      if (!fcData || !fcData.success || !fcData.data?.extract?.products?.length) continue;

      const validProducts = sanitizeScrapedData(fcData.data?.extract?.products || [], "Trends_API");

      const products = validProducts.slice(0, limit).map((p: any) => {
        const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
        return {
          product_name: p.title,
          original_url: p.url?.startsWith("http") ? p.url : `https://www.netshoes.com.br${p.url || ""}`,
          image_url: enhanceImageUrl(p.image || null),
          current_price: p.price,
          old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
          discount_badge: p.discount_badge || null,
          rating: p.rating ? parseFloat(String(p.rating)) : null,
          category: cat,
          subcategory: sub
        };
      });

      if (products.length > 0) return products;
    }
    return [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][NETSHOES][TRENDS] Falha ao buscar tendências: ${errorMsg}`);
    return [];
  }
}

import { fetchMarketplaceCoupons, ScrapedCoupon } from "./coupon-scraper";
import { validateHtml, getScrapingPrompt, sanitizeScrapedData } from "@/core/scraper/validator";
import {
  buildOfferContentHash,
  canonicalizeOfferUrl,
  normalizeProductTitle,
  validateOfferForPersistence,
  type StrongOfferValidationResult
} from "@/core/scraper/product-validator";

async function findDuplicateOffer(
  supabase: any,
  userId: string,
  validation: StrongOfferValidationResult
): Promise<any | null> {
  const { data } = await supabase
    .from("offers")
    .select("id, current_price, old_price, score, status, platform, product_name, original_url")
    .eq("user_id", userId)
    .eq("platform", validation.platform)
    .limit(1000);

  return (data || []).find((offer: any) => {
    const canonicalUrl = canonicalizeOfferUrl(offer.original_url);
    const normalizedTitle = normalizeProductTitle(offer.product_name || "");
    const price = Number(offer.current_price || 0);
    const contentHash = canonicalUrl
      ? buildOfferContentHash({
          platform: offer.platform,
          normalizedTitle,
          price,
          canonicalUrl
        })
      : null;

    return (
      canonicalUrl === validation.canonicalUrl ||
      contentHash === validation.contentHash ||
      (normalizedTitle === validation.normalizedTitle && price === Number(validation.price))
    );
  }) || null;
}

/**
 * Roda o fluxo completo de descoberta de Cupons para as fontes selecionadas
 * e os salva como ofertas rascunho no Supabase.
 */
export async function discoverAndIngestCoupons(
  limit = 5,
  sources: string[] = ["Mercado Livre"],
  targetUserId?: string
): Promise<Offer[]> {
  console.log(`[SCRAPER][COUPONS] Iniciando descobrimento e ingestão para fontes: ${sources.join(", ")}`);
  let supabase;
  let userId = targetUserId || null;
  const getDefaultCouponImageUrl = (sourceName: string): string | null => {
    const normalized = sourceName.toLowerCase().trim();
    if (normalized === "mercado livre") return "https://www.mercadolivre.com.br/favicon.ico";
    if (normalized === "magalu") return "https://www.magazineluiza.com.br/favicon.ico";
    if (normalized === "shopee") return "https://shopee.com.br/favicon.ico";
    if (normalized === "shein") return "https://br.shein.com/favicon.ico";
    if (normalized === "amazon") return "https://www.amazon.com.br/favicon.ico";
    return null;
  };

  if (targetUserId) {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    supabase = createSupabaseAdminClient();
  } else {
    supabase = await createServerSupabaseClient();
    if (supabase) {
      userId = await getCurrentUserId();
    }
  }

  if (!supabase || !userId) {
    throw new Error("Supabase ou usuário não autenticado.");
  }

  const ingestedCoupons: Offer[] = [];

  for (const source of sources) {
    const scrapedCoupons = await fetchMarketplaceCoupons(source, limit);

    for (const coupon of scrapedCoupons) {
      let finalUrl = coupon.link;
      if (source === "Mercado Livre") {
        finalUrl = generateMLAffiliateLink(coupon.link, userId);
      } else if (source === "Magalu") {
        const magaluId = process.env.MAGALU_PARTNER_ID || "";
        if (magaluId) {
          try {
            const urlObj = new URL(coupon.link);
            urlObj.hostname = "www.magazinevoce.com.br";
            urlObj.pathname = `/${magaluId}${urlObj.pathname}`;
            finalUrl = urlObj.toString();
          } catch (e) {}
        }
      } else if (source === "Amazon") {
        const amazonTag = process.env.AMAZON_PARTNER_TAG || "";
        if (amazonTag) {
          try {
            const urlObj = new URL(coupon.link);
            urlObj.searchParams.set("tag", amazonTag);
            finalUrl = urlObj.toString();
          } catch (e) {}
        }
      }

      const imageUrl =
        coupon.image_url && coupon.image_url.startsWith("http")
          ? coupon.image_url
          : getDefaultCouponImageUrl(source);

      const { data: existingOffer } = await supabase
        .from("offers")
        .select("id")
        .eq("coupon", coupon.code)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingOffer) {
        console.log(`[SCRAPER][${source}][COUPONS] Cupom ${coupon.code} já existe.`);
        continue;
      }

      let platformValue = source;
      let notesValue = `Importado automaticamente via Robô de Cupons (${source}). Regras: ${coupon.rules}`;

      const { data: newOffer, error: insertError } = await supabase
        .from("offers")
        .insert({
          user_id: userId,
          platform: platformValue === "Shein" ? "Outro" : platformValue,
          product_name: `[CUPOM] ${coupon.discount}`,
          original_url: finalUrl,
          image_url: imageUrl,
          current_price: 0,
          old_price: null,
          rating: null,
          coupon: coupon.code,
          category: "Cupons",
          subcategory: null,
          score: 10,
          legacy_score: 10,
          new_score: 10,
          explainability: {},
          status: "draft",
          notes: platformValue === "Shein" ? `Plataforma original: Shein. ${notesValue}` : notesValue
        })
        .select("*")
        .maybeSingle();

      if (!insertError && newOffer) {
        ingestedCoupons.push(newOffer as Offer);
        updateMetrics(source, "found", 1);
      } else if (insertError) {
        console.error(`[SCRAPER][${source}][COUPONS] Erro ao cadastrar cupom ${coupon.code}: ${insertError.message}`);
        updateMetrics(source, "failures", 1);
      }
    }
  }

  return ingestedCoupons;
}

/**
 * Roda o fluxo completo de descoberta de tendências para as fontes selecionadas, raspa os detalhes de até N produtos,
 * e os salva como ofertas rascunho no Supabase.
 */
export async function discoverAndIngestTrendingOffers(
  limit = 5,
  sources: string[] = ["Mercado Livre"],
  targetUserId?: string,
  categorySearchQuery?: string
): Promise<Offer[]> {
  console.log(`[SCRAPER][TRENDS] Iniciando descobrimento e ingestão para fontes: ${sources.join(", ")}`);
  let supabase;
  let userId = targetUserId || null;

  try {
    if (targetUserId) {
      const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
      supabase = createSupabaseAdminClient();
    } else {
      supabase = await createServerSupabaseClient();
      if (supabase) {
        userId = await getCurrentUserId();
      }
    }
  } catch (err) {
    // Fallback para Admin Client se não houver contexto de request (Inngest Cron / Testes CLI)
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    supabase = createSupabaseAdminClient();
    userId = "7a9ca7b7-f464-46e0-a9de-9b322c73628a"; // UUID real do Admin (André)
  }

  if (!supabase) {
    throw new Error("Supabase não configurado.");
  }
  if (!userId) {
     userId = "7a9ca7b7-f464-46e0-a9de-9b322c73628a"; // Fallback de segurança para persistência (André)
  }

  // Lista VIP do Modelo Pechinchou (Alta Conversão por Impulso)
  const HIGH_CONVERSION_CATEGORIES = [
    "Eletrodomésticos",
    "Eletroportáteis",
    "Telefonia",
    "Televisão",
    "Eletrônicos",
    "Moda, Beleza e Perfumaria",
    "Utilidades Domésticas"
  ];

  // Over-fetching: Multiplicamos por 3 para garantir margem de sobra para o filtro de curadoria
  const overFetchLimit = limit * 3;
  console.log(`[SCRAPER][TRENDS] Over-fetching ativado: Solicitado ${limit}, Buscando até ${overFetchLimit} brutos.`);

  const ingestedOffers: Offer[] = [];

  for (const source of sources) {
    let scrapedProducts: ScrapedProduct[] = [];
    
    // ── Modo Viral Target: substitui a roleta aleatória de categorias genéricas ───────────────
    // Usa getNextViralTarget() que rotaciona queries curadas por viralScore (Pelando/Promobit model)
    let activeCategorySearch = categorySearchQuery;
    if (!activeCategorySearch || activeCategorySearch === "Geral") {
      if (source === "Netshoes") {
        // Netshoes tem targets específicos no discovery-config (tênis, suplementos, etc.)
        const target = getNextViralTarget("Netshoes");
        activeCategorySearch = target.query;
        console.log(`[VIRAL_TARGET] Netshoes → query="${target.query}" viralScore=${target.viralScore}`);
      } else {
        const target = getNextViralTarget(source);
        activeCategorySearch = target.query;
        // category do target é usada como hint mas normalizeCategory() decide o valor final
        console.log(`[VIRAL_TARGET] ${source} → query="${target.query}" category="${target.category}" viralScore=${target.viralScore}`);
      }
    } else {
      console.log(`[SCRAPER][TRENDS] Categoria explícita recebida: "${activeCategorySearch}" (override do viral target)`);
    }

    if (source === "Mercado Livre") {
      scrapedProducts = await fetchTrendingProductsFromLanding(overFetchLimit, activeCategorySearch);
    } else if (source === "Shopee") {
      scrapedProducts = await fetchShopeeTrendingProducts(overFetchLimit, activeCategorySearch);
    } else if (source === "Shein") {
      scrapedProducts = await fetchSheinTrendingProducts(overFetchLimit, activeCategorySearch);
    } else if (source === "Magalu") {
      scrapedProducts = await fetchMagaluTrendingProducts(overFetchLimit, activeCategorySearch);
    } else if (source === "Amazon") {
      scrapedProducts = await fetchAmazonTrendingProducts(overFetchLimit, activeCategorySearch);
    } else if (source === "Netshoes") {
      scrapedProducts = await fetchNetshoesTrendingProducts(overFetchLimit, activeCategorySearch);
    }

    for (const product of scrapedProducts) {
      // Processamento de URL de Afiliado para as respectivas plataformas ANTES da busca de duplicados
      let finalUrl = product.original_url;
      if (source === "Mercado Livre") {
        finalUrl = generateMLAffiliateLink(product.original_url, userId);
      } else if (source === "Magalu") {
        const magaluId = process.env.MAGALU_PARTNER_ID || "";
        if (magaluId) {
          try {
            const urlObj = new URL(product.original_url);
            urlObj.hostname = "www.magazinevoce.com.br";
            urlObj.pathname = `/${magaluId}${urlObj.pathname}`;
            finalUrl = urlObj.toString();
          } catch (e) {}
        }
      } else if (source === "Amazon") {
        const amazonTag = process.env.AMAZON_PARTNER_TAG || "";
        if (amazonTag) {
          try {
            const urlObj = new URL(product.original_url);
            urlObj.searchParams.set("tag", amazonTag);
            finalUrl = urlObj.toString();
          } catch (e) {}
        }
      } else if (source === "Netshoes") {
        const rakutenId = process.env.RAKUTEN_AFFILIATE_ID || "";
        const rakutenMid = process.env.RAKUTEN_NETSHOES_MID || "43984";
        if (rakutenId) {
          finalUrl = `https://click.linksynergy.com/deeplink?id=${rakutenId}&mid=${rakutenMid}&murl=${encodeURIComponent(product.original_url)}`;
        }
      }

      let platformValue = source;
      let notesValue = `Importado automaticamente via Robô de Tendências (${source}).`;

      const offerValidation = validateOfferForPersistence({
        product_name: product.product_name,
        platform: platformValue,
        original_url: finalUrl,
        image_url: product.image_url,
        current_price: product.current_price,
      });

      if (!offerValidation.valid) {
        console.warn(`[SCRAPER][${source.toUpperCase()}][TRENDS] Oferta rejeitada antes da gravação: ${offerValidation.rejectReason}`);
        updateMetrics(source, "discarded", 1);
        continue;
      }

      const canonicalOriginalUrl = offerValidation.canonicalUrl as string;

      // Verificar duplicidade por URL canônica, content_hash e título+marketplace+preço.
      const existingOffer = await findDuplicateOffer(supabase, userId, offerValidation);

      // Aplica o Motor Frio para ter o Rating + Shadow Mode
      const curation = curateOfferScore({
        current_price: product.current_price,
        old_price: product.old_price,
        rating: product.rating,
        category: product.category || "Geral",
        product_name: product.product_name  // passa product_name para brand_score real
      });

      if (existingOffer) {
        // Lógica inteligente de duplicidade: se mudou preço, desconto ou score, atualiza e marca como draft
        const priceChanged = Number(existingOffer.current_price) !== product.current_price;
        const oldPriceChanged = Number(existingOffer.old_price) !== (product.old_price || null);
        const scoreChanged = Number(existingOffer.score) !== curation.score;

        if (priceChanged || oldPriceChanged || scoreChanged) {
          console.log(`[SCRAPER][${source.toUpperCase()}][TRENDS] Atualizando oferta existente ${existingOffer.id} devido a mudança nos dados.`);
          const updateNotes = `Atualizado via Robô de Tendências (${source}). Preço anterior: R$ ${existingOffer.current_price} -> Novo: R$ ${product.current_price}.`;

          const { data: updatedOffer, error: updateError } = await supabase
            .from("offers")
            .update({
              product_name: product.product_name,
              original_url: canonicalOriginalUrl,
              image_url: product.image_url,
              current_price: product.current_price,
              old_price: product.old_price,
              rating: product.rating,
              category: product.category || "Geral",
              subcategory: product.subcategory || null,
              score: curation.score,
              official_policy: curation.official_policy,
              historical_policy: curation.historical_policy,
              explainability: curation.explainability,
              status: "draft", // reseta para draft se mudou preço/dados
              notes: updateNotes,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingOffer.id)
            .select("*")
            .maybeSingle();

          if (!updateError && updatedOffer) {
            ingestedOffers.push(updatedOffer as Offer);
            updateMetrics(source, "found", 1);
          } else if (updateError) {
            console.error(`[SCRAPER][${source.toUpperCase()}][TRENDS] Erro ao atualizar oferta ${existingOffer.id}: ${updateError.message}`);
            updateMetrics(source, "failures", 1);
          }
        } else {
          // Apenas atualiza a data de detecção nas tendências sem alterar dados ou status
          console.log(`[SCRAPER][${source.toUpperCase()}][TRENDS] Oferta existente ${existingOffer.id} sem alterações. Ignorando re-ingestão.`);
          updateMetrics(source, "discarded", 1);
          await supabase
            .from("offers")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", existingOffer.id);
        }
        continue; // Segue para o próximo produto
      }

      if (source === "Shein") {
        // Tenta salvar como Shein no banco. Se a constraint rejeitar, o erro será capturado e inserido como "Outro".

        const { data: newOffer, error: insertError } = await supabase
          .from("offers")
          .insert({
            user_id: userId,
            platform: "Shein",
            product_name: product.product_name,
            original_url: canonicalOriginalUrl,
            image_url: product.image_url,
            current_price: product.current_price,
            old_price: product.old_price,
            rating: product.rating,
            category: product.category || "Geral",
            subcategory: product.subcategory || null,
            score: curation.score,
            official_policy: curation.official_policy,
            historical_policy: curation.historical_policy,
            explainability: curation.explainability,
            status: "draft",
            notes: notesValue
          })
          .select("*")
          .maybeSingle();

        if (!insertError && newOffer) {
          ingestedOffers.push(newOffer as Offer);
          updateMetrics(source, "found", 1);
          continue;
        } else {
          console.error(`[SCRAPER][${source.toUpperCase()}][TRENDS] Erro ao salvar oferta Shein: ${insertError?.message || "retorno vazio"}`);
          updateMetrics(source, "failures", 1);
          continue;
        }
      }

      // Salvar no banco como draft

      const { data: newOffer, error: insertError } = await supabase
        .from("offers")
        .insert({
          user_id: userId,
          platform: platformValue,
          product_name: product.product_name,
          original_url: canonicalOriginalUrl,
          image_url: product.image_url,
          current_price: product.current_price,
          old_price: product.old_price,
          rating: product.rating,
          category: product.category || "Geral",
          subcategory: product.subcategory || null,
          score: curation.score,
          official_policy: curation.official_policy,
          historical_policy: curation.historical_policy,
          explainability: curation.explainability,
          status: "draft",
          notes: notesValue
        })
        .select("*")
        .maybeSingle();

      if (insertError) {
        console.error(`[SCRAPER][${source.toUpperCase()}][TRENDS] Erro ao salvar oferta no banco: ${insertError.message}`);
        updateMetrics(source, "failures", 1);
        continue;
      }

      if (newOffer) {
        ingestedOffers.push(newOffer as Offer);
        updateMetrics(source, "found", 1);
      }
    }
  }

  // Registra as estatísticas agregadas na tabela integration_logs para observabilidade avançada
  try {
    await supabase.from("integration_logs").insert({
      user_id: userId,
      integration: "Robô de Tendências",
      action: "Ingestão Completa",
      status: "success",
      message: `Descoberta e ingestão executadas para fontes: ${sources.join(", ")}. Ingeridas/atualizadas: ${ingestedOffers.length} ofertas.`,
      metadata: {
        sources,
        metrics: scraperMetrics,
        ingested_count: ingestedOffers.length
      }
    });
  } catch (metricsError) {
    console.error("[SCRAPER][TRENDS] Falha ao registrar log de integração:", metricsError);
  }

  console.log(`[SCRAPER][TRENDS] Descobrimento concluído. Ofertas ingeridas/atualizadas nesta rodada: ${ingestedOffers.length}`);
  return ingestedOffers;
}
