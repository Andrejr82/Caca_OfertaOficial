import { describe, expect, it } from 'vitest';
import { evaluateShopeeOracleCandidate } from '../../lib/shopee/ranking/oracle-adapter';

describe('Shopee Oracle adapter', () => {
  it('applies the canonical V1 gate and score to Shopee only', () => {
    const result = evaluateShopeeOracleCandidate({
      marketplace: 'Shopee',
      sourceItemId: '123',
      title: 'Liquidificador Mondial Turbo',
      sourceUrl: 'https://s.shopee.com.br/offer-123',
      currentPrice: 100,
      originalPrice: 150,
      category: { id: '100010', name: 'eletrodomesticos' },
      marketplaceMetrics: { shopId: '456', rating: 4.8, sales: 500, commissionRate: 8, shopType: 1 },
      intent: 'liquidificador',
    });

    expect(result.eligible).toBe(true);
    expect(result.strategyVersion).toBe('shopee-ranking-v1');
    expect(result.score).toBeGreaterThan(0);
    expect(result.scoreBreakdown).toBeDefined();
  });

  it('does not apply the Shopee engine to Amazon or Mercado Livre', () => {
    expect(evaluateShopeeOracleCandidate({
      marketplace: 'Amazon', sourceItemId: 'ASIN', title: 'Produto', currentPrice: 10,
      category: { name: 'geral' },
    }).rejectionCode).toBe('unsupported_marketplace');
  });
});
