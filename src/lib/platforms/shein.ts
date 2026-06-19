import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AdmitadCredentials {
  access_token: string;
  expires_at: string;
}

/**
 * Obtém ou renova o token de acesso da Admitad usando Client Credentials (global).
 */
export async function getValidAdmitadAccessToken(userId: string): Promise<string | null> {
  const clientId = process.env.ADMITAD_CLIENT_ID;
  const clientSecret = process.env.ADMITAD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[ADMITAD API] ADMITAD_CLIENT_ID ou ADMITAD_CLIENT_SECRET ausentes no ambiente.");
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  // Verifica se o token existe e ainda é válido no banco (app_settings)
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "admitad_credentials")
    .maybeSingle();

  if (!error && data?.value) {
    const credentials = data.value as AdmitadCredentials;
    const expiresAt = new Date(credentials.expires_at);
    // Se o token estiver válido (com margem de 5 minutos), usa ele.
    if (expiresAt.getTime() - new Date().getTime() > 5 * 60 * 1000) {
      return credentials.access_token;
    }
  }

  // Caso contrário, precisamos solicitar um novo token
  try {
    console.log("[ADMITAD API] Solicitando novo access_token da Admitad...");
    const credentialsBuffer = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    
    const tokenRes = await fetch("https://api.admitad.com/token/", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentialsBuffer}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "deeplink_generator"
      }).toString()
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({}));
      console.error("[ADMITAD API] Erro ao obter token:", errBody);
      return null;
    }

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;
    const expires_at = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Salva o novo token no banco de dados para evitar solicitações a cada link gerado
    const { error: upsertError } = await supabase.from("app_settings").upsert({
      user_id: userId,
      key: "admitad_credentials",
      value: { access_token, expires_at },
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,key" });

    if (upsertError) {
      console.error("[ADMITAD API] Erro ao salvar novo token na app_settings:", upsertError);
    }

    return access_token;
  } catch (err) {
    console.error("[ADMITAD API] Erro fatal na requisição do token:", err);
    return null;
  }
}

/**
 * Gera um Deeplink de afiliado para a Shein através da API da Admitad.
 * Caso haja falha (credenciais faltando, não aprovado, erro de API),
 * a função retorna graciosamente a urlOriginal como fallback de segurança.
 */
export async function generateSheinAffiliateLink(productUrl: string, userId: string): Promise<string> {
  const websiteId = process.env.ADMITAD_WEBSITE_ID;
  if (!websiteId) {
    console.warn("[ADMITAD API] ADMITAD_WEBSITE_ID não configurado. Retornando link original.");
    return productUrl;
  }

  const token = await getValidAdmitadAccessToken(userId);
  if (!token) {
    console.warn("[ADMITAD API] Não foi possível obter token da Admitad. Retornando link original.");
    return productUrl;
  }

  try {
    // API de Deeplink:
    const urlWithParams = `https://api.admitad.com/deeplink/${websiteId}/new/?ulp=${encodeURIComponent(productUrl)}`;
    
    const deeplinkRes = await fetch(urlWithParams, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });

    const deeplinkData = await deeplinkRes.json();

    if (!deeplinkRes.ok) {
      console.error("[ADMITAD API] Falha ao gerar deeplink (Possível Ad Space não aprovado na campanha Shein):", deeplinkData);
      return productUrl;
    }

    if (Array.isArray(deeplinkData) && deeplinkData.length > 0) {
      return deeplinkData[0]; // Retorna a URL final da Admitad (ex: https://ad.admitad.com/g/...)
    }

    console.warn("[ADMITAD API] Retorno inesperado da API ao gerar deeplink:", deeplinkData);
    return productUrl;
  } catch (error) {
    console.error("[ADMITAD API] Erro na chamada do gerador de deeplink:", error);
    return productUrl;
  }
}
