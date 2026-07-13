"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateOfferScore } from "@/lib/offers/score";
import { getCurrentUserId } from "@/lib/offers/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { formDataToOfferInput } from "@/lib/validators/offer";
import { saleInputSchema } from "@/lib/validators/sale";
import type { Channel, Offer, Platform } from "@/types/domain";
import { assertShopeeSelected, nextShopeeManualStatus } from "@/lib/offers/shopee-manual-curation";

async function updateShopeeManualStatus(offerId: string, action: "select" | "reject") {
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) throw new Error("Usuário não autenticado.");
  const status = nextShopeeManualStatus("pending_manual_review", action);
  const { data, error } = await supabase
    .from("offers")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId)
    .eq("platform", "Shopee")
    .eq("status", "pending_manual_review")
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Candidato Shopee não está pendente.");
  revalidatePath("/offers");
}

export async function selectShopeeCandidateAction(formData: FormData) {
  await updateShopeeManualStatus(String(formData.get("offer_id") || ""), "select");
}

export async function rejectShopeeCandidateAction(formData: FormData) {
  await updateShopeeManualStatus(String(formData.get("offer_id") || ""), "reject");
}

export async function createOfferAction(formData: FormData) {
  const input = formDataToOfferInput(formData);
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) redirect("/login");

  // ETAPAS 5 & 6: VALIDAÇÃO GLOBAL OBRIGATÓRIA
  if (
    input.current_price === null ||
    input.current_price === undefined ||
    Number.isNaN(input.current_price) ||
    input.current_price <= 0
  ) {
    throw new Error("Oferta rejeitada: preço inválido.");
  }

  if (!input.product_name) {
    throw new Error("Oferta rejeitada: título inválido.");
  }

  if (!input.platform) {
    throw new Error("Oferta rejeitada: marketplace inválido.");
  }

  if (!input.original_url) {
    throw new Error("Oferta rejeitada: affiliate_url inválido.");
  }

  const score = calculateOfferScore(input);
  const { error } = await supabase.from("offers").insert({
    ...input,
    category: input.category || null,
    image_url: input.image_url || null,
    old_price: input.old_price ?? null,
    coupon: input.coupon || null,
    rating: input.rating ?? null,
    estimated_commission: input.estimated_commission ?? null,
    commission_rate: input.commission_rate ?? null,
    seasonality: input.seasonality ?? null,
    notes: input.notes || null,
    score,
    user_id: userId
  });

  if (error) throw new Error(error.message);
  revalidatePath("/offers");
  revalidatePath("/dashboard");
  redirect("/offers");
}

export async function selectMercadoLivreOfferAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") || "");
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId || !offerId) return;
  const { error } = await supabase
    .from("offers")
    .update({ status: "selected", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId)
    .eq("platform", "Mercado Livre")
    .eq("status", "pending_manual_review");
  if (error) throw new Error(error.message);
  revalidatePath("/offers");
}

export async function rejectMercadoLivreOfferAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") || "");
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId || !offerId) return;
  const { error } = await supabase
    .from("offers")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId)
    .eq("platform", "Mercado Livre")
    .eq("status", "pending_manual_review");
  if (error) throw new Error(error.message);
  revalidatePath("/offers");
}

export async function selectAmazonOfferAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") || "");
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId || !offerId) return;
  const { error } = await supabase
    .from("offers")
    .update({ status: "selected", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId)
    .eq("platform", "Amazon")
    .eq("status", "pending_manual_review");
  if (error) throw new Error(error.message);
  revalidatePath("/offers");
}

export async function rejectAmazonOfferAction(formData: FormData) {
  const offerId = String(formData.get("offer_id") || "");
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId || !offerId) return;
  const { error } = await supabase
    .from("offers")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", offerId)
    .eq("user_id", userId)
    .eq("platform", "Amazon")
    .eq("status", "pending_manual_review");
  if (error) throw new Error(error.message);
  revalidatePath("/offers");
}

