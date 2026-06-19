import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LinkMetadata } from "@/lib/publish/scraper";
import { Platform } from "@/types/domain";

export interface MLCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  ml_user_id: string;
}

/**
 * Renova o token de acesso do Mercado Livre usando o refresh_token
 */
export async function refreshMLToken(userId: string, refreshToken: string): Promise<string | null> {
  const appId = process.env.MERCADO_LIVRE_APP_ID || process.env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET;

  if (!appId || !clientSecret) {
    console.error("[ML API] Variáveis de ambiente MERCADO_LIVRE_APP_ID ou MERCADO_LIVRE_CLIENT_SECRET não encontradas.");
    return null;
  }

  try {
    console.log(`[ML API] Tentando renovar token do Mercado Livre para o usuário ${userId}...`);
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      }).toString()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[ML API] Erro ao renovar token na API do Mercado Livre:", errorData);
      return null;
    }

    const data = await response.json();
    const { access_token, refresh_token: newRefreshToken, expires_in, user_id } = data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      console.error("[ML API] Supabase client não disponível para salvar novo token.");
      return access_token; // Retorna o token mesmo que falhe em salvar no banco (para uso imediato)
    }

    const { error: upsertError } = await supabase
      .from("app_settings")
      .upsert(
        {
          user_id: userId,
          key: "ml_credentials",
          value: {
            access_token,
            refresh_token: newRefreshToken,
            expires_at: expiresAt,
            ml_user_id: user_id
          },
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "user_id,key"
        }
      );

    if (upsertError) {
      console.error("[ML API] Falha ao atualizar credenciais renovadas no banco de dados:", upsertError);
    } else {
      console.log(`[ML API] Token renovado e salvo com sucesso no banco para o usuário ${userId}.`);
    }

    return access_token;
  } catch (error) {
    console.error("[ML API] Erro fatal no refreshMLToken:", error);
    return null;
  }
}

/**
 * Obtém um token de acesso do Mercado Livre válido para o usuário (renovando se necessário)
 */
export async function getValidMLAccessToken(userId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    console.warn("[ML API] Supabase client não disponível ao verificar token.");
    return null;
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "ml_credentials")
    .maybeSingle();

  if (error) {
    console.error(`[ML API] Erro ao buscar credenciais do Mercado Livre para usuário ${userId}:`, error);
    return null;
  }

  if (!data || !data.value) {
    console.log(`[ML API] Nenhuma credencial do Mercado Livre encontrada para o usuário ${userId}.`);
    return null;
  }

  const credentials = data.value as MLCredentials;
  const expiresAt = new Date(credentials.expires_at);
  const now = new Date();

  // Se o token estiver expirado ou a menos de 5 minutos de expirar, renova
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log(`[ML API] Token do Mercado Livre para ${userId} está expirado ou próximo de expirar. Renovando...`);
    return refreshMLToken(userId, credentials.refresh_token);
  }

  return credentials.access_token;
}

/**
 * Extrai o ID do item ou produto de catálogo de uma URL do Mercado Livre
 */
export function extractMLId(url: string): { type: "item" | "product"; id: string } | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    // 1. Testa se é um ID de catálogo de produto (/p/MLB123456)
    const productMatch = path.match(/\/p\/(MLB-?\d+)/i);
    if (productMatch) {
      return { type: "product", id: productMatch[1].replace("-", "").toUpperCase() };
    }

    // 2. Testa se é um item comum (/MLB-123456 ou /MLB123456)
    const itemMatch = path.match(/(MLB-?\d+)/i);
    if (itemMatch) {
      return { type: "item", id: itemMatch[1].replace("-", "").toUpperCase() };
    }

    // 3. Testa nos parâmetros de busca (ex: itemId=MLB123456)
    const itemIdParam = urlObj.searchParams.get("itemId");
    if (itemIdParam && itemIdParam.toUpperCase().startsWith("MLB")) {
      return { type: "item", id: itemIdParam.toUpperCase() };
    }

    return null;
  } catch {
    // Fallback se o parser de URL falhar (regex direto na string de texto)
    const productMatch = url.match(/\/p\/(MLB-?\d+)/i);
    if (productMatch) {
      return { type: "product", id: productMatch[1].replace("-", "").toUpperCase() };
    }
    const itemMatch = url.match(/(MLB-?\d+)/i);
    if (itemMatch) {
      return { type: "item", id: itemMatch[1].replace("-", "").toUpperCase() };
    }
    return null;
  }
}

