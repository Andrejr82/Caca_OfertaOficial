"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { fetchLinkMetadata } from "@/lib/publish/scraper";
import { evaluateQualityGate } from "@/lib/publish/quality-gate";
import { logger } from "@/lib/utils/logger";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import type { Channel, Offer } from "@/types/domain";
import { curateOfferScore } from "@/lib/offers/curation-engine";

export async function generateQuickPostAction(affiliateUrl: string, channel: Channel) {
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();

  if (!supabase || !userId) {
    return { ok: false, message: "Usuário não autenticado." };
  }

  if (!affiliateUrl) {
    return { ok: false, message: "O link de afiliado é obrigatório." };
  }

  // 1. Scraping do link
  const startScrapeTime = Date.now();
  const metadata = await fetchLinkMetadata(affiliateUrl);
  const processingTimeMs = Date.now() - startScrapeTime;

  // Quality Gate Avaliação Flexível
  const qualityGate = evaluateQualityGate(metadata);

  // Observabilidade Estruturada
  logger.info("Processamento de Link Finalizado", {
    event: "LINK_PROCESSED",
    originalUrl: affiliateUrl,
    finalUrl: metadata.finalUrl,
    marketplace: metadata.platform,
    pageType: qualityGate.classification,
    imageFound: !!metadata.imageUrl,
    imageSource: metadata.imageSource || "none",
    priceFound: !!metadata.price && metadata.price > 0,
    qualityGateResult: qualityGate.status,
    rejectionReason: qualityGate.reason || "none",
    processingTimeMs
  });

  if (qualityGate.status === "REJECTED") {
    return { 
      ok: false, 
      status: "REJECTED", 
      message: `Publicação Rejeitada (Quality Gate). Motivo: ${qualityGate.reason}` 
    };
  }

  // Preenchimento de Segurança se a Vercel for bloqueada de raspar
  if (!metadata.title || metadata.title === "Oferta Especial" || metadata.title.length < 5) {
    metadata.title = "Oferta Imperdível Encontrada!";
  }
  if (!metadata.platform || metadata.platform === "Outro") {
    metadata.platform = "Link Externo" as any;
  }

  // Processamento do Score pelo Curation Engine
  const curation = curateOfferScore({
    current_price: metadata.price || 0,
    category: "Geral" // fallback até extrairmos categoria rica
  });

  // 2. Criar Oferta na base
  const { data: newOffer, error: offerError } = await supabase
    .from("offers")
    .insert({
      user_id: userId,
      platform: metadata.platform,
      product_name: metadata.title,
      original_url: affiliateUrl,
      image_url: metadata.imageUrl || null,
      current_price: metadata.price || 0,
      status: "approved",
      score: curation.score,
      legacy_score: curation.legacy_score,
      new_score: curation.new_score,
      explainability: curation.explainability,
    })
    .select()
    .single<Offer>();

  if (offerError || !newOffer) {
    return { ok: false, message: "Erro ao criar oferta avulsa: " + offerError?.message };
  }

  // 3. Criar Links Rastreados (Para a IA ter acesso aos 3 canais se precisar)
  // Mas para o disparo rápido, priorizamos o canal escolhido.
  // Vamos criar um link para o canal principal.
  const utmSource = channel;
  const utmMedium = "social";
  const utmCampaign = "caca_oferta_express";
  
  const subId = createSubId(channel, newOffer.product_name, newOffer.id);
  const trackedUrl = createTrackedUrl(affiliateUrl, subId, utmSource, utmMedium, utmCampaign);

  const { error: linkError } = await supabase.from("affiliate_links").upsert(
    {
      user_id: userId,
      offer_id: newOffer.id,
      channel,
      original_url: affiliateUrl,
      tracked_url: trackedUrl,
      sub_id: subId
    },
    { onConflict: "offer_id,channel" }
  );

  if (linkError) {
    return { ok: false, message: "Erro ao criar tracking: " + linkError.message };
  }

  // Vamos montar os links falsos/reais para a IA. 
  // Na Publish Express, queremos o post especificamente para 1 canal ou pra todos? 
  // O ideal é a IA gerar pra todos, pois ela já retorna o JSON completo.
  const aiLinks = {
    telegram: channel === "telegram" ? trackedUrl : createTrackedUrl(affiliateUrl, createSubId("telegram", newOffer.product_name, newOffer.id), "telegram", utmMedium, utmCampaign),
    instagram: channel === "instagram" ? trackedUrl : createTrackedUrl(affiliateUrl, createSubId("instagram", newOffer.product_name, newOffer.id), "instagram", utmMedium, utmCampaign),
    whatsapp: channel === "whatsapp" ? trackedUrl : createTrackedUrl(affiliateUrl, createSubId("whatsapp", newOffer.product_name, newOffer.id), "whatsapp", utmMedium, utmCampaign),
  };

  // 4. Invocar a IA (Groq / Gemini via fallback ou integração)
  const aiResult = await generateOfferAnalysis(newOffer, aiLinks);

  // 5. Retornar os dados prontos
  return {
    ok: true,
    offer: newOffer,
    trackedUrl,
    copy: channel === "telegram" ? aiResult.telegram 
        : channel === "whatsapp" ? aiResult.whatsapp 
        : aiResult.instagram_feed // Para instagram pegamos o feed por padrão
  };
}

