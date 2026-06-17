import { inngest } from "./client";
import { logger } from "@/lib/utils/logger";
import { publisher } from "@/lib/publisher";
import { discoverAndIngestTrendingOffers } from "@/lib/affiliates/scraper";
import { rankOffersBatch } from "@/lib/offers/curation-engine";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import { calculateFinalRankScore } from "@/lib/offers/score-v2";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Função de Fila: Publicação
 * Retira o bloqueio síncrono do front-end/cron ao publicar nas redes.
 */
export const publishPostBackground = inngest.createFunction(
  { id: "publish-post", retries: 3, triggers: [{ event: "post/publish" }] },
  async ({ event, step }: any) => {
    logger.info("Executando fila Inngest: post/publish", { eventId: event.id });
    
    const { channel, payload } = event.data as any;

    const result = await step.run("publish-to-channel", async () => {
      return await publisher.publish(channel, payload);
    });

    if (!result.success) {
      throw new Error(`Falha no publisher: ${result.error}`);
    }

    return { result };
  }
);

/**
 * Função de Fila: Scraping & IA (STUB)
 * Preparado para substituir o processamento síncrono no Cron
 */
export const processOfferBackground = inngest.createFunction(
  { id: "process-offer", retries: 2, triggers: [{ event: "offer/process" }] },
  async ({ event, step }: any) => {
    logger.info("Processando oferta em background", { url: event.data.url });
    // TODO: Invocar scraper + gerador de copy da Groq aqui
    return { status: "processed" };
  }
);

/**
 * Função de Fila: Analytics (STUB)
 */
export const syncAnalyticsBackground = inngest.createFunction(
  { id: "sync-analytics", triggers: [{ event: "analytics/sync" }] },
  async ({ event, step }: any) => {
    logger.info("Sincronizando analytics em background", { source: event.data.source });
    return { synced: true };
  }
);

/**
 * Função de Fila: Robô de Ingestão e Curadoria V2
 * Executa de forma assíncrona o scraping e a geração de copys por IA para um usuário,
 * evitando problemas de timeout do servidor.
 */
export const runUserScrapingBackground = inngest.createFunction(
  { id: "run-user-scraping", retries: 1, triggers: [{ event: "cron/run-scraping" }] },
  async ({ event, step }: any) => {
    const { userId } = event.data;
    logger.info(`[Inngest] Iniciando scraping em background para usuário: ${userId}`);

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      throw new Error("Cliente Supabase Admin não configurado para Inngest.");
    }

    // 1. Executa o descobrimento de tendências
    const offers = await step.run("discover-offers", async () => {
      return await discoverAndIngestTrendingOffers(5, ["Mercado Livre", "Shopee", "Shein"], userId);
    });

    if (offers.length === 0) {
      return { status: "no_offers_scraped" };
    }

    // 2. Ordena comercialmente (Cold Curation)
    const rankedOffers = await step.run("rank-offers", async () => {
      return await rankOffersBatch(offers);
    });

    const top3Offers = rankedOffers.slice(0, 3);
    const processedOffers: any[] = [];

    // 3. Processamento das copys por IA
    if (process.env.GROQ_API_KEY && top3Offers.length > 0) {
      for (const offer of top3Offers) {
        await step.run(`process-offer-ai-${offer.id}`, async () => {
          // 3.1. Criar ou recuperar os links de afiliados
          const channels = ["telegram", "instagram", "whatsapp"] as const;
          const links: Record<string, any> = {};

          for (const channel of channels) {
            const subId = createSubId(channel, offer.product_name, offer.id);
            const trackedUrl = createTrackedUrl(offer.original_url, subId);

            const { data: linkData, error: linkError } = await supabase
              .from("affiliate_links")
              .upsert(
                {
                  user_id: userId,
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

            if (linkError) throw linkError;
            links[channel] = linkData;
          }

          // 3.2. Gerar copys
          const analysis = await generateOfferAnalysis(offer, {
            telegram: links.telegram.tracked_url,
            instagram: links.instagram.tracked_url,
            whatsapp: links.whatsapp.tracked_url
          });

          // 3.3. Calcular score final e atualizar status usando a fórmula ponderada consistente
          const commercialScore = Number(offer.new_score || offer.score || 0);
          const conversionScore = Number(offer.explainability?.conversion_score || 5.0);
          const aiCopyScore = Number(analysis.score || 0);
          
          const finalRankScore = calculateFinalRankScore(commercialScore, conversionScore, aiCopyScore);
          const newStatus = finalRankScore >= 7.0 ? "approved" : offer.status;

          const updatedExplainability = {
            ...(offer.explainability || {}),
            ai_copy_score: aiCopyScore,
            final_rank_score: finalRankScore,
            commercial_score: commercialScore,
            conversion_score: conversionScore
          };

          await supabase
            .from("offers")
            .update({
              score: finalRankScore,
              explainability: updatedExplainability,
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", offer.id);

          // 3.4. Deletar rascunhos de posts antigos para evitar duplicações
          await supabase.from("posts").delete().eq("offer_id", offer.id).eq("status", "draft");

          // 3.5. Salvar novos posts
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
              user_id: userId,
              offer_id: offer.id,
              affiliate_link_id: links.telegram.id,
              channel: "telegram",
              content: analysis.telegram,
              status: "draft"
            },
            {
              user_id: userId,
              offer_id: offer.id,
              affiliate_link_id: links.instagram.id,
              channel: "instagram",
              content: instagramContent,
              status: "draft"
            },
            {
              user_id: userId,
              offer_id: offer.id,
              affiliate_link_id: links.whatsapp.id,
              channel: "whatsapp",
              content: analysis.whatsapp,
              status: "draft"
            }
          ];

          await supabase.from("posts").insert(postsToInsert);
          processedOffers.push(offer.id);
        });
      }
    }

    return { status: "completed", processedCount: processedOffers.length };
  }
);