/**
 * Busca os detalhes do produto do Mercado Livre usando a API oficial
 */
export async function fetchMLProductDetails(url: string, userId?: string): Promise<LinkMetadata | null> {
  const mlIdInfo = extractMLId(url);
  if (!mlIdInfo) {
    console.warn(`[ML API] Não foi possível extrair um ID do Mercado Livre válido da URL: ${url}`);
    return null;
  }

  console.log(`[ML API] ID do Mercado Livre identificado: ${mlIdInfo.id} (${mlIdInfo.type})`);

  let accessToken: string | null = null;
  if (userId) {
    accessToken = await getValidMLAccessToken(userId);
  }

  const headers: HeadersInit = {
    "Accept": "application/json"
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  try {
    let title = "Oferta Mercado Livre";
    let price = 0;
    let originalPrice: number | null = null;
    let imageUrl: string | undefined;
    let permalink = url;

    if (mlIdInfo.type === "item") {
      // Consulta detalhes do item
      const itemUrl = `https://api.mercadolibre.com/items/${mlIdInfo.id}`;
      const response = await fetch(itemUrl, { headers });

      if (!response.ok) {
        throw new Error(`Erro ao buscar item ${mlIdInfo.id}: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      title = data.title || title;
      price = data.price || 0;
      originalPrice = data.original_price || null;
      permalink = data.permalink || permalink;

      if (data.pictures && data.pictures.length > 0) {
        // Pega a primeira foto em alta qualidade
        imageUrl = data.pictures[0].secure_url || data.pictures[0].url;
      } else if (data.thumbnail) {
        imageUrl = data.thumbnail;
      }
    } else {
      // Consulta detalhes do produto de catálogo
      const productUrl = `https://api.mercadolibre.com/products/${mlIdInfo.id}`;
      const response = await fetch(productUrl, { headers });

      if (!response.ok) {
        throw new Error(`Erro ao buscar produto de catálogo ${mlIdInfo.id}: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      title = data.name || data.title || title;
      permalink = data.permalink || permalink;

      // Obtém preço do buy box
      if (data.buy_box_winner) {
        price = data.buy_box_winner.price || 0;
      } else if (data.price) {
        price = data.price;
      }

      if (data.pictures && data.pictures.length > 0) {
        imageUrl = data.pictures[0].secure_url || data.pictures[0].url;
      } else if (data.thumbnail) {
        imageUrl = data.thumbnail;
      }
    }

    // Melhora a imagem substituindo o thumbnail padrão por alta resolução (-O) se possível
    if (imageUrl && imageUrl.includes("mlstatic.com")) {
      imageUrl = imageUrl.replace(/\.webp$/i, ".jpg");
      imageUrl = imageUrl.replace(/-[a-zA-Z]\.jpg$/i, "-O.jpg");
    }

    if (imageUrl && imageUrl.startsWith("//")) {
      imageUrl = "https:" + imageUrl;
    }

    const confidenceScore = price > 0 ? 100 : 70;

    return {
      title,
      platform: "Mercado Livre" as Platform,
      imageUrl,
      price,
      finalUrl: permalink,
      imageSource: "mercadolivre_api",
      confidenceScore,
      extractionDate: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[ML API] Erro ao buscar dados na API do Mercado Livre para ${mlIdInfo.id}:`, error);
    return null;
  }
}

/**
 * Gera o link de afiliado oficial usando o ID do usuário (ou tag do Mercado Livre)
 */
export function generateMLAffiliateLink(productUrl: string, userId?: string): string {
  if (!userId) return productUrl;

  try {
    const url = new URL(productUrl);
    // Injeta o tracking de afiliado (af_sub1 recebe o id do usuário do sistema)
    url.searchParams.set("af_sub1", userId);
    url.searchParams.set("utm_source", "afiliado");
    url.searchParams.set("utm_medium", "caca_oferta");
    return url.toString();
  } catch {
    return productUrl;
  }
}
