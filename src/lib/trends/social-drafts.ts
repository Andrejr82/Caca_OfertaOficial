import type { TrendRecommendationChannel, TrendRecommendationFormat } from "@/core/trends/recommendation-contract";
import type { AITrendRecommendation } from "@/core/ai/trend-channel-format-recommender";
import type { Offer } from "@/types/domain";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";

export interface TrendSocialDraftInput {
  userId: string;
  offer: Pick<Offer, "id" | "platform" | "product_name" | "current_price" | "original_url" | "image_url" | "category">;
  recommendation: Pick<AITrendRecommendation, "channel" | "format" | "rationale" | "hypothesis" | "confidence" | "strategyVersion">;
  trackedUrl: string;
  affiliateLinkId: string;
}

export function channelKey(channel: TrendRecommendationChannel): "whatsapp" | "telegram" | "instagram" | "facebook" {
  return channel.toLocaleLowerCase("pt-BR") as "whatsapp" | "telegram" | "instagram" | "facebook";
}

export function buildTrendAffiliateLinkInput(userId: string, offer: TrendSocialDraftInput["offer"], channel: TrendRecommendationChannel, affiliateUrl: string) {
  const key = channelKey(channel);
  const subId = createSubId(key, offer.product_name, offer.id);
  return {
    user_id: userId,
    offer_id: offer.id,
    channel: key,
    original_url: affiliateUrl,
    tracked_url: createTrackedUrl(affiliateUrl, subId, key, "social", "trend_radar"),
    sub_id: subId
  };
}

export function buildTrendSocialDraftRow(input: TrendSocialDraftInput) {
  const price = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(input.offer.current_price || 0));
  return {
    user_id: input.userId,
    offer_id: input.offer.id,
    affiliate_link_id: input.affiliateLinkId,
    channel: channelKey(input.recommendation.channel),
    content: `${input.offer.product_name}\n\n${price}\n\n${input.recommendation.rationale}\n\n${input.trackedUrl}`,
    status: "draft" as const,
    deleted_at: null
  };
}

export type TrendSocialDraftClient = {
  from(table: string): any;
};

export async function createTrendSocialDraft(
  client: TrendSocialDraftClient,
  input: TrendSocialDraftInput,
) {
  const channel = channelKey(input.recommendation.channel);
  const { data: existing, error: existingError } = await client.from("posts")
    .select("id,status,channel")
    .eq("user_id", input.userId)
    .eq("offer_id", input.offer.id)
    .eq("channel", channel)
    .eq("status", "draft")
    .maybeSingle();
  if (existingError) throw new Error("Falha ao verificar draft social existente.");
  if (existing?.id) return { id: existing.id, created: false, status: "draft" as const };
  const { data, error } = await client.from("posts").insert(buildTrendSocialDraftRow(input)).select("id,status").single();
  if (error || !data?.id) throw new Error("Falha ao criar draft social.");
  return { id: data.id, created: true, status: "draft" as const };
}

export async function createTrendAffiliateLinkAndDraft(
  client: TrendSocialDraftClient,
  input: Omit<TrendSocialDraftInput, "trackedUrl" | "affiliateLinkId">,
  affiliateUrl: string,
) {
  const linkInput = buildTrendAffiliateLinkInput(input.userId, input.offer, input.recommendation.channel, affiliateUrl);
  const { data: link, error } = await client.from("affiliate_links")
    .upsert(linkInput, { onConflict: "offer_id,channel" })
    .select("id,tracked_url")
    .single();
  if (error || !link?.id || !link.tracked_url) throw new Error("Falha ao criar link afiliado do draft.");
  return createTrendSocialDraft(client, { ...input, trackedUrl: link.tracked_url, affiliateLinkId: link.id });
}
