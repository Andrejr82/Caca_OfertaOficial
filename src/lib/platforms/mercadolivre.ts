import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    if (!access_token || !expires_in) {
      console.error("[ML API] Resposta de renovação sem access_token ou expires_in.");
      return null;
    }
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
    if (!supabase) {
      console.error("[ML API] Supabase client não disponível para salvar novo token.");
      return access_token;
    }

    const { error: upsertError } = await supabase
      .from("app_settings")
      .upsert(
        {
          user_id: userId,
          key: "ml_credentials",
          value: {
            access_token,
            refresh_token: newRefreshToken || refreshToken,
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
      appTokenExpiresAt = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000);
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
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      console.warn("[ML API] Supabase client não disponível ao verificar token.");
      return null;
    }

    let credentialsOwnerId = userId;
    let { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "ml_credentials")
      .maybeSingle();

    if (error) {
      console.error(`[ML API] Erro ao buscar credenciais do Mercado Livre para usuário ${userId}:`, error);
      return null;
    }

    if ((!data || !data.value) && userId !== SHARED_ML_CREDENTIALS_OWNER) {
      const shared = await supabase
        .from("app_settings")
        .select("value")
        .eq("user_id", SHARED_ML_CREDENTIALS_OWNER)
        .eq("key", "ml_credentials")
        .maybeSingle();
      data = shared.data;
      error = shared.error;
      credentialsOwnerId = SHARED_ML_CREDENTIALS_OWNER;
    }

    if (!data || !data.value) {
      console.log(`[ML API] Nenhuma credencial do Mercado Livre encontrada para o usuário ${userId}.`);
      return null;
    }

    const credentials = data.value as MLCredentials;
    const expiresAt = new Date(credentials.expires_at);
    const now = new Date();

    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log(`[ML API] Token do Mercado Livre para ${userId} está expirado ou próximo de expirar. Renovando...`);
      return refreshMLToken(credentialsOwnerId, credentials.refresh_token);
    }

    return credentials.access_token;
  } catch (error) {
    console.error("[ML API] Falha inesperada ao carregar credenciais do Mercado Livre; seguindo com token operacional.", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

const SHARED_ML_CREDENTIALS_OWNER = "7a9ca7b7-f464-46e0-a9de-9b322c73628a";

async function refreshMLTokenFromEnvironment(): Promise<string | null> {
  const candidates: Array<{ source: "environment" | "supabase"; token: string }> = [];
  const environmentToken = process.env.MERCADO_LIVRE_REFRESH_TOKEN;
  if (environmentToken) candidates.push({ source: "environment", token: environmentToken });

  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from("app_settings")
      .select("value")
      .eq("user_id", SHARED_ML_CREDENTIALS_OWNER)
      .eq("key", "ml_credentials")
      .maybeSingle();
    if (error) {
      console.warn("[ML API] Não foi possível ler o refresh token operacional persistido; usando bootstrap da Vercel.");
    } else {
      const persisted = data?.value as Partial<MLCredentials> | null;
      if (persisted?.refresh_token && persisted.refresh_token !== environmentToken) {
        candidates.push({ source: "supabase", token: persisted.refresh_token });
      }
    }
  }

  for (const candidate of candidates) {
    const accessToken = await refreshMLToken(SHARED_ML_CREDENTIALS_OWNER, candidate.token);
    if (accessToken) {
      console.log(`[ML API] Token operacional renovado pela fonte ${candidate.source}.`);
      return accessToken;
    }
    console.warn(`[ML API] Refresh operacional rejeitado pela fonte ${candidate.source}; tentando a próxima fonte.`);
  }

  return null;
}

async function forceRefreshMLAccessToken(userId: string): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  let ownerId = userId;
  let { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "ml_credentials")
    .maybeSingle();
  if (error || !data?.value) {
    const shared = await supabase
      .from("app_settings")
      .select("value")
      .eq("user_id", SHARED_ML_CREDENTIALS_OWNER)
      .eq("key", "ml_credentials")
      .maybeSingle();
    data = shared.data;
    error = shared.error;
    ownerId = SHARED_ML_CREDENTIALS_OWNER;
  }
  if (error || !data?.value) return null;
  const credentials = data.value as Partial<MLCredentials>;
  if (!credentials.refresh_token) return null;
  return refreshMLToken(ownerId, credentials.refresh_token);
}

