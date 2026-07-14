import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { publishToInstagram } from "@/lib/instagram/client";
import { isCouponOffer, resolveCouponPublishImageUrl } from "@/lib/coupons/presentation";
import { completeOfficialPublication } from "@/lib/state/official-publication-service";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";

export async function POST(request: Request) {
  try {
    const { postId, content } = (await request.json()) as { postId?: string; content?: string };
    if (!postId) {
      return NextResponse.json({ ok: false, message: "postId é obrigatório." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    }

    // 1. Carrega o post e a oferta associada
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*, offers(*)")
      .eq("id", postId)
      .neq("status", "deleted")
      .single();

    if (postError || !post) {
      return NextResponse.json({ ok: false, message: "Post não encontrado." }, { status: 404 });
    }

    if (post.channel !== "instagram") {
      return NextResponse.json({ ok: false, message: "Este post não é do canal Instagram." }, { status: 400 });
    }

    const offerData = post.offers;
    if (!offerData) {
      return NextResponse.json({ ok: false, message: "Oferta vinculada não encontrada." }, { status: 404 });
    }

    // O Supabase pode retornar a relação como um array dependendo de como a foreign key foi resolvida.
    const offer = Array.isArray(offerData) ? offerData[0] : offerData;
    if (offer.status !== "approved" || post.status !== "draft") {
      return NextResponse.json({ ok: false, message: "Publicação exige oferta approved e post draft." }, { status: 409 });
    }

    const couponOffer = isCouponOffer(offer);
    const imageUrl = couponOffer ? await resolveCouponPublishImageUrl(offer, request) : offer.image_url;
    if (!imageUrl) {
      return NextResponse.json({ 
        ok: false, 
        message: "O produto não possui uma URL de imagem. Para publicar no Instagram, é obrigatório definir uma imagem." 
      }, { status: 422 });
    }

    // O usuário pode ter editado o texto na tela antes de aprovar
    const finalContent = content || post.content;

    if (content && content !== post.content) {
      await supabase
        .from("posts")
        .update({ content: finalContent })
        .eq("id", post.id);
    }

    let publishCaption = finalContent;
    if (finalContent.includes("=== STORIES SUGERIDOS ===")) {
      publishCaption = finalContent.split("=== STORIES SUGERIDOS ===")[0].trim();
    }

    if (couponOffer) {
      const externalId = await publishToInstagram(imageUrl, publishCaption);

      await completeOfficialPublication({
        tenantId: user.id,
        actorId: "nextjs-instagram-publication",
        offerId: offer.id,
        postId: post.id,
        origin: "publication.instagram",
        requestedAt: post.created_at,
        idempotencyKey: `publication:${post.id}:${externalId}`,
        receiptRef: `receipt:instagram:${externalId}`
      }, createSupabaseStateDependencies(supabase, user.id));

      const { error: metadataError } = await supabase
        .from("posts")
        .update({
          external_id: externalId,
          posted_at: new Date().toISOString()
        })
        .eq("id", post.id);
      if (metadataError) throw new Error(metadataError.message);

      return NextResponse.json({
        ok: true,
        message: "Cupom publicado com sucesso no Instagram."
      });
    }

    return NextResponse.json({
      ok: false,
      message: "Publicação assíncrona por GitHub Actions está desconectada do fluxo oficial de estados."
    }, { status: 409 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha na publicação no Instagram.";
    console.error("Erro ao publicar no Instagram:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
