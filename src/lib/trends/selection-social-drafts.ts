import { buildCopyV2ChannelCopy } from "@/core/ai/prompt";
import { createRequiredSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";

export const TREND_SOCIAL_CHANNELS = ["facebook", "instagram", "whatsapp"] as const;

export function buildTrendSocialDraftContent(
  baseContent: string,
  channel: (typeof TREND_SOCIAL_CHANNELS)[number],
  trackedUrl: string,
) {
  if (channel !== "whatsapp") return baseContent;

  const url = trackedUrl.trim();
  if (!url) return baseContent.trimEnd();

  const withoutTrackedUrl = baseContent.replaceAll(url, "").trimEnd();
  if (/👉\s*$/u.test(withoutTrackedUrl)) {
    return `${withoutTrackedUrl} ${url}`;
  }

  return `${withoutTrackedUrl}\n\n👉 ${url}`;
}

export async function prepareTrendSocialDrafts(input: {
  userId: string;
  offerId: string;
  productId: string;
}) {
  const admin = createRequiredSupabaseAdminClient();
  const { data: offer, error: offerError } = await admin
    .from("offers")
    .select("id,product_name,platform,category,current_price,old_price,original_url,shipping_free,explainability,marketplace_metrics")
    .eq("id", input.offerId)
    .eq("user_id", input.userId)
    .single();
  if (offerError || !offer) throw new Error("Oferta aprovada no Trends não pôde ser carregada para as redes sociais.");

  const facts = {
    productName: offer.product_name,
    marketplace: offer.platform,
    category: offer.category ?? null,
    currentPrice: Number(offer.current_price),
    originalPrice: offer.old_price == null ? null : Number(offer.old_price),
    freeShipping: offer.shipping_free ?? null,
    evidence: { ...(offer.explainability ?? {}), ...(offer.marketplace_metrics ?? {}) },
  };

  const draftIds: Record<string, string> = {};
  for (const channel of TREND_SOCIAL_CHANNELS) {
    const subId = createSubId(channel, offer.product_name, offer.id);
    const trackedUrl = createTrackedUrl(offer.original_url, subId);
    const { data: link, error: linkError } = await admin.from("affiliate_links").upsert(
      {
        user_id: input.userId,
        offer_id: offer.id,
        channel,
        original_url: offer.original_url,
        tracked_url: trackedUrl,
        sub_id: subId,
      },
      { onConflict: "offer_id,channel" },
    ).select("id").single();
    if (linkError || !link) {
      throw new Error(`Falha ao preparar o link do canal ${channel}: ${linkError?.message ?? "registro ausente"}`);
    }

    const baseContent = buildCopyV2ChannelCopy(facts, channel);
    const content = buildTrendSocialDraftContent(baseContent, channel, trackedUrl);
    const { data: draft, error: draftReadError } = await admin
      .from("posts")
      .select("id")
      .eq("user_id", input.userId)
      .eq("offer_id", offer.id)
      .eq("channel", channel)
      .eq("status", "draft")
      .maybeSingle();
    if (draftReadError) throw new Error(`Falha ao consultar draft do canal ${channel}.`);

    if (draft) {
      const { error: updateError } = await admin.from("posts").update({ content, affiliate_link_id: link.id }).eq("id", draft.id);
      if (updateError) throw new Error(`Falha ao atualizar o draft do canal ${channel}.`);
      draftIds[channel] = draft.id;
      continue;
    }

    const { data: published, error: publishedError } = await admin
      .from("posts")
      .select("id")
      .eq("user_id", input.userId)
      .eq("offer_id", offer.id)
      .eq("channel", channel)
      .eq("status", "published")
      .limit(1)
      .maybeSingle();
    if (publishedError) throw new Error(`Falha ao verificar publicação existente do canal ${channel}.`);
    if (published) continue;

    const { data: created, error: createError } = await admin.from("posts").insert({
      user_id: input.userId,
      offer_id: offer.id,
      affiliate_link_id: link.id,
      channel,
      content,
      status: "draft",
    }).select("id").single();
    if (createError || !created) throw new Error(`Falha ao criar o draft do canal ${channel}.`);
    draftIds[channel] = created.id;
  }

  return { draftIds, automaticPublication: false, radarProductId: input.productId };
}
