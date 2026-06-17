import type { ScoreInput } from "./score";
import { featureFlags } from "./flags";
import { calculateConversionScore } from "./conversion-engine";
import type { Offer } from "@/types/domain";

const categoryBoosts: Record<string, number> = {
  casa: 1.15,
  cozinha: 1.15,
  pet: 1.15,
  infantil: 1.15,
  beleza: 1.15,
  "organização": 1.15,
  organizacao: 1.15,
  utilidades: 1.15,
  celulares: 1.15,
  "acessórios": 1.15,
  acessorios: 1.15,
};

const categoryPenalties: Record<string, number> = {
  "construção": 0.70,
  construcao: 0.70,
  "agrícola": 0.70,
  agricola: 0.70,
  industrial: 0.70,
  "ferramentas profissionais": 0.70,
  "autopeças técnicas": 0.70,
  autopecas: 0.70,
  b2b: 0.70,
};

export interface ScoreV2Output {
  final_score: number;
  explainability: {
    price_score: number;
    discount_score: number;
    rating_score: number;
    impulse_score: number;
    purchase_potential_score: number;
    conversion_score: number;
    category_score: number;
    brand_score: number;
    historical_score: number;
    final_score: number;
    chosen_reason: string;
  };
}

export function calculateOfferScoreV2(input: ScoreInput): ScoreV2Output {
  const price = input.current_price;
  const category = (input.category || "").toLowerCase();

  // 1. Faixa de Preço (Tier A, B, C, D) - Peso Máx 2.0 (20%)
  let priceScore = 0;
  if (price > 0 && price <= 100) {
    priceScore = 10; // Tier A
  } else if (price > 100 && price <= 300) {
    priceScore = 8; // Tier B
  } else if (price > 300 && price <= 700) {
    priceScore = 5; // Tier C
  } else if (price > 700) {
    priceScore = 2; // Tier D
  } else {
    priceScore = 0;
  }

  // 2. Score de Impulso - Peso Máx 1.5 (15%)
  // Critérios: ticket baixo, decisão rápida, baixo risco, compra imediata.
  let impulseScore = 0;
  if (price > 0 && price <= 80) {
    impulseScore = 10; // baixíssimo risco, decisão rápida
  } else if (price > 80 && price <= 150) {
    impulseScore = 8; // ticket baixo
  } else if (price > 150 && price <= 300) {
    impulseScore = 5; // ticket médio
  } else {
    impulseScore = 2; // alto risco, exige mais reflexão
  }

  // 3. Potencial de Compra (Purchase Potential) - Peso Máx 2.0 (20%)
  // Critérios: categoria prioritária, utilidade, demanda orgânica.
  let purchasePotentialScore = 5; // Base neutra
  const isPriorityCategory = ["casa", "cozinha", "pet", "infantil", "beleza", "utilidades", "celulares", "acessórios"].some(cat => category.includes(cat));
  if (isPriorityCategory) {
    purchasePotentialScore += 3;
  }
  if (input.rating && input.rating >= 4.5) {
    purchasePotentialScore += 2;
  }
  purchasePotentialScore = Math.max(0, Math.min(10, purchasePotentialScore));

  // 4. Avaliação (Rating) - Peso Máx 1.0 (10%)
  let ratingScore = 0;
  if (input.rating) {
    ratingScore = (input.rating / 5) * 10; 
  } else {
    ratingScore = 5; // Default moderado
  }

  // 5. Desconto Real - Peso Máx 1.0 (10%)
  let discountScore = 0;
  if (input.old_price && input.old_price > price) {
    const discountPct = (input.old_price - price) / input.old_price;
    if (discountPct >= 0.05 && discountPct <= 0.80) { // Queda >= 5% e <= 80%
      discountScore = Math.min((discountPct / 0.50) * 10, 10);
    } else if (discountPct > 0.80) {
      discountScore = 2; // Penaliza descontos possivelmente falsos
    }
  }

  // 6. Popularidade/Conversão - Peso Máx 1.5 (15%)
  // Integrado com ENABLE_CONVERSION_ENGINE ao pipeline real.
  let conversionScore = 0;
  if (featureFlags.ENABLE_CONVERSION_ENGINE) {
    // Constrói um objeto compatível com Offer
    const dummyOffer: Offer = {
      id: "",
      user_id: "",
      platform: "Outro",
      product_name: "",
      category: input.category || null,
      original_url: "",
      image_url: null,
      current_price: price,
      old_price: input.old_price || null,
      coupon: input.coupon || null,
      rating: input.rating || null,
      estimated_commission: input.estimated_commission || null,
      commission_rate: null,
      score: 0,
      status: "draft",
      notes: null,
      seasonality: input.seasonality || null,
      created_at: "",
      updated_at: ""
    };
    const conversionResult = calculateConversionScore(dummyOffer);
    conversionScore = conversionResult.final_conversion_score;
  } else {
    // Fallback/Proxy legado se a flag estiver desativada
    if (input.coupon) conversionScore += 3;
    if (input.rating && input.rating >= 4.5) conversionScore += 7;
  }

  // 7. Categoria/Comissão (Boost/Penalidade) - Aplicado no final (Multiplicadores)
  let categoryScore = 10; // Score base neutro
  let categoryMultiplier = 1.0;
  
  const boostEntry = Object.entries(categoryBoosts).find(([key]) => category.includes(key));
  if (boostEntry) {
    categoryMultiplier = boostEntry[1];
    categoryScore = 15;
  }

  const penaltyEntry = Object.entries(categoryPenalties).find(([key]) => category.includes(key));
  if (penaltyEntry) {
    categoryMultiplier = penaltyEntry[1];
    categoryScore = 5;
  }

  // Soma Ponderada Fria (Total: 10)
  // Pesos: Impulse (15%), Purchase Potential (20%), Preço (20%), Conversão (15%), Rating (10%), Desconto (10%), Histórico (10%)
  const historicalScore = input.seasonality ? Math.min(input.seasonality * 5, 10) : 5;

  let rawScore = 
    (impulseScore * 0.15) +
    (purchasePotentialScore * 0.20) +
    (priceScore * 0.20) +
    (conversionScore * 0.15) +
    (ratingScore * 0.10) +
    (discountScore * 0.10) +
    (historicalScore * 0.10);

  // Aplica Categoria
  rawScore = rawScore * categoryMultiplier;

  // Limitando entre 0 e 10
  const finalScore = Number(Math.max(0, Math.min(10, rawScore)).toFixed(2));

  // Gera o chosen_reason baseado nos melhores componentes
  let reason = "Produto neutro com score regular.";
  if (finalScore >= 8) {
    reason = "Produto de alta conversão. ";
    if (impulseScore >= 9) reason += "Excelente apelo de compra por impulso devido à faixa de preço. ";
    if (categoryMultiplier > 1) reason += "Categoria prioritária detectada. ";
  } else if (finalScore < 5) {
    reason = "Produto rejeitado no filtro frio. ";
    if (categoryMultiplier < 1) reason += "Categoria penalizada (B2B/Industrial/Ferramentas). ";
    if (priceScore <= 2) reason += "Ticket altíssimo (Tier D). ";
  }

  return {
    final_score: finalScore,
    explainability: {
      price_score: Number(priceScore.toFixed(1)),
      discount_score: Number(discountScore.toFixed(1)),
      rating_score: Number(ratingScore.toFixed(1)),
      impulse_score: Number(impulseScore.toFixed(1)),
      purchase_potential_score: Number(purchasePotentialScore.toFixed(1)),
      conversion_score: Number(conversionScore.toFixed(1)),
      category_score: categoryScore,
      brand_score: 5, // Default placeholder
      historical_score: Number(historicalScore.toFixed(1)),
      final_score: finalScore,
      chosen_reason: reason.trim()
    }
  };
}

/**
 * Calcula a pontuação final ponderada de ranqueamento (Curadoria V2)
 * Formula: 70% score comercial + 20% score de conversão + 10% score de persuasão de IA
 */
export function calculateFinalRankScore(
  commercialScore: number,
  conversionScore: number,
  aiCopyScore: number
): number {
  const score = (0.70 * commercialScore) + (0.20 * conversionScore) + (0.10 * aiCopyScore);
  return Number(Math.max(0, Math.min(10, score)).toFixed(2));
}

