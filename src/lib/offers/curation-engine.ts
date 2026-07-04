import { featureFlags } from "./flags";
import { calculateOfferScore, type ScoreInput } from "./score";
import { calculateOfferScoreV2, calculateFinalRankScore } from "./score-v2";
import { analyzeConversionPotential } from "@/lib/ai/groq";
import { logger } from "@/lib/utils/logger";
import type { Offer } from "@/types/domain";
import { MINIMUM_DISCOUNT_BY_CATEGORY } from "./viral-intelligence";

export interface CurationResult {
  score: number;
  official_policy?: number;
  historical_policy?: number;
  explainability?: any;
}

/**
 * Adapter Principal: Calcula o Score.
 * Ativação da Commercial Policy (Sprint 04).
 * Retorna o Score V2 como Oficial, mantendo V1 apenas como Histórico.
 */
export function curateOfferScore(input: ScoreInput): CurationResult {
  const isCurationEnabled = featureFlags.ENABLE_CURATION_ENGINE;
  
  const historicalPolicyScore = calculateOfferScore(input);
  const officialPolicyOutput = calculateOfferScoreV2(input);

  if (!isCurationEnabled) {
    // Rollback: se desativado, retorna V1 como Oficial
    return { 
      score: historicalPolicyScore,
      official_policy: historicalPolicyScore,
      historical_policy: historicalPolicyScore
    };
  }

  return {
    score: officialPolicyOutput.final_score,
    official_policy: officialPolicyOutput.final_score,
    historical_policy: historicalPolicyScore,
    explainability: officialPolicyOutput.explainability
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

  // 3. Filtro de Desconto Mínimo por Categoria (Fase 2 — MINIMUM_DISCOUNT_BY_CATEGORY)
  // REGRA: Aplica APENAS quando old_price está disponível.
  //        Produtos sem old_price NÃO são descartados (podem ter desconto via cupom ou badge).
  //        Registra motivo em log [DISCOUNT_FILTER] para auditoria.
  sortedOffers = sortedOffers.filter(offer => {
    // Sem old_price: não é possível calcular desconto real — mantém a oferta
    if (!offer.old_price || offer.old_price <= offer.current_price) {
      return true;
    }
    const cat = (offer.category || "default").toLowerCase();
    const minDiscount = MINIMUM_DISCOUNT_BY_CATEGORY[cat] ?? MINIMUM_DISCOUNT_BY_CATEGORY["default"];
    const actualDiscount = (offer.old_price - offer.current_price) / offer.old_price;
    const passes = actualDiscount >= minDiscount;
    if (!passes) {
      console.log(
        `[DISCOUNT_FILTER] Rejeitado: "${(offer.product_name || "").substring(0, 50)}" | ` +
        `desconto real=${(actualDiscount * 100).toFixed(1)}% < mínimo=${(minDiscount * 100).toFixed(0)}% (cat: ${cat})`
      );
    }
    return passes;
  });

  // 4. Corte de Top 3 se IA ativa, para não estourar rate limit. Exigência estrita: limitToAi = 3.
  const limitToAi = 3;
  
  if (isAiCurationEnabled) {
    const topTier = sortedOffers.slice(0, limitToAi);
    
    // Processamento da IA Sequencial para respeitar o Rate Limit (Tokens per Minute)
    const aiEvaluated = [];
    for (const offer of topTier) {
      // Bate no motor quente
      const aiResult = await analyzeConversionPotential(offer, offer.score);
      
      // Ranking Oficial ativo
      const officialScore = offer.official_policy || offer.score || 0;
      const conversionScore = offer.explainability?.conversion_score || 5.0;
      const aiCopyScore = aiResult.ai_score_boost * 2; // Escala 0-5 do boost mapeada para 0-10
      const totalScore = calculateFinalRankScore(officialScore, conversionScore, aiCopyScore);
      
      aiEvaluated.push({
        ...offer,
        score: totalScore,
        explainability: {
          ...(offer.explainability || {}),
          ai_score_boost: aiResult.ai_score_boost,
          ai_copy_score: aiCopyScore,
          official_score: officialScore,
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
