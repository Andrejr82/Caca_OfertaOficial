import { NextResponse } from "next/server";
import { publishToInstagram } from "@/lib/instagram/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
      .single();

    if (postError || !post) {
      return NextResponse.json({ ok: false, message: "Post não encontrado." }, { status: 404 });
    }

    if (post.channel !== "instagram") {
      return NextResponse.json({ ok: false, message: "Este post não é do canal Instagram." }, { status: 400 });
    }

    const offer = post.offers;
    if (!offer) {
      return NextResponse.json({ ok: false, message: "Oferta vinculada não encontrada." }, { status: 404 });
    }

    // A API do Instagram exige uma URL de imagem pública
    const imageUrl = offer.image_url;
    if (!imageUrl) {
      return NextResponse.json({ 
        ok: false, 
        message: "O produto não possui uma URL de imagem. Para publicar no Instagram, é obrigatório definir uma imagem." 
      }, { status: 422 });
    }

    // O usuário pode ter editado o texto na tela antes de aprovar
    const finalContent = content || post.content;

    // Se o conteúdo foi alterado, atualiza primeiro no banco de dados
    if (content && content !== post.content) {
      await supabase
        .from("posts")
        .update({ content: finalContent })
        .eq("id", post.id);
    }

    // 2. Executa a publicação real via Instagram Graph API
    // Para simplificar a publicação no feed do Instagram, usaremos a legenda limpa do feed
    // Vamos extrair a legenda do feed caso existam as divisões dos rascunhos de stories/carousel
    let publishCaption = finalContent;
    if (finalContent.includes("=== STORIES SUGERIDOS ===")) {
      publishCaption = finalContent.split("=== STORIES SUGERIDOS ===")[0].trim();
    }

    const externalId = await publishToInstagram(imageUrl, publishCaption);

    // 3. Atualiza o status do post para published
    const now = new Date().toISOString();
    const { error: postUpdateError } = await supabase
      .from("posts")
      .update({
        status: "published",
        external_id: externalId,
        posted_at: now
      })
      .eq("id", post.id);

    if (postUpdateError) {
      return NextResponse.json({ ok: false, message: "Erro ao atualizar status do post." }, { status: 500 });
    }

    // 4. Atualiza o status da oferta para posted
    await supabase
      .from("offers")
      .update({
        status: "posted",
        updated_at: now
      })
      .eq("id", offer.id);

    return NextResponse.json({ ok: true, externalId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha na publicação no Instagram.";
    console.error("Erro ao publicar no Instagram:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