export async function generateAffiliateLinkAction(
  prevState: { ok: boolean; message: string; timestamp: number } | null,
  formData: FormData
) {
  const offerId = String(formData.get("offer_id") || "");
  const productNameManual = String(formData.get("product_name_manual") || "");
  const channel = String(formData.get("channel") || "") as Channel;
  const utmSource = String(formData.get("utm_source") || channel);
  const utmMedium = String(formData.get("utm_medium") || "social");
  const utmCampaign = String(formData.get("utm_campaign") || "caca_oferta");
  const affiliateUrl = String(formData.get("affiliate_url") || "");

  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return { ok: false, message: "Não autenticado.", timestamp: Date.now() };

  if (!affiliateUrl) return { ok: false, message: "O link de afiliado é obrigatório.", timestamp: Date.now() };

  let offer: Offer;
  if (offerId === "manual") {
    let platform: Platform = "Outro";
    const lowerUrl = affiliateUrl.toLowerCase();
    if (lowerUrl.includes("shope")) platform = "Shopee";
    else if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon")) platform = "Amazon";
    else if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu")) platform = "Magalu";
    else if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("ml")) platform = "Mercado Livre";
    else if (lowerUrl.includes("netshoes")) platform = "Netshoes" as any;

    const { data: newOffer, error: createError } = await supabase.from("offers").insert({
      user_id: userId,
      platform,
      product_name: productNameManual || "Link Manual",
      original_url: affiliateUrl,
      current_price: 0,
      status: "approved",
      score: 0
    }).select().single<Offer>();

    if (createError || !newOffer) {
      return { ok: false, message: "Erro ao criar oferta manual: " + createError?.message, timestamp: Date.now() };
    }
    offer = newOffer;
  } else {
    const { data: fetchedOffer, error: offerError } = await supabase.from("offers").select("*").eq("id", offerId).single<Offer>();
    if (offerError || !fetchedOffer) return { ok: false, message: offerError?.message || "Oferta não encontrada.", timestamp: Date.now() };
    offer = fetchedOffer;
  }
  assertShopeeSelected(offer);

  // Injeta parâmetros de afiliado oficiais (Mercado Livre e Shein)
  let finalAffiliateUrl = affiliateUrl;
  if (offer.platform === "Mercado Livre") {
    const { generateMLAffiliateLink } = await import("@/lib/platforms/mercadolivre");
    finalAffiliateUrl = generateMLAffiliateLink(affiliateUrl, userId);
  } else if (offer.platform === "Shein") {
    const { generateSheinAffiliateLink } = await import("@/lib/platforms/shein");
    finalAffiliateUrl = await generateSheinAffiliateLink(affiliateUrl, userId);
  } else if (offer.platform === "Netshoes" as any) {
    const { generateNetshoesAffiliateLink } = await import("@/lib/platforms/netshoes");
    finalAffiliateUrl = generateNetshoesAffiliateLink(affiliateUrl);
  }

  const subId = createSubId(channel, offer.product_name, offer.id);
  const trackedUrl = createTrackedUrl(finalAffiliateUrl, subId, utmSource, utmMedium, utmCampaign);
  const { error } = await supabase.from("affiliate_links").upsert(
    {
      user_id: userId,
      offer_id: offer.id,
      channel,
      original_url: finalAffiliateUrl,
      tracked_url: trackedUrl,
      sub_id: subId
    },
    { onConflict: "offer_id,channel" }
  );

  if (error && (channel === "facebook" || channel === "site" || channel === "blog")) {
    const fallbackChannel = channel === "facebook" ? "instagram" : "whatsapp";
    const { error: retryError } = await supabase.from("affiliate_links").upsert(
      {
        user_id: userId,
        offer_id: offer.id,
        channel: fallbackChannel,
        original_url: affiliateUrl,
        tracked_url: trackedUrl,
        sub_id: subId
      },
      { onConflict: "offer_id,channel" }
    );
    if (retryError) return { ok: false, message: retryError.message, timestamp: Date.now() };
  } else if (error) {
    return { ok: false, message: error.message, timestamp: Date.now() };
  }
  revalidatePath("/tracking");
  revalidatePath("/messages");
  return { ok: true, message: `Link de afiliado gerado com sucesso para ${channel}!`, timestamp: Date.now() };
}

export async function createSaleAction(formData: FormData) {
  const input = saleInputSchema.parse({
    offer_id: formData.get("offer_id"),
    affiliate_link_id: formData.get("affiliate_link_id") || null,
    channel: formData.get("channel"),
    gross_value: formData.get("gross_value"),
    commission_value: formData.get("commission_value"),
    status: formData.get("status"),
    sold_at: formData.get("sold_at") ? new Date(String(formData.get("sold_at"))).toISOString() : undefined
  });
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) redirect("/login");

  const { error } = await supabase.from("sales").insert({ ...input, user_id: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
  revalidatePath("/dashboard");
}
