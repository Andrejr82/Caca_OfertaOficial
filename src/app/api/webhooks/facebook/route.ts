import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/client";

export const dynamic = 'force-dynamic';

// O Meta envia um desafio GET para confirmar a URL do Webhook
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK_VERIFIED");
    return new NextResponse(challenge, { status: 200 });
  } else {
    return new NextResponse("Forbidden", { status: 403 });
  }
}

// O Meta envia os eventos via POST
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Verifica se é um evento de Página do Facebook
    if (body.object === "page") {
      // Log de debug
      await sendTelegramMessage(`[FB Webhook] Evento page recebido.`).catch(() => {});

      for (const entry of body.entry) {
        if (!entry.changes) continue;

        for (const change of entry.changes) {
          // O campo 'feed' recebe notificações sobre posts, fotos e vídeos publicados
          if (change.field === "feed") {
            const value = change.value;

            // Filtramos apenas novos itens adicionados que tenham post_id ou video_id
            if (value.verb === "add" && (value.item === "video" || value.item === "status" || value.item === "photo")) {
              const postId = value.post_id || value.video_id;
              
              if (!postId) {
                await sendTelegramMessage(`[FB Webhook] Recebido 'add' sem ID.`).catch(() => {});
                continue;
              }

              await sendTelegramMessage(`[FB Webhook] 🎬 Mídia publicada na Meta! ID: ${postId}. Processando comentário...`).catch(() => {});
              
              // O processamento assíncrono continua sem travar a resposta da Meta
              processFacebookComment(postId);
            }
          }
        }
      }
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    } else {
      return new NextResponse("Not Found", { status: 404 });
    }
  } catch (error: any) {
    console.error("Erro no Webhook do Facebook:", error);
    await sendTelegramMessage(`[FB Webhook ERRO CRÍTICO] ${error.message}`).catch(() => {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

async function processFacebookComment(facebookPostId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // O facebookPostId da Meta (post_id) normalmente vem no formato PAGEID_POSTID.
  // Nosso script de publicação às vezes salva apenas o POSTID. 
  // Vamos buscar via 'like' para garantir que achamos.
  const shortId = facebookPostId.split('_').pop() || facebookPostId;

  const { data: post } = await supabase
    .from("posts")
    .select("*, affiliate_links(*)")
    .eq("channel", "facebook")
    .like("external_id", `%${shortId}%`)
    .single();

  if (!post || !post.affiliate_links) {
    console.log(`[FB Webhook] Nenhum post no BD com external_id contendo ${shortId}`);
    return; // Pode ser um post orgânico que o usuário fez manualmente
  }

  // Verifica se o array de affiliate_links tem item válido, ou se é objeto direto
  const trackedUrl = Array.isArray(post.affiliate_links) 
    ? post.affiliate_links[0]?.tracked_url 
    : (post.affiliate_links as any)?.tracked_url;

  if (!trackedUrl) {
    await sendTelegramMessage(`[FB Webhook AVISO] Post encontrado (${post.id}), mas sem tracked_url!`).catch(() => {});
    return;
  }

  const messageText = `🛒 Compre aqui: ${trackedUrl}`;
  await sendCommentToFacebook(facebookPostId, messageText);
}

async function sendCommentToFacebook(postId: string, message: string) {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!accessToken) {
    await sendTelegramMessage(`[FB Webhook ERRO] FACEBOOK_ACCESS_TOKEN não configurado!`).catch(() => {});
    return;
  }

  const url = `https://graph.facebook.com/v19.0/${postId}/comments`;
  const payload = {
    message: message,
    access_token: accessToken
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Falha ao enviar comentário via Webhook:", data);
    await sendTelegramMessage(`[FB Webhook ERRO] Falha ao enviar comentário no FB: ${JSON.stringify(data.error?.message || data)}`).catch(() => {});
  } else {
    console.log(`[FB Webhook] Comentário enviado com sucesso para ${postId}`);
    await sendTelegramMessage(`[FB Webhook SUCESSO] Comentário fixado no Facebook com o link de afiliado! ✅`).catch(() => {});
  }
}
