import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INSTAGRAM_STORIES_V4_HANDOFF_MARKER } from "@/lib/social/meta-publication-guard";
import { buildStoryV5Plan } from "@/lib/social/instagram-story-v5";
import {
  buildStoryV5FrameModel,
  renderStoryV5Frame,
} from "@/lib/social/instagram-story-v5-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

type StoryOffer = {
  product_name?: string | null;
  platform?: string | null;
  category?: string | null;
  current_price?: number | null;
  old_price?: number | null;
  image_url?: string | null;
};

function validHttpsImage(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("postId")?.trim();
  const frame = Number(searchParams.get("frame"));

  if (!postId || !Number.isInteger(frame) || frame < 1 || frame > 3) {
    return NextResponse.json({ ok: false, message: "postId e frame=1|2|3 são obrigatórios." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: post, error } = await supabase
    .from("posts")
    .select("id,channel,status,content,offers(product_name,platform,category,current_price,old_price,image_url)")
    .eq("id", postId)
    .eq("channel", "instagram")
    .eq("status", "draft")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ ok: false, message: "Draft de Story não encontrado." }, { status: 404 });
  if (!post.content.trimStart().startsWith(INSTAGRAM_STORIES_V4_HANDOFF_MARKER)) {
    return NextResponse.json({ ok: false, message: "Draft não pertence ao fluxo de Stories." }, { status: 422 });
  }

  const related = (Array.isArray(post.offers) ? post.offers[0] : post.offers) as StoryOffer | null | undefined;
  if (!related) return NextResponse.json({ ok: false, message: "Oferta do Story não encontrada." }, { status: 422 });

  const imageUrl = validHttpsImage(related.image_url);
  if (!imageUrl) {
    return NextResponse.json({ ok: false, message: "Oferta sem imagem HTTPS válida para Story V5." }, { status: 422 });
  }

  const plan = buildStoryV5Plan({
    productName: related.product_name || "Oferta selecionada",
    marketplace: related.platform || "Marketplace",
    category: related.category ?? null,
    currentPrice: Number(related.current_price ?? 0),
    originalPrice: related.old_price === null || related.old_price === undefined ? null : Number(related.old_price),
    evidence: {},
    freeShipping: false,
  });

  const frameModel = buildStoryV5FrameModel(
    plan,
    { marketplace: related.platform || "Marketplace", imageUrl },
    frame as 1 | 2 | 3,
  );

  if (!frameModel) {
    return NextResponse.json(
      { ok: false, message: `Este Story V5 possui somente ${plan.frameCount} tela(s).` },
      { status: 404 },
    );
  }

  return new ImageResponse(renderStoryV5Frame(frameModel), {
    width: STORY_WIDTH,
    height: STORY_HEIGHT,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename=story-v5-${postId}-${frame}.png`,
    },
  });
}
