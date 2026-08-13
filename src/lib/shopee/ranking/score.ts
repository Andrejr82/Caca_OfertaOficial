import { ShopeeRankedCandidate, CommercialFiltersConfig } from './types';
import { DEFAULT_COMMERCIAL_FILTERS } from './commercial-filters';

export function calculateScore(
  candidate: Partial<ShopeeRankedCandidate>,
  medianPrice: number,
  isFreshCapture: boolean = true,
  filters: CommercialFiltersConfig = DEFAULT_COMMERCIAL_FILTERS
): { score: number; breakdown: Record<string, number>; reasons: string[] } {

  const semanticConfidence = candidate.semanticConfidence || 0;
  const sales = candidate.sales || 0;
  const discountPercent = candidate.discountPercent || 0;
  const rating = candidate.rating || 0;
  const shopTypes = candidate.shopTypes || [];
  const commissionPercent = candidate.commissionPercent || 0;
  const currentPrice = candidate.currentPrice || 0;

  // Normalizations
  const salesNorm = Math.min(1, Math.log10(sales + 1) / 4);
  const discountNorm = Math.min(1, discountPercent / 50);
  const ratingNorm = rating / 5;
  const shopQuality = shopTypes.some(t => filters.bonusShopTypes.includes(t)) ? 1 : 0;
  const commissionNorm = Math.min(1, commissionPercent / 15);
  
  // Price Competitiveness
  let priceCompetitiveness = 0;
  if (medianPrice > 0) {
    if (currentPrice <= medianPrice * 0.9) priceCompetitiveness = 1.0;
    else if (currentPrice <= medianPrice * 1.1) priceCompetitiveness = 0.5;
    else priceCompetitiveness = 0.2;
  } else {
    priceCompetitiveness = 0.5; // fallback se não tiver mediana
  }

  const freshness = isFreshCapture ? 1 : 0.5;

  // Breakdown Calculation (Base: 100)
  const breakdown = {
    semantic_relevance: 25 * semanticConfidence,
    sales: 20 * salesNorm,
    discount: 15 * discountNorm,
    rating: 10 * ratingNorm,
    shop_quality: 10 * shopQuality,
    commission: 10 * commissionNorm,
    price: 5 * priceCompetitiveness,
    freshness: 5 * freshness,
  };

  const score = Object.values(breakdown).reduce((acc, curr) => acc + curr, 0);

  // Reasons
  const reasons: string[] = [];
  if (semanticConfidence >= 0.9) reasons.push('Produto principal confirmado');
  else if (semanticConfidence >= 0.7) reasons.push('Correspondência parcial');
  
  if (sales > 1000) reasons.push(`Mais de 1 mil vendas (${sales})`);
  else if (sales > 100) reasons.push(`Muitas vendas (${sales})`);

  if (discountPercent >= 50) reasons.push(`${discountPercent}% de desconto`);
  if (shopQuality === 1) reasons.push('Loja recomendada (Shopee Oficial/Indicada)');
  if (commissionPercent >= 10) reasons.push(`Alta comissão (${commissionPercent}%)`);
  if (priceCompetitiveness === 1) reasons.push('Preço muito competitivo');

  return {
    score: Number(score.toFixed(4)), // Avoid floating point chaos, but keep deterministic tie
    breakdown,
    reasons
  };
}

export function sortCandidatesDeterministic(a: ShopeeRankedCandidate, b: ShopeeRankedCandidate): number {
  // 1. maior score sem arredondamento (já comparamos o number diretamente)
  if (a.score !== b.score) return b.score - a.score;
  
  // 2. maior confiança semântica
  if (a.semanticConfidence !== b.semanticConfidence) return b.semanticConfidence - a.semanticConfidence;
  
  // 3. maior volume de vendas
  if (a.sales !== b.sales) return b.sales - a.sales;
  
  // 4. maior avaliação
  if (a.rating !== b.rating) return b.rating - a.rating;
  
  // 5. maior desconto
  if (a.discountPercent !== b.discountPercent) return b.discountPercent - a.discountPercent;
  
  // 6. menor preço
  if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice; // ASCENDING
  
  // 7. shopId:itemId crescente (tie breaker final)
  const idA = `${a.shopId}:${a.itemId}`;
  const idB = `${b.shopId}:${b.itemId}`;
  return idA.localeCompare(idB);
}
