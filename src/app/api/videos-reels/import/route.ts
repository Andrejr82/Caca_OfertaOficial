import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVideoJobPolicy, quotaMessage } from "@/lib/videos/job-policy";
import { validateSourceUrl } from "@/lib/videos/import/source-policy";
import { resolveShopeeReelProduct } from "@/lib/videos/reels/shopee-reel-product";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { generateFacebookMessage, generateInstagramMessage } from "@/lib/messages/generate";

const schema = z.object({ sourceUrl: z.string().url(), channels: z.array(z.enum(["instagram", "facebook"])).min(1), rightsConfirmed: z.literal(true) });

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || !validateSourceUrl(parsed.data.sourceUrl).ok) return NextResponse.json({ ok: false, error: "Informe um link Shopee Video HTTPS válido." }, { status: 400 });

  try {
    const resolved = await resolveShopeeReelProduct(parsed.data.sourceUrl);
    const selected = resolved.selected;
    const existing = await client.from("offers").select("*").eq("user_id", userData.user.id).eq("platform", "Shopee").eq("shopee_item_id", selected.itemId).maybeSingle();
    if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
    let offer = existing.data;
    if (!offer) {
      const inserted = await client.from("offers").insert({ user_id: userData.user.id, platform: "Shopee", product_name: selected.productName, original_url: selected.productLink, image_url: selected.imageUrl, current_price: selected.priceMin, old_price: selected.priceMax && selected.priceMax > selected.priceMin ? selected.priceMax : null, score: 0, status: "selected", shopee_item_id: selected.itemId, shopee_shop_id: selected.shopId, marketplace_metrics: { sales: selected.sales, shopName: selected.shopName, selectionRule: "lowest_price" }, explainability: { sourceVideoUrl: parsed.data.sourceUrl, sourceProductTitle: resolved.productTitle, selectionRule: "lowest_price", affiliate_url: selected.offerLink } }).select("*").single();
      if (inserted.error || !inserted.data) return NextResponse.json({ ok: false, error: inserted.error?.message || "Oferta não criada." }, { status: 500 });
      offer = inserted.data;
    }

    const links = [] as Array<{ id: string; channel: string; tracked_url: string }>;
    for (const channel of parsed.data.channels) {
      const subId = createSubId(channel, offer.product_name, offer.id);
      const trackedUrl = createTrackedUrl(selected.offerLink, subId);
      const result = await client.from("affiliate_links").upsert({ user_id: userData.user.id, offer_id: offer.id, channel, original_url: selected.offerLink, tracked_url: trackedUrl, sub_id: subId }, { onConflict: "offer_id,channel" }).select("id,channel,tracked_url").single();
      if (result.error || !result.data) return NextResponse.json({ ok: false, error: result.error?.message || "Link afiliado não criado." }, { status: 500 });
      links.push(result.data);
    }
    const offerWithLinks = { ...offer, affiliate_links: links };
    const contents = parsed.data.channels.map((channel) => ({ channel, content: channel === "instagram" ? (() => { const value = generateInstagramMessage(offerWithLinks as any, { tracked_url: links.find((item) => item.channel === channel)!.tracked_url }); return typeof value === "string" ? value : value.reels.join("\n"); })() : generateFacebookMessage(offerWithLinks as any, { tracked_url: links.find((item) => item.channel === channel)!.tracked_url }) }));
    for (const item of contents) {
      const link = links.find((candidate) => candidate.channel === item.channel)!;
      const current = await client.from("posts").select("id").eq("offer_id", offer.id).eq("user_id", userData.user.id).eq("channel", item.channel).eq("status", "draft").maybeSingle();
      if (current.data?.id) await client.from("posts").update({ content: item.content, affiliate_link_id: link.id }).eq("id", current.data.id);
      else await client.from("posts").insert({ user_id: userData.user.id, offer_id: offer.id, affiliate_link_id: link.id, channel: item.channel, content: item.content, status: "draft" });
    }
    const policy = getVideoJobPolicy();
    const queued = await (client as any).rpc("enqueue_video_job", { _user_id: userData.user.id, _offer_id: offer.id, _script: "imported-reel-v1", _template_id: "imported-reel-v1", _daily_limit: null, _queue_limit: policy.queueLimit }).single();
    if (queued.error) return NextResponse.json({ ok: false, error: queued.error.message.includes("VIDEO_QUEUE_LIMIT") ? quotaMessage("queue_limit", policy) : queued.error.message }, { status: queued.error.message.includes("VIDEO_QUEUE_LIMIT") ? 429 : 500 });
    await client.from("video_jobs").update({ metadata: { importedReel: { sourceUrl: parsed.data.sourceUrl, resolvedPageUrl: resolved.resolvedPageUrl, mediaUrl: resolved.mediaUrl, productTitle: resolved.productTitle, selectedItemId: selected.itemId, selectedShopId: selected.shopId, channels: parsed.data.channels, rightsConfirmed: true, selectionRule: "lowest_price" } } }).eq("id", queued.data.id).eq("user_id", userData.user.id);
    return NextResponse.json({ ok: true, jobId: queued.data.id, offerId: offer.id, productName: offer.product_name, price: offer.current_price, channels: parsed.data.channels, drafts: contents }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao preparar Reel." }, { status: 422 });
  }
}
