export interface CommercialDataInput {
  platform?: string;
  marketplace?: string;
  category?: string;
  rating?: number;
  sales_count?: number;
  brand?: string;
  is_official_store?: boolean;
  is_mall?: boolean;
  has_extra_commission?: boolean;
  detected_campaigns?: string[];
  shopee_enrichment?: any; // Fallback para manter o enriquecimento anterior
  commercialComparison?: any; // Shadow mode comparison result
}

export type CommercialTier = 'S' | 'A' | 'B' | 'C' | 'LIXO';

export interface CommercialQualityResult {
  status: string;
  confidence: string;
}

export interface IntelligenceResult {
  tier: CommercialTier;
  commercialValueScore: number; // Um multiplicador ou bônus interpretativo
  signals: string[];
  commercialQuality: CommercialQualityResult;
}

export class MarketplaceIntelligenceEngine {
  /**
   * Responde exclusivamente à pergunta: "Qual o valor comercial desta oferta?"
   * Sem calcular o ranking principal, e sim enriquecendo a decisão comercial.
   */
  static evaluateCommercialValue(offer: CommercialDataInput, baseScore: number = 0): IntelligenceResult {
    const signals: string[] = [];
    let commercialScore = 0;

    // Normalização dos campos (extraindo do shopee_enrichment se necessário)
    const isMall = offer.is_mall || offer.shopee_enrichment?.is_shopee_mall;
    const isOfficial = offer.is_official_store || offer.shopee_enrichment?.is_official_store;
    const hasCommission = offer.has_extra_commission || offer.shopee_enrichment?.has_extra_commission;
    const sales = offer.sales_count ?? offer.shopee_enrichment?.sales_count ?? 0;
    const rating = offer.rating ?? offer.shopee_enrichment?.rating_star ?? 0;

    // 1. Avaliação de Oficialidade e Confiabilidade
    if (isMall) {
      signals.push("LOJA_MALL");
      commercialScore += 1.5;
    }
    if (isOfficial) {
      signals.push("LOJA_OFICIAL");
      commercialScore += 1.2;
    }

    // 2. Avaliação de Performance de Vendas e Popularidade
    if (sales >= 1000) {
      signals.push("ALTA_POPULARIDADE");
      commercialScore += 1.0;
    } else if (sales >= 100) {
      signals.push("BOA_POPULARIDADE");
      commercialScore += 0.5;
    }

    // 3. Avaliação de Qualidade do Produto
    if (rating >= 4.7) {
      signals.push("EXCELENTE_AVALIACAO");
      commercialScore += 0.8;
    } else if (rating >= 4.0) {
      signals.push("BOA_AVALIACAO");
      commercialScore += 0.3;
    }

    // 4. Atratividade para o Afiliado (Lucratividade)
    if (hasCommission) {
      signals.push("COMISSAO_EXTRA");
      commercialScore += 1.0;
    }

    // Classificação em Tiers baseada no Score Base + Comercial (projeção para o Cérebro)
    // O Score Base reflete o preço/desconto. O Comercial reflete confiabilidade.
    const combinedValue = baseScore + commercialScore;
    let tier: CommercialTier = 'C';

    if (combinedValue >= 9.0 && (isMall || isOfficial || sales > 500)) {
      tier = 'S';
    } else if (combinedValue >= 7.5) {
      tier = 'A';
    } else if (combinedValue >= 5.0) {
      tier = 'B';
    } else if (combinedValue < 3.0) {
      tier = 'LIXO';
    }

    // Classificação da Qualidade Comercial baseada na Commercial Policy (Shadow)
    // O Intelligence Engine interpreta o resultado matemático para rotular a qualidade
    const commercialQuality: CommercialQualityResult = {
      status: "COMUM",
      confidence: "95%" // Calculado deterministicamente
    };

    if (offer.commercialComparison) {
      const cScore = offer.commercialComparison.commercialPolicy;
      if (cScore >= 9.0) commercialQuality.status = "EXCELENTE";
      else if (cScore >= 7.5) commercialQuality.status = "MUITO BOA";
      else if (cScore >= 5.0) commercialQuality.status = "BOA";
      else if (cScore < 3.0) commercialQuality.status = "FRACA";
      else if (cScore < 1.0) commercialQuality.status = "LIXO";
    } else {
      if (tier === 'S') commercialQuality.status = "MUITO BOA";
      else if (tier === 'LIXO') commercialQuality.status = "LIXO";
    }

    return {
      tier,
      commercialValueScore: Number(commercialScore.toFixed(2)),
      signals,
      commercialQuality
    };
  }
}
