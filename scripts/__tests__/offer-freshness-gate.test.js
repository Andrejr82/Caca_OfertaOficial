'use strict';

const { normalizeTitle, filterFreshCandidates } = require('../offer-freshness-gate.cjs');

describe('offer freshness gate', () => {
  it('normaliza títulos acentuados para a chave histórica', () => {
    expect(normalizeTitle('Ação Árvore')).toBe('acao arvore');
  });

  it('bloqueia título Shopee histórico acentuado sem melhoria material', () => {
    const result = filterFreshCandidates('Shopee', [{
      sourceItemId: '100', title: 'Ação Árvore', currentPrice: 10, originalPrice: 20,
      marketplaceMetrics: { itemId: '100', shopId: '200' },
    }], [{
      item_id: '100', shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Acao Arvore',
      current_price: 10, old_price: 20, created_at: new Date().toISOString(),
    }]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('cooldown_repeticao_historica');
  });
});
