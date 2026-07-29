// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runDiscoveryOnlyCycle,
  selectCopyQueue,
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

    it('seleciona no máximo 15 ofertas válidas, com 5 por marketplace e 3 por categoria, sem preencher vagas com duplicatas ou inválidas', () => {
      const marketplaces = ['Mercado Livre', 'Amazon', 'Shopee'];
      const candidates = marketplaces.flatMap((marketplace, marketplaceIndex) =>
        Array.from({ length: 5 }, (_, categoryIndex) => ({
          marketplace,
          sourceItemId: `${marketplaceIndex}-${categoryIndex}`,
          sourceUrl: `https://example.com/${marketplaceIndex}-${categoryIndex}`,
          imageUrl: `https://example.com/${marketplaceIndex}-${categoryIndex}.jpg`,
          title: `Produto ${marketplaceIndex} modelo ${1000 + marketplaceIndex * 10 + categoryIndex}`,
          currentPrice: 100,
          originalPrice: 200,
          deterministicScore: 9,
          category: { name: `Categoria ${categoryIndex}` },
          marketplaceMetrics: { rating: 4.8, sales: 2000 },
        })),
      );

      const queue = selectCopyQueue([
        ...candidates,
        { ...candidates[0], deterministicScore: 1 },
        { ...candidates[0], sourceItemId: 'invalida', sourceUrl: 'http://example.com/invalida' },
      ], { maxTotal: 15, maxPerMarketplace: 5, maxPerCategory: 3 });

      expect(queue.selected).toHaveLength(15);
      expect(new Set(queue.selected.map((candidate) => candidate.sourceItemId)).size).toBe(15);
      expect(queue.selected.filter((candidate) => candidate.marketplace === 'Mercado Livre')).toHaveLength(5);
      expect(queue.selected.filter((candidate) => candidate.marketplace === 'Amazon')).toHaveLength(5);
      expect(queue.selected.filter((candidate) => candidate.marketplace === 'Shopee')).toHaveLength(5);
      expect(queue.selected.filter((candidate) => candidate.category.name === 'Categoria 0')).toHaveLength(3);
      expect(queue.selected.map((candidate) => candidate.sourceItemId)).not.toContain('invalida');
    });

    it('configura o ciclo agendado para no máximo 15 ofertas, 5 por marketplace e 3 por categoria', () => {
      const scraperSource = readFileSync(resolve(process.cwd(), 'scripts/oracle-scraper.cjs'), 'utf8');

      expect(scraperSource).toContain('copyQueueOptions: { maxTotal: 15, maxPerMarketplace: 5, maxPerCategory: 3 }');
    });

    it('registra a comparação shadow no log do ciclo Oracle', () => {
      const scraperSource = readFileSync(resolve(process.cwd(), 'scripts/oracle-scraper.cjs'), 'utf8');
      expect(scraperSource).toContain('observe: async (event) =>');
      expect(scraperSource).toContain("event.eventType === 'discovery.quality.shadow.completed'");
      expect(scraperSource).toContain('[Offer Quality Shadow]');
    });
  });

  describe('Integration Pipeline', () => {
    let mockDiscover;
    let mockPersist;

    beforeEach(() => {
      mockPersist = vi.fn().mockResolvedValue({ accepted: 1, state: 'pending_manual_review', offerIds: ['offer-1'] });
      mockDiscover = vi.fn();
    });

    it('carrega a admissão V2 somente quando a flag está active', async () => {
      const scraper = require('../../scripts/oracle-scraper.cjs');
      const previous = process.env.OFFER_QUALITY_PIPELINE_V2;
      delete process.env.OFFER_QUALITY_PIPELINE_V2;
      expect(scraper.createQualityAdmissionRunner()).toBeNull();

      process.env.OFFER_QUALITY_PIPELINE_V2 = 'active';
      try {
        const runner = scraper.createQualityAdmissionRunner();
        expect(typeof runner).toBe('function');
        const result = await runner([{
          sourceItemId: 'B0ABC12345',
          sourceUrl: 'https://www.amazon.com.br/dp/B0ABC12345',
          title: 'Cafeteira Espresso Compacta',
          imageUrl: 'https://images.example/cafe.jpg',
          currentPrice: 99,
          originalPrice: 129,
          marketplaceMetrics: { asin: 'B0ABC12345', rating: 4.8, sales: 1000 },
          monetization: { valid: true },
        }], 'Amazon');
        expect(result.accepted).toHaveLength(1);
      } finally {
        if (previous === undefined) delete process.env.OFFER_QUALITY_PIPELINE_V2;
        else process.env.OFFER_QUALITY_PIPELINE_V2 = previous;
      }
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

    it('prioritizes the lowest valid price within a catalog', async () => {
      const expensive = {
        ...validCandidateBase,
        sourceItemId: 'MLB-expensive',
        sourceUrl: 'https://produto.mercadolivre.com.br/p/MLB777',
        currentPrice: 120,
        deterministicScore: 10,
        marketplaceMetrics: { item_id: 'MLB-expensive', sourcePosition: 1 }
      };
      const cheaper = {
        ...validCandidateBase,
        sourceItemId: 'MLB-cheaper',
        sourceUrl: 'https://produto.mercadolivre.com.br/p/MLB777',
        currentPrice: 80,
        deterministicScore: 1,
        marketplaceMetrics: { item_id: 'MLB-cheaper', sourcePosition: 2 }
      };
      mockDiscover.mockResolvedValue([expensive, cheaper]);

      await runDiscoveryOnlyCycle({ ...baseContext, discover: mockDiscover, persist: mockPersist });

      expect(mockPersist.mock.calls[0][0][0].candidate.sourceItemId).toBe('MLB-cheaper');
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

    it('applies monetization preparation before queue selection', async () => {
      const invalid = {
        ...validCandidateBase,
        sourceItemId: 'MLB-invalid',
        marketplaceMetrics: { item_id: 'MLB-invalid', sourcePosition: 1 }
      };
      const valid = {
        ...validCandidateBase,
        sourceItemId: 'MLB-valid',
        marketplaceMetrics: { item_id: 'MLB-valid', sourcePosition: 2 }
      };
      mockDiscover.mockResolvedValue([invalid, valid]);

      await runDiscoveryOnlyCycle({
        ...baseContext,
        discover: mockDiscover,
        persist: mockPersist,
        prepareCandidate: vi.fn(async (product) => product.sourceItemId === 'MLB-valid'
          ? { ...product, monetization: { valid: true, affiliateUrl: 'https://meli.la/valid' } }
          : null),
      });

      const persistArg = mockPersist.mock.calls[0][0];
      expect(persistArg).toHaveLength(1);
      expect(persistArg[0].candidate.sourceItemId).toBe('MLB-valid');
    });

    it('ranqueia todos os candidatos antes de aplicar o limite da fila', async () => {
      const candidates = Array.from({ length: 201 }, (_, index) => ({
        ...validCandidateBase,
        title: `Cafeteira Marca${index} Modelo ${index + 1000} 1L`,
        sourceItemId: `MLB-${index}`,
        sourceUrl: `https://produto.mercadolivre.com.br/MLB-${index}`,
        currentPrice: 100,
        deterministicScore: index === 200 ? 10 : 1,
        marketplaceMetrics: { item_id: `MLB-${index}`, sourcePosition: index + 1 }
      }));
      mockDiscover.mockResolvedValue(candidates);

      await runDiscoveryOnlyCycle({
        ...baseContext,
        discover: mockDiscover,
        persist: mockPersist,
      });

      const persistedIds = mockPersist.mock.calls[0][0].map((ingestion) => ingestion.candidate.sourceItemId);
      expect(persistedIds).toContain('MLB-200');
    });
  });
});
