"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rejectShopeeCandidateAction, selectShopeeCandidateAction, transitionManualStatus } from "@/lib/offers/actions";
import { OfficialAIProviderRegistry } from "@/lib/ai/official/create-official-ai-service";
import { recommendTrendChannelAndFormat } from "@/core/ai/trend-channel-format-recommender";
import { persistTrendRecommendation } from "@/lib/trends/recommendation-persistence";
import { createTrendAffiliateLinkAndDraft } from "@/lib/trends/social-drafts";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { TrendOpportunity } from "@/core/trends/types";

export async function approveTrendOfferAction(formData: FormData) {
  const platform = String(formData.get("platform") || "");
  if (platform === "Shopee") await selectShopeeCandidateAction(formData);
  else if (platform === "Mercado Livre") await selectMercadoLivreCandidateAction(formData);
  else throw new Error("Marketplace inválido para aprovação.");
  const channel = await createDraftAfterTrendApproval(formData);
  if (channel) redirect(`/${channel.toLocaleLowerCase("pt-BR")}`);
}

async function createDraftAfterTrendApproval(formData: FormData) {
  const offerId = String(formData.get("offer_id") || "");
  const client = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!client || !userId || !offerId) return null;
  const { data: offer } = await client.from("offers").select("id,platform,product_name,current_price,old_price,score,original_url,image_url,category").eq("id", offerId).eq("user_id", userId).maybeSingle();
  const { data: opportunity } = await client.from("trend_opportunities").select("*").eq("user_id", userId).eq("offer_id", offerId).eq("match_status", "matched").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!offer) return null;
  const normalizedOpportunity: TrendOpportunity = opportunity ? {
    id: opportunity.id,
    signalId: opportunity.signal_id,
    classificationId: opportunity.classification_id ?? null,
    offerId: opportunity.offer_id,
    marketplace: opportunity.marketplace,
    normalizedProductTerm: opportunity.normalized_product_term,
    matchStatus: opportunity.match_status,
    matchReason: opportunity.match_reason,
    matchConfidence: opportunity.match_confidence,
    currentPrice: opportunity.current_price,
    oldPrice: opportunity.old_price,
    score: opportunity.score,
    status: opportunity.status,
    experimentId: opportunity.experiment_id,
    strategyVersion: opportunity.strategy_version,
    finalDecision: opportunity.final_decision
  } : {
    id: `trend-radar:${offer.id}`,
    signalId: "trend-radar",
    classificationId: null,
    offerId: offer.id,
    marketplace: offer.platform === "Shopee" || offer.platform === "Mercado Livre" ? offer.platform : null,
    normalizedProductTerm: offer.product_name,
    matchStatus: "matched",
    matchReason: "Oferta validada pelo Radar multimarketplace.",
    matchConfidence: 100,
    currentPrice: Number(offer.current_price),
    oldPrice: offer.old_price == null ? null : Number(offer.old_price),
    score: Number(offer.score ?? 0),
    status: "matched",
    experimentId: null,
    strategyVersion: "daily-commercial-radar-v1",
    finalDecision: null
  };
  const provider = new OfficialAIProviderRegistry().resolve();
  const recommendation = await recommendTrendChannelAndFormat(normalizedOpportunity, {
    offerTitle: offer.product_name,
    evidenceStatus: "partial",
    provenance: "external_radar",
    category: offer.category,
    matchReason: normalizedOpportunity.matchReason
  }, provider);
  if (!recommendation) return null;
  if (opportunity) await persistTrendRecommendation(client, userId, normalizedOpportunity, recommendation);
  const affiliateUrl = offer.platform === "Mercado Livre"
    ? (await import("@/lib/platforms/mercadolivre")).generateMLAffiliateLink(offer.original_url, userId)
    : offer.original_url;
  await createTrendAffiliateLinkAndDraft(client, { userId, offer, recommendation }, affiliateUrl);
  revalidatePath("/trends");
  return channelKeyForRedirect(recommendation.channel);
}

function channelKeyForRedirect(channel: string): "whatsapp" | "telegram" | "instagram" | "facebook" {
  return channel.toLocaleLowerCase("pt-BR") as "whatsapp" | "telegram" | "instagram" | "facebook";
}

export async function rejectTrendOfferAction(formData: FormData) {
  const platform = String(formData.get("platform") || "");
  if (platform === "Shopee") return rejectShopeeCandidateAction(formData);
  if (platform === "Mercado Livre") return rejectMercadoLivreCandidateAction(formData);
  throw new Error("Marketplace inválido para rejeição.");
}

async function selectMercadoLivreCandidateAction(formData: FormData) {
  await transitionManualStatus(formData, "Mercado Livre", "select");
  revalidatePath("/trends");
}

async function rejectMercadoLivreCandidateAction(formData: FormData) {
  await transitionManualStatus(formData, "Mercado Livre", "reject");
  revalidatePath("/trends");
}

export async function approveTrendShopeeOfferAction(formData: FormData) {
  await selectShopeeCandidateAction(formData);
  revalidatePath("/trends");
}

export async function rejectTrendShopeeOfferAction(formData: FormData) {
  await rejectShopeeCandidateAction(formData);
  revalidatePath("/trends");
}
