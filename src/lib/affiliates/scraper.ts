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

export async function fetchShopeeTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][SHOPEE][TRENDS] Iniciando busca de tendências da Shopee via Oracle API...");
  try {
    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) {
      throw new Error("ORACLE_API_KEY não configurada.");
    }

    const fetchLimit = limit * 4;
    const targetUrl = category ? `https://shopee.com.br/search?keyword=${encodeURIComponent(category + " oferta relâmpago")}` : "https://shopee.com.br/m/ofertas-do-dia";
    const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns ${fetchLimit} itens) que sejam CLARAMENTE uma promoção. Isso inclui obrigatoriamente uma destas opções: 1) Produtos com preço antigo riscado; 2) Produtos com selos percentuais explícitos (ex: '-20% OFF'); 3) Produtos com tags oficiais de loja como 'Oferta do Dia', 'Oferta Relâmpago', 'Oferta em Destaque', 'Venda Flash' ou 'Super Oferta'. Ignore produtos com preço cheio ou sem indicativo claro de promoção. Não pule nenhum produto que atenda aos critérios! Se houver avaliação/nota do produto (ex: 4.5 estrelas), inclua no campo rating como número decimal. Para cada produto retorne o titulo, url, image, price, old_price (se houver), discount_badge (se houver selo ou texto promocional), rating (se houver) e categoria.`;

    const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, token: oracleKey }),
    });

    if (!oracleRes.ok) throw new Error(`Falha na Oracle API Shopee Trends: ${oracleRes.status}`);
    const oracleData = await oracleRes.json();
    if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) throw new Error("Sem texto extraído da Shopee pela Oracle API");

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;

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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
    const fcData = JSON.parse(rawResult);

    if (!fcData.products) throw new Error("Sem produtos extraídos da Shopee pela IA");

    const validProducts = fcData.products
      .filter((p: any) => p.title && p.price > 0 && ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0)));

    const products = validProducts.slice(0, limit).map((p: any) => {
      const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
      return {
        product_name: p.title,
        original_url: p.url.startsWith("http") ? p.url : `https://shopee.com.br${p.url}`,
        image_url: enhanceImageUrl(p.image || null),
        current_price: p.price,
        old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
        discount_badge: p.discount_badge || null,
        rating: p.rating ? parseFloat(String(p.rating)) : null, // rating real ou null (sem hardcode)
        category: cat,
        subcategory: sub
      };
    });

    console.log(`[SCRAPER][SHOPEE][TRENDS] Sucesso: ${products.length} tendências encontradas.`);
    return products;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][SHOPEE][TRENDS] Falha ao buscar tendências: ${errorMsg}`);
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
    // Corrigido: era /campaigns/best_sellers (best sellers ≠ promoções).
    // Agora usa /promotion/flash-sale: página de vendas relâmpago com preço antigo riscado real.
    const targetUrl = category ? `https://br.shein.com/pdsearch/${encodeURIComponent(category + " venda flash")}/` : "https://br.shein.com/promotion/flash-sale";
    const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns ${fetchLimit} itens) que sejam CLARAMENTE uma promoção. Isso inclui obrigatoriamente uma destas opções: 1) Produtos com preço antigo riscado; 2) Produtos com selos percentuais explícitos (ex: '-20% OFF'); 3) Produtos com tags oficiais de loja como 'Oferta do Dia', 'Oferta Relâmpago', 'Oferta em Destaque', 'Venda Flash' ou 'Super Oferta'. Ignore produtos com preço cheio ou sem indicativo claro de promoção. Não pule nenhum produto que atenda aos critérios! Se houver avaliação/nota do produto (ex: 4.5 estrelas), inclua no campo rating como número decimal. Para cada produto retorne o titulo, url, image, price, old_price (se houver), discount_badge (se houver selo ou texto promocional), rating (se houver) e categoria.`;

    const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl, token: oracleKey }),
    });

    if (!oracleRes.ok) throw new Error(`Falha na Oracle API Shein Trends: ${oracleRes.status}`);
    const oracleData = await oracleRes.json();
    if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) throw new Error("Sem texto extraído da Shein pela Oracle API");

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;

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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
    const fcData = JSON.parse(rawResult);

    if (!fcData.products) throw new Error("Sem produtos extraídos da Shein pela IA");

    const validProducts = fcData.products
      .filter((p: any) => p.title && p.price > 0 && ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0)));

    const products = validProducts.slice(0, limit).map((p: any) => {
      const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
      return {
        product_name: p.title,
        original_url: p.url.startsWith("http") ? p.url : `https://br.shein.com${p.url}`,
        image_url: enhanceImageUrl(p.image || null),
        current_price: p.price,
        old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
        discount_badge: p.discount_badge || null,
        rating: p.rating ? parseFloat(String(p.rating)) : null, // rating real ou null (sem hardcode)
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

    const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns ${fetchLimit} itens) que sejam CLARAMENTE uma promoção. Isso inclui obrigatoriamente uma destas opções: 1) Produtos com preço antigo riscado; 2) Produtos com selos percentuais explícitos (ex: '-20% OFF'); 3) Produtos com tags oficiais de loja como 'Oferta do Dia', 'Oferta Relâmpago', 'Oferta em Destaque', 'Venda Flash' ou 'Super Oferta'. Ignore produtos com preço cheio ou sem indicativo claro de promoção. Não pule nenhum produto que atenda aos critérios! Se houver avaliação/nota do produto (ex: 4.5 estrelas), inclua no campo rating como número decimal. Para cada produto retorne o titulo, url (começando com https://), image, price, old_price (se houver), discount_badge (se houver selo ou texto promocional), rating (se houver) e categoria.`;

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

        const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
        const fcData = JSON.parse(rawResult);

        if (!fcData.products || !fcData.products.length) {
          console.warn(`[SCRAPER][MAGALU][TRENDS] IA não encontrou produtos para ${url}. Tentando próxima URL...`);
          continue;
        }

        const validProducts = fcData.products
          .filter((p: any) => p.title && p.price > 0 && !(p.title || "").toLowerCase().includes("protected by") && ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0)));

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
  const oracleKey = process.env.ORACLE_API_KEY;

  // === ESTRATÉGIA 1: Oracle API + IA Local (mais resiliente) ===
  if (oracleKey) {
    try {
      console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1: Oracle API + IA...");
      const fetchLimit = limit * 4;
      const targetUrl = category ? `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(category)}` : "https://www.mercadolivre.com.br/ofertas";
      const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns ${fetchLimit} itens) que sejam CLARAMENTE uma promoção. Isso inclui obrigatoriamente uma destas opções: 1) Produtos com preço antigo riscado; 2) Produtos com selos percentuais explícitos (ex: '-20% OFF'); 3) Produtos com tags oficiais de loja como 'Oferta do Dia', 'Oferta Relâmpago', 'Oferta em Destaque', 'Venda Flash' ou 'Super Oferta'. Ignore produtos com preço cheio ou sem indicativo claro de promoção. Não pule nenhum produto que atenda aos critérios! Para cada produto retorne o titulo, url (começando com https://), image, price, old_price (se houver), discount_badge (se houver selo ou texto promocional) e categoria.`;

      const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, token: oracleKey }),
      });

      if (oracleRes.ok) {
        const oracleData = await oracleRes.json();
        if (oracleData.success && (oracleData.data?.text || oracleData.data?.html)) {
          const textToAnalyze = oracleData.data?.text || oracleData.data?.html;

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

          const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
          const fcData = JSON.parse(rawResult);

          if (fcData.products && fcData.products.length > 0) {
            const validProducts = fcData.products
              .filter((p: any) => p.title && p.price > 0 && !p.image?.includes("unsplash.com") && !p.image?.includes("example.com") && !p.image?.includes("mock") && ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0)));

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
    
    if (!metadata) {
      console.warn(`[SCRAPER][MERCADO LIVRE][PRODUCT] Falha ao extrair dados via API oficial: ${productUrl}`);
      updateMetrics("Mercado Livre", "failures", 1);
      return null;
    }

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

    if (scraped.product_name && scraped.image_url) {
      console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Sucesso ao raspar produto: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
      updateMetrics("Mercado Livre", "found", 1);
      return scraped;
    }

    console.warn(`[SCRAPER][MERCADO LIVRE][PRODUCT] Falha ao extrair produto: ${productUrl} (Faltando nome ou imagem)`);
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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
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
  console.log(`[SCRAPER][SHOPEE][PRODUCT] Iniciando raspagem de produto com Firecrawl: ${productUrl}`);
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



    let retries = 3;
    let delay = 1000;
    let oracleData = null;
    const oracleKey = process.env.ORACLE_API_KEY;
    if (!oracleKey) throw new Error("ORACLE_API_KEY não configurada.");

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[SCRAPER][SHOPEE][PRODUCT] Tentativa ${attempt} de raspagem Shopee via Oracle API...`);
        const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: finalProductUrl, token: oracleKey }),
          signal: AbortSignal.timeout(60000)
        });

        if (!oracleRes.ok) {
          throw new Error(`HTTP Status ${oracleRes.status}`);
        }
        
        oracleData = await oracleRes.json();
        break; // Sucesso
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[SCRAPER][SHOPEE][PRODUCT] Tentativa ${attempt} falhou: ${msg}`);
        if (attempt === retries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    if (!oracleData || !oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
      throw new Error("Oracle API não retornou dados válidos para Shopee.");
    }

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
    const promptText = "Extraia o nome do produto Shopee, a URL da imagem principal do produto, o preço promocional atual do produto (como número) e o preço antigo cortado (como número). Se não houver preço antigo, retorne null. Responda em formato JSON válido.";
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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
    const extract = JSON.parse(rawResult);
    const scraped = {
      product_name: extract.title.trim(),
      original_url: finalProductUrl,
      image_url: enhanceImageUrl(extract.image || null),
      current_price: extract.current_price,
      old_price: extract.old_price && extract.old_price > extract.current_price ? extract.old_price : null,
      rating: 4.8
    };

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
        break; // Sucesso
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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
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

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
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

    const textToAnalyze = oracleData.data?.text || oracleData.data?.html;
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

    const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
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

export async function fetchAmazonTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][AMAZON][TRENDS] Iniciando busca de tendências da Amazon...");
  try {


    const fetchLimit = limit * 4;
    // URLs de descoberta Amazon: Deals (principal) + Movers & Shakers + Best Sellers
    // NOTA: Amazon tem anti-bot agressivo. Falhas são esperadas; o sistema tem fallback interno.
    const urls = category
      ? [`https://www.amazon.com.br/s?k=${encodeURIComponent(category + " oferta")}`]
      : [
          "https://www.amazon.com.br/deals",
          "https://www.amazon.com.br/gp/movers-and-shakers/electronics", // Trending: crescimento rápido
          "https://www.amazon.com.br/gp/bestsellers/electronics"          // Best Sellers Eletrônicos
        ];

    const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns ${fetchLimit} itens) que sejam CLARAMENTE uma promoção. 
