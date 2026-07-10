import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[ML OAuth] Autenticação falhou:", error);
      return NextResponse.redirect(new URL("/dashboard?error=ml_auth_failed", req.url));
    }

    if (!code) {
      return new NextResponse("Nenhum código de autorização fornecido.", { status: 400 });
    }

    // Credenciais com fallback hardcoded para setup inicial
    const appId = process.env.MERCADO_LIVRE_APP_ID ?? "4737683937591844";
    const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET ?? "ghjolsSndOR1Mp591UskpOepNZ8hvyrw";
    const redirectUri = process.env.MERCADO_LIVRE_REDIRECT_URI ?? "https://caca-oferta-oficial.vercel.app/api/auth/ml/callback";

    console.log("[ML OAuth] Iniciando troca de code pelo token...");
    console.log("[ML OAuth] client_id:", appId);
    console.log("[ML OAuth] redirect_uri:", redirectUri);
    console.log("[ML OAuth] code recebido:", code.substring(0, 20) + "...");

    // Troca o código pelo access_token
    const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: appId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri
      }).toString()
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("[ML OAuth] Erro ao obter token:", JSON.stringify(tokenData));
      // Mostra erro detalhado na URL para diagnóstico
      const errMsg = encodeURIComponent(JSON.stringify(tokenData));
      return NextResponse.redirect(new URL(`/dashboard?error=ml_token_failed&detail=${errMsg}`, req.url));
    }

    const { access_token, refresh_token, expires_in, user_id } = tokenData;

    console.log("[ML OAuth] Token obtido! user_id:", user_id);

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase client não inicializado.");
    }

    const { data: userData } = await supabase.auth.getUser();
    const systemUserId = userData?.user?.id;

    if (!systemUserId) {
      console.warn("[ML OAuth] Usuário do sistema não logado no callback.");
      // Mesmo sem sessão, salva os tokens na URL para não perder o code
      const tokenParams = new URLSearchParams({
        error: "ml_no_session",
        ml_access_token: access_token,
        ml_refresh_token: refresh_token,
        ml_user_id: String(user_id)
      });
      return NextResponse.redirect(new URL(`/dashboard?${tokenParams.toString()}`, req.url));
    }

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    const { error: upsertError } = await supabase
      .from("app_settings")
      .upsert(
        {
          user_id: systemUserId,
          key: "ml_credentials",
          value: {
            access_token,
            refresh_token,
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
      console.error("[ML OAuth] Erro ao salvar credenciais no banco:", upsertError);
      return NextResponse.redirect(new URL("/dashboard?error=ml_save_failed", req.url));
    }

    console.log(`[ML OAuth] Token salvo com sucesso para o usuário: ${systemUserId}`);

    return NextResponse.redirect(new URL("/dashboard?success=ml_connected", req.url));
  } catch (err) {
    console.error("[ML OAuth] Erro fatal no callback:", err);
    return NextResponse.redirect(new URL("/dashboard?error=ml_auth_fatal", req.url));
  }
}
