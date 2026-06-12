import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { discoverAndIngestTrendingOffers } from "@/lib/affiliates/scraper";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { generateOfferAnalysis } from "@/lib/ai/groq";

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  try {
    // 1. Validar autorização do Cron
    const authHeader = request.headers.get("authorization");
    const { searchParams } = new URL(request.url);
    const tokenParam = searchParams.get("token");

    const expectedSecret = process.env.CRON_SECRET || "desenvolvimento-local-caca-oferta";
    const token = authHeader ? authHeader.replace("Bearer ", "") : tokenParam;

    if (token !== expectedSecret) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: "Cliente Supabase Admin não configurado." }, { status: 503 });
    }

    // 2. Buscar usuários que ativaram o Cron de Scraping
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("user_id, value")
      .eq("key", "general_settings");

    if (settingsError) {
      console.error("Erro ao carregar configurações gerais no cron:", settingsError);
      return NextResponse.json({ ok: false, message: "Erro ao carregar configurações no banco." }, { status: 500 });
    }

    const activeUsers = settings
      ?.filter((s: any) => s.value && s.value.cron_scraping_enabled === true)
      .map((s: any) => s.user_id) || [];

    if (activeUsers.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum usuário com cron de scraping ativado." });
    }

    const report: any[] = [];

    // 3. Executar para cada usuário ativo
    for (const userId of activeUsers) {
      try {
        console.log(`[CRON] Iniciando scraping para o usuário: ${userId}`);
        
        // Executa o robô de descoberta
        const offers = await discoverAndIngestTrendingOffers(5, ["Mercado Livre", "Shopee", "Shein"], userId);
        
        const offersProcessed: any[] = [];

        // Se houver novas ofertas e a chave da Groq estiver disponível, gera copys
        if (process.env.GROQ_API_KEY && offers.length > 0) {
          for (const offer of offers) {
            try {
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

              // 3.3. Atualizar score e status
              const newStatus = analysis.score >= 7.0 ? "approved" : offer.status;
              await supabase
                .from("offers")
                .update({
                  score: analysis.score,
                  status: newStatus,
                  updated_at: new Date().toISOString()
                })
                .eq("id", offer.id);

              // 3.4. Deletar rascunhos de posts antigos
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

              offersProcessed.push({
                id: offer.id,
                product_name: offer.product_name,
                score: analysis.score,
                status: newStatus
              });

            } catch (offerError) {
              console.error(`Erro ao processar copys da oferta ${offer.id} no cron:`, offerError);
              offersProcessed.push({
                id: offer.id,
                product_name: offer.product_name,
                error: true
              });
            }
          }
        } else {
          for (const offer of offers) {
            offersProcessed.push({
              id: offer.id,
              product_name: offer.product_name,
              status: "draft"
            });
          }
        }

        report.push({
          user_id: userId,
          scraped_count: offers.length,
          offers: offersProcessed
        });

      } catch (userError) {
        console.error(`Erro ao executar scraping para usuário ${userId}:`, userError);
        report.push({
          user_id: userId,
          error: true
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Cron executado com sucesso.",
      report
    });

  } catch (error) {
    console.error("Erro interno no cron:", error);
    return NextResponse.json({ ok: false, message: "Erro interno no servidor." }, { status: 500 });
  }
}
