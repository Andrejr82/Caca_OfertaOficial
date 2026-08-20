"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createRequiredSupabaseAdminClient } from "@/lib/supabase/admin";
import { transitionOfficialOfferState } from "@/lib/state/official-state-service";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import {
  resolveTrendOfferHandoff,
  resolveTrendOfferHandoffBlock,
  resolveTrendSnapshotImageUrl,
} from "@/lib/trends/selection-offer-state";
import { prepareTrendSocialDrafts } from "@/lib/trends/selection-social-drafts";

export type TrendSelectionDecision = "IGNORAR" | "APROVAR_TESTE";

type Evidence = Record<string, any>;

function firstEvidence(value: unknown): Evidence {
  return Array.isArray(value) && value[0] && typeof value[0] === "object" ? value[0] as Evidence : {};
}

function validHttps(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isShopeeAffiliateUrl(value: string): boolean {
  return /(?:s\.shopee\.com\.br|shope\.ee|affiliates|ext_camp)/i.test(value);
}

function isMercadoLivreUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && /(^|\.)mercadolivre\.com\.br$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

async function findExactOffer(supabase: any, userId: string, marketplace: string, evidence: Evidence) {
  const identity = evidence.marketplace_identity ?? {};
  const itemId = String(identity.itemId ?? "").trim();
  const productId = String(identity.productId ?? "").trim();
  const columns = marketplace === "Shopee"
    ? [["shopee_item_id", itemId], ["item_id", itemId], ["product_id", productId]]
    : [["item_id", itemId], ["product_id", productId]];

  for (const [column, value] of columns) {
    if (!value) continue;
    const { data, error } = await supabase
      .from("offers")
      .select("id,status,platform,product_name,explainability")
      .eq("user_id", userId)
      .eq("platform", marketplace)
      .eq(column, value)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Falha ao procurar oferta já existente.");
    if (data) return data;
  }
  return null;
}

async function readMaterializedOffer(persistenceClient: any, userId: string, offerId: string) {
  const { data: offer, error: offerError } = await persistenceClient
    .from("offers")
    .select("id,status,platform,product_name,explainability")
    .eq("id", offerId)
    .eq("user_id", userId)
    .single();
  if (offerError || !offer) throw new Error("Oferta Trends materializada não pôde ser confirmada.");
  return offer;
}

async function materializeShopeeOfferFromSnapshot(userId: string, product: any, evidence: Evidence) {
  const identity = evidence.marketplace_identity ?? {};
  const metrics = evidence.commercial_metrics ?? {};
  const itemId = String(identity.itemId ?? "").trim();
  const shopId = String(identity.shopId ?? "").trim();
  const affiliateUrl = validHttps(evidence.source_url);
  const imageUrl = resolveTrendSnapshotImageUrl(evidence);
  const price = Number(evidence.price ?? metrics.price ?? 0);
  if (!/^\d+$/.test(itemId) || !affiliateUrl || !isShopeeAffiliateUrl(affiliateUrl) || !Number.isFinite(price) || price <= 0) {
    throw new Error("Snapshot Shopee não possui identidade/link afiliado/preço suficientes para materializar a oferta com segurança.");
  }

  const row = {
    user_id: userId,
    platform: "Shopee",
    product_name: product.product_term,
    category: product.category,
    original_url: affiliateUrl,
    image_url: imageUrl,
    current_price: price,
    old_price: evidence.old_price ?? null,
    score: Number(product.commercial_score ?? 0) / 10,
    status: "pending_manual_review",
    explainability: {
      provenance: "trend_experiment",
      correlation_id: `trend-radar:${product.radar_run_id}:${product.id}`,
      radar_run_id: product.radar_run_id,
      radar_product_id: product.id,
      commercial_score_v3: Number(product.commercial_score ?? 0),
      score_breakdown: product.score_breakdown ?? {},
      automatic_publication: false,
      marketplace_metrics: metrics,
    },
    notes: `Trends IA · teste aprovado · ${product.product_term}`,
    shopee_item_id: itemId,
    shopee_shop_id: shopId || null,
    native_category_position: Number(product.priority ?? 0) || null,
  };

  const persistenceClient = createRequiredSupabaseAdminClient();
  const { data, error } = await persistenceClient.rpc("upsert_discovery_offers_v2", { p_marketplace: "Shopee", p_rows: [row] });
  if (error) throw new Error(`Falha ao materializar oferta Trends: ${error.message}`);
  const offerId = Array.isArray(data?.offer_ids) ? String(data.offer_ids[0] ?? "") : "";
  if (!offerId) throw new Error("Oferta Trends não retornou vínculo persistido.");
  return readMaterializedOffer(persistenceClient, userId, offerId);
}

async function materializeMercadoLivreOfferFromSnapshot(userId: string, product: any, evidence: Evidence) {
  const identity = evidence.marketplace_identity ?? {};
  const metrics = evidence.commercial_metrics ?? {};
  const opportunity = evidence.mercado_livre_opportunity ?? {};
  const itemId = String(identity.itemId ?? "").trim();
  const productId = String(identity.productId ?? "").trim();
  const marketplaceUrl = validHttps(evidence.source_url);
  const imageUrl = resolveTrendSnapshotImageUrl(evidence);
  const price = Number(evidence.price ?? metrics.price ?? 0);
  const oldPrice = Number(evidence.old_price ?? 0);

  if ((!itemId && !productId) || !marketplaceUrl || !isMercadoLivreUrl(marketplaceUrl) || !Number.isFinite(price) || price <= 0) {
    throw new Error("Snapshot Mercado Livre não possui identidade/link/preço suficientes para materializar a oferta com segurança.");
  }

  const row = {
    user_id: userId,
    platform: "Mercado Livre",
    product_name: product.product_term,
    category: product.category,
    original_url: marketplaceUrl,
    image_url: imageUrl,
    current_price: price,
    old_price: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
    score: Number(product.commercial_score ?? 0) / 10,
    status: "pending_manual_review",
    explainability: {
      provenance: "trend_experiment",
      correlation_id: `trend-radar:${product.radar_run_id}:${product.id}`,
      radar_run_id: product.radar_run_id,
      radar_product_id: product.id,
      strategy_version: evidence.strategy_version ?? "mercadolivre-opportunity-v1",
      commercial_score: Number(product.commercial_score ?? 0),
      score_breakdown: product.score_breakdown ?? {},
      automatic_publication: false,
      marketplace_metrics: metrics,
    },
    notes: `Trends IA · teste aprovado · ${product.product_term}`,
    item_id: itemId || null,
    product_id: productId || null,
    category_id: opportunity.category_id ?? null,
    category_name: product.category ?? null,
    source_position: Number(opportunity.source_position ?? product.priority ?? 0) || null,
    source_categories: product.category ? [product.category] : [],
  };

  const persistenceClient = createRequiredSupabaseAdminClient();
  const { data, error } = await persistenceClient.rpc("upsert_discovery_offers_v2", {
    p_marketplace: "Mercado Livre",
    p_rows: [row],
  });
  if (error) throw new Error(`Falha ao materializar oferta Mercado Livre no Trends: ${error.message}`);
  const offerId = Array.isArray(data?.offer_ids) ? String(data.offer_ids[0] ?? "") : "";
  if (!offerId) throw new Error("Oferta Mercado Livre no Trends não retornou vínculo persistido.");
  return readMaterializedOffer(persistenceClient, userId, offerId);
}

async function ensureOfferSelected(supabase: any, userId: string, offer: any, productId: string) {
  let status = String(offer.status ?? "");
  let resolution = resolveTrendOfferHandoff(status);
  if (resolution === "reuse") return null;

  if (resolution === "reopen") {
    const reopenedAt = new Date().toISOString();
    const reopenCommandId = `trend-test:${productId}:reopen:${reopenedAt}`;
    const reopenResult = await transitionOfficialOfferState({
      commandId: reopenCommandId,
      idempotencyKey: reopenCommandId,
      correlationId: `trend-test:${productId}`,
      causationId: null,
      tenantId: userId,
      actor: { type: "user", id: userId, service: "trends-selection-desk" },
      requestedAt: reopenedAt,
      entityId: offer.id,
      fromState: "rejected",
      toState: "pending_manual_review",
      origin: "trends.approve-test.reopen",
      reason: { code: "TREND_TEST_REOPENED", detail: "Fresh Radar opportunity reopens previously rejected offer identity for a new human-approved test" },
      evidenceRefs: [`trend_radar_product:${productId}`, `offer:${offer.id}`],
    }, createSupabaseStateDependencies(supabase, userId));
    if (reopenResult.status === "rejected") throw new Error(reopenResult.message);
    status = "pending_manual_review";
    resolution = "select";
  }

  const block = resolveTrendOfferHandoffBlock(status);
  if (block) return block;

  if (resolution !== "select") {
    return {
      code: "offer_unavailable" as const,
      message: `Esta oportunidade está vinculada a uma oferta em estado ${status || "desconhecido"} e não pode ser aprovada automaticamente.`,
    };
  }

  const requestedAt = new Date().toISOString();
  const commandId = `trend-test:${productId}:select:${requestedAt}`;
  const result = await transitionOfficialOfferState({
    commandId,
    idempotencyKey: commandId,
    correlationId: `trend-test:${productId}`,
    causationId: null,
    tenantId: userId,
    actor: { type: "user", id: userId, service: "trends-selection-desk" },
    requestedAt,
    entityId: offer.id,
    fromState: "pending_manual_review",
    toState: "selected",
    origin: "trends.approve-test",
    reason: { code: "TREND_TEST_APPROVED", detail: "Human-approved Trends IA experiment" },
    evidenceRefs: [`trend_radar_product:${productId}`, `offer:${offer.id}`],
  }, createSupabaseStateDependencies(supabase, userId));
  if (result.status === "rejected") throw new Error(result.message);
  return null;
}

async function approveAndBridge(formData: FormData) {
  const productId = String(formData.get("product_id") || "").trim();
  if (!productId) throw new Error("Produto do Radar inválido.");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: product, error: productError } = await supabase
    .from("trend_radar_products")
    .select("id,radar_run_id,priority,product_term,category,marketplace,commercial_score,score_breakdown,direct_evidence,selected_offer_id")
    .eq("id", productId)
    .single();
  if (productError || !product) throw new Error("Produto do Radar não encontrado.");

  const { data: run, error: runError } = await supabase
    .from("trend_radar_runs")
    .select("id,user_id,strategy_version")
    .eq("id", product.radar_run_id)
    .eq("user_id", user.id)
    .single();
  if (runError || !run) throw new Error("Radar não pertence ao usuário autenticado.");

  const evidence = firstEvidence(product.direct_evidence);
  let offer = product.selected_offer_id
    ? (await supabase.from("offers").select("id,status,platform,product_name,explainability").eq("id", product.selected_offer_id).eq("user_id", user.id).maybeSingle()).data
    : null;

  if (!offer) offer = await findExactOffer(supabase, user.id, String(product.marketplace ?? ""), evidence);
  if (!offer && product.marketplace === "Shopee") offer = await materializeShopeeOfferFromSnapshot(user.id, product, evidence);
  if (!offer && product.marketplace === "Mercado Livre") offer = await materializeMercadoLivreOfferFromSnapshot(user.id, product, evidence);
  if (!offer) throw new Error("Nenhuma oferta rastreável existente foi encontrada para esta oportunidade.");

  const block = await ensureOfferSelected(supabase, user.id, offer, product.id);
  if (block) return { blocked: block, productId: product.id };

  const approvedAt = new Date().toISOString();
  const executionContext = {
    origin: "trend",
    experiment_source: "trend_radar",
    experiment_key: product.id,
    radar_run_id: product.radar_run_id,
    radar_product_id: product.id,
    strategy_version: run.strategy_version,
    commercial_score: Number(product.commercial_score ?? 0),
    offer_id: offer.id,
    approved_at: approvedAt,
    automatic_publication: false,
  };

  const { error: productUpdateError } = await supabase.from("trend_radar_products").update({
    selection_decision: "APROVAR_TESTE",
    selection_decided_at: approvedAt,
    selected_offer_id: offer.id,
    match_status: "matched",
    execution_context: executionContext,
  }).eq("id", product.id);
  if (productUpdateError) throw new Error("Falha ao registrar vínculo do teste comercial.");

  const priorExplainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability : {};
  const { error: offerUpdateError } = await supabase.from("offers").update({
    explainability: { ...priorExplainability, trend_execution: executionContext },
  }).eq("id", offer.id).eq("user_id", user.id);
  if (offerUpdateError) throw new Error("Falha ao registrar origem Trends na oferta.");

  await prepareTrendSocialDrafts({
    userId: user.id,
    offerId: offer.id,
    productId: product.id,
  });

  revalidatePath("/trends");
  revalidatePath("/offers");
  revalidatePath("/videos");
  revalidatePath("/facebook");
  revalidatePath("/instagram");
  revalidatePath("/telegram");
  revalidatePath("/whatsapp");
  return { blocked: null, productId: product.id };
}

async function persistIgnore(formData: FormData) {
  const productId = String(formData.get("product_id") || "").trim();
  if (!productId) throw new Error("Produto do Radar inválido.");
  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: product } = await supabase.from("trend_radar_products").select("id,radar_run_id").eq("id", productId).single();
  if (!product) throw new Error("Produto do Radar não encontrado.");
  const { data: run } = await supabase.from("trend_radar_runs").select("id").eq("id", product.radar_run_id).eq("user_id", user.id).single();
  if (!run) throw new Error("Radar não pertence ao usuário autenticado.");

  const { error } = await supabase.from("trend_radar_products").update({
    selection_decision: "IGNORAR",
    selection_decided_at: new Date().toISOString(),
  }).eq("id", productId);
  if (error) throw new Error("Falha ao registrar decisão comercial.");
  revalidatePath("/trends");
}

export async function approveTrendTestAction(formData: FormData) {
  const result = await approveAndBridge(formData);
  if (result.blocked) {
    redirect(`/trends?approval_error=${result.blocked.code}&product_id=${encodeURIComponent(result.productId)}`);
  }
}

export async function ignoreTrendProductAction(formData: FormData) {
  await persistIgnore(formData);
}
