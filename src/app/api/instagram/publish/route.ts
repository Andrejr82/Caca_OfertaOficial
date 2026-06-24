import { NextResponse } from "next/server";
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

    const imageUrl = offer.image_url;
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

    // 2. Dispara o GitHub Actions para Renderizar e Postar o Vídeo
    console.log("[Instagram API] Disparando GitHub Actions para geração do vídeo...");
    
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return NextResponse.json({ 
        ok: false, 
        message: "Variável de ambiente GITHUB_TOKEN não configurada na Vercel." 
      }, { status: 500 });
    }

    // O format do original price e current price precisa vir da oferta.
    const currentPrice = offer.current_price ? offer.current_price.toFixed(2).replace('.', ',') : "0,00";
    const originalPrice = offer.original_price ? offer.original_price.toFixed(2).replace('.', ',') : "";

    const repoOwner = "Andrejr82"; // Substitua pelo usuário correto se necessário, mas em repositórios pessoais é o owner do repo
    const repoName = "Caca_OfertaOficial";
    
    // O GitHub aceita workflow dispatches através dessa API REST
    const githubUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/publish-reel.yml/dispatches`;

    const githubRes = await fetch(githubUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main", // ou "master" dependendo do repositório
        inputs: {
          postId: post.id,
          offerId: offer.id,
          productName: offer.product_name || "Oferta Especial",
          originalPrice: originalPrice,
          currentPrice: currentPrice,
          imageUrl: imageUrl,
          caption: publishCaption
        }
      })
    });

    if (!githubRes.ok) {
      const gitError = await githubRes.text();
      console.error("[GitHub Actions Error]:", gitError);
      return NextResponse.json({ 
        ok: false, 
        message: `Falha ao acionar o GitHub Actions: ${githubRes.statusText}. Verifique o GITHUB_TOKEN.` 
      }, { status: 500 });
    }

    // 3. Atualiza o status do post para processing (já que o github assumiu)
    await supabase
      .from("posts")
      .update({
        status: "processing"
      })
      .eq("id", post.id);

    return NextResponse.json({ 
      ok: true, 
      message: "Renderização do Vídeo iniciada no servidor! A publicação ocorrerá em até 2 minutos." 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha na publicação no Instagram.";
    console.error("Erro ao publicar no Instagram:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
