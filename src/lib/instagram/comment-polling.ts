import { createClient } from "@supabase/supabase-js";
import { createTrackedUrl } from "@/lib/tracking/sub-id";
import { sendTelegramMessage } from "@/lib/telegram/client";

const GRAPH_API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const TRIGGERS = ["quero", "link", "eu quero", "manda", "comprar"];

interface CommentData {
  id: string;
  text: string;
  from: { id: string; username?: string };
  timestamp: string;
}

/**
 * Busca o Instagram Business Account ID via Facebook Page
 */
async function getIgBusinessId(token: string): Promise<string | null> {
  // Usar cache da env se disponível
  if (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    return process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  }

  const res = await fetch(`${BASE_URL}/me/accounts?access_token=${token}`);
  const data = await res.json();
  const page = data.data?.[0];
  if (!page) return null;

  const igRes = await fetch(`${BASE_URL}/${page.id}?fields=instagram_business_account&access_token=${token}`);
  const igData = await igRes.json();
  return igData.instagram_business_account?.id || null;
}

/**
 * Busca comentários de um media ID via Graph API
 */
async function fetchComments(mediaId: string, token: string): Promise<CommentData[]> {
  const res = await fetch(
    `${BASE_URL}/${mediaId}/comments?fields=id,text,from{id,username},timestamp&limit=50&access_token=${token}`
  );
  const data = await res.json();
  if (data.error) {
    // Post pode ter sido deletado ou ser inválido
    console.log(`[Polling] Erro ao buscar comments do media ${mediaId}: ${data.error.message}`);
    return [];
  }
  return data.data || [];
}

/**
 * Envia Private Reply via Instagram Messaging API
 */
async function sendPrivateReply(igBusinessId: string, commentId: string, message: string, token: string): Promise<boolean> {
  const url = `${BASE_URL}/${igBusinessId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("[Polling] Falha no Private Reply:", data);
    await sendTelegramMessage(`[Polling ERRO] Private Reply falhou para comment ${commentId}: ${JSON.stringify(data.error?.message || data)}`).catch(() => {});
    return false;
  }

  console.log(`[Polling] Private Reply enviado: comment_id=${commentId}`);
  return true;
}

/**
 * Executa o polling de comentários e envia DMs para comentários com gatilhos.
 * Retorna o número de DMs enviadas com sucesso.
 */
export async function pollAndReplyComments(): Promise<{ processed: number; errors: number; skipped: number }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token || !supabaseUrl || !supabaseServiceKey) {
    console.log("[Polling] Variáveis de ambiente faltando.");
    return { processed: 0, errors: 0, skipped: 0 };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Buscar IG Business Account ID
  const igBusinessId = await getIgBusinessId(token);
  if (!igBusinessId) {
    console.log("[Polling] Não foi possível descobrir IG Business Account.");
    return { processed: 0, errors: 0, skipped: 0 };
  }

  // 2. Buscar posts publicados com external_id (apenas os últimos 50 para evitar Vercel Timeout)
  const { data: posts } = await supabase
    .from("posts")
    .select("id, external_id, offer_id, user_id")
    .eq("channel", "instagram")
    .eq("status", "published")
    .not("external_id", "is", null)
    .order("posted_at", { ascending: false })
    .limit(50);

  if (!posts || posts.length === 0) {
    return { processed: 0, errors: 0, skipped: 0 };
  }

  let processed = 0;
  let errors = 0;
  let skipped = 0;

  for (const post of posts) {
    const mediaId = post.external_id;
    if (!mediaId) continue;

    // 3. Buscar comentários deste post
    const comments = await fetchComments(mediaId, token);

    for (const comment of comments) {
      const text = (comment.text || "").toLowerCase();
      const fromId = comment.from?.id;
      const fromUsername = comment.from?.username || "unknown";

      // Ignorar comentários do próprio perfil
      if (fromId === igBusinessId) continue;

      // Verificar se é um gatilho
      const isTrigger = TRIGGERS.some(t => text.includes(t));
      if (!isTrigger) continue;

      // 4. Verificar se já foi processado (evitar duplicatas)
      const { data: existingLog } = await supabase
        .from("integration_logs")
        .select("id")
        .eq("integration", "instagram_comment_reply")
        .eq("action", comment.id)
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        skipped++;
        continue;
      }

      // 5. Buscar affiliate_link para este post
      const { data: linkRecord } = await supabase
        .from("affiliate_links")
        .select("*")
        .eq("offer_id", post.offer_id)
        .eq("channel", "instagram")
        .single();

      if (!linkRecord) {
        await sendTelegramMessage(`[Polling AVISO] Gatilho "${text}" por @${fromUsername} no media ${mediaId}, mas NÃO ACHOU o Link de Afiliado!`).catch(() => {});
        
        // Registrar como erro para não tentar novamente
        await supabase.from("integration_logs").insert({
          user_id: post.user_id,
          integration: "instagram_comment_reply",
          action: comment.id,
          status: "error",
          message: "Affiliate link não encontrado",
          metadata: { media_id: mediaId, from: fromUsername, text }
        });
        
        errors++;
        continue;
      }

      // 6. Gerar mensagem e enviar Private Reply
      const trackingUrl = createTrackedUrl(linkRecord.original_url, linkRecord.sub_id);
      const messageText = `Olá! 👋 Aqui está o link da oferta que você pediu no nosso post:\n\n👉 ${trackingUrl}\n\nAproveite antes que acabe!`;

      const success = await sendPrivateReply(igBusinessId, comment.id, messageText, token);

      // 7. Registrar no integration_logs (sucesso ou falha)
      const userId = post.user_id;
      await supabase.from("integration_logs").insert({
        user_id: userId,
        integration: "instagram_comment_reply",
        action: comment.id,
        status: success ? "success" : "error",
        message: success
          ? `Private Reply enviado para @${fromUsername}`
          : `Falha ao enviar Private Reply para @${fromUsername}`,
        metadata: {
          media_id: mediaId,
          comment_text: text,
          from_username: fromUsername,
          from_id: fromId,
          tracking_url: trackingUrl
        }
      });

      if (success) {
        processed++;
        await sendTelegramMessage(`[Polling ✅] Link enviado via DM para @${fromUsername} que comentou "${text}"!`).catch(() => {});
      } else {
        errors++;
      }
    }
  }

  if (processed > 0 || errors > 0) {
    await sendTelegramMessage(`[Polling] Ciclo concluído: ${processed} DMs enviadas, ${errors} erros, ${skipped} já processados.`).catch(() => {});
  }

  return { processed, errors, skipped };
}
