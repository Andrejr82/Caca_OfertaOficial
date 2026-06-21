import { featureFlags } from "./flags";
import { calculateOfferScore, type ScoreInput } from "./score";
import { calculateOfferScoreV2, calculateFinalRankScore } from "./score-v2";
import { analyzeConversionPotential } from "@/lib/ai/groq";
import { logger } from "@/lib/utils/logger";
import type { Offer } from "@/types/domain";

export interface CurationResult {
  score: number;
  legacy_score?: number;
  new_score?: number;
  explainability?: any;
}

/**
 * Adapter Principal: Calcula o Score.
 * Se o Conversion Engine estiver ativado, retorna o Score V2.
 * Se o Shadow Mode estiver ativado, roda os dois e loga.
 */
export function curateOfferScore(input: ScoreInput): CurationResult {
  const isCurationEnabled = featureFlags.ENABLE_CURATION_ENGINE;
  const isShadowMode = featureFlags.ENABLE_SHADOW_SCORING;

  // Se nada da V2 estiver ativado, roda puro Legacy V1
  if (!isCurationEnabled && !isShadowMode) {
    return { score: calculateOfferScore(input) };
  }

  const legacyScore = calculateOfferScore(input);
  const v2Output = calculateOfferScoreV2(input);

  if (isShadowMode) {
    // Log estruturado para o Datadog / Observability
    logger.info("Shadow Mode Scoring", {
      event: "SHADOW_SCORING_RUN",
      legacy_score: legacyScore,
      new_score: v2Output.final_score,
      explainability: v2Output.explainability
    });
  }

  if (isCurationEnabled) {
    return {
      score: v2Output.final_score,
      legacy_score: legacyScore,
      new_score: v2Output.final_score,
      explainability: v2Output.explainability
    };
  }

  // Fallback: Retorna V1 mas anexa os dados V2 se Shadow Mode
  return {
    score: legacyScore,
    legacy_score: legacyScore,
    new_score: v2Output.final_score,
    explainability: v2Output.explainability
  };
}

// ==========================================
// FASE 3 E FASE 4: RANKING DE LOTE (HOT ENGINE)
// ==========================================

export interface RankingOptions {
  limit?: number;
  minColdScore?: number;
}

/**
 * Processa um lote inteiro de ofertas (Pipeline: Scraper -> Frio -> Quente).
 * Se a IA estiver ativada, o Top 3 receberá a análise da LLM e o ranking será reordenado.
 */
export async function rankOffersBatch(offers: Offer[], options: RankingOptions = {}): Promise<Offer[]> {
  const isAiCurationEnabled = featureFlags.ENABLE_AI_CURATION;
  const minScoreThreshold = options.minColdScore || 5.0; // Corte mínimo por regra (não inventar produto ruim)
  
  // 1. Já assumimos que cada `Offer` tem seu `score` frio calculado na inserção pelo curateOfferScore().
  // Ordena matematicamente primeiro (Cold Ranking).
  let sortedOffers = [...offers].sort((a, b) => (b.score || 0) - (a.score || 0));

  // 2. Filtro de Corte de Qualidade Base >= 5 (Obrigatório)
  sortedOffers = sortedOffers.filter(o => o.score >= minScoreThreshold);

  // 3. Corte de Top 3 se IA ativa, para não estourar rate limit. Exigência estrita: limitToAi = 3.
  const limitToAi = 3;
  
  if (isAiCurationEnabled) {
    const topTier = sortedOffers.slice(0, limitToAi);
    
    // Processamento da IA Sequencial para respeitar o Rate Limit (Tokens per Minute)
    const aiEvaluated = [];
    for (const offer of topTier) {
      // Bate no motor quente
      const aiResult = await analyzeConversionPotential(offer, offer.score);
      
      // Cálculo consistente com o rank ponderado da Curadoria V2
      const commercialScore = offer.new_score || offer.score || 0;
      const conversionScore = offer.explainability?.conversion_score || 5.0;
      const aiCopyScore = aiResult.ai_score_boost * 2; // Escala 0-5 do boost mapeada para 0-10
      const totalScore = calculateFinalRankScore(commercialScore, conversionScore, aiCopyScore);
      
      aiEvaluated.push({
        ...offer,
        score: totalScore,
        explainability: {
          ...(offer.explainability || {}),
          ai_score_boost: aiResult.ai_score_boost,
          ai_copy_score: aiCopyScore,
          commercial_score: commercialScore,
          conversion_score: conversionScore,
          final_rank_score: totalScore,
          ai_justification: aiResult.conversion_justification,
          ai_strong_points: aiResult.strong_points,
          ai_weak_points: aiResult.weak_points
        }
      });
      // Delay maior de 10s entre as chamadas para não estourar os limites da Groq (Rate Limit 429)
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Substituir no array original as ofertas que foram turbinadas pela IA e re-ordenar o geral (Ranking Final)
    const remainingOffers = sortedOffers.slice(limitToAi);
    sortedOffers = [...aiEvaluated, ...remainingOffers].sort((a, b) => b.score - a.score);
  }

  // Se a Feature Flag para Fase 4 (ML Histórico de CTR) estiver ativa
  if (featureFlags.ENABLE_HISTORICAL_SCORING) {
     // placeholder futuro: buscar CTR no Supabase e aplicar multiplicador de tração
     // ex: sortedOffers = applyMachineLearningTraction(sortedOffers);
  }

  return sortedOffers;
}
