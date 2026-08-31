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

  it.each(['approved', 'selected', 'pending_manual_review'])('reaproveita identidade Shopee %s sem publicação', (status) => {
    const result = filterFreshCandidates('Shopee', [{
      sourceItemId: '100', title: 'Produto novo', currentPrice: 70, originalPrice: 100,
      marketplaceMetrics: { itemId: '100', shopId: '200' },
    }], [{
      shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Produto antigo', status,
      current_price: 100, old_price: 100, created_at: '2026-06-01T00:00:00.000Z',
    }], {
      now: '2026-08-31T12:00:00.000Z',
      permanentStatuses: ['rejected'],
      reusableStatuses: ['approved', 'selected', 'pending_manual_review'],
      blockPublished: true,
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it.each([
    { status: 'rejected', posts: [] },
    { status: 'posted', posts: [] },
    { status: 'approved', posts: [{ status: 'published', channel: 'telegram' }] },
    { status: 'pending_manual_review', posts: [{ status: 'draft', posted_at: '2026-08-01T10:00:00.000Z' }] },
  ])('bloqueia identidade Shopee rejeitada ou publicada: $status', (historyRow) => {
    const result = filterFreshCandidates('Shopee', [{
      sourceItemId: '100', title: 'Produto novo', currentPrice: 70, originalPrice: 100,
      marketplaceMetrics: { itemId: '100', shopId: '200' },
    }], [{
      shopee_item_id: '100', shopee_shop_id: '200', product_name: 'Produto antigo',
      current_price: 100, old_price: 100, created_at: '2026-06-01T00:00:00.000Z',
      ...historyRow,
    }], {
      now: '2026-08-31T12:00:00.000Z',
      permanentStatuses: ['rejected'],
      reusableStatuses: ['approved', 'selected', 'pending_manual_review'],
      blockPublished: true,
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([{ sourceItemId: '100', reason: 'historical_identity' }]);
  });
});
