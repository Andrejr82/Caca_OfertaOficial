import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Offer } from "@/types/domain";
import { mlClient } from "@/lib/integrations/mercadolivre/client";
import { curateOfferScore } from "@/lib/offers/curation-engine";

const USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export interface ScrapedProduct {
  product_name: string;
  original_url: string;
  image_url: string | null;
  current_price: number;
  old_price: number | null;
  rating: number | null;
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

/**
 * Coleta os links e detalhes dos produtos mais vendidos no Mercado Livre diretamente da página principal
 * Evita fazer requisições extras para páginas individuais de produtos, contornando bloqueios de captcha.
 * Híbrido: Extrai os dados publicamente e depois injeta a tag de afiliado.
 */
export async function fetchTrendingProductsFromLanding(limit = 5): Promise<ScrapedProduct[]> {
  try {
    const url = "https://www.mercadolivre.com.br/mais-vendidos";
    let html = "";

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;

    if (firecrawlKey) {
      console.log("[Scraper] Usando Firecrawl para contornar bloqueio do Mercado Livre...");
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: url, formats: ["html"] })
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
      console.log("[Scraper] Tentando fetch direto (sujeito a bloqueio do Mercado Livre)...");
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "pt-BR,pt;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        },
        next: { revalidate: 3600 } // cache de 1 hora
      });

      if (!response.ok) {
        throw new Error(`Falha ao carregar a página de mais vendidos. Status: ${response.status}`);
      }
      html = await response.text();
    }

    const chunks = html.split('<div class="dynamic-carousel__item-container">');
    const results: ScrapedProduct[] = [];

    // Ignora a primeira parte, que é o cabeçalho antes dos cards de produtos
    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];

      // 1. URL do Produto
      const linkMatch = chunk.match(/href="([^"]+)"/);
      const link = linkMatch ? linkMatch[1] : null;

      // 2. Imagem (Tratamento robusto contra Lazy Loading)
      let image: string | null = null;
      const dataSrcMatch = chunk.match(/data-src="([^"]+)"/);
      const srcMatch = chunk.match(/<img[^>]+src="([^"]+)"/);

      if (dataSrcMatch && dataSrcMatch[1].startsWith("http")) {
        image = dataSrcMatch[1];
      } else if (srcMatch && srcMatch[1].startsWith("http")) {
        image = srcMatch[1];
      }

      // 3. Título do Produto
      const titleMatch = chunk.match(/<h3 class="dynamic-carousel__title">([^<]+)<\/h3>/) ||
                         chunk.match(/alt="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].trim() : null;

      // 4. Preço Atual e Antigo
      const priceBlockMatch = chunk.match(/class="dynamic-carousel__price-block">([\s\S]*?)<\/h3>/) ||
                              chunk.match(/class="dynamic-carousel__price-block">([\s\S]*?)<\/div>/);
      let currentPrice = 0;
      let oldPrice: number | null = null;

      if (priceBlockMatch) {
        const priceHtml = priceBlockMatch[1];
        const priceMatches = [...priceHtml.matchAll(/R\$\s*(\d+(?:\.\d+)?(?:,\d+)?)/g)];
        if (priceMatches.length > 0) {
          if (priceMatches.length === 1) {
            currentPrice = parseFloat(priceMatches[0][1].replace(/\./g, "").replace(",", "."));
          } else {
            const vals = priceMatches.map(m => parseFloat(m[1].replace(/\./g, "").replace(",", ".")));
            currentPrice = vals[1] || vals[0];
            oldPrice = vals[0] > currentPrice ? vals[0] : null;
          }
        }
      }

      if (title && link && currentPrice > 0) {
        results.push({
          product_name: title,
          original_url: link,
          image_url: enhanceImageUrl(image),
          current_price: currentPrice,
          old_price: oldPrice,
          rating: 4.8 // nota padrão alta
        });
      }

      if (results.length >= limit) break;
    }

    return results;
  } catch (error) {
    console.error("Erro ao buscar tendências do Mercado Livre:", error);
    return [];
  }
}

/**
 * Raspa detalhes de um produto individual do Mercado Livre
 * Nota: Pode sofrer redirecionamento para tela de tráfego suspeito dependendo do IP/Rate Limit.
 */
