export interface MLTrend {
  keyword: string;
  url: string;
}

export interface MLProduct {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  permalink: string;
  thumbnail: string;
  sold_quantity: number | null;
}

/**
 * Cliente Oficial da API do Mercado Livre
 */
export class MercadoLivreClient {
  private readonly baseUrl = "https://api.mercadolibre.com";

  /**
   * Obtém as top tendências de buscas no Mercado Livre Brasil
   */
  async getTrendingTopics(limit: number = 10): Promise<MLTrend[]> {
    try {
      const response = await fetch(`${this.baseUrl}/trends/MLB`, {
        headers: {
          "Accept": "application/json"
        },
        // Revalidate cache cada 1 hora para evitar bater limite da API para dados que demoram a mudar
        next: { revalidate: 3600 }
      });

      if (!response.ok) {
        throw new Error(`ML API Error (Trends): ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // A API retorna um array de objetos: [{ keyword: "celular", url: "..." }, ...]
      if (Array.isArray(data)) {
        return data.slice(0, limit).map(item => ({
          keyword: item.keyword,
          url: item.url
        }));
      }

      return [];
    } catch (error) {
      console.error("[MercadoLivreClient] Error fetching trends:", error);
      return [];
    }
  }

  /**
   * Busca os produtos mais relevantes para uma determinada palavra-chave (tendência)
   */
  async getProductsByKeyword(keyword: string, limit: number = 1): Promise<MLProduct[]> {
    try {
      const url = new URL(`${this.baseUrl}/sites/MLB/search`);
      url.searchParams.append("q", keyword);
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("sort", "relevance");

      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`ML API Error (Search): ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.results && Array.isArray(data.results)) {
        return data.results.map((item: any) => ({
          id: item.id,
          title: item.title,
          price: item.price,
          original_price: item.original_price || null,
          permalink: item.permalink,
          // A API retorna uma thumbnail minúscula. Para obter uma boa imagem, substituímos o -I por -O (ou -F)
          thumbnail: item.thumbnail ? item.thumbnail.replace("-I.jpg", "-O.jpg") : "",
          sold_quantity: item.sold_quantity || null
        }));
      }

      return [];
    } catch (error) {
      console.error(`[MercadoLivreClient] Error searching products for ${keyword}:`, error);
      return [];
    }
  }

  /**
   * Gera o link de afiliado oficial usando o Sub ID do usuário.
   * O ML identifica afiliados geralmente através do tracking gerado no painel,
   * mas para automação direta, muitos sistemas usam parâmetros de UTM ou injetam o código de afiliado.
   * Aqui criamos uma estrutura base para injeção.
   */
  generateAffiliateLink(productUrl: string, affiliateId?: string): string {
    if (!affiliateId) return productUrl;
    
    try {
      const url = new URL(productUrl);
      // Injeta parâmetros de tracking de afiliado caso tenha (Exemplo genérico)
      url.searchParams.append("af_sub1", affiliateId);
      url.searchParams.append("utm_source", "afiliado");
      return url.toString();
    } catch {
      return productUrl;
    }
  }
}

// Exporta uma instância única (Singleton)
export const mlClient = new MercadoLivreClient();
