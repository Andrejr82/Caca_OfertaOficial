import { evaluateSemanticConfidence } from "./semantic-validator";
import { getPolicyForCategory } from "./category-policies";
import { evaluateCommercialFilters, DEFAULT_COMMERCIAL_FILTERS } from "./commercial-filters";
import { calculateScore } from "./score";
import type { ShopeeRankedCandidate, RejectionCode } from "./types";

export interface OracleCandidateInput {
  marketplace: string;
  sourceItemId: string;
  title: string;
  currentPrice: number;
  originalPrice?: number | null;
  category: {
    id?: string;
    name?: string;
  };
  marketplaceMetrics?: {
    rating?: number;
    sales?: number;
    shopId?: string | number;
    commissionRate?: string | number;
    shopTypeTags?: string[];
  };
  intent?: string; // Scenario / intent used for search
  allowAccessory?: boolean;
}

export interface OracleRankingResult {
  eligible: boolean;
  score: number;
  scoreBreakdown?: Record<string, number>;
  rejectionCode?: RejectionCode | "unsupported_marketplace";
  reasons: string[];
  strategyVersion: string;
}

/**
 * Adapter para conectar o Oracle Worker ao núcleo do Motor Shopee V1.
 * 
 * Atua SOMENTE sobre candidatos do marketplace 'Shopee'.
 * Aplica validação semântica, políticas de categoria, filtros comerciais e pontuação.
 */
export function evaluateShopeeOracleCandidate(
  candidate: OracleCandidateInput,
  medianPrice: number = 0,
  isFreshCapture: boolean = true,
  strategyVersion: string = "shopee-v1"
): OracleRankingResult {
  const isShopee = candidate.marketplace.toLowerCase() === "shopee";
  
  if (!isShopee) {
    return {
      eligible: false,
      score: 0,
      rejectionCode: "unsupported_marketplace",
      reasons: ["Marketplace não suportado pelo Motor V1"],
      strategyVersion
    };
  }

  // Converter formato Oracle genérico para ShopeeRankedCandidate
  const originalPrice = candidate.originalPrice ?? undefined;
  const currentPrice = candidate.currentPrice;
  let discountPercent = 0;
  if (originalPrice && originalPrice > currentPrice) {
    discountPercent = ((originalPrice - currentPrice) / originalPrice) * 100;
  }

  const shopeeCandidate: Partial<ShopeeRankedCandidate> = {
    marketplace: 'Shopee',
    strategyVersion: 'shopee-ranking-v1',
    itemId: candidate.sourceItemId,
    shopId: candidate.marketplaceMetrics?.shopId ? String(candidate.marketplaceMetrics.shopId) : 'unknown',
    productName: candidate.title,
    affiliateUrl: "https://shopee.com.br/product/" + (candidate.marketplaceMetrics?.shopId || "") + "/" + candidate.sourceItemId,
    currentPrice: currentPrice,
    maximumPrice: originalPrice,
    discountPercent,
    rating: candidate.marketplaceMetrics?.rating || 0,
    sales: candidate.marketplaceMetrics?.sales || 0,
    commissionPercent: candidate.marketplaceMetrics?.commissionRate ? Number(candidate.marketplaceMetrics.commissionRate) : 0,
    categoryId: candidate.category.id ? String(candidate.category.id) : null,
    categoryKey: candidate.intent || candidate.category.name || "global",
    queryTerm: candidate.intent || candidate.category.name || "global",
    productUrl: null,
    imageUrl: null,
    capturedAt: new Date().toISOString()
  };

  const rejectionReasons: string[] = [];

  // 1. Políticas de Categoria
  const categoryKey = candidate.intent || candidate.category.name || "global";
  const categoryPolicy = getPolicyForCategory(categoryKey);

  // 2. Validação Semântica
  const semanticResult = evaluateSemanticConfidence(
    shopeeCandidate.productName || "",
    categoryKey,
    categoryPolicy
  );

  shopeeCandidate.semanticConfidence = semanticResult.confidence;

  if (!semanticResult.isValid) {
    return {
      eligible: false,
      score: 0,
      rejectionCode: semanticResult.rejectionCode,
      reasons: [semanticResult.reason || "Rejeitado na validação semântica"],
      strategyVersion
    };
  }

  // 3. Filtros Comerciais
  const commercialResult = evaluateCommercialFilters(shopeeCandidate, DEFAULT_COMMERCIAL_FILTERS);
  if (!commercialResult.isValid) {
    return {
      eligible: false,
      score: 0,
      rejectionCode: commercialResult.rejectionCode,
      reasons: [commercialResult.reason || "Rejeitado nos filtros comerciais"],
      strategyVersion
    };
  }

  // 4. Cálculo de Score
  const scoreResult = calculateScore(shopeeCandidate, medianPrice, isFreshCapture, DEFAULT_COMMERCIAL_FILTERS);

  return {
    eligible: true,
    score: scoreResult.score,
    scoreBreakdown: scoreResult.breakdown,
    reasons: scoreResult.reasons,
    strategyVersion
  };
}
