import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publishStoryToChannel, type StoryPublishChannel } from "@/lib/social/story-meta-publisher";

export const runtime = "nodejs";

type Body = { postId?: string; channel?: StoryPublishChannel; frame?: number };

function publicAppOrigin(request: Request) {
  const candidate = process.env.NEXT_PUBLIC_APP_URL
    || process.env.PUBLIC_APP_URL
    || process.env.APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const fallback = new URL(request.url).origin;
  const value = (candidate || fallback).replace(/\/$/u, "");
  if (!/^https:\/\//iu.test(value)) throw new Error("URL pública HTTPS da aplicação não configurada.");
  return value;
}

function receiptKey(postId: string, channel: StoryPublishChannel, frame: number) {
  return `stories.publication.receipt.${channel}.${postId}.${frame}`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  let claimed: { userId: string; key: string } | null = null;
  try {
    const body = await request.json() as Body;
    const postId = body.postId?.trim();
    const channel = body.channel;
    const frame = Number(body.frame || 1);
    if (!postId || (channel !== "instagram" && channel !== "facebook") || !Number.isInteger(frame) || frame < 1 || frame > 2) {
      return NextResponse.json({ ok: false, message: "postId, channel e frame=1|2 são obrigatórios." }, { status: 400 });
    }

    if (!supabase) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id,offer_id,channel,status,affiliate_links(tracked_url),offers(image_url)")
      .eq("id", postId)
      .eq("user_id", user.id)
      .eq("channel", channel)
      .eq("status", "draft")
      .maybeSingle();
    if (postError) return NextResponse.json({ ok: false, message: postError.message }, { status: 500 });
    if (!post) return NextResponse.json({ ok: false, message: "Draft de Story não encontrado para a rede selecionada." }, { status: 404 });

    const offer = Array.isArray(post.offers) ? post.offers[0] : post.offers;
    const affiliate = Array.isArray(post.affiliate_links) ? post.affiliate_links[0] : post.affiliate_links;
    if (!offer?.image_url || !/^https:\/\//iu.test(offer.image_url)) {
      return NextResponse.json({ ok: false, message: "Oferta sem imagem HTTPS válida." }, { status: 422 });
    }
    if (!affiliate?.tracked_url || !/^https:\/\//iu.test(affiliate.tracked_url)) {
      return NextResponse.json({ ok: false, message: "Story bloqueado: link rastreado ausente." }, { status: 422 });
    }

    const key = receiptKey(postId, channel, frame);
    const claimedAt = new Date().toISOString();
    const { error: claimError } = await supabase.from("app_settings").insert({
      user_id: user.id,
      key,
      value: { status: "publishing", channel, postId, offerId: post.offer_id, frame, claimedAt },
      updated_at: claimedAt,
    });
    if (claimError) {
      if (claimError.code === "23505") {
        return NextResponse.json({ ok: false, code: "STORY_ALREADY_PUBLISHED", message: "Esta arte já foi publicada ou está em publicação nessa rede." }, { status: 409 });
      }
      return NextResponse.json({ ok: false, message: "Não foi possível reservar a publicação do Story." }, { status: 503 });
    }
    claimed = { userId: user.id, key };

    const imageUrl = `${publicAppOrigin(request)}/api/images/story-creative?postId=${encodeURIComponent(postId)}&frame=${frame}&meta=1`;
    const externalId = await publishStoryToChannel(channel, imageUrl);
    const publishedAt = new Date().toISOString();
    const { error: receiptError } = await supabase.from("app_settings").update({
      value: { status: "published", channel, postId, offerId: post.offer_id, frame, externalId, imageUrl, publishedAt },
      updated_at: publishedAt,
    }).eq("user_id", user.id).eq("key", key);
    if (receiptError) {
      console.error("Story publicado na Meta, mas falhou ao finalizar recibo", receiptError);
      return NextResponse.json({ ok: true, externalId, warning: "Publicado, mas o recibo local ficou pendente de reconciliação." });
    }

    claimed = null;
    return NextResponse.json({ ok: true, externalId, publishedAt, channel, frame });
  } catch (error) {
    if (supabase && claimed) {
      await supabase.from("app_settings").delete().eq("user_id", claimed.userId).eq("key", claimed.key);
    }
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao publicar Story." }, { status: 500 });
  }
}
