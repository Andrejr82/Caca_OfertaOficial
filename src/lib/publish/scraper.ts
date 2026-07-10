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
  sold_quantity?: number;
  available_quantity?: number;
  official_store_id?: number | string | null;
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
  let apiMetadata: any = null;

  logger.info("Iniciando extração de metadados", { url });

  // 0. Detectar Plataforma pela URL Original ANTES do redirect (Evita CAPTCHA imediato no ML)
  const originalUrlLower = url.toLowerCase();
  let initialPlatform: Platform = "Outro";
  if (originalUrlLower.includes("shope") || originalUrlLower.includes("shopee") || originalUrlLower.includes("shp.ee")) initialPlatform = "Shopee";
  else if (originalUrlLower.includes("amzn") || originalUrlLower.includes("amazon")) initialPlatform = "Amazon";
  else if (originalUrlLower.includes("magazineluiza") || originalUrlLower.includes("magalu")) initialPlatform = "Magalu";
  else if (originalUrlLower.includes("mercadolivre") || originalUrlLower.includes("ml") || originalUrlLower.includes("meli.la")) initialPlatform = "Mercado Livre";
  else if (originalUrlLower.includes("shein")) initialPlatform = "Shein";
  else if (originalUrlLower.includes("netshoes")) initialPlatform = "Netshoes" as any;

  // 1. Tentar API unificada (Scraper Integrado) ANTES de resolver redirecionamento completo na Vercel
  // scrapeProductDetails lida internamente com shortlinks e fallbacks robustos (incluindo ML)
  if (["Shopee", "Shein", "Magalu", "Amazon", "Netshoes", "Mercado Livre"].includes(initialPlatform)) {
    try {
      const { scrapeProductDetails } = await import("@/lib/affiliates/scraper");
      const scraped = await scrapeProductDetails(url);
      if (scraped && scraped.current_price > 0) {
        logger.info(`Extração via Scraper Integrado para ${initialPlatform} com sucesso`, { url });
        // NOTE: Amazon official API debt
        if (initialPlatform === "Amazon") {
          logger.warn("AMAZON_OFFICIAL_API_REQUIRED: Usando Oracle/LLM pois não há API oficial instalada.");
        }
        return {
          title: scraped.product_name,
          platform: initialPlatform,
          imageUrl: scraped.image_url || undefined,
          price: scraped.current_price,
          finalUrl: scraped.original_url || url,
          imageSource: "integrated_api",
          confidenceScore: 95,
          extractionDate: new Date().toISOString()
        };
      }
    } catch (err) {
      logger.error(`Erro ao chamar Scraper Integrado para ${initialPlatform}:`, err);
    }
  }

  // 2. Resolver URL final para fallbacks
  finalUrl = await resolveFinalUrl(url);
  logger.info("URL Final resolvida (Fallback)", { finalUrl });

  // Re-detectar Plataforma
  const lowerUrl = finalUrl.toLowerCase();
  if (lowerUrl.includes("shope") || lowerUrl.includes("shopee")) platform = "Shopee";
  else if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon")) platform = "Amazon";
  else if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu")) platform = "Magalu";
  else if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("ml") || lowerUrl.includes("meli.la")) platform = "Mercado Livre";
  else if (lowerUrl.includes("shein")) platform = "Shein";
  else if (lowerUrl.includes("netshoes")) platform = "Netshoes" as any;

  // Tentar API unificada após redirecionamento, para capturar links encurtados (ex: meli.la, shp.ee)
  if (["Shopee", "Shein", "Magalu", "Amazon", "Netshoes", "Mercado Livre"].includes(platform) && finalUrl !== url) {
    try {
      const { scrapeProductDetails } = await import("@/lib/affiliates/scraper");
      const scraped = await scrapeProductDetails(finalUrl);
      if (scraped && scraped.current_price > 0) {
        logger.info(`Extração via Scraper Integrado para ${platform} (após redirect) com sucesso`, { finalUrl });
        return {
          title: scraped.product_name,
          platform: platform,
          imageUrl: scraped.image_url || undefined,
          price: scraped.current_price,
          finalUrl: scraped.original_url || finalUrl,
          imageSource: "integrated_api",
          confidenceScore: 95,
          extractionDate: new Date().toISOString()
        };
      }
    } catch (err) {
      logger.error(`Erro ao chamar Scraper Integrado para ${platform} após redirect:`, err);
    }
  }

  // 3. Fallback Scrapfly (Se não temos API ou se ela falhou)
  const scrapflyKeys = process.env.SCRAPFLY_API_KEYS;
  if (scrapflyKeys) {
    logger.info("Tentando extração de HTML/Dados via Scrapfly", { finalUrl });
    const keys = scrapflyKeys.split(",").map(k => k.trim());
    const key = keys[0];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const scrapflyUrl = `https://api.scrapfly.io/scrape?key=${key}&url=${encodeURIComponent(finalUrl)}&render_js=false&asp=true`;

      const sfRes = await fetch(scrapflyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (sfRes.ok) {
        const sfData = await sfRes.json();
        if (sfData?.result?.content) {
          html = sfData.result.content;
          logger.info("HTML extraído com sucesso via Scrapfly");
        }
      }
    } catch (err) {
      logger.warn("Falha no fallback Scrapfly", { error: err instanceof Error ? err.message : String(err) });
    }
  }



  const oracleKey = process.env.ORACLE_API_KEY;

  // 4. Extração via Micro-API Oracle In-House (Se HTML não veio via Scrapfly)
  if (oracleKey && !html) {
    try {
      logger.info("Tentando extração via Oracle API In-House", { finalUrl });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const oracleRes = await fetch('http://193.122.242.178:3002/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: finalUrl, token: oracleKey }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (oracleRes.ok) {
        const oracleData = await oracleRes.json();
        if (oracleData.success && oracleData.data) {
          html = oracleData.data.html || "";

          if (oracleData.data.extract) {
            if (oracleData.data.extract.title) title = oracleData.data.extract.title;
            if (oracleData.data.extract.price) price = oracleData.data.extract.price;
            if (oracleData.data.extract.image) {
              imageUrl = oracleData.data.extract.image;
              imageSource = "oracle_extract";
            }
          }

          if (oracleData.data.metadata) {
            apiMetadata = oracleData.data.metadata;
            if (!title || title === "Oferta Especial") title = oracleData.data.metadata.title;
            if (!imageUrl && oracleData.data.metadata.ogImage) {
              imageUrl = oracleData.data.metadata.ogImage;
              imageSource = "oracle_og";
            }
          }
          logger.info("Oracle API sucesso", { finalUrl, hasHtml: !!html });
        }
      } else {
        logger.warn("Oracle API retornou erro", { status: oracleRes.status });
      }
    } catch (err) {
      logger.error("Falha ao comunicar com Oracle API", err);
    }
  }

  // 5. Fallback: Fetch HTTP simples se Scrapfly/Oracle API falharam em trazer o HTML
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

  // 6. Parse de HTML (Para qualquer fluxo que gerou HTML e ainda precisa processar)
  if (html && (!price || price === 0)) {
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
            } catch (e) { }
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
  if (title && title !== "Oferta Especial") {
    score += 30; // Título válido

    // Proteção de Privacidade: Ocultar dados sigilosos do Perfil Social do ML
    if (title.toLowerCase().includes("perfil social no mercado livre")) {
      title = "Coleção Especial de Ofertas";
    }
    // Regex genérico para remover IDs de usuário padrão (nome + muitos números)
    title = title.replace(/[a-zA-Z]+\d{10,}/gi, "Oferta Selecionada");
  }

  if (imageUrl) {
    score += 20; // Imagem presente
    // Bônus se imagem vem de fontes estruturadas fortes
    if (imageSource === "oracle_extract" || imageSource === "json-ld") {
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
