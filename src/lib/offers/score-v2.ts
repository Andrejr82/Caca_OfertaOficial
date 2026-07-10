import type { ScoreInput } from "./score";
import { featureFlags } from "./flags";
import { calculateConversionScore } from "./conversion-engine";
import type { Offer } from "@/types/domain";
import { calculateBrandScore, isProductViralEligible } from "./viral-intelligence";

const categoryBoosts: Record<string, number> = {
  // Tier S (1.20) — Alta demanda impulsiva, alto giro
  "telefonia":              1.20,
  "games":                  1.20,
  "eletroportateis":        1.18,
  "eletroportáteis":        1.18,
  // Tier A (1.15) — Demanda constante, boa comissão
  "casa":                   1.15,
  "cozinha":                1.15,
  "pet":                    1.15,
  "petshop":                1.15,
  "infantil":               1.15,
  "criancas":               1.15,
  "crianças":               1.15,
  "beleza":                 1.15,
  "moda":                   1.15,
  "saude":                  1.15,
  "saúde":                  1.15,
  "organização":            1.15,
  "organizacao":            1.15,
  "utilidades":             1.15,
  "celulares":              1.15,
  "acessórios":             1.15,
  "acessorios":             1.15,
  "eletronicos":            1.15,
  "eletrônicos":            1.15,
  "informatica":            1.15,
  "informática":            1.15,
  "televisao":              1.15,
  "televisão":              1.15,
  "eletrodomesticos":       1.15,
  "eletrodomésticos":       1.15,
  // Tier B (1.10) — Boa demanda sazonal
  "esporte":                1.10,
  "supermercado":           1.10,
  "livros":                 1.10,
  "ar e ventilacao":        1.10,
  "ar e ventilação":        1.10,
  "moveis":                 1.10,
  "móveis":                 1.10,
  "cama":                   1.10,
  "decoracao":              1.10,
  "decoração":              1.10,
};