Critérios rígidos:
1. O produto DEVE ter um preço antigo riscado ou um selo percentual de desconto.
2. Para a IMAGEM (image), extraia a URL de alta resolução (frequentemente no atributo data-src, src ou srcset). NUNCA extraia placeholders.
3. Para o SELO (discount_badge), extraia EXATAMENTE o que está escrito no site (ex: '30% OFF'). NUNCA invente.
4. Se houver avaliação/nota do produto (ex: 4.5 estrelas), inclua no campo rating como número decimal.
Retorne para cada produto: title, url, image, price (número), old_price (número, se houver), discount_badge, rating (se houver) e category.`;

    for (const url of urls) {
      let retries = 3;
      let delay = 1500;
      let fcData = null;

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`[SCRAPER][AMAZON][TRENDS] Tentando URL (Tentativa ${attempt}): ${url}`);
          const oracleKey = process.env.ORACLE_API_KEY;
          if (!oracleKey) throw new Error("ORACLE_API_KEY não configurada.");

          const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, token: oracleKey }),
            signal: AbortSignal.timeout(65000)
          });
        
          if (!oracleRes.ok) {
            console.warn(`[SCRAPER][AMAZON][TRENDS] Oracle API retornou status ${oracleRes.status} para ${url}`);
            if (oracleRes.status === 408 || oracleRes.status === 401 || oracleRes.status === 403 || oracleRes.status === 500 || oracleRes.status === 429) {
              throw new Error(`HTTP Status ${oracleRes.status}`);
            }
            break; // Se não for um erro de antibot/timeout/limite, interrompe os retries para esta URL
          }

          const oracleData = await oracleRes.json();
          if (!oracleData.success || (!oracleData.data?.text && !oracleData.data?.html)) {
             throw new Error("Sem texto extraído da Amazon");
          }

          const textToAnalyze = oracleData.data?.text || oracleData.data?.html;

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

          const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
          fcData = { success: true, data: { extract: JSON.parse(rawResult) } };
          
          console.log(`[SCRAPER][AMAZON][TRENDS] Oracle API + IA success=${fcData.success}, products=${fcData?.data?.extract?.products?.length ?? 0}`);
          break;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(`[SCRAPER][AMAZON][TRENDS] Tentativa ${attempt} falhou: ${msg}`);
          if (attempt === retries) break;
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        }
      }

      if (!fcData || !fcData.success || !fcData.data?.extract?.products?.length) {
        console.warn(`[SCRAPER][AMAZON][TRENDS] Sem produtos extraídos de ${url}. Tentando próxima URL...`);
        continue;
      }

        const validProducts = fcData.data.extract.products
          .filter((p: any) => {
            const titleLower = (p.title || "").toLowerCase();
            return p.title && p.price > 0 &&
              !titleLower.includes("cachorros da amazon") &&
              !titleLower.includes("página não encontrada") &&
              !titleLower.includes("sorry") &&
              ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0));
          });

        const products = validProducts.slice(0, limit)
          .map((p: any) => {
            const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
            return {
              product_name: p.title,
              original_url: p.url?.startsWith("http") ? p.url : `https://www.amazon.com.br${p.url || ""}`,
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
          console.log(`[SCRAPER][AMAZON][TRENDS] Sucesso: ${products.length} tendências encontradas via ${url}.`);
          return products;
        }
    }

    console.warn("[SCRAPER][AMAZON][TRENDS] Nenhuma URL retornou produtos.");
    return [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][AMAZON][TRENDS] Falha ao buscar tendências: ${errorMsg}`);
    return [];
  }
}

export async function fetchNetshoesTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][NETSHOES][TRENDS] Iniciando busca de tendências da Netshoes...");
  try {


    const fetchLimit = limit * 4;
    const urls = category
      ? [`https://www.netshoes.com.br/busca?q=${encodeURIComponent(category + " oferta")}`]
      : ["https://www.netshoes.com.br/busca?q=oferta", "https://www.netshoes.com.br/lst/promocoes", "https://www.netshoes.com.br/especial/outlet"];

    const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns ${fetchLimit} itens) que sejam CLARAMENTE uma promoção. 
