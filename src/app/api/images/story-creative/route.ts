import sharp from "sharp";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildStoryCommercialPlan } from "@/lib/social/story-commercial-plan";
import { buildStoryCommercialFrameModel, renderStoryCommercialFrame } from "@/lib/social/story-commercial-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoryChannel = "instagram" | "facebook";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const offerId = searchParams.get("offerId")?.trim();
  const channel = searchParams.get("channel") as StoryChannel | null;
  const frame = Number(searchParams.get("frame") || "1");
  const forMeta = searchParams.get("meta") === "1";
  const download = searchParams.get("download") === "1";

  if (!offerId || (channel !== "instagram" && channel !== "facebook") || !Number.isInteger(frame) || frame < 1 || frame > 2) {
    return NextResponse.json({ ok: false, message: "offerId, channel e frame=1|2 são obrigatórios." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: offer, error } = await supabase
    .from("offers")
    .select("id,product_name,platform,category,current_price,old_price,image_url,shipping_free,explainability,marketplace_metrics")
    .eq("id", offerId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!offer) return NextResponse.json({ ok: false, message: "Oferta não encontrada para Stories." }, { status: 404 });
  if (!offer.image_url || !/^https:\/\//iu.test(offer.image_url)) {
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
    { marketplace: offer.platform, imageUrl: offer.image_url, channel },
    frame as 1 | 2,
  );
  if (!model) return NextResponse.json({ ok: false, message: "Esta oferta não precisa dessa segunda arte." }, { status: 404 });

  const image = new ImageResponse(renderStoryCommercialFrame(model), { width: 1080, height: 1920 });
  const png = Buffer.from(await image.arrayBuffer());
  const fileBase = `story-${channel}-${offerId}-${frame}`;

  if (forMeta) {
    const jpeg = await sharp(png).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Content-Disposition": `inline; filename=${fileBase}.jpg`,
      },
    });
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename=${fileBase}.png`,
    },
  });
}
