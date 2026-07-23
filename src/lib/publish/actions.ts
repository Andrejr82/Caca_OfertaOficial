"use server";

import { generateOfficialAI, type OfficialAIChannel, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Channel, Offer, Platform } from "@/types/domain";
import { evaluateQualityGate } from "@/lib/publish/quality-gate";
import { validateProductTitle } from "@/core/quality/product-title-quality";
import { parseSheinOneLinkHtml } from "@/lib/publish/shein-link";
import { fetchMLProductDetails } from "@/lib/platforms/mercadolivre";

interface QuickPostResult {
  ok: boolean;
  message: string;
  status?: string;
  offer?: Offer;
  trackedUrl?: string;
  copy?: string;
  copies?: { telegram: string; whatsapp: string; instagram: string };
}

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function metaTag(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeHtml(match[1].trim()) : "";
}

async function readLinkMetadata(url: string) {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; CacaOferta/1.0)" }, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return { title: "", imageUrl: "", price: 0, finalUrl: url };
    const html = await response.text();
    const socialTitle = metaTag(html, "og:title") || metaTag(html, "twitter:title");
    const sheinReference = /shein/i.test(response.url || url) ? parseSheinOneLinkHtml(html) : null;
    const genericSheinTitle = /não perca esta oferta|great offer|save big|economize muito/i.test(socialTitle);
    const title = (genericSheinTitle ? sheinReference?.titleFromUrl : socialTitle) || socialTitle;
    const imageUrl = metaTag(html, "og:image") || metaTag(html, "twitter:image");
    const rawPrice = metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
    const normalizedPrice = rawPrice?.includes(",") ? rawPrice.replace(/\./g, "").replace(",", ".") : rawPrice;
    const price = normalizedPrice ? Number(normalizedPrice) : 0;
    return {
      title,
      imageUrl,
      price: Number.isFinite(price) ? price : 0,
      finalUrl: response.url || url,
      sheinProductUrl: sheinReference?.productUrl,
      sheinProductId: sheinReference?.productId,
      sheinCategoryId: sheinReference?.categoryId,
    };
  } catch {
    return { title: "", imageUrl: "", price: 0, finalUrl: url };
  }
}

function detectPlatform(value: string): Platform {
  const lowerUrl = value.toLowerCase();
  if (lowerUrl.includes("shein")) return "Shein";
  if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu") || lowerUrl.includes("magazinevoce")) return "Magalu";
  if (lowerUrl.includes("shopee") || lowerUrl.includes("s.shopee")) return "Shopee";
  if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon") || lowerUrl.includes("a.co")) return "Amazon";
  if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("mercadolibre") || lowerUrl.includes("meli.la")) return "Mercado Livre";
  return "Outro";
}

