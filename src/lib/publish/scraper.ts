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
    
    // Use WhatsApp user agent to bypass Mercado Livre Cloudflare/WAF block on Vercel IPs
    // Social media crawlers usually bypass aggressive bot checks and receive OGP data perfectly.
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "WhatsApp/2.21.19.21 A",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      }
    });
    
    clearTimeout(timeoutId);

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

      // Se o ML retornou a versão Light/OGP para o WhatsApp, o preço não estará no HTML body
      // Mas sim injetado no final do title: "Nome do Produto - R$ 99,90"
      if (!price && title) {
        const titlePriceMatch = title.match(/-\s*R\$\s*(\d+(?:[.,]\d+)?)/i);
        if (titlePriceMatch) {
           price = parseFloat(titlePriceMatch[1].replace(/\./g, "").replace(",", "."));
           title = title.replace(titlePriceMatch[0], "").trim();
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
