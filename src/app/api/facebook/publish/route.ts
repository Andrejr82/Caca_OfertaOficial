import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publishToFacebook } from "@/lib/platforms/facebook";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { postId } = await request.json();
    if (!postId) {
      return NextResponse.json({ error: "postId is required" }, { status: 400 });
    }

    // 1. Obter o post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*, offers(image_url)")
      .eq("id", postId)
      .eq("user_id", user.id)
      .single();

    if (postError || !post) {
      logger.error("Post não encontrado", { postId, error: postError });
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    // 2. Chamar o publicador do Facebook
    const imageUrl = post.offers?.image_url;
    const result = await publishToFacebook(post.content, imageUrl);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, details: result.error },
        { status: 500 }
      );
    }

    // 3. Atualizar status no banco
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        external_id: result.postId,
        posted_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (updateError) {
      logger.error("Falha ao atualizar post no BD (Facebook)", { updateError });
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    logger.error("Erro interno no endpoint de Facebook", { error: error.message });
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
