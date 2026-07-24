import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LinkMetadata } from "@/lib/publish/quality-gate";
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

let cachedAppToken: string | null = null;
let appTokenExpiresAt: number = 0;

export async function getAppMLAccessToken(): Promise<string | null> {
  if (cachedAppToken && Date.now() < appTokenExpiresAt) {
    return cachedAppToken;
  }
  
  const appId = process.env.MERCADO_LIVRE_APP_ID || process.env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET;

  if (!appId || !clientSecret) return null;

  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: appId,
        client_secret: clientSecret
      }).toString()
    });

    if (response.ok) {
      const data = await response.json();
      cachedAppToken = data.access_token;
      appTokenExpiresAt = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000); // 5 min safety margin
      return cachedAppToken;
    }
  } catch (err) {
    console.error("[ML API] Erro ao obter token App Client Credentials:", err);
  }
  return null;
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

    // Links de compartilhamento de catálogo podem apontar para /p/MLB...
    // e carregar o item/oferta real em ?pdp_filters=item_id%3AMLB....
    // O item tem preço e estoque atuais; priorize-o quando estiver presente.
    const pdpFilters = urlObj.searchParams.get("pdp_filters") || "";
    const itemIdParam = urlObj.searchParams.get("item_id")
      || urlObj.searchParams.get("itemId")
      || pdpFilters.match(/(?:^|[;,&])item_id[:=](MLB-?\d+)/i)?.[1];
    if (itemIdParam && /^MLB-?\d+$/i.test(itemIdParam)) {
      return { type: "item", id: itemIdParam.replace("-", "").toUpperCase() };
    }

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

