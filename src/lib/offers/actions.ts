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
import { assertShopeeSelected } from "@/lib/offers/shopee-manual-curation";
import { transitionOfficialOfferState } from "@/lib/state/official-state-service";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";

async function transitionManualStatus(
  formData: FormData,
  marketplace: "Shopee" | "Mercado Livre" | "Amazon",
  action: "select" | "reject"
) {
  const offerId = String(formData.get("offer_id") || "");
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId || !offerId) throw new Error("Usuário não autenticado ou oferta inválida.");

  const rawRequestedAt = String(formData.get("requested_at") || new Date().toISOString());
  const requestedAt = new Date(rawRequestedAt).toISOString();
  const commandId = String(formData.get("command_id") || `${offerId}:${action}:${requestedAt}`);
  const toState = action === "select" ? "selected" : "rejected";

  const { data: offer } = await supabase.from("offers").select("status").eq("id", offerId).single();
  if (!offer) throw new Error("Oferta não encontrada.");

  if (offer.status === toState) {
    revalidatePath("/offers");
    return;
  }

  const result = await transitionOfficialOfferState({
    commandId,
    idempotencyKey: commandId,
    correlationId: commandId,
    causationId: null,
    tenantId: userId,
    actor: { type: "user", id: userId, service: "nextjs-curation" },
    requestedAt,
    entityId: offerId,
    fromState: "pending_manual_review",
    toState,
    origin: `offers.action.${action}`,
    reason: { code: action === "select" ? "MANUAL_SELECTION" : "MANUAL_REJECTION", detail: marketplace },
    evidenceRefs: [`marketplace:${marketplace}`, `offer:${offerId}`]
  }, createSupabaseStateDependencies(supabase, userId));
  if (result.status === "rejected") throw new Error(result.message);
  revalidatePath("/offers");
}

export async function selectShopeeCandidateAction(formData: FormData) {
  await transitionManualStatus(formData, "Shopee", "select");
}

export async function rejectShopeeCandidateAction(formData: FormData) {
  await transitionManualStatus(formData, "Shopee", "reject");
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
    user_id: userId,
    status: "pending_manual_review"
  });

  if (error) throw new Error(error.message);
  revalidatePath("/offers");
  revalidatePath("/dashboard");
  redirect("/offers");
}

export async function selectMercadoLivreOfferAction(formData: FormData) {
  await transitionManualStatus(formData, "Mercado Livre", "select");
}

export async function rejectMercadoLivreOfferAction(formData: FormData) {
  await transitionManualStatus(formData, "Mercado Livre", "reject");
}

export async function selectAmazonOfferAction(formData: FormData) {
  await transitionManualStatus(formData, "Amazon", "select");
}

export async function rejectAmazonOfferAction(formData: FormData) {
  await transitionManualStatus(formData, "Amazon", "reject");
}

export async function bulkRejectOffersAction(formData: FormData) {
  const rawOfferIds = String(formData.get("offer_ids") || "[]");
  const discardAllPending = String(formData.get("discard_all_pending") || "") === "true";
  let offerIds: string[];
  try {
    const parsed = JSON.parse(rawOfferIds);
    offerIds = Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
      : [];
  } catch {
    throw new Error("Seleção de ofertas inválida.");
  }
  if (offerIds.length === 0 && !discardAllPending) throw new Error("Selecione ao menos uma oferta.");

  // A limpeza é uma operação de lote restrita aos IDs selecionados. Isso evita
  // centenas de invocações serverless e mantém a transição atômica.
  const batchOfferIds = offerIds;
  const remainingOfferIds: string[] = [];

  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) throw new Error("Usuário não autenticado.");

  if (discardAllPending) {
    const allowedPlatforms = ["Shopee", "Mercado Livre", "Amazon"];
    const countQuery = await supabase.from("offers").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "pending_manual_review").in("platform", allowedPlatforms);
    if (countQuery.error) throw new Error(countQuery.error.message);
    const total = countQuery.count || 0;
    const { error: rejectAllError } = await supabase.from("offers")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("status", "pending_manual_review").in("platform", allowedPlatforms);
    if (rejectAllError) throw new Error(rejectAllError.message);
    if (total > 0) await supabase.from("integration_logs").insert({
      user_id: userId, integration: "official-state-service", action: "bulk_offer_rejection", status: "success",
      message: `offers:${total}:pending_manual_review->rejected`,
      metadata: { scope: "all_pending", origin: "offers.action.bulk-reject" }
    });
    revalidatePath("/offers");
    revalidatePath("/dashboard");
    return { ok: true, successCount: total, failureCount: 0, processedIds: [], remainingOfferIds: [], message: `${total} oferta(s) descartada(s).` };
  }

  const { data: offers, error } = await supabase
    .from("offers")
    .select("id,platform,status,updated_at,created_at")
    .eq("user_id", userId)
    .in("id", batchOfferIds);
  if (error) throw new Error(error.message);

  const eligibleIds = (offers || [])
    .filter((offer) => offer.status === "pending_manual_review")
    .filter((offer) => ["Shopee", "Mercado Livre", "Amazon"].includes(offer.platform))
    .map((offer) => offer.id);
  const { data: rejectedOffers, error: rejectError } = eligibleIds.length > 0
    ? await supabase
      .from("offers")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("status", "pending_manual_review")
      .in("id", eligibleIds)
      .select("id")
    : { data: [], error: null };
  if (rejectError) throw new Error(rejectError.message);
  const successCount = rejectedOffers?.length || 0;
  if (successCount > 0) {
    const auditId = `curation:bulk-reject:${new Date().toISOString()}`;
    await supabase.from("integration_logs").insert({
      user_id: userId,
      integration: "official-state-service",
      action: "bulk_offer_rejection",
      status: "success",
      message: `offers:${successCount}:pending_manual_review->rejected`,
      metadata: { auditId, offerIds: rejectedOffers.map((offer) => offer.id), origin: "offers.action.bulk-reject" }
    });
  }

  revalidatePath("/offers");
  revalidatePath("/dashboard");
  return {
    ok: successCount === batchOfferIds.length,
    successCount,
    failureCount: batchOfferIds.length - successCount,
    processedIds: batchOfferIds,
    remainingOfferIds,
    message: `${successCount} oferta(s) descartada(s).`,
  };
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
      status: "pending_manual_review",
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
