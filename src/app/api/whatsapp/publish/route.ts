import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCouponOffer, resolveCouponPublishImageUrl } from "@/lib/coupons/presentation";
import { resolveConfiguredWhatsAppTargetId } from "@/lib/integrations/whatsapp/target";
import { logger } from "@/lib/utils/logger";
import { prepareOfferForPublication } from "@/lib/offers/shopee-manual-curation";

function isValidRemoteImageUrl(value: string | null | undefined) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function buildWhatsAppPremiumUrl(request: Request, offerId: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin;

  return new URL(`/api/images/whatsapp-premium?offerId=${encodeURIComponent(offerId)}`, baseUrl).toString();
}

async function resolveWhatsAppImageUrl(
  offer: any,
  request: Request,
  originalImageUrl: string | null | undefined
) {
  const fallbackImageUrl = String(originalImageUrl || "").trim() || null;
  if (!offer?.id || !isValidRemoteImageUrl(offer?.image_url) || !fallbackImageUrl) {
    return fallbackImageUrl;
  }

  const premiumImageUrl = buildWhatsAppPremiumUrl(request, offer.id);

  try {
    const response = await fetch(premiumImageUrl, {
      method: "HEAD",
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || contentType !== "image/jpeg") {
      throw new Error(`PREMIUM_HEAD_INVALID_${response.status}_${contentType || "unknown"}`);
    }

    logger.info("Imagem premium validada para WhatsApp Grupo", {
      event: "whatsapp_publish_premium_image_validated",
      offerId: offer.id,
      premiumImageUrl,
      bytes: Number(response.headers.get("content-length") || 0) || null,
      width: response.headers.get("x-whatsapp-premium-width") || null,
      height: response.headers.get("x-whatsapp-premium-height") || null
    });

    return premiumImageUrl;
  } catch (error) {
    logger.warn("Fallback para imagem original no WhatsApp", {
      event: "whatsapp_publish_premium_image_fallback",
      offerId: offer?.id || null,
      error: error instanceof Error ? error.message : String(error)
    });
    return fallbackImageUrl;
  }
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

    if (post.channel !== "whatsapp") {
      return NextResponse.json({ ok: false, message: "Este post não é do canal WhatsApp." }, { status: 400 });
    }

    let offer = Array.isArray(post.offers) ? post.offers[0] : post.offers;
    if (!offer) {
      return NextResponse.json({ ok: false, message: "Oferta vinculada não encontrada." }, { status: 404 });
    }
    try {
      offer = await prepareOfferForPublication(offer, async (pendingOffer) => {
        const { error: selectionError } = await supabase
          .from("offers")
          .update({ status: "selected", updated_at: new Date().toISOString() })
          .eq("id", pendingOffer.id)
          .eq("user_id", user.id)
          .eq("platform", pendingOffer.platform)
          .eq("status", "pending_manual_review");
        if (selectionError) throw new Error(selectionError.message);

        const { data: persistedOffer, error: confirmationError } = await supabase
          .from("offers")
          .select("*")
          .eq("id", pendingOffer.id)
          .eq("user_id", user.id)
          .eq("platform", pendingOffer.platform)
          .single();
        if (confirmationError || !persistedOffer) {
          throw new Error(confirmationError?.message || "Não foi possível confirmar selected.");
        }
        return persistedOffer;
      });
    } catch (error) {
      return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 409 });
    }

    const baseImageUrl = isCouponOffer(offer) ? await resolveCouponPublishImageUrl(offer, request) : offer.image_url;
    const imageUrl = await resolveWhatsAppImageUrl(offer, request, baseImageUrl);

    // O usuário pode ter editado o texto na tela antes de aprovar
    const finalContent = content || post.content;

    logger.info("Início da publicação WhatsApp", {
      event: "whatsapp_publish_start",
      offerId: offer.id,
      postId: post.id,
      productId: offer.product_id || null,
      hasImage: Boolean(imageUrl)
    });

    // Se o conteúdo foi alterado, atualiza primeiro no banco de dados
    if (content && content !== post.content) {
      await supabase
        .from("posts")
        .update({ content: finalContent })
        .eq("id", post.id);
    }

    // 2. Executa a publicação real via WhatsApp API
    const targetId = resolveConfiguredWhatsAppTargetId();
    if (!targetId) {
      return NextResponse.json({ ok: false, message: "WHATSAPP_TARGET_ID não configurado no ambiente." }, { status: 500 });
    }

    const { whatsappService } = await import("@/lib/integrations/whatsapp");
    let whatsappResult;
    try {
      logger.info("Enviando payload para WhatsApp Engine", {
        event: "whatsapp_publish_engine_send",
        postId,
        offerId: offer.id,
        targetId,
        hasImage: Boolean(imageUrl)
      });

      whatsappResult = await whatsappService.sendMedia(targetId, finalContent, imageUrl);
    } catch (error: any) {
      logger.error("Erro na integração WhatsApp", error, {
        event: "whatsapp_publish_engine_failed",
        postId,
        offerId: offer.id,
        targetId
      });
      try {
        await supabase.from("integration_logs").insert({
          user_id: user.id,
          integration: "WhatsApp",
          action: "Publicar",
          status: "error",
          message: `Falha ao enviar para o alvo ${targetId}`,
          metadata: {
            postId,
            offerId: offer.id,
            targetId,
            engineUrl: process.env.WHATSAPP_ENGINE_URL || null,
            error: error.message
          }
        });
      } catch (logError) {
        logger.warn("Falha ao registrar erro de integração WhatsApp", {
          event: "whatsapp_publish_error_log_failed",
          postId,
          offerId: offer.id,
          error: logError instanceof Error ? logError.message : String(logError)
        });
      }
      return NextResponse.json({ ok: false, message: `Erro ao enviar via WhatsApp: ${error.message}` }, { status: 502 });
    }

    const externalId = whatsappResult.messageId || `wa-${Date.now()}`;
    try {
      await supabase.from("integration_logs").insert({
        user_id: user.id,
        integration: "WhatsApp",
        action: "Publicar",
        status: "success",
        message: `Disparo aceito pelo motor WhatsApp para o alvo ${targetId}`,
        metadata: {
          postId,
          offerId: offer.id,
          targetId,
          externalId,
          engineUrl: process.env.WHATSAPP_ENGINE_URL || null,
          engine: whatsappResult.engine || null
        }
      });
    } catch (logError) {
      logger.warn("Falha ao registrar sucesso de integração WhatsApp", {
        event: "whatsapp_publish_success_log_failed",
        postId,
        offerId: offer.id,
        externalId,
        error: logError instanceof Error ? logError.message : String(logError)
      });
    }

    // 3. Atualiza o status do post para published
    const now = new Date().toISOString();
    const { error: postUpdateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        external_id: externalId,
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

    return NextResponse.json({ ok: true, externalId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha na publicação no WhatsApp.";
    logger.error("Erro ao publicar no WhatsApp", error, { event: "whatsapp_publish_failed" });
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
