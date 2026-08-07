"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCommercialQueue } from "@/lib/offers/commercial-curation-queue";
import { validateCommercialDraftRequest } from "@/lib/offers/commercial-draft-validation";
import type { CommercialDraftChannel } from "@/lib/offers/commercial-draft-validation";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";

const CRITICAL_RISKS = new Set(["regulated_or_sensitive", "security_camera_manual", "electronics_high_ticket_manual", "large_or_freight_sensitive_manual"]);

function resolveLegacyChannel(channel: CommercialDraftChannel): "telegram" | "whatsapp" | null {
  if (channel === "telegram") return "telegram";
  if (channel === "manual_whatsapp") return "whatsapp";
  return null;
}

function materializeCommercialDraftContent(rawContent: string, trackedUrl: string) {
  const copy = rawContent.trimEnd();
  const urls = copy.match(/https?:\/\/\S+/g) ?? [];
  if (urls.length > 0) {
    return copy.replace(/https?:\/\/\S+/g, trackedUrl).trimEnd();
  }
  return `${copy}\n\n👉 ${trackedUrl}`;
}

export async function createCommercialCurationDraft(input: { offerId?: string; selectedChannel?: string; confirmCriticalRisk?: boolean }) {
  const validation = validateCommercialDraftRequest(input);
  if (!validation.ok) return validation;
  const legacyChannel = resolveLegacyChannel(validation.selectedChannel);
  if (!legacyChannel) {
    return {
      ok: false as const,
      code: validation.selectedChannel === "reels_manual" ? "REELS_USE_VIDEO_FLOW" : "CHANNEL_USES_LEGACY_FLOW",
      message: validation.selectedChannel === "reels_manual"
        ? "Reels segue o fluxo antigo de Vídeos de Ofertas: importe o vídeo e aprove-o lá."
        : "Escolha Telegram ou WhatsApp para preparar um draft no painel antigo."
    };
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false as const, code: "SUPABASE_UNAVAILABLE", message: "Supabase indisponível para criar o draft." };
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false as const, code: "UNAUTHENTICATED", message: "Faça login para criar um draft." };

  const { data: offer, error: offerError } = await supabase.from("offers").select("*").eq("id", validation.offerId).eq("user_id", userId).maybeSingle();
  if (offerError || !offer) return { ok: false as const, code: "OFFER_NOT_FOUND", message: "Oferta não encontrada para este usuário." };
  if (offer.platform === "Amazon") return { ok: false as const, code: "AMAZON_BLOCKED", message: "Amazon está fora da Curadoria Comercial V1." };

  const [candidate] = buildCommercialQueue([offer as any], { limit: 1 });
  if (!candidate || candidate.rejected) return { ok: false as const, code: "CANDIDATE_REJECTED", message: "Candidato rejeitado pelos gates da Curadoria Comercial V1." };
  const criticalRisks = candidate.commercialRiskFlags.filter((risk) => CRITICAL_RISKS.has(risk));
  if (criticalRisks.length > 0 && !validation.confirmCriticalRisk) return { ok: false as const, code: "CRITICAL_RISK_CONFIRMATION_REQUIRED", message: `Confirmação manual necessária para: ${criticalRisks.join(", ")}.` };

  const idempotencyKey = `commercial-curation/v1:${offer.id}:${candidate.commercialIntent}:${legacyChannel}`;
  const { data: existing } = await supabase.from("posts").select("id,status,channel").eq("user_id", userId).eq("offer_id", offer.id).eq("channel", legacyChannel).eq("status", "draft").maybeSingle();
  if (existing) return { ok: true as const, code: "DRAFT_ALREADY_EXISTS", message: "Este draft já existe no painel antigo.", postId: existing.id, idempotencyKey, selectedChannel: validation.selectedChannel, metadata: candidate.commercialMetadata };
  const { data: published } = await supabase.from("posts").select("id,status").eq("user_id", userId).eq("offer_id", offer.id).eq("channel", legacyChannel).eq("status", "published").maybeSingle();
  if (published) return { ok: false as const, code: "PUBLISHED_POST_PROTECTED", message: "Já existe post publicado neste canal; nada foi alterado." };

  const metadata = {
    ...candidate.commercialMetadata,
    source: "commercial-curation/v1",
    selectedChannel: legacyChannel,
    approvalStatus: "draft_created",
    createdFromOfferId: offer.id,
    idempotencyKey,
  };
  const subId = createSubId(legacyChannel, offer.product_name, offer.id);
  const trackedUrl = createTrackedUrl(offer.original_url, subId);
  const { data: affiliateLink, error: linkError } = await supabase.from("affiliate_links").upsert({
    user_id: userId,
    offer_id: offer.id,
    channel: legacyChannel,
    original_url: offer.original_url,
    tracked_url: trackedUrl,
    sub_id: subId
  }, { onConflict: "offer_id,channel" }).select("id,tracked_url").single();
  if (linkError || !affiliateLink) return { ok: false as const, code: "AFFILIATE_LINK_CREATE_FAILED", message: linkError?.message || "Não foi possível preparar o link rastreado." };
  const content = materializeCommercialDraftContent(candidate.suggestedCopy, affiliateLink.tracked_url);
  const { data: post, error: postError } = await supabase.from("posts").insert({ user_id: userId, offer_id: offer.id, affiliate_link_id: affiliateLink.id, channel: legacyChannel, content, status: "draft" }).select("id,status,channel").single();
  if (postError || !post) return { ok: false as const, code: "DRAFT_CREATE_FAILED", message: postError?.message || "Não foi possível criar o draft." };

  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability : {};
  const commercialDrafts = explainability.commercialDrafts && typeof explainability.commercialDrafts === "object" ? explainability.commercialDrafts : {};
  await supabase.from("offers").update({ explainability: { ...explainability, commercialDrafts: { ...commercialDrafts, [idempotencyKey]: metadata } } }).eq("id", offer.id).eq("user_id", userId);
  return { ok: true as const, code: "DRAFT_CREATED", message: "Draft criado; nenhuma publicação foi acionada.", postId: post.id, idempotencyKey, selectedChannel: validation.selectedChannel, metadata };
}
