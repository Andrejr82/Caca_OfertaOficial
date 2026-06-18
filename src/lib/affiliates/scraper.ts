import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Offer } from "@/types/domain";
import { mlClient } from "@/lib/integrations/mercadolivre/client";
import { curateOfferScore } from "@/lib/offers/curation-engine";
import { normalizeCategory, MAIN_CATEGORY_NAMES } from "@/lib/offers/category-taxonomy";

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

  // Mercado Livre: Força JPEG e imagem de alta resolução (-O)
  if (enhanced.includes("mlstatic.com")) {
    enhanced = enhanced.replace(/\.webp$/i, ".jpg");
    enhanced = enhanced.replace(/-[a-zA-Z]\.jpg$/i, "-O.jpg");
  }

  // Magalu: Remove as dimensões fixas baixas da URL para pegar a original
  if (enhanced.includes("mlcdn.com.br")) {
    enhanced = enhanced.replace(/\/\d+x\d+\//, "/orig/");
  }

  return enhanced;
}

export async function fetchShopeeTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][SHOPEE][TRENDS] Iniciando busca de tendências da Shopee via Firecrawl...");
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      throw new Error("FIRECRAWL_API_KEY não configurada.");
    }

    const targetUrl = category ? `https://shopee.com.br/search?keyword=${encodeURIComponent(category)}` : "https://shopee.com.br/m/ofertas-do-dia";
    const promptText = category 
      ? `Extraia os top ${limit} produtos dos resultados de busca para "${category}". Para cada produto, traga o título, url original do produto shopee.com.br, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}).`
      : `Extraia os top ${limit} produtos em destaque da página. Para cada produto, traga o título, url original do produto shopee.com.br, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}).`;

    const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        url: targetUrl, 
        formats: ["extract"],
        extract: {
          prompt: promptText,
          schema: {
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
                    category: { type: "string" }
                  },
                  required: ["title", "url", "price"]
                }
              }
            },
            required: ["products"]
          }
        }
      })
    });

    if (!fcResponse.ok) throw new Error(`Falha no Firecrawl Shopee Trends: ${fcResponse.status}`);
    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data?.extract?.products) throw new Error("Sem produtos extraídos da Shopee");

    const products = fcData.data.extract.products.slice(0, limit).map((p: any) => {
      const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
      return {
        product_name: p.title,
        original_url: p.url.startsWith("http") ? p.url : `https://shopee.com.br${p.url}`,
        image_url: enhanceImageUrl(p.image || null),
        current_price: p.price,
        old_price: null,
        rating: 4.8,
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
  console.log("[SCRAPER][SHEIN][TRENDS] Iniciando busca de tendências da Shein via Firecrawl...");
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      throw new Error("FIRECRAWL_API_KEY não configurada.");
    }

    const targetUrl = category ? `https://br.shein.com/pdsearch/${encodeURIComponent(category)}/` : "https://br.shein.com/campaigns/best_sellers";
    const promptText = category
      ? `Extraia os top ${limit} produtos dos resultados de busca para "${category}". Para cada produto, precisamos do título, url original do produto shein, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}).`
      : `Extraia os top ${limit} produtos mais vendidos. Para cada produto, precisamos do título, url original do produto shein, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}).`;

    const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        url: targetUrl, 
        formats: ["extract"],
        extract: {
          prompt: promptText,
          schema: {
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
                    category: { type: "string" }
                  },
                  required: ["title", "url", "price"]
                }
              }
            },
            required: ["products"]
          }
        }
      })
    });

    if (!fcResponse.ok) throw new Error(`Falha no Firecrawl Shein Trends: ${fcResponse.status}`);
    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data?.extract?.products) throw new Error("Sem produtos extraídos da Shein");

    const products = fcData.data.extract.products.slice(0, limit).map((p: any) => {
      const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
      return {
        product_name: p.title,
        original_url: p.url.startsWith("http") ? p.url : `https://br.shein.com${p.url}`,
        image_url: enhanceImageUrl(p.image || null),
        current_price: p.price,
        old_price: null,
        rating: 4.8,
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
  console.log("[SCRAPER][MAGALU][TRENDS] Iniciando busca de tendências do Magalu via Firecrawl...");
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      throw new Error("FIRECRAWL_API_KEY não configurada.");
    }

    const urls = category
      ? [`https://www.magazineluiza.com.br/busca/${encodeURIComponent(category)}/`]
      : [
          "https://www.magazineluiza.com.br/selecao/ofertasdodia/",
          "https://www.magazineluiza.com.br/selecao/mais-vendidos/",
          "https://www.magazineluiza.com.br/busca/mais+vendidos/"
        ];

    const promptText = category
      ? `Extraia os top ${limit} produtos dos resultados de busca para "${category}". Para cada produto, traga o título, url original do produto magazineluiza.com.br, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). Se houver preço antigo riscado, traga também.`
      : `Extraia os top ${limit} produtos em destaque nesta página do Magazine Luiza. Para cada produto, traga o título completo, a URL completa do produto (começando com https://www.magazineluiza.com.br/), a URL da imagem do produto e o preço promocional atual como número (ex: 1299.00). Se houver preço antigo riscado, traga também. e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}).`;

    for (const url of urls) {
      try {
        console.log(`[SCRAPER][MAGALU][TRENDS] Tentando URL: ${url}`);
        const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ 
            url,
            formats: ["extract"],
            waitFor: 5000,
            extract: {
              prompt: promptText,
              schema: {
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
                        category: { type: "string" }
                      },
                      required: ["title", "url", "price"]
                    }
                  }
                },
                required: ["products"]
              }
            }
          })
        });

        if (!fcResponse.ok) {
          console.warn(`[SCRAPER][MAGALU][TRENDS] Firecrawl retornou status ${fcResponse.status} para ${url}`);
          continue;
        }

        const fcData = await fcResponse.json();
        console.log(`[SCRAPER][MAGALU][TRENDS] Firecrawl success=${fcData.success}, products=${fcData.data?.extract?.products?.length ?? 0}`);

        if (!fcData.success || !fcData.data?.extract?.products?.length) {
          console.warn(`[SCRAPER][MAGALU][TRENDS] Sem produtos extraídos de ${url}. Tentando próxima URL...`);
          continue;
        }

        const products = fcData.data.extract.products
          .filter((p: any) => p.title && p.price > 0 && !(p.title || "").toLowerCase().includes("protected by"))
          .slice(0, limit)
          .map((p: any) => {
            const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
            return {
              product_name: p.title,
              original_url: p.url?.startsWith("http") ? p.url : `https://www.magazineluiza.com.br${p.url || ""}`,
              image_url: enhanceImageUrl(p.image || null),
              current_price: p.price,
              old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
              rating: 4.8,
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
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  // === ESTRATÉGIA 1: Firecrawl Extract (IA) — mais resiliente ===
  if (firecrawlKey) {
    try {
      console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1: Firecrawl Extract (IA)...");
      const targetUrl = category ? `https://lista.mercadolivre.com.br/${encodeURIComponent(category.replace(/ /g, "-"))}` : "https://www.mercadolivre.com.br/mais-vendidos";
      const promptText = category
        ? `Extraia os top ${limit} produtos dos resultados de busca para "${category}". Para cada produto, traga o título, url original do produto lista.mercadolivre.com.br, imagem, o preço promocional (somente número) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). Se tiver preço antigo riscado, traga também. IMPORTANTE: Se não houver produtos, retorne products como vazio. Não invente ou crie produtos falsos (como bebidas ou imagens de example/unsplash).`
        : `Extraia os top ${limit} produtos mais vendidos desta página. Para cada produto, traga o título completo do produto, a URL completa do produto (href do link, começando com https://www.mercadolivre.com.br/), a URL da imagem principal do produto e o preço atual como número (ex: 329.90). Se tiver preço antigo riscado, traga também. e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). IMPORTANTE: Se não houver produtos, retorne products como vazio. Não invente ou crie produtos falsos (como bebidas ou imagens de example/unsplash).`;

      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["extract"],
          waitFor: 5000,
          mobile: true,
          proxy: "stealth",
          blockAds: true,
          extract: {
            prompt: promptText,
            schema: {
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
                      category: { type: "string" }
                    },
                    required: ["title", "url", "price"]
                  }
                }
              },
              required: ["products"]
            }
          }
        })
      });

      if (fcResponse.ok) {
        const fcData = await fcResponse.json();
        if (fcData.success && fcData.data?.extract?.products?.length > 0) {
          const products = fcData.data.extract.products
            .filter((p: any) => p.title && p.price > 0 && !p.image?.includes("unsplash.com") && !p.image?.includes("example.com") && !p.image?.includes("mock"))
            .slice(0, limit)
            .map((p: any) => {
              const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
              return {
                product_name: p.title,
                original_url: p.url?.startsWith("http") ? p.url : `https://www.mercadolivre.com.br${p.url || ""}`,
                image_url: enhanceImageUrl(p.image || null),
                current_price: p.price,
                old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
                rating: 4.8,
                category: cat,
                subcategory: sub
              };
            });

          if (products.length > 0) {
            console.log(`[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1 (Extract) OK: ${products.length} produtos.`);
            return products;
          }
        }
        console.warn("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1 retornou 0 produtos. Tentando fallback HTML...");
      } else {
        console.warn(`[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 1 falhou com status ${fcResponse.status}. Tentando fallback HTML...`);
      }
    } catch (extractError) {
      const msg = extractError instanceof Error ? extractError.message : String(extractError);
      console.warn(`[SCRAPER][MERCADO LIVRE][TRENDS] Erro na Estratégia 1: ${msg}. Tentando fallback HTML...`);
    }
  }

  // === ESTRATÉGIA 2: Firecrawl HTML + Regex Parsing (fallback) ===
  try {
    const url = "https://www.mercadolivre.com.br/mais-vendidos";
    let html = "";

    if (firecrawlKey) {
      console.log("[SCRAPER][MERCADO LIVRE][TRENDS] Estratégia 2: Firecrawl HTML + Regex...");
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url, formats: ["html"], waitFor: 5000, mobile: true, proxy: "stealth", blockAds: true })
      });

      if (!fcResponse.ok) {
        throw new Error(`Falha no Firecrawl HTML. Status: ${fcResponse.status}`);
      }

      const fcData = await fcResponse.json();
      if (!fcData.success || !fcData.data?.html) {
        throw new Error("Firecrawl não retornou HTML válido.");
      }
      html = fcData.data.html;
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
    if (html.length < 5000 || html.includes("captcha") || html.includes("robot") || html.includes("tráfego suspeito")) {
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
          rating: 4.8
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
  console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Iniciando raspagem de produto: ${productUrl}`);
  try {
    let html = "";
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;

    if (firecrawlKey) {
      console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Usando Firecrawl para produto ML: ${productUrl}`);
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: productUrl, formats: ["html"], waitFor: 3000, mobile: true, proxy: "stealth", blockAds: true })
      });

      if (!fcResponse.ok) {
        throw new Error(`Falha no Firecrawl. Status: ${fcResponse.status}`);
      }

      const fcData = await fcResponse.json();
      if (!fcData.success || !fcData.data || !fcData.data.html) {
        throw new Error("Firecrawl não retornou HTML válido.");
      }
      html = fcData.data.html;
    } else {
      console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Usando fetch direto para produto ML: ${productUrl}`);
      const response = await fetch(productUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
      });

      if (!response.ok) {
        throw new Error(`Falha ao obter o produto. Status: ${response.status}`);
      }
      html = await response.text();
    }

    // 1. Extração do título (OpenGraph)
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
    let title = titleMatch ? titleMatch[1] : "";
    if (!title) {
      const tagTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
      title = tagTitleMatch ? tagTitleMatch[1].replace("- Mercado Livre", "").trim() : "Produto sem nome";
    }

    // 2. Extração da Imagem (OpenGraph)
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const image = imageMatch ? imageMatch[1] : null;

    // Valores padrão
    let currentPrice = 0;
    let oldPrice: number | null = null;
    let rating: number | null = null;

    // 3. Extração via JSON-LD
    const ldJsonMatches = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
    if (ldJsonMatches) {
      for (const scriptTag of ldJsonMatches) {
        try {
          const jsonContent = scriptTag.replace(/<script\s+type=["']application\/ld\+json["']>/i, "").replace(/<\/script>/i, "").trim();
          const parsed = JSON.parse(jsonContent);
          
          if (parsed["@type"] === "Product" || parsed["@context"]?.includes("schema.org")) {
            if (parsed.name && !title) title = parsed.name;
            if (parsed.offers) {
              const offer = Array.isArray(parsed.offers) ? parsed.offers[0] : parsed.offers;
              if (offer.price) {
                currentPrice = parseFloat(offer.price);
              } else if (offer.lowPrice) {
                currentPrice = parseFloat(offer.lowPrice);
              }
            }
            if (parsed.aggregateRating && parsed.aggregateRating.ratingValue) {
              rating = parseFloat(parsed.aggregateRating.ratingValue);
            }
            break;
          }
        } catch {
          // Ignora JSONs malformados
        }
      }
    }

    // 4. Fallback de preço
    if (currentPrice === 0) {
      const metaPriceMatch = html.match(/<meta\s+property=["']product:preconfigured_price:amount["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+itemprop=["']price["']\s+content=["']([^"']+)["']/i);
      if (metaPriceMatch) {
        currentPrice = parseFloat(metaPriceMatch[1]);
      } else {
        const priceRegex = /"price":\s*(\d+(?:\.\d+)?)/i;
        const priceMatch = html.match(priceRegex);
        if (priceMatch) {
          currentPrice = parseFloat(priceMatch[1]);
        }
      }
    }

    // 5. Extração de Preço Antigo
    const oldPriceMatch = html.match(/<span\s+class=["']ui-pdp-price__original-value["'][\s\S]*?<span\s+class=["']andes-money-amount__fraction["']>([^<]+)<\/span>/i) ||
                        html.match(/<del[^>]*>[\s\S]*?<span\s+class=["']andes-money-amount__fraction["']>([^<]+)<\/span>/i);
    if (oldPriceMatch) {
      const valStr = oldPriceMatch[1].replace(/\./g, "").replace(",", ".");
      oldPrice = parseFloat(valStr);
    }

    if (currentPrice > 0) {
      const scraped = {
        product_name: title.trim(),
        original_url: productUrl,
        image_url: enhanceImageUrl(image),
        current_price: currentPrice,
        old_price: oldPrice && oldPrice > currentPrice ? oldPrice : null,
        rating: rating
      };
      console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Sucesso ao raspar produto: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
      updateMetrics("Mercado Livre", "found", 1);
      return scraped;
    }

    // Se falhou ao extrair o preço (pode ser captcha do ML)
    const isSuspectedCaptcha = html.length < 10000 || html.includes("captcha") || html.includes("robot") || html.includes("tráfego suspeito");
    if (isSuspectedCaptcha) {
      updateMetrics("Mercado Livre", "captchas", 1);
      console.warn(`[SCRAPER][MERCADO LIVRE][PRODUCT] Captcha ou bloqueio detectado no HTML. Iniciando retry com Firecrawl Extract...`);
      
      if (firecrawlKey) {
        try {
          const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
              url: productUrl, 
              formats: ["extract"],
              waitFor: 4000,
              mobile: true,
              proxy: "stealth",
              blockAds: true,
              extract: {
                prompt: "Extraia o nome do produto, a URL da imagem principal do produto, o preço promocional atual do produto (como número) e o preço antigo cortado (como número). Se não houver preço antigo, retorne null.",
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    image: { type: "string" },
                    current_price: { type: "number" },
                    old_price: { type: "number", nullable: true }
                  },
                  required: ["title", "current_price"]
                }
              }
            })
          });

          if (fcResponse.ok) {
            const fcData: any = await fcResponse.json();
            if (fcData.success && fcData.data?.extract) {
              const ext = fcData.data.extract;
              if (ext.current_price > 0 && ext.title) {
                const scraped = {
                  product_name: ext.title.trim(),
                  original_url: productUrl,
                  image_url: enhanceImageUrl(ext.image || null),
                  current_price: ext.current_price,
                  old_price: ext.old_price && ext.old_price > ext.current_price ? ext.old_price : null,
                  rating: 4.8
                };
                console.log(`[SCRAPER][MERCADO LIVRE][PRODUCT] Sucesso via Firecrawl Extract Retry: ${scraped.product_name} - Preço: R$ ${scraped.current_price}`);
                updateMetrics("Mercado Livre", "found", 1);
                return scraped;
              }
            }
          }
        } catch (retryError) {
          console.error("[SCRAPER][MERCADO LIVRE][PRODUCT] Erro no retry do Firecrawl Extract:", retryError);
        }
      }
    }

    console.warn(`[SCRAPER][MERCADO LIVRE][PRODUCT] Falha ao extrair preço do produto: ${productUrl}`);
    updateMetrics("Mercado Livre", "failures", 1);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPER][MERCADO LIVRE][PRODUCT] Falha ao raspar produto ${productUrl}: ${errorMsg}`);
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

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.error("[SCRAPER][MAGALU][PRODUCT] FIRECRAWL_API_KEY não configurada. Impossível raspar.");
      updateMetrics("Magalu", "failures", 1);
      return null;
    }

    console.log(`[SCRAPER][MAGALU][PRODUCT] Usando Firecrawl Extract para Magalu: ${productUrl}`);
    const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        url: finalProductUrl, 
        formats: ["extract"],
        extract: {
          prompt: "Extraia o nome do produto, a URL principal da imagem do produto, o preço atual promocional (como número) e o preço original/antigo cortado (como número). Retorne null para o preço antigo se não houver.",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              image: { type: "string" },
              current_price: { type: "number" },
              old_price: { type: "number", nullable: true }
            },
            required: ["title", "current_price"]
          }
        }
      })
    });

    if (!fcResponse.ok) {
      throw new Error(`Falha no Firecrawl. Status: ${fcResponse.status}`);
    }

    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data || !fcData.data.extract) {
      throw new Error("Firecrawl não retornou dados de extração válidos.");
    }

    const extract = fcData.data.extract;
    const isAkamaiBlock = extract && (extract.title || "").toLowerCase().includes("protected by");

    // Fallback se a extração estruturada falhou (título vazio ou preço zerado ou bloqueio Akamai)
    if (!extract || !extract.title || extract.current_price === 0 || isAkamaiBlock) {
      console.log("[SCRAPER][MAGALU][PRODUCT] Extração estruturada falhou ou foi bloqueada. Tentando fallbacks via HTML...");
      const fcHtmlResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: finalProductUrl, formats: ["html"] })
      });

      if (fcHtmlResponse.ok) {
        const fcHtmlData: any = await fcHtmlResponse.json();
        if (fcHtmlData.success && fcHtmlData.data?.html) {
          const html = fcHtmlData.data.html;

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
      }

      // Último recurso: Fetch simples direto (caso o Firecrawl HTML dê timeout ou falhe)
      console.log("[SCRAPER][MAGALU][PRODUCT] Firecrawl HTML falhou ou deu timeout. Tentando fetch direto simples...");
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

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.error("[SCRAPER][SHOPEE][PRODUCT] FIRECRAWL_API_KEY não configurada. Impossível raspar.");
      updateMetrics("Shopee", "failures", 1);
      return null;
    }

    let retries = 3;
    let delay = 1000;
    let fcResponse = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[SCRAPER][SHOPEE][PRODUCT] Tentativa ${attempt} de raspagem Shopee...`);
        fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ 
            url: finalProductUrl, 
            formats: ["extract"],
            extract: {
              prompt: "Extraia o nome do produto Shopee, a URL da imagem principal do produto, o preço promocional atual do produto (como número) e o preço antigo cortado (como número). Se não houver preço antigo, retorne null.",
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  image: { type: "string" },
                  current_price: { type: "number" },
                  old_price: { type: "number", nullable: true }
                },
                required: ["title", "current_price"]
              }
            }
          }),
          signal: AbortSignal.timeout(20000)
        });

        if (fcResponse.status === 429) {
          throw new Error("HTTP 429 Too Many Requests");
        }
        
        if (fcResponse.ok) {
          break; // Sucesso
        }
        
        throw new Error(`HTTP Status ${fcResponse.status}`);
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

    if (!fcResponse || !fcResponse.ok) {
      throw new Error("Falha ao obter resposta do Firecrawl após retries");
    }

    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data || !fcData.data.extract) {
      throw new Error("Firecrawl não retornou dados de extração válidos para Shopee.");
    }

    const extract = fcData.data.extract;
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
  console.log(`[SCRAPER][SHEIN][PRODUCT] Iniciando raspagem de produto com Firecrawl: ${productUrl}`);
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.error("[SCRAPER][SHEIN][PRODUCT] FIRECRAWL_API_KEY não configurada. Impossível raspar.");
      updateMetrics("Shein", "failures", 1);
      return null;
    }

    let retries = 3;
    let delay = 1000;
    let fcResponse = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[SCRAPER][SHEIN][PRODUCT] Tentativa ${attempt} de raspagem Shein...`);
        fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ 
            url: productUrl, 
            formats: ["extract"],
            extract: {
              prompt: "Extraia o nome do produto, a URL da imagem principal do produto e o preço promocional atual do produto (como número). Se houver preço antigo cortado, traga também.",
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  image: { type: "string" },
                  current_price: { type: "number" },
                  old_price: { type: "number", nullable: true }
                },
                required: ["title", "current_price"]
              }
            }
          })
        });

        if (fcResponse.status === 429) {
          throw new Error("HTTP 429 Too Many Requests");
        }
        
        if (fcResponse.ok) {
          break; // Sucesso
        }
        
        throw new Error(`HTTP Status ${fcResponse.status}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[SCRAPER][SHEIN][PRODUCT] Tentativa ${attempt} falhou: ${msg}`);
        if (attempt === retries) {
          throw error;
        }
        // Backoff exponencial
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    if (!fcResponse || !fcResponse.ok) {
      throw new Error("Falha ao obter resposta do Firecrawl após retries");
    }

    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data || !fcData.data.extract) {
      throw new Error("Firecrawl não retornou dados de extração válidos.");
    }

    const extract = fcData.data.extract;
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

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.error("[SCRAPER][AMAZON][PRODUCT] FIRECRAWL_API_KEY não configurada. Impossível raspar.");
      return null;
    }

    console.log(`[SCRAPER][AMAZON][PRODUCT] Usando Firecrawl Extract para Amazon: ${productUrl}`);
    const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        url: finalProductUrl, 
        formats: ["extract"],
        extract: {
          prompt: "Extraia o nome do produto, a URL da imagem principal do produto, o preço atual promocional (somente número, ex: 99.90) e o preço original/antigo cortado (somente número). Se não houver preço antigo, retorne null.",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              image: { type: "string" },
              current_price: { type: "number" },
              old_price: { type: "number", nullable: true }
            },
            required: ["title", "current_price"]
          }
        }
      })
    });

    if (!fcResponse.ok) {
      throw new Error(`Falha no Firecrawl. Status: ${fcResponse.status}`);
    }

    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data || !fcData.data.extract) {
      throw new Error("Firecrawl não retornou dados de extração válidos.");
    }

    const extract = fcData.data.extract;
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
  
  // Default fallback (Mercado Livre)
  return scrapeMercadoLivreProductDetails(productUrl);
}

