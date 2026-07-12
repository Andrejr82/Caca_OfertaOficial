import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { isCouponOffer, resolveCouponPublishImageUrl } from "@/lib/coupons/presentation";
import { assertShopeePublishable } from "@/lib/offers/shopee-manual-curation";

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

function normalizeTelegramText(text: string) {
  return text.replace(/\r\n/g, "\n").trim();
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

  const { body, tail } = extractTelegramTail(normalized);
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const headline = lines[0] || "Confira a oferta";
  const bodyText = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();

  if (!tail) {
    const plainCaption = [headline, truncateText(bodyText, TELEGRAM_CAPTION_LIMIT - headline.length - 2)]
      .filter(Boolean)
      .join("\n\n");
    return truncateText(plainCaption, TELEGRAM_CAPTION_LIMIT);
  }

  const tailLines = tail.split("\n").map((line) => line.trim()).filter(Boolean);
  const linkLine = tailLines.find((line) => URL_PATTERN.test(line)) || "";
  const ctaLines = tailLines.filter((line) => line !== linkLine);

  const buildCaption = (description: string, cta: string[]) =>
    [headline, description, linkLine, ...cta].filter(Boolean).join("\n\n");

  let captionText = buildCaption(bodyText, ctaLines);
  if (captionText.length <= TELEGRAM_CAPTION_LIMIT) {
    return captionText;
  }

  const minCaption = buildCaption("", ctaLines);
  const descriptionBudget = TELEGRAM_CAPTION_LIMIT - minCaption.length - (bodyText ? 2 : 0);
  if (descriptionBudget > 0) {
    captionText = buildCaption(truncateText(bodyText, descriptionBudget), ctaLines);
    if (captionText.length <= TELEGRAM_CAPTION_LIMIT) {
      return captionText;
    }
  }

  const compactCta = ctaLines.length > 0 ? [ctaLines[0], ...ctaLines.slice(1)] : [];
  const compactMinCaption = buildCaption("", compactCta);
  const compactBudget = TELEGRAM_CAPTION_LIMIT - compactMinCaption.length - (bodyText ? 2 : 0);
  if (compactBudget > 0) {
    captionText = buildCaption(truncateText(bodyText, compactBudget), compactCta);
    if (captionText.length <= TELEGRAM_CAPTION_LIMIT) {
      return captionText;
    }
  }

  return truncateText(buildCaption("", compactCta), TELEGRAM_CAPTION_LIMIT);
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
    try {
      assertShopeePublishable(offer);
    } catch (error) {
      return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 409 });
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
        const { sendTelegramPhoto } = await import("@/lib/telegram/client");
        telegramPost = await sendTelegramPhoto(sanitizeTelegramCaption(finalContent), imageUrl) as TelegramPublishResult;
      } else {
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