function extractMLCatalogId(url: string): string | null {
  const match = url.match(/\/p\/(MLB-?\d+)/i);
  return match ? match[1].replace("-", "").toUpperCase() : null;
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

  // Fallback para token genérico da aplicação se o usuário não tiver token vinculado
  if (!accessToken) {
    console.log(`[ML API] Usuário sem token OAuth. Utilizando fallback App Token (Client Credentials).`);
    accessToken = await getAppMLAccessToken();
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
    let htmlContent: string | null = null;
    let rating: number | undefined = undefined;

    let apiData: any = null;
    if (mlIdInfo.type === "item") {
      // O endpoint individual /items/{id} pode retornar 403 para aplicativos
      // válidos. O endpoint em lote é o mesmo usado pelo pipeline oficial.
      const itemUrl = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(mlIdInfo.id)}`;
      const response = await fetch(itemUrl, { headers });

      if (!response.ok) {
        throw new Error(`Erro ao buscar item ${mlIdInfo.id}: ${response.status} ${response.statusText}`);
      }

      const payload = await response.json();
      const firstResult = Array.isArray(payload) ? payload[0] : null;
      if (firstResult && Number(firstResult.code) >= 400) {
        const catalogId = extractMLCatalogId(url);
        if (!catalogId) {
          throw new Error(`Erro ao buscar item ${mlIdInfo.id}: ${firstResult.code} ${firstResult.body?.message || "resposta inválida"}`);
        }

        // Links de catálogo podem bloquear o item individual. Nesse caso,
        // usa-se o endpoint oficial do catálogo para localizar a oferta real.
        const catalogItemsResponse = await fetch(
          `https://api.mercadolibre.com/products/${catalogId}/items?limit=20`,
          { headers },
        );
        if (!catalogItemsResponse.ok) {
          throw new Error(`Erro ao buscar ofertas do catálogo ${catalogId}: ${catalogItemsResponse.status}`);
        }
        const catalogItems = await catalogItemsResponse.json();
        const catalogResults = Array.isArray(catalogItems) ? catalogItems : catalogItems?.results;
        const matchedItem = Array.isArray(catalogResults)
          ? catalogResults.find((item: any) => String(item.item_id || item.id).replace("-", "").toUpperCase() === mlIdInfo.id)
          : null;
        const catalogResponse = await fetch(`https://api.mercadolibre.com/products/${catalogId}`, { headers });
        const catalogData = catalogResponse.ok ? await catalogResponse.json() : {};
        apiData = { ...catalogData, ...(matchedItem || {}) };
        title = matchedItem?.title || catalogData.name || catalogData.title || title;
        price = matchedItem?.price || catalogData.buy_box_winner?.price || catalogData.price || 0;
        originalPrice = matchedItem?.original_price || catalogData.original_price || null;
        permalink = matchedItem?.permalink || catalogData.permalink || permalink;
        imageUrl = matchedItem?.thumbnail || matchedItem?.pictures?.[0]?.secure_url
          || catalogData.pictures?.[0]?.secure_url || catalogData.pictures?.[0]?.url;
      } else {
        apiData = firstResult?.body || payload;
        title = apiData.title || title;
        price = apiData.price || 0;
        originalPrice = apiData.original_price || null;
        permalink = apiData.permalink || permalink;

        if (apiData.pictures && apiData.pictures.length > 0) {
          // Pega a primeira foto em alta qualidade
          imageUrl = apiData.pictures[0].secure_url || apiData.pictures[0].url;
        } else if (apiData.thumbnail) {
          imageUrl = apiData.thumbnail;
        }
      }
    } else {
      // Consulta detalhes do produto de catálogo
      const productUrl = `https://api.mercadolibre.com/products/${mlIdInfo.id}`;
      const response = await fetch(productUrl, { headers });

      if (!response.ok) {
        throw new Error(`Erro ao buscar produto de catálogo ${mlIdInfo.id}: ${response.status} ${response.statusText}`);
      }

      apiData = await response.json();
      title = apiData.name || apiData.title || title;
      permalink = apiData.permalink || permalink;

      // Obtém preço do buy box
      if (apiData.buy_box_winner) {
        price = apiData.buy_box_winner.price || 0;
      } else if (apiData.price) {
        price = apiData.price;
      }

      // Fallback para quando o produto de catálogo não retorna o preço na API
      if (price === 0) {
        console.log(`[ML API] Preço não encontrado no produto de catálogo ${mlIdInfo.id}. Tentando fallback de HTML...`);
        try {
          const htmlRes = await fetch(url, {
             headers: {
               "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
               "Accept-Language": "pt-BR,pt;q=0.9"
             }
          });
          htmlContent = await htmlRes.text();
          const metaPriceMatch = htmlContent.match(/<meta\s+property=["']product:preconfigured_price:amount["']\s+content=["']([^"']+)["']/i) ||
                             htmlContent.match(/<meta\s+itemprop=["']price["']\s+content=["']([^"']+)["']/i);
          if (metaPriceMatch) {
            price = parseFloat(metaPriceMatch[1]);
            console.log(`[ML API] Preço resgatado via fallback HTML: R$ ${price}`);
          }
        } catch (htmlErr) {
          console.error("[ML API] Falha no fallback HTML:", htmlErr);
        }
      }

      if (apiData && apiData.pictures && apiData.pictures.length > 0) {
        imageUrl = apiData.pictures[0].secure_url || apiData.pictures[0].url;
      } else if (apiData && apiData.thumbnail) {
        imageUrl = apiData.thumbnail;
      }
    }

    // A substituição por -O.jpg foi removida porque a CDN do ML retorna 404
    // se a imagem em alta resolução (-O) não existir de fato.
    if (imageUrl && imageUrl.includes("mlstatic.com")) {
      imageUrl = imageUrl.replace(/\.webp$/i, ".jpg");
    }

    if (imageUrl && imageUrl.startsWith("//")) {
      imageUrl = "https:" + imageUrl;
    }

    // Extração de Rating Real via HTML/JSON-LD
    try {
      if (!htmlContent) {
        const htmlRes = await fetch(permalink, {
           headers: {
             "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
             "Accept-Language": "pt-BR,pt;q=0.9"
           }
        });
        htmlContent = await htmlRes.text();
      }

      // Procura AggregateRating no JSON-LD
      const jsonLdMatches = htmlContent.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
      if (jsonLdMatches) {
        for (const match of jsonLdMatches) {
          try {
            const cleanJson = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
            const data = JSON.parse(cleanJson);
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item?.aggregateRating?.ratingValue) {
                const parsedRating = parseFloat(item.aggregateRating.ratingValue);
                if (!isNaN(parsedRating) && parsedRating > 0) {
                  rating = parsedRating;
                  break;
                }
              }
            }
          } catch (e) {
            // ignore JSON parse error for this block
          }
          if (rating !== undefined) break;
        }
      }

      // Se não encontrou no JSON-LD, tenta na meta tag ou itemprop
      if (rating === undefined) {
        const ratingMatch = htmlContent.match(/<meta\s+itemprop=["']ratingValue["']\s+content=["']([^"']+)["']/i) ||
                            htmlContent.match(/"ratingValue"\s*:\s*"?([0-9.]+)"?/i);
        if (ratingMatch) {
          const parsedRating = parseFloat(ratingMatch[1]);
          if (!isNaN(parsedRating) && parsedRating > 0) {
            rating = parsedRating;
          }
        }
      }
    } catch (err) {
      console.warn(`[ML API] Falha ao extrair rating HTML para ${permalink}:`, err);
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
      extractionDate: new Date().toISOString(),
      sold_quantity: apiData ? apiData.sold_quantity : undefined,
      official_store_id: apiData ? apiData.official_store_id : undefined,
      available_quantity: apiData ? apiData.available_quantity : undefined,
      rating
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
