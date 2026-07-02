import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { isCouponOffer, resolveCouponPublishImageUrl } from "@/lib/coupons/presentation";

type TelegramPublishResult = {
  message_id: number;
  date: number;
};

const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const URL_PATTERN = /https?:\/\/\S+/i;

function truncateText(text: string, limit: number) {
  if (limit <= 0) return "";
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, limit);
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

function normalizeTelegramText(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
}

function splitLongText(text: string, limit: number) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n\n", limit);
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = remaining.lastIndexOf("\n", limit);
    }
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", limit);
    }
    if (splitAt <= 0) {
      splitAt = limit;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks.filter(Boolean);
}

function extractTelegramTail(text: string) {
  const lines = text.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  const linkIndex = lines.findIndex((line) => URL_PATTERN.test(line));
  if (linkIndex === -1) {
    return { body: text, tail: "" };
  }

  return {
    body: lines.slice(0, linkIndex).join("\n").trim(),
    tail: lines.slice(linkIndex).join("\n").trim()
  };
}

export function sanitizeTelegramCaption(caption: string) {
  const normalized = normalizeTelegramText(caption);
  if (normalized.length <= TELEGRAM_CAPTION_LIMIT) {
    return normalized;
  }

  const { body } = extractTelegramTail(normalized);
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const headline = lines[0] || "Confira os detalhes completos na mensagem abaixo.";
  const secondary = lines[1] || "Detalhes completos logo abaixo.";
  const captionText = [headline, secondary].filter(Boolean).join("\n\n");
  return truncateText(captionText, TELEGRAM_CAPTION_LIMIT);
}

export function splitTelegramText(fullText: string) {
  const normalized = normalizeTelegramText(fullText);
  if (normalized.length <= TELEGRAM_MESSAGE_LIMIT) {
    return [normalized];
  }

  const { body, tail } = extractTelegramTail(normalized);
  if (!tail) {
    return splitLongText(normalized, TELEGRAM_MESSAGE_LIMIT);
  }

  const bodyChunks = splitLongText(body, TELEGRAM_MESSAGE_LIMIT);
  const parts = bodyChunks.slice(0, -1);
  const lastBodyChunk = bodyChunks.at(-1) || "";
  const combinedLastPart = [lastBodyChunk, tail].filter(Boolean).join("\n\n").trim();

  if (combinedLastPart.length <= TELEGRAM_MESSAGE_LIMIT) {
    parts.push(combinedLastPart);
    return parts.filter(Boolean);
  }

  if (lastBodyChunk) {
    parts.push(lastBodyChunk);
  }

  const tailChunks = splitLongText(tail, TELEGRAM_MESSAGE_LIMIT);
  if (tailChunks.length > 1) {
    const tailWithoutLast = tailChunks.slice(0, -1);
    const lastTailChunk = tailChunks.at(-1) || "";
    return [...parts, ...tailWithoutLast, lastTailChunk].filter(Boolean);
  }

  return [...parts, ...tailChunks].filter(Boolean);
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
    const fullTextParts = splitTelegramText(finalContent);

    // 2. Executa a publicação real via Telegram API
    let telegramPost: TelegramPublishResult;
    try {
      if (imageUrl) {
        const { sendTelegramPhoto } = await import("@/lib/telegram/client");
        telegramPost = await sendTelegramPhoto(sanitizeTelegramCaption(finalContent), imageUrl) as TelegramPublishResult;
        for (const part of fullTextParts) {
          await sendTelegramMessage(part);
        }
      } else {
        telegramPost = await sendTelegramMessage(fullTextParts[0]) as TelegramPublishResult;
        for (const part of fullTextParts.slice(1)) {
          await sendTelegramMessage(part);
        }
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
