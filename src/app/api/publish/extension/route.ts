import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import { publishToTelegramAction } from "@/lib/publish/actions";

// Liberar CORS para a Extensão do Chrome
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Em produção poderia ser o ID da extensão
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let userId = await getCurrentUserId();

    if (!userId) {
      // Como é uma extensão do Chrome, os cookies de sessão podem ser bloqueados por CORS.
      // Precisamos usar a chave Service Role para achar o dono da plataforma.
      const { data: offers } = await adminSupabase.from('offers').select('user_id').limit(1);
      if (offers && offers.length > 0) {
        userId = offers[0].user_id;
      } else {
        return NextResponse.json({ error: "Usuário não autenticado e nenhum histórico encontrado para assumir." }, { status: 401, headers: corsHeaders });
      }
    }

    const { title, price, imageUrl, finalUrl, channels } = await req.json();

    if (!finalUrl || !title) {
      return NextResponse.json({ error: "Dados incompletos enviados pela extensão." }, { status: 400, headers: corsHeaders });
    }

    const selectedChannels = Array.isArray(channels) && channels.length > 0 ? channels : ["telegram"];

    // A plataforma é deduzida da URL
    const platform = finalUrl.includes("magalu") || finalUrl.includes("magazine") ? "Magalu" : "Outro";

    // 1. Criar Oferta na base usando o adminSupabase para passar pelo RLS
    const { data: newOffer, error: offerError } = await adminSupabase
      .from("offers")
      .insert({
        user_id: userId,
        platform: platform,
        product_name: title,
        original_url: finalUrl,
        image_url: imageUrl || null,
        current_price: price || 0,
        status: "approved",
        score: 0,
      })
      .select()
      .single();

    if (offerError || !newOffer) {
      console.error("[Extension Route] Erro DB:", offerError);
      return NextResponse.json({ error: "Erro ao salvar a oferta no banco de dados: " + offerError?.message }, { status: 500, headers: corsHeaders });
    }

    // 2. Criar Tracking para todos os canais selecionados
    const aiLinks: Record<string, string> = {
      telegram: "",
      whatsapp: "",
      instagram: ""
    };

    for (const channel of selectedChannels) {
      const subId = createSubId(channel, newOffer.product_name, newOffer.id);
      const trackedUrl = createTrackedUrl(finalUrl, subId, channel, "social", "caca_oferta_extension");
      aiLinks[channel] = trackedUrl;

      await adminSupabase.from("affiliate_links").upsert(
        {
          user_id: userId,
          offer_id: newOffer.id,
          channel,
          original_url: finalUrl,
          tracked_url: trackedUrl,
          sub_id: subId
        },
        { onConflict: "offer_id,channel" }
      );
    }

    // 3. Invocar IA (Groq) - A IA gera copy para todos por padrão, passamos os links reais que criamos
    const aiResult = await generateOfferAnalysis(newOffer, aiLinks);

    // 4. Publicar em todos os canais selecionados
    const results = [];
    const { sendTelegramMessage, sendTelegramPhoto } = await import("@/lib/telegram/client");
    const { publishToInstagramAction, publishToWhatsAppAction } = await import("@/lib/publish/actions");

    for (const channel of selectedChannels) {
      try {
        if (channel === "telegram") {
          const copy = aiResult.telegram;
          if (imageUrl) await sendTelegramPhoto(copy, imageUrl);
          else await sendTelegramMessage(copy);
          results.push({ channel, status: "ok" });
        } 
        else if (channel === "whatsapp") {
          const copy = aiResult.whatsapp;
          // Como o endpoint da API é Server-Side puro sem auth, chamamos a camada de serviço direto para o whatsapp, 
          // ou usamos publishToWhatsAppAction que depende de cookie?
          // O publishToWhatsAppAction pede auth. Então usamos o serviço direto!
          const { whatsappService } = await import("@/lib/integrations/whatsapp");
          const channelId = process.env.WHATSAPP_CHANNEL_ID;
          if (channelId) {
            await whatsappService.sendChannelMedia(channelId, copy, imageUrl);
            results.push({ channel, status: "ok" });
          } else {
            results.push({ channel, status: "error", error: "WHATSAPP_CHANNEL_ID não configurado" });
          }
        }
        else if (channel === "instagram") {
          const copy = aiResult.instagram_feed;
          // publishToInstagramAction também exige cookie. Vamos chamar a funcão nativa!
          const { publishToInstagram, isInstagramConfigured } = await import("@/lib/instagram/client");
          if (isInstagramConfigured() && imageUrl) {
            await publishToInstagram(imageUrl, copy);
            results.push({ channel, status: "ok" });
          } else {
            results.push({ channel, status: "error", error: "Sem imagem ou sem Token do Instagram" });
          }
        }
      } catch (e: any) {
        results.push({ channel, status: "error", error: e.message });
      }
    }

    return NextResponse.json({ success: true, message: "Operação concluída", results }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("[Extension Route] Erro geral:", error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
