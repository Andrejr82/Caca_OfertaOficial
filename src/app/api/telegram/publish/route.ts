import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { isCouponOffer, resolveCouponPublishImageUrl } from "@/lib/coupons/presentation";

type TelegramPublishResult = {
  message_id: number;
  date: number;
};

const TELEGRAM_CAPTION_LIMIT = 1024;
const URL_PATTERN = /https?:\/\/\S+/i;

function truncateText(text: string, limit: number) {
  if (limit <= 0) return "";
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, limit);
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

export function sanitizeTelegramCaption(caption: string) {
  const normalized = caption.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= TELEGRAM_CAPTION_LIMIT) {
    return normalized;
  }

  const lines = normalized.split("\n").map((line) => line.trimEnd());
  const linkIndex = lines.findIndex((line) => URL_PATTERN.test(line));

  if (linkIndex === -1) {
    return truncateText(normalized, TELEGRAM_CAPTION_LIMIT);
  }

  const beforeLink = lines.slice(0, linkIndex).filter((line) => line.trim().length > 0);
  const afterLink = lines.slice(linkIndex).filter((line) => line.trim().length > 0);

  const headline = beforeLink[0] || "";
  const supportLines = beforeLink.slice(1, 3);
  const bodyLines = beforeLink.slice(3);
  const descriptiveText = [...supportLines, ...bodyLines].join(" ");
  const fullSuffix = afterLink.join("\n");
  const linkLine = afterLink.find((line) => URL_PATTERN.test(line)) || "";
  const compactSuffix = afterLink
    .filter((line, index) => index === 0 || URL_PATTERN.test(line))
    .join("\n");

  const buildCaption = (
    body: string,
    suffix: string,
    extraSupport: string[] = supportLines,
    customHeadline: string = headline
  ) => [customHeadline, extraSupport.join("\n"), body, suffix]
    .filter((section) => section && section.trim().length > 0)
    .join("\n\n");

  let candidate = buildCaption(bodyLines.join(" "));
  if (candidate.length <= TELEGRAM_CAPTION_LIMIT) {
    return candidate;
  }

  const suffix = fullSuffix.length <= TELEGRAM_CAPTION_LIMIT ? fullSuffix : compactSuffix || linkLine;
  const baseWithoutBody = buildCaption("", suffix, []);
  const remainingForBody = TELEGRAM_CAPTION_LIMIT - baseWithoutBody.length - 2;
  if (remainingForBody > 0) {
    let truncatedBody = truncateText(descriptiveText, remainingForBody);
    candidate = buildCaption(truncatedBody, suffix, []);
    while (candidate.length > TELEGRAM_CAPTION_LIMIT && truncatedBody.length > 0) {
      const overflow = candidate.length - TELEGRAM_CAPTION_LIMIT;
      truncatedBody = truncateText(truncatedBody, Math.max(truncatedBody.length - overflow - 3, 0));
      candidate = buildCaption(truncatedBody, suffix, []);
    }
    if (candidate.length <= TELEGRAM_CAPTION_LIMIT) {
      return candidate;
    }
  }

  const minimalBase = buildCaption("", linkLine, []);
  const remainingForHeadline = TELEGRAM_CAPTION_LIMIT - minimalBase.length - 2;
  return buildCaption("", linkLine, [], truncateText(headline, Math.max(remainingForHeadline, 0)));
}

export async function POST(request: Request) {
  try {
    const { postId, content } = (await request.json()) as { postId?: string; content?: string };
    if (!postId) {
      return NextResponse.json({ ok: false, message: "postId é obrigatório." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    }

    // 1. Carrega o post e a oferta associada
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*, offers(*)")
      .eq("id", postId)
      .neq("status", "deleted")
      .single();

    if (postError || !post) {
      return NextResponse.json({ ok: false, message: "Post não encontrado." }, { status: 404 });
    }

    if (post.channel !== "telegram") {
      return NextResponse.json({ ok: false, message: "Este post não é do canal Telegram." }, { status: 400 });
    }

    const offer = Array.isArray(post.offers) ? post.offers[0] : post.offers;
    if (!offer) {
      return NextResponse.json({ ok: false, message: "Oferta vinculada não encontrada." }, { status: 404 });
    }

    // O usuário pode ter editado o texto na tela antes de aprovar
    const finalContent = content || post.content;

    // Se o conteúdo foi alterado, atualiza primeiro no banco de dados
    if (content && content !== post.content) {
      await supabase
        .from("posts")
        .update({ content: finalContent })
        .eq("id", post.id);
    }

    const imageUrl = isCouponOffer(offer) ? await resolveCouponPublishImageUrl(offer, request) : offer.image_url;

    // 2. Executa a publicação real via Telegram API
    let telegramPost: TelegramPublishResult;
    try {
      if (imageUrl) {
        // Envia foto com a legenda
        const { sendTelegramPhoto } = await import("@/lib/telegram/client");
        telegramPost = await sendTelegramPhoto(sanitizeTelegramCaption(finalContent), imageUrl) as TelegramPublishResult;
      } else {
        // Fallback: só texto
        telegramPost = await sendTelegramMessage(finalContent) as TelegramPublishResult;
      }
    } catch (error: any) {
      console.error("Telegram API Error:", error);
      return NextResponse.json({ ok: false, message: `Erro ao enviar para o Telegram: ${error.message || 'Timeout/Conexão'}` }, { status: 502 });
    }

    // 3. Atualiza o status do post para published
    const now = telegramPost.date ? new Date(telegramPost.date * 1000).toISOString() : new Date().toISOString();
    const { error: postUpdateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        external_id: String(telegramPost.message_id),
        posted_at: now
      })
      .eq("id", post.id);

    if (postUpdateError) {
      return NextResponse.json({ ok: false, message: "Erro ao atualizar status do post." }, { status: 500 });
    }

    // 4. Atualiza o status da oferta para posted
    await supabase
      .from("offers")
      .update({
        status: "posted",
        updated_at: new Date().toISOString()
      })
      .eq("id", offer.id);

    return NextResponse.json({ ok: true, messageId: telegramPost.message_id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha na publicação no Telegram.";
    console.error("Erro ao publicar no Telegram:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