Critérios rígidos:
1. O produto DEVE ter um preço antigo riscado ou um selo percentual de desconto.
2. Para a IMAGEM (image), extraia a URL de alta resolução (frequentemente no atributo data-src, src ou srcset). NUNCA extraia placeholders (imagens vazias, base64 ou de carregamento).
3. Para o SELO (discount_badge), extraia EXATAMENTE o que está escrito no site (ex: '30% OFF'). NUNCA invente palavras ou traduções.
4. Se houver avaliação/nota do produto (ex: 4.5 estrelas), inclua no campo rating como número decimal.
Retorne para cada produto: title, url, image, price (número), old_price (número, se houver), discount_badge, rating (se houver) e category.`;

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

          const textToAnalyze = oracleData.data?.text || oracleData.data?.html;

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

          const rawResult = await callLLM(promptText, textToAnalyze.slice(0, 15000), schemaObj, 0.2, 4000);
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

      const validProducts = fcData.data.extract.products
        .filter((p: any) => p.title && p.price > 0 && ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0)));

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
          image_url: null,
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

      // Verificar se este produto já foi cadastrado antes (usando o finalUrl)
      const { data: existingOffer } = await supabase
        .from("offers")
        .select("id, current_price, old_price, score, status")
        .eq("original_url", finalUrl)
        .eq("user_id", userId)
        .maybeSingle();

      let platformValue = source;
      let notesValue = `Importado automaticamente via Robô de Tendências (${source}).`;

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
              image_url: product.image_url,
              current_price: product.current_price,
              old_price: product.old_price,
              rating: product.rating,
              category: product.category || "Geral",
              subcategory: product.subcategory || null,
              score: curation.score,
              legacy_score: curation.legacy_score,
              new_score: curation.new_score,
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
            original_url: finalUrl,
            image_url: product.image_url,
            current_price: product.current_price,
            old_price: product.old_price,
            rating: product.rating,
            category: product.category || "Geral",
            subcategory: product.subcategory || null,
            score: curation.score,
            legacy_score: curation.legacy_score,
            new_score: curation.new_score,
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
          platformValue = "Outro";
          notesValue = `Plataforma original: Shein. ${notesValue}`;
        }
      }

      // Salvar no banco como draft

      const { data: newOffer, error: insertError } = await supabase
        .from("offers")
        .insert({
          user_id: userId,
          platform: platformValue,
          product_name: product.product_name,
          original_url: finalUrl,
          image_url: product.image_url,
          current_price: product.current_price,
          old_price: product.old_price,
          rating: product.rating,
          category: product.category || "Geral",
          subcategory: product.subcategory || null,
          score: curation.score,
          legacy_score: curation.legacy_score,
          new_score: curation.new_score,
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
