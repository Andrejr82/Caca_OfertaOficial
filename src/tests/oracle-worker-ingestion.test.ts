// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runDiscoveryOnlyCycle,
  validateCanonicalUrl,
  validateNativeIdentity
} from '../../scripts/oracle-worker-discovery-only.cjs';

describe('Oracle Worker Ingestion (Discovery Only)', () => {
  describe('Pure Functions', () => {
    describe('validateCanonicalUrl', () => {
      it('rejects linksynergy gateway', () => {
        expect(validateCanonicalUrl('https://click.linksynergy.com/deeplink?id=123')).toBe(false);
      });
      it('rejects onelink.shein.com gateway', () => {
        expect(validateCanonicalUrl('https://onelink.shein.com/44/xxx')).toBe(false);
      });
      it('accepts amzn.to', () => {
        expect(validateCanonicalUrl('https://amzn.to/3xyz')).toBe(true);
      });
      it('rejects amazon /r/ gateway', () => {
        expect(validateCanonicalUrl('https://www.amazon.com.br/r/123')).toBe(false);
      });
      it('accepts valid ML url', () => {
        expect(validateCanonicalUrl('https://produto.mercadolivre.com.br/MLB-123')).toBe(true);
      });
    });

    describe('validateNativeIdentity', () => {
      it('accepts ML with item_id', () => {
        expect(validateNativeIdentity('Mercado Livre', { marketplaceMetrics: { item_id: 'MLB123' } })).toBe(true);
      });
      it('rejects ML with null string', () => {
        expect(validateNativeIdentity('Mercado Livre', { marketplaceMetrics: { item_id: 'null' } })).toBe(false);
      });
      it('rejects ML with url as id', () => {
        expect(validateNativeIdentity('Mercado Livre', { marketplaceMetrics: { item_id: 'https://ml.com' } })).toBe(false);
      });
      it('accepts Amazon with valid ASIN', () => {
        expect(validateNativeIdentity('Amazon', { marketplaceMetrics: { asin: 'B0H41T85MS' } })).toBe(true);
      });
      it('rejects Amazon with invalid ASIN format', () => {
        expect(validateNativeIdentity('Amazon', { marketplaceMetrics: { asin: 'B0H4' } })).toBe(false);
      });
      it('rejects Amazon without ASIN', () => {
        expect(validateNativeIdentity('Amazon', { marketplaceMetrics: {} })).toBe(false);
      });
      it('accepts Shopee with shopee_item_id (legacy)', () => {
        expect(validateNativeIdentity('Shopee', { marketplaceMetrics: { shopee_item_id: '12345' } })).toBe(true);
      });
      it('accepts Shopee with itemId (native)', () => {
        expect(validateNativeIdentity('Shopee', { marketplaceMetrics: { itemId: '12345' } })).toBe(true);
      });
      it('rejects Shopee Test Product', () => {
        expect(validateNativeIdentity('Shopee', { title: 'Test Product 123', marketplaceMetrics: { itemId: '123' } })).toBe(false);
      });
      it('rejects Shopee without id', () => {
        expect(validateNativeIdentity('Shopee', { marketplaceMetrics: { } })).toBe(false);
      });
    });
  });

  describe('Integration Pipeline', () => {
    let mockDiscover;
    let mockPersist;

    beforeEach(() => {
      mockPersist = vi.fn().mockResolvedValue({ accepted: 1, state: 'pending_manual_review', offerIds: ['offer-1'] });
      mockDiscover = vi.fn();
    });

    const baseContext = {
      tenantId: 't1',
      correlationId: 'c1',
      requestedAt: new Date().toISOString(),
      copyQueueOptions: { maxTotal: 30 },
      marketplaces: ['Mercado Livre']
    };

    const validCandidateBase = {
      title: 'Produto Teste Valido',
      sourceUrl: 'https://produto.mercadolivre.com.br/MLB-123456',
      imageUrl: 'https://http2.mlstatic.com/img.jpg',
      currentPrice: 100,
      originalPrice: 150,
      deterministicScore: 9,
      discoveredAt: new Date().toISOString(),
      category: { name: 'Eletrônicos', source: 'ML' }
    };

    it('persists exactly once and only for selected candidates', async () => {
      const p1 = {
        ...validCandidateBase,
        sourceItemId: 'MLB123',
        marketplaceMetrics: { item_id: 'MLB123', sourcePosition: 1 }
      };

      mockDiscover.mockResolvedValue([p1]);
      
      const res = await runDiscoveryOnlyCycle({
        ...baseContext,
        discover: mockDiscover,
        persist: mockPersist,
        loadDeferred: vi.fn().mockResolvedValue([]),
        observe: vi.fn(),
      });

      expect(mockPersist).toHaveBeenCalledTimes(1);
      const persistArg = mockPersist.mock.calls[0][0];
      expect(persistArg).toHaveLength(1);
      expect(persistArg[0].candidate.sourceItemId).toBe('MLB123');
      expect(res.finalState).toBe('pending_manual_review');
    });

    it('does not call persist if all candidates are invalid', async () => {
      const p1 = {
        ...validCandidateBase,
        sourceItemId: 'null',
        marketplaceMetrics: { item_id: 'null' }
      };

      mockDiscover.mockResolvedValue([p1]);
      
      await runDiscoveryOnlyCycle({
        ...baseContext,
        discover: mockDiscover,
        persist: mockPersist,
      });

      expect(mockPersist).not.toHaveBeenCalled();
    });

    it('groups Mercado Livre by catalog and selects only the best', async () => {
      const p1 = {
        ...validCandidateBase,
        sourceItemId: 'MLB1',
        sourceUrl: 'https://produto.mercadolivre.com.br/p/MLB999',
        currentPrice: 100,
        marketplaceMetrics: { item_id: 'MLB1', sourcePosition: 2 }
      };
      const p2 = {
        ...validCandidateBase,
        sourceItemId: 'MLB2',
        sourceUrl: 'https://produto.mercadolivre.com.br/p/MLB999',
        currentPrice: 90,
        marketplaceMetrics: { item_id: 'MLB2', sourcePosition: 1 }
      };
      
      mockDiscover.mockResolvedValue([p1, p2]);
      
      await runDiscoveryOnlyCycle({
        ...baseContext,
        discover: mockDiscover,
        persist: mockPersist,
      });

      expect(mockPersist).toHaveBeenCalledTimes(1);
      const persistArg = mockPersist.mock.calls[0][0];
      expect(persistArg).toHaveLength(1);
      expect(persistArg[0].candidate.sourceItemId).toBe('MLB2');
    });

    it('does not group ML products from different catalogs', async () => {
      const p1 = {
        ...validCandidateBase,
        title: 'TV Samsung 55 polegadas',
        category: { name: 'TVs', source: 'ML' },
        sourceItemId: 'MLB1',
        sourceUrl: 'https://produto.mercadolivre.com.br/p/MLB888',
        marketplaceMetrics: { item_id: 'MLB1', sourcePosition: 1 }
      };
      const p2 = {
        ...validCandidateBase,
        title: 'Camisa Polo Masculina',
        category: { name: 'Moda', source: 'ML' },
        sourceItemId: 'MLB2',
        sourceUrl: 'https://produto.mercadolivre.com.br/p/MLB999',
        marketplaceMetrics: { item_id: 'MLB2', sourcePosition: 2 }
      };
      
      mockDiscover.mockResolvedValue([p1, p2]);
      
      await runDiscoveryOnlyCycle({
        ...baseContext,
        discover: mockDiscover,
        persist: mockPersist,
      });

      expect(mockPersist).toHaveBeenCalledTimes(1);
      const persistArg = mockPersist.mock.calls[0][0];
      expect(persistArg).toHaveLength(2);
    });
  });
});
