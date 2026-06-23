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
 * Gera um Deeplink de afiliado para a Shein.
 * Devido à migração da Shein para o seu próprio app (Agosto/2024)
 * e o desligamento do CPA em redes terceirizadas para o Brasil,
 * essa função opera agora em modo SEMI-AUTOMÁTICO.
 * Retorna o link original limpo para que a IA crie a copy perfeitamente,
 * e o usuário substitui manualmente pelo seu link do app na hora da postagem.
 */
export async function generateSheinAffiliateLink(productUrl: string, userId: string): Promise<string> {
  console.info(`[SHEIN API] Operando em modo semi-automático. Retornando link raw: ${productUrl}`);
  
  // Apenas limpa a URL se houver parâmetros sujos de rastreio de outros afiliados
  try {
    const urlObj = new URL(productUrl);
    // Removemos os params UTM/affiliate comuns que vêm raspados (se houver)
    urlObj.searchParams.delete('admitad_uid');
    urlObj.searchParams.delete('affiliateID');
    
    // Adiciona uma flag visual na URL final apenas para sabermos que passou pelo backend
    urlObj.searchParams.set('caca_oferta_manual_link', 'true');
    return urlObj.toString();
  } catch (e) {
    return productUrl;
  }
}
