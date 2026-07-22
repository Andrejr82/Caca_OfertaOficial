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
  let offerIds: string[];
  try {
    const parsed = JSON.parse(rawOfferIds);
    offerIds = Array.isArray(parsed)
      ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0))]
      : [];
  } catch {
    throw new Error("Seleção de ofertas inválida.");
  }
  if (offerIds.length === 0) throw new Error("Selecione ao menos uma oferta.");

  // Limita o trabalho por invocação serverless. O cliente continua com os IDs
  // restantes em novas invocações, evitando timeout ao limpar lotes grandes.
  const batchOfferIds = offerIds.slice(0, 20);
  const remainingOfferIds = offerIds.slice(20);

  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) throw new Error("Usuário não autenticado.");

  const { data: offers, error } = await supabase
    .from("offers")
    .select("id,platform,status,updated_at,created_at")
    .eq("user_id", userId)
    .in("id", batchOfferIds);
  if (error) throw new Error(error.message);

  const foundOfferIds = new Set((offers || []).map((offer) => offer.id));
  const results: Array<{ id: string; ok: boolean; message?: string }> = [];
  for (const offerId of batchOfferIds) {
    if (!foundOfferIds.has(offerId)) {
      results.push({ id: offerId, ok: false, message: "Oferta não encontrada." });
    }
  }

  // Processa sequencialmente e isola falhas por oferta. Assim, uma oferta
  // inconsistente não derruba a página nem impede o restante do lote.
  for (const offer of offers || []) {
    try {
      if (offer.status !== "pending_manual_review") {
        results.push({ id: offer.id, ok: false, message: "Oferta não está aguardando revisão." });
        continue;
      }
      if (!["Shopee", "Mercado Livre", "Amazon"].includes(offer.platform)) {
        results.push({ id: offer.id, ok: false, message: "Marketplace sem ação de descarte configurada." });
        continue;
      }
      const rawRequestedAt = offer.updated_at || offer.created_at || new Date().toISOString();
      const parsedRequestedAt = new Date(rawRequestedAt);
      const requestedAt = Number.isNaN(parsedRequestedAt.getTime())
        ? new Date().toISOString()
        : parsedRequestedAt.toISOString();
      const commandId = `curation:${offer.id}:bulk-reject:${requestedAt}`;
      const result = await transitionOfficialOfferState({
        commandId,
        idempotencyKey: commandId,
        correlationId: commandId,
        causationId: null,
        tenantId: userId,
        actor: { type: "user", id: userId, service: "nextjs-curation" },
        requestedAt,
        entityId: offer.id,
        fromState: "pending_manual_review",
        toState: "rejected",
        origin: "offers.action.bulk-reject",
        reason: { code: "MANUAL_REJECTION", detail: offer.platform },
        evidenceRefs: [`marketplace:${offer.platform}`, `offer:${offer.id}`]
      }, createSupabaseStateDependencies(supabase, userId));
      results.push(result.status === "rejected"
        ? { id: offer.id, ok: false, message: result.message }
        : { id: offer.id, ok: true });
    } catch (error) {
      results.push({
        id: offer.id,
        ok: false,
        message: error instanceof Error ? error.message : "Falha ao descartar oferta."
      });
    }
  }

  revalidatePath("/offers");
  revalidatePath("/dashboard");
  return {
    ok: results.every((result) => result.ok) && results.length === batchOfferIds.length && remainingOfferIds.length === 0,
    successCount: results.filter((result) => result.ok).length,
    failureCount: batchOfferIds.length - results.filter((result) => result.ok).length,
    processedIds: batchOfferIds,
    remainingOfferIds,
    message: `${results.filter((result) => result.ok).length} oferta(s) descartada(s).`,
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
