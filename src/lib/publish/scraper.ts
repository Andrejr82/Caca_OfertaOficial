import { Platform } from "@/types/domain";

export interface LinkMetadata {
  title: string;
  platform: Platform;
  imageUrl?: string;
  price?: number;
  finalUrl?: string;
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  let title = "Oferta Especial";
  let imageUrl: string | undefined;
  let finalUrl = url;
  let platform: Platform = "Outro";
  let price = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    // Use Googlebot user agent to bypass Mercado Livre Captcha / Account Verification
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });
    
    clearTimeout(timeoutId);

    // Bypassing explícito para links Mercado Livre usando a API oficial do Meli
    // A Vercel é barrada pelo Captcha (403), então evitamos o parser HTML.
    const decodedUrl = decodeURIComponent(url);
    const mlbMatch = decodedUrl.match(/MLB-?\d+/i);
    
    if (mlbMatch) {
      const mlbId = mlbMatch[0].replace("-", "").toUpperCase();
      try {
        const mlApiRes = await fetch(`https://api.mercadolibre.com/items/${mlbId}`);
        if (mlApiRes.ok) {
          const mlData = await mlApiRes.json();
          return {
            title: mlData.title,
            platform: "Mercado Livre",
            imageUrl: mlData.pictures && mlData.pictures.length > 0 ? mlData.pictures[0].url : undefined,
            price: mlData.price,
            finalUrl: url // Mantém original
          };
        }
      } catch (e) {
        console.error("Falha ao usar ML API bypass", e);
      }
    }

    if (response.ok) {
      finalUrl = response.url;
      const html = await response.text();

      // Etapa 3: Detectar Marketplace pela URL final
      const lowerUrl = finalUrl.toLowerCase();
      if (lowerUrl.includes("shope") || lowerUrl.includes("shopee")) platform = "Shopee";
      else if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon")) platform = "Amazon";
      else if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu")) platform = "Magalu";
      else if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("ml")) platform = "Mercado Livre";
      
      // Extract <title>
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        // Basic cleanup
        let rawTitle = titleMatch[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
          
        // Remove common platform suffixes from title
        rawTitle = rawTitle.replace(/\s*[-|]\s*(Shopee Brasil|Amazon\.com\.br|Magazine Luiza|Mercado Livre).*$/i, "");
        if (rawTitle.length > 5) {
          title = rawTitle;
        }
      }

      // Extract og:image
      const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) || 
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
                         
      if (imageMatch && imageMatch[1]) {
        imageUrl = imageMatch[1];
      }

      // Extract price
      const priceMatch = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:amount["'][^>]*>/i) ||
                         html.match(/"price":\s*(\d+(?:\.\d+)?)/i) ||
                         html.match(/<meta\s+itemprop=["']price["']\s+content=["']([^"']+)["']/i);
      
      if (priceMatch && priceMatch[1]) {
        price = parseFloat(priceMatch[1]);
      } else {
        // Fallback for Mercado Livre visible price
        const mlPriceMatch = html.match(/<span\s+class=["']andes-money-amount__fraction["']>([^<]+)<\/span>/i);
        if (mlPriceMatch && mlPriceMatch[1]) {
          price = parseFloat(mlPriceMatch[1].replace(/\./g, "").replace(",", "."));
        }
      }
    }
  } catch (error) {
    console.error("Erro ao fazer scraping da URL:", error);
    // Ignora o erro e retorna os valores padrão se falhar
  }

  return {
    title,
    platform,
    imageUrl,
    price,
    finalUrl
  };
}
