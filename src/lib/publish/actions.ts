"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import { fetchLinkMetadata } from "@/lib/publish/scraper";
import { evaluateQualityGate } from "@/lib/publish/quality-gate";
import { logger } from "@/lib/utils/logger";
import type { Channel, Offer } from "@/types/domain";
import { curateOfferScore } from "@/lib/offers/curation-engine";
import {
  canonicalizeOfferUrl,
  normalizeProductTitle,
  validateOfferForPersistence,
  type StrongOfferValidationResult
} from "@/core/scraper/product-validator";

interface QuickPostResult {
  ok: boolean;
  message: string;
  status?: string;
  offerId?: string;
  offer?: Offer;
  trackedUrl?: string;
  copy?: string;
  copies?: { telegram: string; whatsapp: string; instagram: string };
}

async function findDuplicateOffer(
  supabase: any,
  userId: string,
  validation: StrongOfferValidationResult
): Promise<string | null> {
  const { data } = await supabase
    .from("offers")
    .select("id, platform, product_name, current_price, original_url")
    .eq("user_id", userId)
    .eq("platform", validation.platform)
    .limit(1000);

  const same = (data || []).find((offer: any) => {
    const canonicalUrl = canonicalizeOfferUrl(offer.original_url);
    const normalizedTitle = normalizeProductTitle(offer.product_name || "");
    const samePrice = Number(offer.current_price) === Number(validation.price);

    return (
      canonicalUrl === validation.canonicalUrl ||
      (normalizedTitle === validation.normalizedTitle && samePrice)
    );
  });

  return same?.id || null;
}

export async function generateQuickPostAction(affiliateUrl: string, channel: Channel): Promise<QuickPostResult> {
  void channel;
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
  const metadata = await fetchLinkMetadata(affiliateUrl, userId);
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

  const offerValidation = validateOfferForPersistence({
    product_name: metadata.title,
    platform: metadata.platform,
    original_url: metadata.finalUrl || affiliateUrl,
    image_url: metadata.imageUrl,
    current_price: metadata.price,
  });

  const isCollection = qualityGate.classification === "STORE_PAGE" || 
                       qualityGate.classification === "CATEGORY_PAGE" || 
                       qualityGate.classification === "SOCIAL_PAGE";

  if (!offerValidation.valid) {
    if (isCollection && offerValidation.rejectReason === "PRECO_INVALIDO") {
      offerValidation.valid = true;
      offerValidation.platform = metadata.platform;
      offerValidation.price = metadata.price || 0;
    } else {
      return {
        ok: false,
        status: "REJECTED",
        message: `Oferta rejeitada: ${offerValidation.rejectReason}`
      };
    }
  }

  const duplicateOfferId = await findDuplicateOffer(supabase, userId, offerValidation);
  if (duplicateOfferId) {
    return {
      ok: false,
      status: "REJECTED",
      message: `Oferta duplicada bloqueada antes da gravação: ${duplicateOfferId}`
    };
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
      platform: offerValidation.platform,
      product_name: metadata.title,
      original_url: offerValidation.canonicalUrl,
      image_url: metadata.imageUrl,
      current_price: offerValidation.price,
      status: "pending_manual_review",
      score: curation.score,
      official_policy: curation.official_policy,
      historical_policy: curation.historical_policy,
      explainability: curation.explainability,
    })
    .select()
    .single<Offer>();

  if (offerError || !newOffer) {
    return { ok: false, message: "Erro ao criar oferta avulsa: " + offerError?.message };
  }

  return {
    ok: false,
    status: "PENDING_MANUAL_REVIEW",
    offerId: newOffer.id,
    message: "Oferta ingerida em pending_manual_review. Selecione-a na Curadoria antes de gerar posts."
  };
}

export async function publishToTelegramAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: "Use um post draft aprovado pela rota oficial /api/telegram/publish." };
}

export async function publishToInstagramAction(caption: string, imageUrl: string, offerId?: string) {
  void caption;
  void imageUrl;
  void offerId;
  return { ok: false, message: "Use um post draft aprovado pela rota oficial /api/instagram/publish." };
}

export async function publishToWhatsAppAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: "Use um post draft aprovado pela rota oficial /api/whatsapp/publish." };
}

