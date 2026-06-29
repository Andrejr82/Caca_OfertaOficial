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
      .neq("status", "deleted")
      .single();

    if (postError || !post) {
      return NextResponse.json({ ok: false, message: "Post não encontrado." }, { status: 404 });
    }

    if (post.channel !== "whatsapp") {
      return NextResponse.json({ ok: false, message: "Este post não é do canal WhatsApp." }, { status: 400 });
    }

    const offer = post.offers;
    if (!offer) {
      return NextResponse.json({ ok: false, message: "Oferta vinculada não encontrada." }, { status: 404 });
    }

    // O usuário pode ter editado o texto na tela antes de aprovar
    const finalContent = content || post.content;

    const crypto = require('crypto');
    const hash = (data: any) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 10);
    
    console.log('\n======================================================');
    console.log(`🔎 [AUDITORIA NEXT.JS] INÍCIO DO FLUXO`);
    console.log(`- Offer ID: ${offer.id}`);
    console.log(`- Product ID: ${offer.product_id || 'N/A'}`);
    console.log(`- Título: ${offer.title}`);
    console.log(`- image_url recebida do banco: ${offer.image_url}`);
    console.log(`- Offer object hash: ${hash(offer)}`);
    console.log(`- Post object hash: ${hash(post)}`);

    // Se o conteúdo foi alterado, atualiza primeiro no banco de dados
    if (content && content !== post.content) {
      await supabase
        .from("posts")
        .update({ content: finalContent })
        .eq("id", post.id);
    }

    // 2. Executa a publicação real via WhatsApp API
    const channelId = process.env.WHATSAPP_CHANNEL_ID;
    if (!channelId) {
      return NextResponse.json({ ok: false, message: "Canal do WhatsApp não configurado no .env" }, { status: 500 });
    }

    const { whatsappService } = await import("@/lib/integrations/whatsapp");
    let whatsappResult;
    try {
      console.log(`- Publisher payload info: channelId=${channelId}, image_url=${offer.image_url}`);
      console.log('======================================================\n');
      
      // A imagem será puxada automaticamente pelo Baileys lendo as tags OG do nosso link /go/
      whatsappResult = await whatsappService.sendChannelMedia(channelId, finalContent, offer.image_url);
    } catch (error: any) {
      console.error("Erro na integração WhatsApp:", error);
      return NextResponse.json({ ok: false, message: `Erro ao enviar via WhatsApp: ${error.message}` }, { status: 502 });
    }

    const externalId = whatsappResult.messageId || `wa-${Date.now()}`;

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
        updated_at: new Date().toISOString()
      })
      .eq("id", offer.id);

    return NextResponse.json({ ok: true, externalId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Falha na publicação no WhatsApp.";
    console.error("Erro ao publicar no WhatsApp:", error);
    return NextResponse.json({ 
      ok: false, 
      message: errorMessage 
    }, { status: 500 });
  }
}