export async function publishToTelegramAction(text: string, imageUrl?: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();

  if (!supabase || !userId) {
    return { ok: false, message: "Usuário não autenticado." };
  }

  try {
    const { sendTelegramMessage, sendTelegramPhoto } = await import("@/lib/telegram/client");
    if (imageUrl) {
      await sendTelegramPhoto(text, imageUrl);
    } else {
      await sendTelegramMessage(text);
    }
    return { ok: true, message: "Publicado com sucesso no Telegram!" };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { ok: false, message: error.message || "Erro ao publicar no Telegram." };
    }
    return { ok: false, message: "Erro desconhecido ao publicar no Telegram." };
  }
}

export async function publishToInstagramAction(caption: string, imageUrl: string, offerId?: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();

  if (!supabase || !userId) {
    return { ok: false, message: "Usuário não autenticado." };
  }

  if (!imageUrl) {
    return { ok: false, message: "O Instagram exige uma imagem para publicar no Feed. Esse link não tinha uma imagem extraída." };
  }

  try {
    const { publishToInstagram, isInstagramConfigured, testInstagramConnection } = await import("@/lib/instagram/client");
    
    // Pré-check: Token existe?
    if (!isInstagramConfigured()) {
      return { ok: false, message: "INSTAGRAM_ACCESS_TOKEN não está configurado. Vá em Configurações e adicione o token da Meta Graph API." };
    }

    // Pré-check: Conexão válida?
    console.log("[PublishAction] Verificando conexão com Instagram...");
    const connTest = await testInstagramConnection();
    if (!connTest.ok) {
      return { ok: false, message: `Instagram desconectado: ${connTest.message}. Verifique se o token da Meta Graph API não expirou.` };
    }

    console.log("[PublishAction] Conexão OK. Publicando...");
    const postId = await publishToInstagram(imageUrl, caption);

    if (offerId) {
      await supabase.from("posts").insert({
        offer_id: offerId,
        user_id: userId,
        channel: "instagram",
        content: caption,
        status: "published",
        external_id: postId,
        posted_at: new Date().toISOString()
      });
    }

    return { ok: true, message: `Publicado com sucesso no Instagram! (Post ID: ${postId})` };
  } catch (error: unknown) {
    console.error("[PublishAction] Erro ao publicar no Instagram:", error);
    if (error instanceof Error) {
      return { ok: false, message: error.message || "Erro ao publicar no Instagram." };
    }
    return { ok: false, message: "Erro desconhecido ao publicar no Instagram." };
  }
}

export async function publishToWhatsAppAction(text: string, imageUrl?: string) {
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();

  if (!supabase || !userId) {
    return { ok: false, message: "Usuário não autenticado." };
  }

  const channelId = process.env.WHATSAPP_CHANNEL_ID;
  if (!channelId) {
    return { 
      ok: false, 
      message: "WHATSAPP_CHANNEL_ID não está configurado no .env.local. Coloque o ID do seu canal (ex: 120363...00@newsletter)." 
    };
  }

  try {
    const { whatsappService } = await import("@/lib/integrations/whatsapp");
    const result = await whatsappService.sendChannelMedia(channelId, text, imageUrl);

    return { ok: true, message: "Publicado com sucesso no WhatsApp via Baileys Local!" };
  } catch (error: unknown) {
    console.error("[PublishAction] Erro ao conectar com o Motor WhatsApp Local:", error);
    return { 
      ok: false, 
      message: "Erro ao comunicar com o motor local. Verifique se você rodou 'npm run whatsapp' em outro terminal." 
    };
  }
}

