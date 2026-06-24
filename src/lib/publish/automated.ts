import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/offers/queries";
import { fetchLinkMetadata } from "@/lib/publish/scraper";
import { evaluateQualityGate } from "@/lib/publish/quality-gate";
import { logger } from "@/lib/utils/logger";
import { generateOfferAnalysis } from "@/lib/ai/groq";
import { curateOfferScore } from "@/lib/offers/curation-engine";
import { routeOffer, type OfferData } from "./router";
import { uploadImageAndGenerateVideo, getOgImageUrl } from "../cloudinary";

export async function publishAutomatedOfferAction(affiliateUrl: string, isDryRun: boolean = true) {
  const supabase = await createServerSupabaseClient();
  const userId = await getCurrentUserId();

  if (!supabase || !userId) {
    return { ok: false, message: "Usuário não autenticado." };
  }

  // 1. Scraping e Validação
  const metadata = await fetchLinkMetadata(affiliateUrl, userId);
  const qualityGate = evaluateQualityGate(metadata);

  if (qualityGate.status === "REJECTED") {
    return { ok: false, status: "REJECTED", message: `Rejeitado: ${qualityGate.reason}` };
  }

  // Fallbacks de segurança
  const finalTitle = metadata.title && metadata.title.length > 5 ? metadata.title : "Oferta Especial";
  const finalPlatform = metadata.platform !== "Outro" ? metadata.platform : "Loja Confiável";

  // 2. Prepara Oferta para o Roteador
  const offerData: OfferData = {
    title: finalTitle,
    price: metadata.price || 0,
    oldPrice: null, // Scraper atual não traz oldPrice de forma confiável ainda
    imageUrl: metadata.imageUrl || 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    platform: finalPlatform,
    url: metadata.finalUrl || affiliateUrl
  };

  // 3. Roteamento Inteligente
  const channels = routeOffer(offerData);

  if (channels.length === 0) {
    return { ok: true, status: "IGNORED", message: "Oferta não atendeu aos critérios mínimos de nenhum canal." };
  }

  // 4. Geração de Mídia Avançada (Cloudinary + Vercel OG)
  let videoUrl: string | null = null;
  let staticImageUrl: string | null = null;

  if (channels.includes('INSTAGRAM')) {
    // URL estática linda para usar em outros lugares se quiser
    staticImageUrl = getOgImageUrl(
      offerData.title,
      `R$ ${offerData.price.toFixed(2)}`,
      null,
      offerData.imageUrl,
      offerData.platform
    );

    // Gerar o Vídeo Animado (Reels)
    const videoResult = await uploadImageAndGenerateVideo(offerData.imageUrl);
    if (videoResult.success) {
      videoUrl = videoResult.videoUrl;
    } else {
      logger.error("Falha ao gerar vídeo no Cloudinary", { error: videoResult.error });
    }
  }

  // Para o Dry-Run, vamos apenas retornar o que ele FARIA
  if (isDryRun) {
    return {
      ok: true,
      status: "DRY_RUN",
      message: "Ensaio a seco concluído com sucesso. Nenhuma postagem real foi feita.",
      data: {
        offer: offerData,
        targetChannels: channels,
        media: {
          originalImage: offerData.imageUrl,
          vercelOgImage: staticImageUrl,
          cloudinaryVideoReel: videoUrl
        }
      }
    };
  }

  // =========================================================================
  // ABAIXO DISSO É ONDE ELE REALMENTE SALVARIA NO BANCO E CHAMARIA AS APIS
  // (Desativado até o painel estar pronto para chamar false no isDryRun)
  // =========================================================================
  
  return { ok: true, status: "PENDING_REAL_IMPLEMENTATION", message: "Fluxo real será habilitado em breve." };
}
