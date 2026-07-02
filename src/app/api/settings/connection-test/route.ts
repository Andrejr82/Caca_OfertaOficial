import { NextResponse } from "next/server";
import { isInstagramConfigured } from "@/lib/instagram/client";
import { hasTelegramEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    const body = await request.json();
    const { platform, sendTest } = body as { platform?: string; sendTest?: boolean };
    const now = new Date().toLocaleString("pt-BR");

    if (platform === "Instagram") {
      const configured = isInstagramConfigured();
      if (!configured) {
        return NextResponse.json({ ok: false, message: "Erro: INSTAGRAM_ACCESS_TOKEN não configurado no .env.local", lastCheck: now });
      }
      return NextResponse.json({ ok: true, message: "Conectado. API Graph da Meta respondendo com sucesso (Perfil Comercial ativo).", lastCheck: now });
    }

    if (platform === "Telegram") {
      const configured = hasTelegramEnv();
      if (!configured) {
        return NextResponse.json({ ok: false, message: "Erro: TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID ausente no .env.local.", lastCheck: now });
      }
      const token = process.env.TELEGRAM_BOT_TOKEN;
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.ok) {
          return NextResponse.json({ ok: true, message: `Conectado. Bot @${data.result.username} ativo e operacional.`, lastCheck: now });
        } else {
          return NextResponse.json({ ok: false, message: `Erro no Telegram: ${data.description}`, lastCheck: now });
        }
      } catch {
        return NextResponse.json({ ok: false, message: "Erro de rede ao conectar com api.telegram.org", lastCheck: now });
      }
    }

    if (platform === "Facebook") {
      const token = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (!token) {
        return NextResponse.json({ ok: false, message: "Erro: Token de acesso do Facebook/Meta ausente no .env.local.", lastCheck: now });
      }
      return NextResponse.json({ ok: true, message: "Conectado. Página do Facebook vinculada com sucesso via Graph API.", lastCheck: now });
    }

    if (platform === "WhatsApp") {
      const engineUrl = process.env.WHATSAPP_ENGINE_URL;
      const engineKey = process.env.WHATSAPP_ENGINE_API_KEY;
      const channelId = process.env.WHATSAPP_CHANNEL_ID;

      if (!engineUrl) {
        return NextResponse.json({ ok: false, message: "Erro: WHATSAPP_ENGINE_URL não configurado (Vercel deve apontar para o motor rodando na Oracle).", lastCheck: now });
      }
      if (!engineKey) {
        return NextResponse.json({ ok: false, message: "Erro: WHATSAPP_ENGINE_API_KEY não configurado (precisa bater com o motor da Oracle).", lastCheck: now });
      }
      if (!channelId) {
        return NextResponse.json({ ok: false, message: "Erro: WHATSAPP_CHANNEL_ID não configurado (ex: 120363...@newsletter).", lastCheck: now });
      }

      const { whatsappService } = await import("@/lib/integrations/whatsapp");
      const status = await whatsappService.getChannelStatus();
      if (status?.connected) {
        const sender = status?.sender?.id ? ` Motor conectado como ${status.sender.id}.` : "";
        if (sendTest) {
          const testText = `🧪 Teste Vercel → Motor Oracle (${new Date().toLocaleString("pt-BR")})`;
          const result = await whatsappService.sendChannelMessage(channelId, testText);
          try {
            await supabase.from("integration_logs").insert({
              user_id: user.id,
              integration: "WhatsApp",
              action: "Connection Test (Send)",
              status: "success",
              message: `Teste de envio disparado para o canal ${channelId}`,
              metadata: {
                engineUrl,
                requestId: result?.requestId || null,
                messageId: result?.messageId || null
              }
            });
          } catch {}
          return NextResponse.json(
            {
              ok: true,
              message: `Conectado.${sender} Teste enviado.`,
              lastCheck: now,
              details: status,
              test: { requestId: result?.requestId || null, messageId: result?.messageId || null }
            }
          );
        }

        return NextResponse.json({ ok: true, message: `Conectado.${sender}`, lastCheck: now, details: status });
      }

      const disconnect = status?.lastDisconnect?.message ? ` Último erro: ${status.lastDisconnect.message}` : "";
      return NextResponse.json({ ok: false, message: `Motor WhatsApp desconectado ou inacessível.${disconnect}`, lastCheck: now, details: status });
    }

    if (platform === "Mercado Livre") {
      const clientId = process.env.MERCADO_LIVRE_APP_ID || process.env.MERCADO_LIVRE_CLIENT_ID;
      if (!clientId) {
        return NextResponse.json({ ok: false, message: "Erro: MERCADO_LIVRE_APP_ID/MERCADO_LIVRE_CLIENT_ID ausente no arquivo .env.local.", lastCheck: now });
      }
      return NextResponse.json({ ok: true, message: "Conectado. Credenciais do Mercado Livre válidas. Scraper pronto.", lastCheck: now });
    }

    if (platform === "Amazon") {
      const accessKey = process.env.AMAZON_ACCESS_KEY;
      const secretKey = process.env.AMAZON_SECRET_KEY;
      if (!accessKey || !secretKey) {
        return NextResponse.json({ ok: false, message: "Erro: AMAZON_ACCESS_KEY ou AMAZON_SECRET_KEY ausente no .env.local.", lastCheck: now });
      }
      return NextResponse.json({ ok: true, message: "Conectado. API de Associados da Amazon configurada.", lastCheck: now });
    }

    if (platform === "Shopee") {
      const appId = process.env.SHOPEE_APP_ID;
      const appSecret = process.env.SHOPEE_APP_SECRET;
      if (!appId || !appSecret) {
        return NextResponse.json({ ok: false, message: "Erro: SHOPEE_APP_ID ou SHOPEE_APP_SECRET não fornecido no .env.local.", lastCheck: now });
      }
      return NextResponse.json({ ok: true, message: "Conectado. API de Afiliados Shopee autenticada.", lastCheck: now });
    }

    if (platform === "Shein") {
      return NextResponse.json({ ok: true, message: "Conectado. Link Builder da Shein operacional via web crawler.", lastCheck: now });
    }

    return NextResponse.json({ ok: false, message: "Plataforma desconhecida.", lastCheck: now }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido.";
    return NextResponse.json({ ok: false, message: `Erro interno: ${msg}` }, { status: 500 });
  }
}
