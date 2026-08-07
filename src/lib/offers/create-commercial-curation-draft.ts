"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCommercialQueue } from "@/lib/offers/commercial-curation-queue";

export const COMMERCIAL_DRAFT_CHANNELS = ["telegram", "manual_whatsapp", "reels_manual", "panel_only"] as const;
export type CommercialDraftChannel = (typeof COMMERCIAL_DRAFT_CHANNELS)[number];

const CRITICAL_RISKS = new Set(["regulated_or_sensitive", "security_camera_manual", "electronics_high_ticket_manual", "large_or_freight_sensitive_manual"]);

export function validateCommercialDraftRequest(input: { offerId?: string; selectedChannel?: string; confirmCriticalRisk?: boolean }) {
  if (!input.offerId?.trim()) return { ok: false as const, code: "MISSING_OFFER_ID", message: "Oferta não informada." };
  if (!COMMERCIAL_DRAFT_CHANNELS.includes(input.selectedChannel as CommercialDraftChannel)) return { ok: false as const, code: "CHANNEL_REQUIRED", message: "Escolha um canal antes de criar o draft." };
  return { ok: true as const, offerId: input.offerId, selectedChannel: input.selectedChannel as CommercialDraftChannel, confirmCriticalRisk: input.confirmCriticalRisk === true };
}

export async function createCommercialCurationDraft(input: { offerId?: string; selectedChannel?: string; confirmCriticalRisk?: boolean }) {
  const validation = validateCommercialDraftRequest(input);
  if (!validation.ok) return validation;
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

  const idempotencyKey = `commercial-curation/v1:${offer.id}:${candidate.commercialIntent}:${validation.selectedChannel}`;
  const { data: existing } = await supabase.from("posts").select("id,status,channel").eq("user_id", userId).eq("offer_id", offer.id).eq("channel", validation.selectedChannel).eq("status", "draft").maybeSingle();
  if (existing) return { ok: true as const, code: "DRAFT_ALREADY_EXISTS", message: "Este draft já existe.", postId: existing.id, idempotencyKey, selectedChannel: validation.selectedChannel, metadata: candidate.commercialMetadata };
  const { data: published } = await supabase.from("posts").select("id,status").eq("user_id", userId).eq("offer_id", offer.id).eq("channel", validation.selectedChannel).eq("status", "published").maybeSingle();
  if (published) return { ok: false as const, code: "PUBLISHED_POST_PROTECTED", message: "Já existe post publicado neste canal; nada foi alterado." };

  const metadata = {
    ...candidate.commercialMetadata,
    source: "commercial-curation/v1",
    selectedChannel: validation.selectedChannel,
    approvalStatus: "draft_created",
    createdFromOfferId: offer.id,
    idempotencyKey,
  };
  const content = `${candidate.suggestedCopy}\n🔗 ${offer.original_url}`;
  const { data: post, error: postError } = await supabase.from("posts").insert({ user_id: userId, offer_id: offer.id, channel: validation.selectedChannel, content, status: "draft" }).select("id,status,channel").single();
  if (postError || !post) return { ok: false as const, code: "DRAFT_CREATE_FAILED", message: postError?.message || "Não foi possível criar o draft." };

  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability : {};
  const commercialDrafts = explainability.commercialDrafts && typeof explainability.commercialDrafts === "object" ? explainability.commercialDrafts : {};
  await supabase.from("offers").update({ explainability: { ...explainability, commercialDrafts: { ...commercialDrafts, [idempotencyKey]: metadata } } }).eq("id", offer.id).eq("user_id", userId);
  return { ok: true as const, code: "DRAFT_CREATED", message: "Draft criado; nenhuma publicação foi acionada.", postId: post.id, idempotencyKey, selectedChannel: validation.selectedChannel, metadata };
}