async function scrapeMercadoLivreProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  try {
    let html = "";
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;

    if (firecrawlKey) {
      console.log(`[Scraper] Usando Firecrawl para produto ML: ${productUrl}`);
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: productUrl, formats: ["html"] })
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
      return {
        product_name: title.trim(),
        original_url: productUrl,
        image_url: enhanceImageUrl(image),
        current_price: currentPrice,
        old_price: oldPrice && oldPrice > currentPrice ? oldPrice : null,
        rating: rating
      };
    }

    return null;
  } catch (error) {
    console.error(`Erro ao raspar produto ML ${productUrl}:`, error);
    return null;
  }
}

async function scrapeMagaluProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
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
        console.warn("Falha ao resolver shortlink do magalu:", e);
      }
    }

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.warn("FIRECRAWL_API_KEY não encontrada, usando mock de fallback para Magalu");
      return {
        product_name: "Produto Magalu (Mock - Cadastre a API Key do Firecrawl)",
        original_url: productUrl,
        image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop",
        current_price: 99.90,
        old_price: 199.90,
        rating: 4.5
      };
    }

    console.log(`[Scraper] Usando Firecrawl Extract para Magalu: ${productUrl}`);
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
    return {
      product_name: extract.title,
      original_url: finalProductUrl,
      image_url: enhanceImageUrl(extract.image || null),
      current_price: extract.current_price,
      old_price: extract.old_price || null,
      rating: 4.8 // Nota padrão alta
    };

  } catch (error) {
    console.error(`Erro ao raspar produto Magalu ${productUrl}:`, error);
    return null;
  }
}

async function scrapeSheinProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
  try {
    // Para Shein, usamos redirecionamento automático (para links shein.top) e headers padrão
    const response = await fetch(productUrl, {
      redirect: 'follow',
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      throw new Error(`Falha ao obter produto SHEIN. Status: ${response.status}`);
    }

    const html = await response.text();

    // 1. Extração do título (OpenGraph)
    const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) || 
                       html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].replace(/\| SHEIN.*$/i, "").trim() : "Produto SHEIN";

    // 2. Extração da Imagem (OpenGraph)
    const imageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    let image = imageMatch ? imageMatch[1] : null;

    // Se a imagem iniciar com //, adicionar https:
    if (image && image.startsWith("//")) {
      image = "https:" + image;
    }

    // 3. Extração de preço (Pode estar oculto por SSR/JS, então usamos fallback 0 caso não encontre)
    let currentPrice = 0;
    
    // Tentar achar price na meta tag og:price:amount ou property similar
    const metaPriceMatch = html.match(/<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)["']/i) ||
                           html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)["']/i);
    if (metaPriceMatch) {
      currentPrice = parseFloat(metaPriceMatch[1]);
    } else {
      // Tentar no JSON-LD da Shein
      const ldJsonMatches = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
      if (ldJsonMatches) {
        for (const scriptTag of ldJsonMatches) {
          try {
            const jsonContent = scriptTag.replace(/<script\s+type=["']application\/ld\+json["']>/i, "").replace(/<\/script>/i, "").trim();
            const parsed = JSON.parse(jsonContent);
            if (parsed.offers && parsed.offers.price) {
              currentPrice = parseFloat(parsed.offers.price);
              break;
            }
          } catch {}
        }
      }
    }

    // Mesmo que não ache o preço (currentPrice == 0), vamos retornar para aproveitar a Imagem e Título
    // O usuário poderá preencher o preço manualmente.
    return {
      product_name: title.trim(),
      original_url: productUrl,
      image_url: enhanceImageUrl(image),
      current_price: currentPrice,
      old_price: null,
      rating: 4.8 // Mock para Shein
    };

  } catch (error) {
    console.error(`Erro ao raspar produto SHEIN ${productUrl}:`, error);
    return null;
  }
}

async function scrapeAmazonProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
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
        console.warn("Falha ao resolver shortlink da Amazon:", e);
      }
    }

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.warn("FIRECRAWL_API_KEY não encontrada, Amazon bloqueará o fetch comum. Retornando mock.");
      return {
        product_name: "Produto Amazon (Requer Firecrawl)",
        original_url: finalProductUrl,
        image_url: null,
        current_price: 0,
        old_price: null,
        rating: 4.8
      };
    }

    console.log(`[Scraper] Usando Firecrawl Extract para Amazon: ${productUrl}`);
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
    return {
      product_name: extract.title,
      original_url: finalProductUrl,
      image_url: enhanceImageUrl(extract.image || null),
      current_price: extract.current_price,
      old_price: extract.old_price || null,
      rating: 4.8 // Nota padrão alta
    };

  } catch (error) {
    console.error(`Erro ao raspar produto Amazon ${productUrl}:`, error);
    return null;
  }
}

