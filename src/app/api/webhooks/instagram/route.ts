import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createTrackedUrl } from "@/lib/tracking/sub-id";

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

import { sendTelegramMessage } from "@/lib/telegram/client";

// O Meta envia os eventos via POST
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Verifica se é um evento do Instagram
    if (body.object === "instagram") {
      // Opcional: Descomente para logar no Telegram que o evento chegou
      // await sendTelegramMessage(`[Webhook] Evento recebido: ${JSON.stringify(body).slice(0, 500)}`).catch(() => {});

      for (const entry of body.entry) {
        const instagramAccountId = entry.id;

        for (const change of entry.changes) {
          if (change.field === "comments") {
            const commentValue = change.value;
            
            // Ignorar respostas do próprio bot/usuário da conta ou deletados
            if (commentValue.from.id === instagramAccountId) continue;

            const commentId = commentValue.id;
            const commentText = commentValue.text ? commentValue.text.toLowerCase() : "";
            const mediaId = commentValue.media.id;

            const triggers = ["quero", "link", "eu quero", "manda"];
            const isTrigger = triggers.some(trigger => commentText.includes(trigger));

            if (isTrigger) {
              await sendTelegramMessage(`[Webhook] Gatilho '${commentText}' detectado no media ${mediaId}. Processando...`).catch(() => {});
              await processCommentReply(commentId, mediaId, instagramAccountId);
            }
          }
        }
      }
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    } else {
      return new NextResponse("Not Found", { status: 404 });
    }
  } catch (error: any) {
    console.error("Erro no Webhook do Instagram:", error);
    await sendTelegramMessage(`[Webhook ERRO CRÍTICO] ${error.message}`).catch(() => {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

async function processCommentReply(commentId: string, mediaId: string, igUserId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Achar o post associado a este mediaId
  // Assumimos que o external_id do post armazena o mediaId do Instagram
  const { data: post } = await supabase
    .from("posts")
    .select("*, offers(*)")
    .eq("channel", "instagram")
    .eq("external_id", mediaId)
    .single();

  if (!post || !post.offers) {
    console.log(`[Webhook] Nenhuma oferta encontrada para o media_id ${mediaId}`);
    await sendTelegramMessage(`[Webhook AVISO] Comentário recebido no media ${mediaId}, mas NÃO ACHOU o post no Banco de Dados!`).catch(() => {});
    return;
  }

  // 2. Gerar a URL Rastreável para este usuário
  // Como não sabemos quem exatamente é o usuário da oferta sem Auth aqui, vamos assumir que
  // o usuário criador do post deve receber o comissionamento.
  // Precisamos buscar o affiliate_link associado a esta oferta e canal.
  const { data: linkRecord } = await supabase
    .from("affiliate_links")
    .select("*")
    .eq("offer_id", post.offers.id)
    .eq("channel", "instagram")
    .single();

  if (!linkRecord) {
    await sendTelegramMessage(`[Webhook AVISO] Post encontrado (${post.id}), mas NÃO ACHOU o Link de Afiliado para o Instagram!`).catch(() => {});
    return;
  }

  const trackingUrl = createTrackedUrl(linkRecord.original_url, linkRecord.sub_id);
  const messageText = `Olá! 👋 Aqui está o link da oferta que você pediu no nosso post:\n\n👉 ${trackingUrl}\n\nAproveite antes que acabe!`;

  // 3. Enviar Private Reply via Graph API
  await sendPrivateReply(igUserId, commentId, messageText);
}

async function sendPrivateReply(igUserId: string, commentId: string, message: string) {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("INSTAGRAM_ACCESS_TOKEN não configurado.");
    await sendTelegramMessage(`[Webhook ERRO] INSTAGRAM_ACCESS_TOKEN não configurado!`).catch(() => {});
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${igUserId}/messages`;
  
  const payload = {
    recipient: {
      comment_id: commentId
    },
    message: {
      text: message
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Falha ao enviar Private Reply:", data);
    await sendTelegramMessage(`[Webhook ERRO] Falha ao enviar a mensagem no Instagram: ${JSON.stringify(data.error?.message || data)}`).catch(() => {});
  } else {
    console.log(`[Webhook] Private Reply enviado com sucesso para comment_id ${commentId}`);
    await sendTelegramMessage(`[Webhook SUCESSO] Link enviado no Direct do Instagram com sucesso! ✅`).catch(() => {});
  }
}
