import type { Offer } from "@/types/domain";

export interface ConversionScore {
  purchase_probability: number; // 0 a 10
  conversion_potential: number; // 0 a 10
  commercial_intent: number; // 0 a 10
  final_conversion_score: number; // 0 a 10
}

/**
 * Módulo Conversion Engine Independente
 * Responsabilidades:
 * - Purchase Probability (com base em avaliação e desconto real)
 * - Conversion Potential (com base em cupons e faixa de preço de alto giro)
 * - Commercial Intent (com base em categorias de consumo prioritárias)
 */
export function calculateConversionScore(offer: Offer): ConversionScore {
  const price = offer.current_price || 0;
  const oldPrice = offer.old_price || 0;
  const rating = offer.rating || 0;
  const category = (offer.category || "").toLowerCase();

  // 1. Purchase Probability (Critérios: avaliação consistente e desconto atrativo real)
  let purchaseProbability = 5.0; // Base neutra

  if (rating >= 4.5) {
    purchaseProbability += 2.0;
  } else if (rating > 0 && rating < 4.0) {
    purchaseProbability -= 1.5;
  }

  if (oldPrice > price) {
    const discountPct = (oldPrice - price) / oldPrice;
    if (discountPct >= 0.10 && discountPct <= 0.60) {
      purchaseProbability += 2.5; // Desconto real e saudável
    } else if (discountPct > 0.60) {
      purchaseProbability -= 1.5; // Alerta de desconto inflacionado
    }
  }
  
  if (price > 0 && price <= 150) {
    purchaseProbability += 1.0; // Menor barreira de entrada financeira
  } else if (price > 500) {
    purchaseProbability -= 1.0; // Maior reflexão necessária
  }
  purchaseProbability = Math.max(0, Math.min(10, purchaseProbability));

  // 2. Conversion Potential (Critérios: presença de cupom e faixa de preço de alto giro)
  let conversionPotential = 5.0;

  if (offer.coupon) {
    conversionPotential += 3.0; // Presença de cupom converte mais rápido
  }

  if (price > 0 && price <= 100) {
    conversionPotential += 2.0; // Alto giro / impulso
  } else if (price > 100 && price <= 300) {
    conversionPotential += 1.0;
  } else if (price > 700) {
    conversionPotential -= 2.0;
  }
  conversionPotential = Math.max(0, Math.min(10, conversionPotential));

  // 3. Commercial Intent (Critérios: categorias de alta demanda/prioridade)
  let commercialIntent = 5.0;

  const highDemandKeywords = ["casa", "cozinha", "pet", "infantil", "beleza", "utilidades", "celulares", "acessórios", "organizacao", "organização"];
  const lowDemandKeywords = ["construção", "construcao", "agrícola", "agricola", "industrial", "ferramentas profissionais", "autopeças", "autopecas", "b2b"];

  if (highDemandKeywords.some(keyword => category.includes(keyword))) {
    commercialIntent += 3.0;
  } else if (lowDemandKeywords.some(keyword => category.includes(keyword))) {
    commercialIntent -= 3.0;
  }
  commercialIntent = Math.max(0, Math.min(10, commercialIntent));

  // Média Ponderada para o score final de conversão
  // Pesos: Potencial de Conversão (40%), Probabilidade de Compra (30%), Intenção Comercial (30%)
  const finalConversionScore = Number(
    ((conversionPotential * 0.4) + (purchaseProbability * 0.3) + (commercialIntent * 0.3)).toFixed(2)
  );

  return {
    purchase_probability: Number(purchaseProbability.toFixed(1)),
    conversion_potential: Number(conversionPotential.toFixed(1)),
    commercial_intent: Number(commercialIntent.toFixed(1)),
    final_conversion_score: finalConversionScore
  };
}