export async function fetchAmazonTrendingProducts(limit = 5, category?: string): Promise<ScrapedProduct[]> {
  console.log("[SCRAPER][AMAZON][TRENDS] Iniciando busca de tendências da Amazon...");
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.warn("[SCRAPER][AMAZON][TRENDS] FIRECRAWL_API_KEY não configurada.");
      return [];
    }

    const urls = category
      ? [`https://www.amazon.com.br/s?k=${encodeURIComponent(category)}`]
      : [
          "https://www.amazon.com.br/gp/bestsellers/",
          "https://www.amazon.com.br/gp/movers-and-shakers/",
          "https://www.amazon.com.br/deals"
        ];

    const promptText = category
      ? `Extraia os top ${limit} produtos dos resultados de busca para "${category}". Para cada produto, traga o título completo, a URL completa do produto na Amazon (começando com https://www.amazon.com.br/), a URL da imagem do produto, o preço atual como número (ex: 299.00) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). Se houver preço antigo riscado, traga também. Ignore produtos sem preço.`
      : `Extraia os top ${limit} produtos em destaque nesta página da Amazon Brasil. Para cada produto, traga o título completo, a URL completa do produto na Amazon (começando com https://www.amazon.com.br/), a URL da imagem do produto, o preço atual como número (ex: 299.00) e a categoria do produto (exemplos: ${MAIN_CATEGORY_NAMES.slice(0,8).join(", ")}). Se houver preço antigo riscado, traga também. Ignore produtos sem preço.`;

    for (const url of urls) {
      try {
        console.log(`[SCRAPER][AMAZON][TRENDS] Tentando URL: ${url}`);
        const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ 
            url,
            formats: ["extract"],
            waitFor: 5000,
            extract: {
              prompt: promptText,
              schema: {
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
                        category: { type: "string" }
                      },
                      required: ["title", "url", "price"]
                    }
                  }
                },
                required: ["products"]
              }
            }
          })
        });
      
        if (!fcResponse.ok) {
          console.warn(`[SCRAPER][AMAZON][TRENDS] Firecrawl retornou status ${fcResponse.status} para ${url}`);
          continue;
        }

        const fcData = await fcResponse.json();
        console.log(`[SCRAPER][AMAZON][TRENDS] Firecrawl success=${fcData.success}, products=${fcData.data?.extract?.products?.length ?? 0}`);

        if (!fcData.success || !fcData.data?.extract?.products?.length) {
          console.warn(`[SCRAPER][AMAZON][TRENDS] Sem produtos extraídos de ${url}. Tentando próxima URL...`);
          continue;
        }

        const products = fcData.data.extract.products
          .filter((p: any) => {
            const titleLower = (p.title || "").toLowerCase();
            return p.title && p.price > 0 &&
              !titleLower.includes("cachorros da amazon") &&
              !titleLower.includes("página não encontrada") &&
              !titleLower.includes("sorry");
          })
          .slice(0, limit)
          .map((p: any) => {
            const { category: cat, subcategory: sub } = normalizeCategory(p.category || p.title || '');
            return {
              product_name: p.title,
              original_url: p.url?.startsWith("http") ? p.url : `https://www.amazon.com.br${p.url || ""}`,
              image_url: enhanceImageUrl(p.image || null),
              current_price: p.price,
              old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
              rating: 4.8,
              category: cat,
              subcategory: sub
            };
          });

        if (products.length > 0) {
          console.log(`[SCRAPER][AMAZON][TRENDS] Sucesso: ${products.length} tendências encontradas via ${url}.`);
          return products;
        }
      } catch (urlError) {
        const msg = urlError instanceof Error ? urlError.message : String(urlError);
        console.warn(`[SCRAPER][AMAZON][TRENDS] Erro na URL ${url}: ${msg}`);
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

  let activeCategorySearch = categorySearchQuery;
  if (!activeCategorySearch || activeCategorySearch === "Geral") {
    // Sorteio de Categoria (Roleta Aleatória)
    const randomIndex = Math.floor(Math.random() * MAIN_CATEGORY_NAMES.length);
    activeCategorySearch = MAIN_CATEGORY_NAMES[randomIndex];
    console.log(`[SCRAPER][TRENDS] Modo Roleta Aleatória: Categoria sorteada -> ${activeCategorySearch}`);
  }

  const ingestedOffers: Offer[] = [];

  for (const source of sources) {
    let scrapedProducts: ScrapedProduct[] = [];

    if (source === "Mercado Livre") {
      scrapedProducts = await fetchTrendingProductsFromLanding(limit, activeCategorySearch);
    } else if (source === "Shopee") {
      scrapedProducts = await fetchShopeeTrendingProducts(limit, activeCategorySearch);
    } else if (source === "Shein") {
      scrapedProducts = await fetchSheinTrendingProducts(limit, activeCategorySearch);
    } else if (source === "Magalu") {
      scrapedProducts = await fetchMagaluTrendingProducts(limit, activeCategorySearch);
    } else if (source === "Amazon") {
      scrapedProducts = await fetchAmazonTrendingProducts(limit, activeCategorySearch);
    }

    for (const product of scrapedProducts) {
      // Processamento de URL de Afiliado para as respectivas plataformas ANTES da busca de duplicados
      let finalUrl = product.original_url;
      if (source === "Mercado Livre") {
        finalUrl = mlClient.generateAffiliateLink(product.original_url, userId);
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
        category: product.category || "Geral"
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
