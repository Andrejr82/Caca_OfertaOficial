import { NextResponse } from "next/server";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import type { AffiliateLink, Offer } from "@/types/domain";
import { calculateFinalRankScore } from "@/lib/offers/score-v2";

export async function POST(request: Request) {
  try {
    const { offerId } = (await request.json()) as { offerId?: string };
    if (!offerId) {
      return NextResponse.json({ ok: false, message: "offerId é obrigatório." }, { status: 400 });
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

    // 1. Carrega a oferta
    const { data: offerData, error: offerError } = await supabase
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (offerError || !offerData) {
      return NextResponse.json({ ok: false, message: "Oferta não encontrada." }, { status: 404 });
    }

    const offer = offerData as Offer;

    // 2. Cria ou recupera os links de afiliados para cada canal
    const channels = ["telegram", "instagram", "whatsapp"] as const;
    const links: Record<string, AffiliateLink> = {};

    for (const channel of channels) {
      const subId = createSubId(channel, offer.product_name, offer.id);
      const trackedUrl = createTrackedUrl(offer.original_url, subId);

      const { data: linkData, error: linkError } = await supabase
        .from("affiliate_links")
        .upsert(
          {
            user_id: user.id,
            offer_id: offer.id,
            channel,
            original_url: offer.original_url,
            tracked_url: trackedUrl,
            sub_id: subId
          },
          { onConflict: "offer_id,channel" }
        )
        .select("*")
        .single();

      if (linkError || !linkData) {
        return NextResponse.json({ ok: false, message: `Erro ao criar link para o canal ${channel}.` }, { status: 500 });
      }

      links[channel] = linkData as AffiliateLink;
    }

    // 3. Executa a análise via Groq AI
    const analysis = await generateOfferAnalysis(offer, {
      telegram: links.telegram.tracked_url,
      instagram: links.instagram.tracked_url,
      whatsapp: links.whatsapp.tracked_url
    });

    // 3.5 Atualiza o SubID com a estratégia vencedora para rastreamento (Opcional ML Prep)
    if (analysis.winner_strategy_type) {
      for (const channel of channels) {
        const link = links[channel];
        const newSubId = `${link.sub_id}-${analysis.winner_strategy_type}`;
        
        // Fire and forget update
        supabase.from("affiliate_links").update({
          sub_id: newSubId
        }).eq("id", link.id).then();
      }

      // 3.6 Log da geração de copy (Observabilidade)
      supabase.from("ai_copy_logs").insert({
        offer_id: offer.id,
        user_id: user.id,
        winner_strategy: analysis.winner_strategy_type,
        score: analysis.score,
        model: process.env.GROQ_MODEL || "llama3-8b-8192"
      }).then(({ error }) => {
        if (error) {
          console.warn("[Observabilidade] Falha ao gravar ai_copy_log (Tabela pode não existir ainda):", error.message);
        }
      });
    }

    // 4. Atualiza o score e o status da oferta usando a função unificada
    const commercialScore = Number(offer.new_score || offer.score || 0);
    const conversionScore = Number(offer.explainability?.conversion_score || 5.0);
    const aiCopyScore = Number(analysis.score || 0);

    const finalRankScore = calculateFinalRankScore(commercialScore, conversionScore, aiCopyScore);

    const updatedExplainability = {
      ...(offer.explainability || {}),
      ai_copy_score: aiCopyScore,
      final_rank_score: finalRankScore,
      commercial_score: commercialScore,
      conversion_score: conversionScore
    };

    const newStatus = finalRankScore >= 7.0 ? "approved" : offer.status;
    const { error: updateError } = await supabase
      .from("offers")
      .update({
        score: finalRankScore,
        explainability: updatedExplainability,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", offer.id);

    if (updateError) {
      return NextResponse.json({ ok: false, message: "Erro ao atualizar score da oferta." }, { status: 500 });
    }

    // 5. Deleta rascunhos antigos de posts desta oferta para evitar duplicações
    await supabase.from("posts").update({ status: "deleted", deleted_at: new Date().toISOString() }).eq("offer_id", offer.id).eq("status", "draft");

    // 6. Insere os novos rascunhos na tabela de posts
    // Para Instagram, formatamos as sugestões de Stories, Reels e Carrossel no conteúdo de forma amigável
    const instagramContent = [
      analysis.instagram_feed,
      "",
      "=== STORIES SUGERIDOS ===",
      ...analysis.instagram_stories.map((s) => `• ${s}`),
      "",
      "=== REELS SUGERIDO ===",
      ...analysis.instagram_reels.map((r) => `- ${r}`),
      "",
      "=== CARROSSEL SUGERIDO ===",
      ...analysis.instagram_carousel.map((c) => `- ${c}`)
    ].join("\n");

    const postsToInsert = [
      {
        user_id: user.id,
        offer_id: offer.id,
        affiliate_link_id: links.telegram.id,
        channel: "telegram",
        content: analysis.telegram,
        status: "draft"
      },
      {
        user_id: user.id,
        offer_id: offer.id,
        affiliate_link_id: links.instagram.id,
        channel: "instagram",
        content: instagramContent,
        status: "draft"
      },
      {
        user_id: user.id,
        offer_id: offer.id,
        affiliate_link_id: links.whatsapp.id,
        channel: "whatsapp",
        content: analysis.whatsapp,
        status: "draft"
      }
    ];

    const { error: postsError } = await supabase.from("posts").insert(postsToInsert);
    if (postsError) {
      return NextResponse.json({ ok: false, message: "Erro ao salvar rascunhos de posts." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Copys e rascunhos de posts gerados com sucesso!",
      score: analysis.score,
      status: newStatus
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Erro ao gerar copys por IA:", error);
    return NextResponse.json({ ok: false, message: errorMessage }, { status: 500 });
  }
}
