import { Platform } from "@/types/domain";
import { logger } from "@/lib/utils/logger";

export interface LinkMetadata {
  title: string;
  platform: Platform;
  imageUrl?: string;
  price?: number;
  finalUrl?: string;
  imageSource?: string;
  confidenceScore?: number;
  extractionDate?: string;
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function resolveFinalUrl(urlStr: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(urlStr, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });
    clearTimeout(timeoutId);
    return response.url || urlStr;
  } catch (error) {
    logger.warn(`Erro ao resolver redirects para ${urlStr}`, { error });
    return urlStr;
  }
}

export async function fetchLinkMetadata(url: string, userId?: string): Promise<LinkMetadata> {
  let title = "Oferta Especial";
  let imageUrl: string | undefined;
  let finalUrl = url;
  let platform: Platform = "Outro";
  let price = 0;
  let html = "";
  let imageSource = "none";
  let firecrawlMetadata: any = null;

  logger.info("Iniciando extração de metadados", { url });

  // 1. Resolver URL final para identificar a plataforma corretamente
  finalUrl = await resolveFinalUrl(url);
  logger.info("URL Final resolvida", { finalUrl });

  // 2. Detectar Plataforma
  const lowerUrl = finalUrl.toLowerCase();
  if (lowerUrl.includes("shope") || lowerUrl.includes("shopee")) platform = "Shopee";
  else if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon")) platform = "Amazon";
  else if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu")) platform = "Magalu";
  else if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("ml") || lowerUrl.includes("meli.la")) platform = "Mercado Livre";
  else if (lowerUrl.includes("shein")) platform = "Shein";
  else if (lowerUrl.includes("netshoes")) platform = "Netshoes" as any;

  // Se a plataforma for Mercado Livre, tenta obter pela API oficial
  if (platform === "Mercado Livre") {
    try {
      const { fetchMLProductDetails } = await import("@/lib/platforms/mercadolivre");
      const mlMetadata = await fetchMLProductDetails(finalUrl, userId);
      if (mlMetadata) {
        logger.info("Extração via Mercado Livre API realizada com sucesso", { finalUrl });
        return mlMetadata;
      }
      logger.warn("Falha ao extrair dados via API do Mercado Livre, caindo de volta para Firecrawl/Scraper.");
    } catch (err) {
      logger.error("Erro ao chamar API do Mercado Livre no fetchLinkMetadata:", err);
    }
  }

  // Utiliza o scraper robusto para Netshoes, pois o extrator genérico falha em capturar o preço.
  if (platform === "Netshoes") {
    try {
      const { scrapeProductDetails } = await import("@/lib/affiliates/scraper");
      const nsMetadata = await scrapeProductDetails(finalUrl);
      if (nsMetadata && nsMetadata.current_price > 0) {
        logger.info("Extração via Scraper Dedicado da Netshoes realizada com sucesso", { finalUrl });
        return {
          title: nsMetadata.product_name,
          platform: "Netshoes",
          imageUrl: nsMetadata.image_url || undefined,
          price: nsMetadata.current_price,
          finalUrl: finalUrl,
          imageSource: "firecrawl_custom",
          confidenceScore: 95,
          extractionDate: new Date().toISOString()
        };
      }
      logger.warn("Falha ao extrair dados via Scraper da Netshoes, caindo de volta para Firecrawl/Scraper genérico.");
    } catch (err) {
      logger.error("Erro ao chamar Scraper Dedicado da Netshoes:", err);
    }
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  // 3. Extração via Firecrawl
  if (firecrawlKey) {
    try {
      logger.info("Tentando extração via Firecrawl", { finalUrl });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
      const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlKey}`
        },
        body: JSON.stringify({ url: finalUrl, formats: ["html", "extract"], extract: {
            schema: {
                type: "object",
                properties: {
                    price: { type: "number" },
                    title: { type: "string" },
                    image: { type: "string" }
                }
            }
        } }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (fcRes.ok) {
        const fcData = await fcRes.json();
        if (fcData.success && fcData.data) {
          const fcStatusCode = fcData.data.metadata?.statusCode || 200;
          const fcTitle = fcData.data.metadata?.title || "";
          
          if (fcStatusCode === 403 || fcStatusCode === 401 || fcStatusCode === 503 || fcTitle.includes("Não é possível acessar a página")) {
             logger.warn("Firecrawl foi bloqueado pelo anti-bot do site", { statusCode: fcStatusCode, title: fcTitle });
             html = ""; // Força o fallback
          } else {
            html = fcData.data.html || "";
            
            // Fallback extraction block from LLM extract
            if (fcData.data.extract) {
                if (fcData.data.extract.title) title = fcData.data.extract.title;
                if (fcData.data.extract.price) price = fcData.data.extract.price;
                if (fcData.data.extract.image) {
                    imageUrl = fcData.data.extract.image;
                    imageSource = "firecrawl_extract";
                }
            }

            // Meta tag extraction directly from FC
            if (fcData.data.metadata) {
              firecrawlMetadata = fcData.data.metadata;
              if (!title || title === "Oferta Especial") title = fcData.data.metadata.title;
              if (!imageUrl && fcData.data.metadata.ogImage) {
                imageUrl = fcData.data.metadata.ogImage;
                imageSource = "firecrawl_og";
              }
            }
            logger.info("Firecrawl sucesso", { finalUrl, hasHtml: !!html });
          }
        }
      } else {
        logger.warn("Firecrawl retornou erro", { status: fcRes.status });
      }
    } catch (err) {
      logger.error("Falha ao comunicar com Firecrawl", err);
    }
  }

  // 4. Fallback: Fetch HTTP simples se Firecrawl falhou em trazer o HTML
  if (!html) {
    logger.info("Usando fetch simples como fallback", { finalUrl });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
      const response = await fetch(finalUrl, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        }
      });
      
      if (response.ok) {
        html = await response.text();
      }
    } catch (err) {
      logger.error("Falha no fetch HTTP simples", err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 5. Parse de HTML (Se Firecrawl não extraiu os dados ou não usamos FC)
  if (html) {
    // 5.1 Extract Title
    if (title === "Oferta Especial") {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        let rawTitle = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        rawTitle = rawTitle.replace(/\s*[-|]\s*(Shopee Brasil|Amazon\.com\.br|Magazine Luiza|Mercado Livre).*$/i, "");
        if (rawTitle.length > 5) {
          title = rawTitle;
        }
      }
    }

    // 5.2 Image Fallback Cascade
    if (!imageUrl) {
      // 1. og:image:secure_url
      let imgMatch = html.match(/<meta[^>]*property=["']og:image:secure_url["'][^>]*content=["']([^"']+)["'][^>]*>/i);
      if (imgMatch && imgMatch[1]) {
        imageUrl = imgMatch[1];
        imageSource = "og:image:secure_url";
      }

      // 2. og:image
      if (!imageUrl) {
        imgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) || 
                   html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1];
          imageSource = "og:image";
        }
      }

      // 3. twitter:image
      if (!imageUrl) {
        imgMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1];
          imageSource = "twitter:image";
        }
      }

      // 4. JSON-LD (Schema.org)
      if (!imageUrl) {
        const ldJsonMatches = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
        if (ldJsonMatches) {
          for (const scriptTag of ldJsonMatches) {
            try {
              const jsonContent = scriptTag.replace(/<script\s+type=["']application\/ld\+json["']>/i, "").replace(/<\/script>/i, "").trim();
              const parsed = JSON.parse(jsonContent);
              if (parsed.image) {
                imageUrl = Array.isArray(parsed.image) ? parsed.image[0] : parsed.image;
                if (typeof imageUrl === "object" && (imageUrl as any).url) {
                    imageUrl = (imageUrl as any).url;
                }
                if (typeof imageUrl === "string") {
                  imageSource = "json-ld";
                  break;
                }
              }
            } catch (e) {}
          }
        }
      }

      // 5. Gallery fallback (Mercado Livre)
      if (!imageUrl && platform === "Mercado Livre") {
        imgMatch = html.match(/<img[^>]*class=["'][^"']*ui-pdp-image[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i) ||
                   html.match(/<img[^>]*class=["'][^"']*ui-pdp-gallery__figure__image[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i);
        if (imgMatch && imgMatch[1]) {
          imageUrl = imgMatch[1];
          imageSource = "gallery_fallback";
        }
      }
    }

    // 5.3 Price Fallback
    if (!price || price === 0) {
      const priceMatch = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:amount["'][^>]*>/i) ||
                         html.match(/"price":\s*(\d+(?:\.\d+)?)/i) ||
                         html.match(/<meta\s+itemprop=["']price["']\s+content=["']([^"']+)["']/i);
      
      if (priceMatch && priceMatch[1]) {
        price = parseFloat(priceMatch[1]);
      } else if (platform === "Mercado Livre") {
        const mlPriceMatch = html.match(/<span\s+class=["']andes-money-amount__fraction["']>([^<]+)<\/span>/i);
        if (mlPriceMatch && mlPriceMatch[1]) {
          price = parseFloat(mlPriceMatch[1].replace(/\./g, "").replace(",", "."));
        }
      } else if (platform === "Amazon") {
         const amzPriceMatch = html.match(/<span\s+class=["']a-price-whole["']>([^<]+)<\/span>/i);
         if (amzPriceMatch && amzPriceMatch[1]) {
             price = parseFloat(amzPriceMatch[1].replace(/\./g, "").replace(",", "."));
         }
      }

      // Injected price in title fallback
      if (!price && title) {
        const titlePriceMatch = title.match(/-\s*R\$\s*(\d+(?:[.,]\d+)?)/i);
        if (titlePriceMatch) {
           price = parseFloat(titlePriceMatch[1].replace(/\./g, "").replace(",", "."));
           title = title.replace(titlePriceMatch[0], "").trim();
        }
      }
    }
  }

  // Cleanup imageUrl se necessário
  if (imageUrl) {
    if (imageUrl.startsWith("//")) {
      imageUrl = "https:" + imageUrl;
    }
    // O Cloudinary agora lida perfeitamente com imagens WebP, então não precisamos
    // mais forçar a conversão de URL para .jpg (o que estava quebrando alguns links do ML).
    if (imageUrl.includes("mlstatic.com")) {
      // imageUrl = imageUrl.replace(/\.webp($|\?)/i, ".jpg$1");
      // imageUrl = imageUrl.replace(/-[a-zA-Z]\.jpg($|\?)/i, "-O.jpg$1");
    }
  }

  // 6. Cálculo do Confidence Score (Origem e Qualidade)
  let score = 0;
  if (price && price > 0) score += 40; // Preço é essencial
  if (title && title !== "Oferta Especial") score += 30; // Título válido
  if (imageUrl) {
    score += 20; // Imagem presente
    // Bônus se imagem vem de fontes estruturadas fortes
    if (imageSource === "firecrawl_extract" || imageSource === "json-ld") {
      score += 10;
    }
  }

  const result = {
    title,
    platform,
    imageUrl,
    price,
    finalUrl,
    imageSource,
    confidenceScore: Math.min(100, score),
    extractionDate: new Date().toISOString()
  };

  logger.info("Extração concluída", { ...result, url });

  return result;
}
