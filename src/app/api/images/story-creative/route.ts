import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildStoryCommercialPlan } from "@/lib/social/story-commercial-plan";
import { buildStoryCommercialFrameModel, renderStoryCommercialFrame } from "@/lib/social/story-commercial-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId")?.trim();
  const frame = Number(searchParams.get("frame") || "1");

  if (!postId || !Number.isInteger(frame) || frame < 1 || frame > 2) {
    return NextResponse.json({ ok: false, message: "postId e frame=1|2 são obrigatórios." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: post, error } = await supabase
    .from("posts")
    .select("id,channel,status,offers(product_name,platform,category,current_price,old_price,image_url,shipping_free,explainability,marketplace_metrics)")
    .eq("id", postId)
    .in("channel", ["instagram", "facebook"])
    .eq("status", "draft")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ ok: false, message: "Draft não encontrado para Stories." }, { status: 404 });

  const offer = Array.isArray(post.offers) ? post.offers[0] : post.offers;
  if (!offer?.image_url || !/^https:\/\//iu.test(offer.image_url)) {
    return NextResponse.json({ ok: false, message: "Oferta sem imagem HTTPS válida para Story." }, { status: 422 });
  }

  const explainabilityMetrics = offer.explainability?.marketplace_metrics;
  const plan = buildStoryCommercialPlan({
    productName: offer.product_name,
    marketplace: offer.platform,
    category: offer.category ?? null,
    currentPrice: Number(offer.current_price),
    originalPrice: offer.old_price == null ? null : Number(offer.old_price),
    freeShipping: offer.shipping_free ?? null,
    evidence: {
      ...(offer.explainability ?? {}),
      marketplace_metrics: {
        ...(explainabilityMetrics && typeof explainabilityMetrics === "object" ? explainabilityMetrics as Record<string, unknown> : {}),
        ...(offer.marketplace_metrics ?? {}),
      },
    },
  });

  const model = buildStoryCommercialFrameModel(
    plan,
    {
      marketplace: offer.platform,
      imageUrl: offer.image_url,
      channel: post.channel as "instagram" | "facebook",
    },
    frame as 1 | 2,
  );
  if (!model) return NextResponse.json({ ok: false, message: "Esta oferta não precisa dessa segunda arte." }, { status: 404 });

  return new ImageResponse(renderStoryCommercialFrame(model), {
    width: 1080,
    height: 1920,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename=story-${post.channel}-${postId}-${frame}.png`,
    },
  });
}
