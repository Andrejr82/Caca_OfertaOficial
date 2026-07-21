"use server";

import { generateOfficialAI, type OfficialAIChannel, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import type { Channel, Offer, Platform } from "@/types/domain";

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
    const title = metaTag(html, "og:title") || metaTag(html, "twitter:title");
    const imageUrl = metaTag(html, "og:image") || metaTag(html, "twitter:image");
    const rawPrice = metaTag(html, "product:price:amount") || metaTag(html, "og:price:amount");
    const normalizedPrice = rawPrice?.includes(",") ? rawPrice.replace(/\./g, "").replace(",", ".") : rawPrice;
    const price = normalizedPrice ? Number(normalizedPrice) : 0;
    return { title, imageUrl, price: Number.isFinite(price) ? price : 0, finalUrl: response.url || url };
  } catch {
    return { title: "", imageUrl: "", price: 0, finalUrl: url };
  }
}

export async function generateQuickPostAction(affiliateUrl: string, channel: Channel | "omnichannel"): Promise<QuickPostResult> {
  const url = affiliateUrl.trim();
  const userId = await getCurrentUserId();
  const supabase = await createServerSupabaseClient();
  if (!userId || !supabase) return { ok: false, status: "UNAUTHENTICATED", message: "Sessão expirada. Entre novamente no painel." };
  if (!/^https?:\/\/\S+$/i.test(url)) return { ok: false, status: "INVALID_URL", message: "Cole uma URL válida, começando com http:// ou https://." };

  const metadata = await readLinkMetadata(url);
  const lowerUrl = url.toLowerCase();
  let platform: Platform = "Outro";
  if (lowerUrl.includes("shein")) platform = "Shein";
  else if (lowerUrl.includes("magazineluiza") || lowerUrl.includes("magalu") || lowerUrl.includes("magazinevoce")) platform = "Magalu";
  else if (lowerUrl.includes("shopee")) platform = "Shopee";
  else if (lowerUrl.includes("amzn") || lowerUrl.includes("amazon")) platform = "Amazon";
  else if (lowerUrl.includes("mercadolivre") || lowerUrl.includes("mercadolibre")) platform = "Mercado Livre";

  const { data: offer, error: offerError } = await supabase.from("offers").insert({
    user_id: userId,
    platform,
    product_name: metadata.title || "Produto importado por link",
    original_url: url,
    image_url: metadata.imageUrl || null,
    current_price: metadata.price,
    status: "pending_manual_review",
    score: 0,
    explainability: { contract_version: "pmav5.manual-link/v1", discovery_evidence: { source: "quick-publication", resolved_url: metadata.finalUrl } }
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
    correlationId: commandId,
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