export async function generateQuickPostAction(affiliateUrl: string, channel: Channel | "omnichannel"): Promise<QuickPostResult> {
  const url = affiliateUrl.trim();
  const userId = await getCurrentUserId();
  const supabase = await createServerSupabaseClient();
  if (!userId || !supabase) return { ok: false, status: "UNAUTHENTICATED", message: "Sessão expirada. Entre novamente no painel." };
  if (!/^https?:\/\/\S+$/i.test(url)) return { ok: false, status: "INVALID_URL", message: "Cole uma URL válida, começando com http:// ou https://." };

  const detectedPlatform = detectPlatform(url);
  const metadata = detectedPlatform === "Mercado Livre"
    ? await fetchMLProductDetails(url, userId) || await readLinkMetadata(url)
    : await readLinkMetadata(url);
  const operationId = crypto.randomUUID();
  const candidateId = `manual-${operationId}`;
  const ingestionId = `quick-publication-${operationId}`;
  const correlationId = `quick-publication:${operationId}`;
  const platform = detectPlatform(metadata.finalUrl || url) === "Outro" ? detectedPlatform : detectPlatform(metadata.finalUrl || url);
  const quality = evaluateQualityGate({
    title: metadata.title,
    platform,
    imageUrl: metadata.imageUrl,
    price: metadata.price,
    finalUrl: metadata.finalUrl || url,
  });
  const titleQuality = validateProductTitle(metadata.title);
  if (platform === "Outro") {
    return { ok: false, status: "UNSUPPORTED_MARKETPLACE", message: "Marketplace não reconhecido neste link." };
  }
  if (quality.status !== "APPROVED" || quality.classification !== "VALID_PRODUCT" || !titleQuality.valid) {
    const message = quality.reason === "PRECO_INVALIDO"
      ? `${platform} não expôs um preço verificável neste link. Use o link direto do item ou informe um preço comprovado.`
      : "Não foi possível confirmar um produto individual com nome, preço e imagem verificáveis. Cole o link direto do produto.";
    return {
      ok: false,
      status: quality.reason || titleQuality.reason || "INVALID_PRODUCT_LINK",
      message,
    };
  }

  const { data: offer, error: offerError } = await supabase.from("offers").insert({
    user_id: userId,
    platform,
    product_name: metadata.title,
    original_url: url,
    image_url: metadata.imageUrl || null,
    current_price: metadata.price,
    status: "pending_manual_review",
    score: 0,
    explainability: {
      contract_version: "pmav5.candidate/v1",
      candidate_id: candidateId,
      ingestion_id: ingestionId,
      correlation_id: correlationId,
      discovery_evidence: { source: "quick-publication", resolved_url: metadata.finalUrl, quality_gate: quality.classification },
      marketplace_metrics: { extracted_at: new Date().toISOString(), comparison: "not_applicable" }
    }
  }).select("*").single<Offer>();
  if (offerError || !offer) return { ok: false, status: "OFFER_CREATE_FAILED", message: `Não foi possível salvar o link: ${offerError?.message || "oferta ausente"}` };

  const targetChannels: OfficialAIChannel[] = channel === "omnichannel"
    ? ["telegram", "instagram", "whatsapp"]
    : channel === "telegram" || channel === "instagram" || channel === "whatsapp"
      ? [channel]
      : ["telegram"];
  const commandId = `quick-publication:${offer.id}:v1`;
  const command: OfficialAICommand = {
    contractVersion: "pmav5.ai/v1",
    commandId,
    idempotencyKey: `ai:draft:${offer.id}:v2`,
    correlationId,
    causationId: null,
    offerId: offer.id,
    tenantId: userId,
    providerPreference: "groq",
    channels: targetChannels,
    requestedAt: new Date().toISOString(),
    actor: { type: "user", id: userId, service: "quick-publication" },
    origin: "publish.quick-publication",
    reason: { code: "GENERATE_OFFICIAL_CONTENT" }
  };
  const result = await generateOfficialAI(command, createOfficialAIServiceDependencies(supabase, userId));
  if (result.status === "rejected") return { ok: false, status: result.code, message: result.message };

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("content,channel,affiliate_links(tracked_url)")
    .eq("offer_id", offer.id)
    .eq("status", "draft");
  if (postsError || !posts?.length) return { ok: false, status: "DRAFT_READ_FAILED", message: postsError?.message || "A IA respondeu, mas o rascunho não foi localizado." };

  const copies = Object.fromEntries(posts.map((post: any) => [post.channel, post.content])) as QuickPostResult["copies"];
  const firstLink = (Array.isArray((posts[0] as any)?.affiliate_links)
    ? (posts[0] as any).affiliate_links[0]?.tracked_url
    : (posts[0] as any)?.affiliate_links?.tracked_url) || "";
  return { ok: true, status: result.status, message: "Link processado e copy gerada com sucesso.", offer, copies, copy: posts[0]?.content || "", trackedUrl: firstLink };
}

export async function publishToTelegramAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: "A publicação direta continua sendo feita pela aba oficial do canal." };
}

export async function publishToInstagramAction(caption: string, imageUrl: string, offerId?: string) {
  void caption;
  void imageUrl;
  void offerId;
  return { ok: false, message: "A publicação direta continua sendo feita pela aba oficial do canal." };
}

export async function publishToWhatsAppAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: "A publicação direta continua sendo feita pela aba oficial do canal." };
}