const categoryPenalties: Record<string, number> = {
  // Nicho B2B / Baixa conversão no consumidor final
  "construção":             0.72,
  "construcao":             0.72,
  "agrícola":               0.70,
  "agricola":               0.70,
  "industrial":             0.70,
  "ferramentas profissionais": 0.72,
  "autopeças técnicas":     0.72,
  "autopecas":              0.72,
  "b2b":                    0.68,
  // Categorias de ticket muito alto / baixo giro
  "viagens":                0.80,
  "papelaria":              0.85,
  "bebidas":                0.88,
  "grátis":                 1.05, // Grátis tem boa conversão mas comissão zero — leve boost
  "gratis":                 1.05,
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
    viral_penalty: number;  // Multiplicador de penalidade viral (0.35-1.0). NOVO.
    final_score: number;
    chosen_reason: string;
    sales_signal?: number | string | null;
    official_store?: boolean | string | null;
    campaign?: boolean | string | null;
    commission?: number | string | null;
    shop_type?: string | null;
    sold_quantity?: number | null;
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

  // 3. Potencial de Compra (Purchase Potential) - Peso Máx 1.0 (10%)
  // Critérios: categoria prioritária e utilidade. NÃO depende de rating (não confiável).
  let purchasePotentialScore = 5; // Base neutra
  const isPriorityCategory = [
    // Tier S
    "telefonia", "games", "eletroportáteis", "eletroportateis",
    // Tier A
    "casa", "cozinha", "pet", "petshop", "infantil", "crianças", "criancas",
    "beleza", "moda", "saúde", "saude",
    "utilidades", "celulares", "acessórios", "acessorios",
    "eletrônicos", "eletronicos", "informática", "informatica",
    "televisão", "televisao", "eletrodomésticos", "eletrodomesticos",
    // Tier B
    "esporte", "supermercado", "livros", "ar e ventilação", "ar e ventilacao",
    "móveis", "moveis", "cama", "decoração", "decoracao"
  ].some(cat => category.includes(cat));
  if (isPriorityCategory) {
    purchasePotentialScore += 4; // boost maior pois não depende mais de rating
  }
  purchasePotentialScore = Math.max(0, Math.min(10, purchasePotentialScore));

  // 4. Avaliação (Rating) - Peso REDUZIDO 0.5 (5%)
  // NOTA: rating é hardcoded em 4.8 na maioria dos scrapers (legado).
  // Peso reduzido ao mínimo para não distorcer o score enquanto não há rating real confiável.
  // Quando rating real estiver disponível e validado, este peso pode ser aumentado.
  let ratingScore = 0;
  if (input.rating && input.rating > 0) {
    ratingScore = (input.rating / 5) * 10;
  } else {
    ratingScore = 5; // Default neutro (nem positivo nem negativo)
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
    
    // Quick Win 3: adicionar demanda real ao ranking (sales_signal * 0.30)
    const signal = Number(input.sales_signal || input.sold_quantity || 0);
    if (signal > 0) {
      const signalBoost = Math.min(signal * 0.30, 10);
      conversionScore = Math.min(10, conversionScore + signalBoost);
    }
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
  // Pesos: Desconto (30%), Preço (20%), Impulse (10%), Purchase Potential (10%), Conversão (10%), Rating (10%), Histórico (10%)
  const historicalScore = input.seasonality ? Math.min(input.seasonality * 5, 10) : 5;

  // ── Brand Score (REAL) ─────────────────────────────────────────────────────
  // Substitui o placeholder fixo brand_score: 5 por cálculo real baseado em marca viral.
  // Peso: 15% — reduz price de 20%→15%, rating de 10%→5%, historical de 10%→5%.
  const brandScore = calculateBrandScore(input.product_name);

  // ── Viral Eligibility Penalty ──────────────────────────────────────────────
  // Penalidade gradual para produtos com keywords de baixo apelo viral.
  // Nunca descarta — apenas multiplica o score final por 0.35–1.0.
  const viralEligibility = isProductViralEligible(input.product_name, input.category);

  // ── Fórmula Ponderada Balanceada ──────────────────────────────────────────
  // Pesos totais = 100%:
  //   impulse(10%) + purchasePotential(10%) + price(15%) + conversion(10%)
  //   + rating(5%) + discount(30%) + brand(15%) + historical(5%)
  let rawScore =
    (impulseScore        * 0.10) +
    (purchasePotentialScore * 0.10) +
    (priceScore          * 0.15) +  // era 0.20 — reduzido para dar espaço ao brand
    (conversionScore     * 0.10) +
    (ratingScore         * 0.05) +  // era 0.10 — rating não é confiável (hardcoded legado)
    (discountScore       * 0.30) +
    (brandScore          * 0.15) +  // NOVO — brand score real (era placeholder 5)
    (historicalScore     * 0.05);   // era 0.10 — reduzido levemente

  // Aplica Categoria
  rawScore = rawScore * categoryMultiplier;

  // Aplica penalidade viral (acumulativa, mínimo 0.35 — nunca zera)
  rawScore = rawScore * viralEligibility.penalty;

  // Limitando entre 0 e 10
  const finalScore = Number(Math.max(0, Math.min(10, rawScore)).toFixed(2));

  // Gera o chosen_reason baseado nos melhores componentes
  let reason = "Produto neutro com score regular.";
  if (finalScore >= 8) {
    reason = "Produto de alta conversão. ";
    if (impulseScore >= 9) reason += "Excelente apelo de compra por impulso. ";
    if (brandScore >= 10) reason += "Marca viral Tier S detectada. ";
    else if (brandScore >= 7) reason += "Marca de bom engajamento detectada. ";
    if (categoryMultiplier > 1) reason += "Categoria prioritária. ";
  } else if (finalScore < 5) {
    reason = "Produto rejeitado no filtro frio. ";
    if (categoryMultiplier < 1) reason += "Categoria penalizada (B2B/Industrial). ";
    if (priceScore <= 2) reason += "Ticket altíssimo (Tier D). ";
    if (brandScore <= 2) reason += "Marca sem reconhecimento viral. ";
    if (viralEligibility.penalty < 0.70) reason += `Penalidade viral: ${viralEligibility.reasons[0] || "baixo apelo"}. `;
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
      brand_score: Number(brandScore.toFixed(1)), // REAL — não mais placeholder
      historical_score: Number(historicalScore.toFixed(1)),
      viral_penalty: viralEligibility.penalty,
      final_score: finalScore,
      chosen_reason: reason.trim(),
      sales_signal: input.sales_signal,
      official_store: input.official_store,
      campaign: input.campaign,
      commission: input.commission,
      shop_type: input.shop_type,
      sold_quantity: input.sold_quantity
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

