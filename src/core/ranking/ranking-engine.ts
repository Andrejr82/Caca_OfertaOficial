import { CommercialComparison } from "@/types/domain";

export interface ScoreInput {
  product_name?: string;
  title?: string;
  current_price?: number;
  price?: number;
  old_price?: number;
  rating?: number;
  shopee_enrichment?: any; // Para o bônus da Shopee
}

export interface AiAnalysisScore {
  score: number;
}

export class RankingEngine {
  /**
   * Política Comercial Oficial (Foco atual em volume e baixo ticket)
   */
  static calculateOfficialPolicy(product: ScoreInput): number {
    const price = (typeof product.current_price === 'number' ? product.current_price : product.price) || 0;
    const oldPrice = product.old_price || 0;
    
    let discountScore = 0;
    if (oldPrice > price) {
      const pct = (oldPrice - price) / oldPrice;
      if (price >= 1500 && pct >= 0.10) {
        discountScore = 10;
      } else if (pct >= 0.05 && pct <= 0.80) {
        discountScore = Math.min((pct / 0.5) * 10, 10);
      } else if (pct > 0.80) {
        discountScore = 2;
      }
    }

    const priceScore = price <= 90 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
    const impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
    const ratingScore = product.rating ? (product.rating / 5) * 10 : 5;

    return Number(((discountScore * 0.35) + (priceScore * 0.30) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
  }

  /**
   * Política Comercial Candidata (Foco evoluído em economia absoluta e premium)
   */
  static calculateCommercialPolicy(product: ScoreInput): number {
    const price = (typeof product.current_price === 'number' ? product.current_price : product.price) || 0;
    const oldPrice = product.old_price || 0;
    
    let discountPct = 0;
    let absoluteSavings = 0;

    if (oldPrice > price) {
      discountPct = (oldPrice - price) / oldPrice;
      absoluteSavings = oldPrice - price;
    }
    
    let discountScore = 0;
    if (discountPct > 0) {
      if (discountPct > 0.8) discountScore = 2;
      else discountScore = Math.min((discountPct / 0.5) * 10, 10);
    }
    
    const savingsScore = absoluteSavings >= 1000 ? 10 : (absoluteSavings >= 500 ? 8 : (absoluteSavings >= 100 ? 5 : 0));
    const impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 0));
    const premiumScore = price >= 1500 ? 8 : (price >= 700 ? 5 : 0);
    const ratingScore = product.rating ? (product.rating / 5) * 10 : 5;
    
    const bestCommercialScore = Math.max(savingsScore, impulseScore, premiumScore);

    return Number(((discountScore * 0.40) + (bestCommercialScore * 0.45) + (ratingScore * 0.15)).toFixed(2));
  }

  /**
   * Bônus Específico Shopee
   */
  static calcShopeeScoreBoost(enriched: any): number {
    if (!enriched) return 0;
    let boost = 0;
    if (enriched.is_shopee_mall)       boost += 1.0;
    if (enriched.is_official_store)    boost += 0.8;
    if (enriched.has_extra_commission) boost += 0.5;
    if (enriched.sales_count != null && enriched.sales_count >= 100)  boost += 0.3;
    if (enriched.rating_star  != null && enriched.rating_star  >= 4.5) boost += 0.2;
    if (enriched.detected_campaigns && enriched.detected_campaigns.length > 0) boost += 0.2;
    return Math.min(boost, 2.5);
  }

  /**
   * Realiza a avaliação dupla de políticas em Shadow Mode
   */
  static evaluatePolicies(product: ScoreInput, store: string): CommercialComparison {
    let scoreBoost = 0;
    if (store === 'Shopee' && product.shopee_enrichment) {
      scoreBoost = this.calcShopeeScoreBoost(product.shopee_enrichment);
    }

    const official = Number(Math.min(this.calculateOfficialPolicy(product) + scoreBoost, 10).toFixed(2));
    const commercial = Number(Math.min(this.calculateCommercialPolicy(product) + scoreBoost, 10).toFixed(2));
    const delta = Number((commercial - official).toFixed(2));

    const reasons: string[] = [];
    if (delta > 2) {
      reasons.push("Alto impacto positivo em Premium/Savings.");
    } else if (delta < -2) {
      reasons.push("Penalização severa por bugiganga/baixo ticket.");
    } else if (delta !== 0) {
      reasons.push("Ajuste fino de prioridade comercial.");
    }

    let deltaLevel: import("@/types/domain").DeltaLevel = "LOW";
    if (Math.abs(delta) >= 3.0) deltaLevel = "CRITICAL";
    else if (Math.abs(delta) >= 2.0) deltaLevel = "HIGH";
    else if (Math.abs(delta) >= 1.0) deltaLevel = "MEDIUM";

    return {
      officialPolicy: official,
      commercialPolicy: commercial,
      delta,
      deltaLevel,
      changed: official !== commercial,
      confidence: "95%",
      reasons,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Calcula o Score Base Total antes da IA (Retrocompatibilidade)
   * Agora utiliza a Commercial Policy (V5).
   */
  static calculateBaseScore(product: ScoreInput, store: string): number {
    return this.evaluatePolicies(product, store).commercialPolicy;
  }

  /**
   * Combina o Score Matemático Base com o Score da IA para determinar o Score Final (Prioridade Comercial).
   */
  static calculateFinalPriority(baseScore: number, aiScore: number): number {
    return Number(((baseScore * 0.7) + (aiScore * 0.3)).toFixed(2));
  }
}