async function findStoredOracleOffer(itemId: string): Promise<LinkMetadata | null> {
  let clients: Array<any> = [];
  try {
    clients = [createSupabaseAdminClient(), await createServerSupabaseClient()].filter(Boolean);
  } catch (error) {
    console.warn("[ML API] Não foi possível inicializar a leitura da oferta Oracle", {
      itemId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
  for (const client of clients) {
    try {
      const { data, error } = await client
        .from("offers")
        .select("product_name,current_price,old_price,image_url,original_url,rating,updated_at")
        .eq("platform", "Mercado Livre")
        .eq("item_id", itemId)
        .not("product_name", "is", null)
        .gt("current_price", 0)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) continue;

      return {
        title: String(data.product_name),
        platform: "Mercado Livre" as Platform,
        imageUrl: typeof data.image_url === "string" ? data.image_url : undefined,
        price: Number(data.current_price),
        finalUrl: typeof data.original_url === "string" ? data.original_url : undefined,
        imageSource: "oracle_offer",
        confidenceScore: 100,
        extractionDate: data.updated_at || new Date().toISOString(),
      };
    } catch (error) {
      console.warn("[ML API] Falha ao consultar oferta Oracle persistida", {
        itemId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }
  }
  return null;
}

export function extractMLId(url: string): { type: "item" | "product"; id: string } | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    const pdpFilters = urlObj.searchParams.get("pdp_filters") || "";
    const itemIdParam = urlObj.searchParams.get("item_id")
      || urlObj.searchParams.get("itemId")
      || pdpFilters.match(/(?:^|[;,&])item_id[:=](MLB-?\d+)/i)?.[1];
    if (itemIdParam && /^MLB-?\d+$/i.test(itemIdParam)) {
      return { type: "item", id: itemIdParam.replace("-", "").toUpperCase() };
    }

    const productMatch = path.match(/\/p\/(MLB-?\d+)/i);
    if (productMatch) {
      return { type: "product", id: productMatch[1].replace("-", "").toUpperCase() };
    }

    const itemMatch = path.match(/(MLB-?\d+)/i);
    if (itemMatch) {
      return { type: "item", id: itemMatch[1].replace("-", "").toUpperCase() };
    }

    return null;
  } catch {
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

export type MLApiFailureCode =
  | "MARKETPLACE_AUTH_DENIED"
  | "MARKETPLACE_PERMISSION_DENIED"
  | "MARKETPLACE_SOURCE_UNAVAILABLE";

export function classifyMLApiFailure(status: number): MLApiFailureCode {
  if (status === 401) return "MARKETPLACE_AUTH_DENIED";
  if (status === 403) return "MARKETPLACE_PERMISSION_DENIED";
  return "MARKETPLACE_SOURCE_UNAVAILABLE";
}

export type MLProductDetailsResult =
  | { ok: true; data: LinkMetadata }
  | { ok: false; code: MLApiFailureCode | "INVALID_PRODUCT_ID" };

class MLApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function tryAffiliateSourceFallback(extractionUrl: string, itemId: string): Promise<LinkMetadata | null> {
  const { fetchMLFeaturedSnapshotFallback } = await import("@/lib/platforms/mercadolivre-featured-fallback");
  const fallback = await fetchMLFeaturedSnapshotFallback(extractionUrl, itemId);
  if (fallback) {
    console.log("[ML API] Dados recuperados do featured SSR da origem afiliada", {
      itemId,
      source: "affiliate_social_ssr",
    });
  }
  return fallback;
}

/**
 * Busca os detalhes do produto do Mercado Livre usando a API oficial
 */
export async function fetchMLProductDetailsResult(url: string, userId?: string): Promise<MLProductDetailsResult> {
  const mlIdInfo = extractMLId(url);
  if (!mlIdInfo) {
    console.warn(`[ML API] Não foi possível extrair um ID do Mercado Livre válido da URL: ${url}`);
    return { ok: false, code: "INVALID_PRODUCT_ID" };
  }

  console.log(`[ML API] ID do Mercado Livre identificado: ${mlIdInfo.id} (${mlIdInfo.type})`);

  let accessToken: string | null = null;
  if (userId) {
    accessToken = await getValidMLAccessToken(userId);
  }

  if (!accessToken) {
    accessToken = process.env.MERCADO_LIVRE_ACCESS_TOKEN || null;
  }

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
    let title = "";
    let price = 0;
    let originalPrice: number | null = null;
    let imageUrl: string | undefined;
    let catalogOfferImageUrl: string | undefined;
    let permalink = url;
    let htmlContent: string | null = null;
    let rating: number | undefined = undefined;

    let apiData: any = null;
    if (mlIdInfo.type === "item") {
      const itemUrl = `https://api.mercadolibre.com/items?ids=${encodeURIComponent(mlIdInfo.id)}`;
      let response = await fetch(itemUrl, { headers });
      console.log("[ML API] Consulta de item concluída", { itemId: mlIdInfo.id, status: response.status, endpoint: "items" });

      if (!response.ok && userId && (response.status === 401 || response.status === 403)) {
        const refreshedToken = await forceRefreshMLAccessToken(userId);
        if (refreshedToken) {
          accessToken = refreshedToken;
          headers["Authorization"] = `Bearer ${refreshedToken}`;
          response = await fetch(itemUrl, { headers });
        }
      }

      let catalogFallbackApplied = false;
      if (!response.ok && response.status === 403) {
        const operationalToken = await refreshMLTokenFromEnvironment();
        if (operationalToken && operationalToken !== accessToken) {
          accessToken = operationalToken;
          headers["Authorization"] = `Bearer ${operationalToken}`;
          response = await fetch(itemUrl, { headers });
          console.log("[ML API] Consulta de item após refresh concluída", { itemId: mlIdInfo.id, status: response.status, endpoint: "items" });
        }

        const catalogId = extractMLCatalogId(url);
        if (catalogId) {
          const catalogItemsResponse = await fetch(
            `https://api.mercadolibre.com/products/${catalogId}/items?limit=20`,
            { headers },
          );
          console.log("[ML API] Consulta de ofertas do catálogo concluída", { catalogId, status: catalogItemsResponse.status, endpoint: "products/items" });
          if (!catalogItemsResponse.ok) {
            throw new MLApiRequestError(catalogItemsResponse.status, `Erro ao buscar ofertas do catálogo ${catalogId}: ${catalogItemsResponse.status}`);
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
          catalogFallbackApplied = Boolean(matchedItem || catalogData.name || catalogData.title);
        }
      }

      if (!response.ok && !catalogFallbackApplied) {
        if (response.status === 401 || response.status === 403) {
          const fallback = await tryAffiliateSourceFallback(url, mlIdInfo.id);
          if (fallback) return { ok: true, data: fallback };
        }
        throw new MLApiRequestError(response.status, `Erro ao buscar item ${mlIdInfo.id}: ${response.status} ${response.statusText}`);
      }

      if (!catalogFallbackApplied) {
        const payload = await response.json();
        const firstResult = Array.isArray(payload) ? payload[0] : null;
        if (firstResult && Number(firstResult.code) >= 400) {
          const catalogId = extractMLCatalogId(url);
          if (!catalogId) {
            const verboseStatus = Number(firstResult.code);
            if (verboseStatus === 401 || verboseStatus === 403) {
              const fallback = await tryAffiliateSourceFallback(url, mlIdInfo.id);
              if (fallback) return { ok: true, data: fallback };
            }
            throw new MLApiRequestError(verboseStatus, `Erro ao buscar item ${mlIdInfo.id}: ${firstResult.code} ${firstResult.body?.message || "resposta inválida"}`);
          }

          const catalogItemsResponse = await fetch(
            `https://api.mercadolibre.com/products/${catalogId}/items?limit=20`,
            { headers },
          );
          console.log("[ML API] Consulta de ofertas do catálogo concluída", { catalogId, status: catalogItemsResponse.status, endpoint: "products/items" });
          if (!catalogItemsResponse.ok) {
            throw new MLApiRequestError(catalogItemsResponse.status, `Erro ao buscar ofertas do catálogo ${catalogId}: ${catalogItemsResponse.status}`);
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
            imageUrl = apiData.pictures[0].secure_url || apiData.pictures[0].url;
          } else if (apiData.thumbnail) {
            imageUrl = apiData.thumbnail;
          }
        }
      }
    } else {
      const productUrl = `https://api.mercadolibre.com/products/${mlIdInfo.id}`;
      const response = await fetch(productUrl, { headers });

      if (!response.ok) {
        throw new MLApiRequestError(response.status, `Erro ao buscar produto de catálogo ${mlIdInfo.id}: ${response.status} ${response.statusText}`);
      }

      apiData = await response.json();
      title = apiData.name || apiData.title || title;
      permalink = apiData.permalink || permalink;

      try {
        const catalogItemsResponse = await fetch(
          `${productUrl}/items?limit=20`,
          { headers },
        );
        if (catalogItemsResponse.ok) {
          const catalogItems = await catalogItemsResponse.json();
          const catalogResults = Array.isArray(catalogItems) ? catalogItems : catalogItems?.results;
          const firstOffer = Array.isArray(catalogResults) ? catalogResults.find((item: any) => Number(item.price) > 0) || catalogResults[0] : null;
          if (firstOffer) {
            apiData = { ...apiData, ...firstOffer };
            permalink = firstOffer.permalink || permalink;
            catalogOfferImageUrl = firstOffer.thumbnail || firstOffer.pictures?.[0]?.secure_url || firstOffer.pictures?.[0]?.url;
            imageUrl = catalogOfferImageUrl || imageUrl;
            price = Number(firstOffer.price) || 0;
          }
        } else {
          console.warn("[ML API] Falha ao buscar ofertas do catálogo", {
            catalogId: mlIdInfo.id,
            status: catalogItemsResponse.status,
            endpoint: "products/items",
          });
        }
      } catch (catalogError) {
        console.warn("[ML API] Erro ao buscar ofertas do catálogo", {
          catalogId: mlIdInfo.id,
          errorType: catalogError instanceof Error ? catalogError.name : typeof catalogError,
        });
      }

      if (price > 0) {
        // a oferta do catálogo já forneceu o preço atual
      } else if (apiData.buy_box_winner) {
        price = apiData.buy_box_winner.price || 0;
      } else if (apiData.price) {
        price = apiData.price;
      }

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

      if (catalogOfferImageUrl) {
        imageUrl = catalogOfferImageUrl;
      } else if (apiData && apiData.pictures && apiData.pictures.length > 0) {
        imageUrl = apiData.pictures[0].secure_url || apiData.pictures[0].url;
      } else if (apiData && apiData.thumbnail) {
        imageUrl = apiData.thumbnail;
      }
    }

    if (imageUrl && imageUrl.includes("mlstatic.com")) {
      imageUrl = imageUrl.replace(/\.webp$/i, ".jpg");
    }

    if (imageUrl && imageUrl.startsWith("//")) {
      imageUrl = "https:" + imageUrl;
    }

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
          } catch {
            // ignora bloco JSON-LD inválido
          }
          if (rating !== undefined) break;
        }
      }

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

    return { ok: true, data: {
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
    }};
  } catch (error) {
    const storedOffer = await findStoredOracleOffer(mlIdInfo.id);
    if (storedOffer) {
      console.log("[ML API] Oferta Oracle reutilizada após falha da API", { itemId: mlIdInfo.id });
      return { ok: true, data: storedOffer };
    }
    if (error instanceof MLApiRequestError) {
      console.warn("[ML API] Falha HTTP na consulta de produto", {
        itemId: mlIdInfo.id,
        status: error.status,
        endpoint: mlIdInfo.type === "item" ? "items" : "products",
      });
    } else {
      console.error(`[ML API] Erro ao buscar dados na API do Mercado Livre para ${mlIdInfo.id}:`, error);
    }
    return {
      ok: false,
      code: error instanceof MLApiRequestError
        ? classifyMLApiFailure(error.status)
        : "MARKETPLACE_SOURCE_UNAVAILABLE",
    };
  }
}

export async function fetchMLProductDetails(url: string, userId?: string): Promise<LinkMetadata | null> {
  const result = await fetchMLProductDetailsResult(url, userId);
  return result.ok ? result.data : null;
}

export function generateMLAffiliateLink(productUrl: string, userId?: string): string {
  if (!userId) return productUrl;

  try {
    const url = new URL(productUrl);
    url.searchParams.set("af_sub1", userId);
    url.searchParams.set("utm_source", "afiliado");
    url.searchParams.set("utm_medium", "caca_oferta");
    return url.toString();
  } catch {
    return productUrl;
  }
}

export interface AffiliateMonetizationResult {
  monetized: boolean;
  affiliateUrl: string;
  errorCode?: "AFFILIATE_LINK_NOT_GENERATED";
  reason?: string;
}

export function generateMLAffiliateLinkWithId(productUrl: string, affiliateId: string): string {
  if (!affiliateId?.trim()) return productUrl;

  try {
    const url = new URL(productUrl);
    url.hash = "";
    url.searchParams.set("partner_id", affiliateId.trim());
    url.searchParams.set("utm_source", "caca_oferta");
    url.searchParams.set("utm_medium", "afiliado");
    url.searchParams.set("utm_campaign", "express_publication");
    return url.toString();
  } catch {
    return productUrl;
  }
}

export function validateAffiliateMonetization(params: {
  marketplace: string;
  affiliateUrl: string;
  originalUrl: string;
  resolvedUrl: string;
}): AffiliateMonetizationResult {
  const { marketplace, affiliateUrl } = params;

  if (marketplace !== "Mercado Livre") {
    return { monetized: true, affiliateUrl: affiliateUrl || params.resolvedUrl };
  }

  if (!affiliateUrl?.trim()) {
    return {
      monetized: false,
      affiliateUrl: "",
      errorCode: "AFFILIATE_LINK_NOT_GENERATED",
      reason: "affiliate_url ausente para Mercado Livre",
    };
  }

  return { monetized: true, affiliateUrl };
}