/**
 * Raspa detalhes de um produto individual
 * Identifica a loja pelo domínio e direciona para a função correta
 */
export async function scrapeProductDetails(productUrl: string): Promise<ScrapedProduct | null> {
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

export async function fetchAmazonTrendingProducts(limit = 5): Promise<ScrapedProduct[]> {
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) {
      console.warn("Sem chave Firecrawl. Usando fallback Mock para Tendências da Amazon.");
      return [
        {
          product_name: "Echo Dot 5ª Geração (Requer Firecrawl para ofertas reais)",
          original_url: "https://www.amazon.com.br/dp/B09B8VGCR8",
          image_url: null,
          current_price: 299.00,
          old_price: null,
          rating: 4.9
        }
      ];
    }

    console.log("[Scraper] Usando Firecrawl para buscar tendências da Amazon...");
    const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        url: "https://www.amazon.com.br/gp/bestsellers/", 
        formats: ["extract"],
        extract: {
          prompt: `Extraia os top ${limit} produtos mais vendidos. Para cada produto, precisamos do título, url original da amazon do produto, url da imagem e o preço atual promocional como número (ex: 99.90). Se tiver preço antigo cortado, traga também.`,
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
                    old_price: { type: "number", nullable: true }
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
    
    if (!fcResponse.ok) throw new Error(`Falha no Firecrawl Amazon Trends: ${fcResponse.status}`);
    const fcData = await fcResponse.json();
    if (!fcData.success || !fcData.data?.extract?.products) throw new Error("Sem produtos extraídos");

    return fcData.data.extract.products.slice(0, limit).map((p: any) => ({
      product_name: p.title,
      original_url: p.url.startsWith("http") ? p.url : `https://www.amazon.com.br${p.url}`,
      image_url: enhanceImageUrl(p.image || null),
      current_price: p.price,
      old_price: p.old_price || null,
      rating: 4.8
    }));
  } catch (error) {
    console.error("Erro Amazon Trends:", error);
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
  targetUserId?: string
): Promise<Offer[]> {
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

  const ingestedOffers: Offer[] = [];

  for (const source of sources) {
    let scrapedProducts: ScrapedProduct[] = [];

    if (source === "Mercado Livre") {
      scrapedProducts = await fetchTrendingProductsFromLanding(limit);
    } else if (source === "Shopee") {
      // Mock realista de tendências da Shopee
      scrapedProducts = [
        {
          product_name: "Fone de Ouvido Bluetooth Sem Fio TWS i12 - Alta Fidelidade",
          original_url: "https://shopee.com.br/product-fone-tws-i12",
          image_url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500&auto=format&fit=crop",
          current_price: 34.90,
          old_price: 69.90,
          rating: 4.6
        },
        {
          product_name: "Smartwatch Relógio Inteligente D20 Android iOS",
          original_url: "https://shopee.com.br/product-smartwatch-d20",
          image_url: "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=500&auto=format&fit=crop",
          current_price: 29.90,
          old_price: 59.90,
          rating: 4.3
        },
        {
          product_name: "Tripé de Celular Ring Light Iluminador LED 20cm",
          original_url: "https://shopee.com.br/product-tripe-ringlight",
          image_url: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=500&auto=format&fit=crop",
          current_price: 49.90,
          old_price: 99.90,
          rating: 4.5
        }
      ].slice(0, limit);
    } else if (source === "Shein") {
      // Mock realista de tendências da Shein
      scrapedProducts = [
        {
          product_name: "Vestido Feminino Elegante Manga Bufante Casual Verão",
          original_url: "https://shein.com.br/product-vestido-bufante",
          image_url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500&auto=format&fit=crop",
          current_price: 79.90,
          old_price: 159.90,
          rating: 4.8
        },
        {
          product_name: "Blusa Moletom Masculina Estampa Streetwear com Capuz",
          original_url: "https://shein.com.br/product-moletom-capuz",
          image_url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500&auto=format&fit=crop",
          current_price: 89.90,
          old_price: 189.90,
          rating: 4.7
        },
        {
          product_name: "Bolsa Transversal Couro Sintético com Alça Ajustável",
          original_url: "https://shein.com.br/product-bolsa-transversal",
          image_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=500&auto=format&fit=crop",
          current_price: 54.90,
          old_price: 110.00,
          rating: 4.9
        }
      ].slice(0, limit);
    } else if (source === "Magalu") {
      // Mock realista de tendências do Magalu
      scrapedProducts = [
        {
          product_name: "Fritadeira Elétrica sem Óleo Air Fryer Mondial",
          original_url: "https://www.magazineluiza.com.br/fritadeira-eletrica-sem-oleo-air-fryer-mondial/p/12345/ud/frel",
          image_url: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=500&auto=format&fit=crop",
          current_price: 349.90,
          old_price: 599.90,
          rating: 4.8
        },
        {
          product_name: "Smart TV 50\" 4K UHD LED Samsung",
          original_url: "https://www.magazineluiza.com.br/smart-tv-50-4k/p/67890/et/tv4k",
          image_url: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=500&auto=format&fit=crop",
          current_price: 2199.00,
          old_price: 2899.00,
          rating: 4.9
        },
        {
          product_name: "Smartphone Samsung Galaxy A54 5G 128GB",
          original_url: "https://www.magazineluiza.com.br/smartphone-samsung/p/11223/te/ga54",
          image_url: "https://images.unsplash.com/photo-1610945264803-c22b6272faa0?w=500&auto=format&fit=crop",
          current_price: 1599.00,
          old_price: 2199.00,
          rating: 4.7
        }
      ].slice(0, limit);
    } else if (source === "Amazon") {
      scrapedProducts = await fetchAmazonTrendingProducts(limit);
    }

    for (const product of scrapedProducts) {
      // Verificar se este produto já foi cadastrado antes
      const { data: existingOffer } = await supabase
        .from("offers")
        .select("id")
        .eq("original_url", product.original_url)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingOffer) {
        continue; // Pula se já existe
      }

      let platformValue = source;
      let notesValue = `Importado automaticamente via Robô de Tendências (${source}).`;

      // Aplica o Motor Frio para ter o Rating + Shadow Mode
      const curation = curateOfferScore({
        current_price: product.current_price,
        old_price: product.old_price,
        rating: product.rating,
        category: "Geral" // O bot de tendencias n traz categoria ainda
      });

      if (source === "Shein") {
        // Tenta salvar como Shein no banco. Se a constraint rejeitar, o erro será capturado e inserido como "Outro".
        const { data: newOffer, error: insertError } = await supabase
          .from("offers")
          .insert({
            user_id: userId,
            platform: "Shein",
            product_name: product.product_name,
            original_url: product.original_url,
            image_url: product.image_url,
            current_price: product.current_price,
            old_price: product.old_price,
            rating: product.rating,
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
          continue;
        } else {
          platformValue = "Outro";
          notesValue = `Plataforma original: Shein. ${notesValue}`;
        }
      }

      // Processamento de URL de Afiliado para Mercado Livre e Magalu
      let finalUrl = product.original_url;
      if (source === "Mercado Livre") {
        finalUrl = mlClient.generateAffiliateLink(product.original_url, userId);
      } else if (source === "Magalu") {
        // Formata link do Magalu com a credencial
        const magaluId = process.env.MAGALU_PARTNER_ID || "";
        if (magaluId) {
          try {
            const urlObj = new URL(product.original_url);
            // Substitui o path inicial para usar o magazine afiliado
            urlObj.hostname = "www.magazinevoce.com.br";
            urlObj.pathname = `/${magaluId}${urlObj.pathname}`;
            finalUrl = urlObj.toString();
          } catch (e) {
            // Falha silenciosa no URL parser
          }
        }
      } else if (source === "Amazon") {
        const amazonTag = process.env.AMAZON_PARTNER_TAG || "";
        if (amazonTag) {
          try {
            const urlObj = new URL(product.original_url);
            urlObj.searchParams.set("tag", amazonTag);
            finalUrl = urlObj.toString();
          } catch (e) {
            // Falha silenciosa
          }
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
        console.error(`Erro ao salvar oferta raspada no banco (${source}): ${insertError.message}`);
        continue;
      }

      if (newOffer) {
        ingestedOffers.push(newOffer as Offer);
      }
    }
  }

  return ingestedOffers;
}
