'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectMercadoLivreMarketplaceCandidates,
  normalizeMercadoLivreRadarProduct,
  buildTrendRadarProductsFromCandidates,
} = require('../oracle-trends-radar-engine.cjs');
const {
  filterCandidatesWithRecency,
  getMarketplaceIdentityKey,
} = require('../oracle-trends-radar-freshness.cjs');
const { deduplicateCatalogAndSemantic } = require('../radar-semantic-dedup-v2.cjs');

test('collectMercadoLivreMarketplaceCandidates usa ML Native Top 20 como fonte primária no round 1 gerando pool amplo', async () => {
  let nativeCalled = false;
  let refillCalled = false;

  const mockNativeCollector = async () => {
    nativeCalled = true;
    const products = [];
    for (let i = 1; i <= 30; i++) {
      products.push({
        platform: 'Mercado Livre',
        source: 'mercadolivre_offers_ssr',
        source_url: 'https://www.mercadolivre.com.br/ofertas?category=MLB1055',
        source_position: i,
        category_id: 'MLB1055',
        category_name: 'Celulares',
        item_id: `MLB${100000 + i}`,
        product_id: `MLB${200000 + i}`,
        title: `Smartphone Modelo ${i} 128GB`,
        current_price: 1000 + i * 10,
        old_price: 1500 + i * 10,
        discount_percent: 25,
        shipping_free: true,
        image_url: `https://http2.mlstatic.com/item_${i}.jpg`,
        product_url: `https://www.mercadolivre.com.br/p/MLB${200000 + i}`,
      });
    }
    return { products };
  };

  const mockCoverageRunner = async () => {
    refillCalled = true;
    return { products: [] };
  };

  const candidates = await collectMercadoLivreMarketplaceCandidates({
    page: 1,
    nativeCollector: mockNativeCollector,
    coverageRunner: mockCoverageRunner,
  });

  assert.equal(nativeCalled, true, 'Native collector deve ser chamado no round 1');
  assert.equal(refillCalled, false, 'Refill runner NÃO deve ser chamado se o Native retornar pool amplo');
  assert.equal(candidates.length, 30, 'Deve retornar os 30 produtos da fonte nativa');
});

test('normalização de produto ML Native preserva dados essenciais e mantém sales/rating como null se não observados', () => {
  const ssrProduct = {
    platform: 'Mercado Livre',
    source: 'mercadolivre_offers_ssr',
    item_id: 'MLB777123',
    product_id: 'MLB999888',
    title: 'Smart TV 55 Polegadas 4K HDR',
    category_name: 'Eletrônicos',
    current_price: 2499.90,
    old_price: 3299.90,
    discount_percent: 24.24,
    image_url: 'https://http2.mlstatic.com/tv55.jpg',
    product_url: 'https://www.mercadolivre.com.br/p/MLB999888',
  };

  const normalized = normalizeMercadoLivreRadarProduct(ssrProduct);

  assert.equal(normalized.marketplace, 'Mercado Livre');
  assert.equal(normalized.itemId, 'MLB777123');
  assert.equal(normalized.productId, 'MLB999888');
  assert.equal(normalized.productName, 'Smart TV 55 Polegadas 4K HDR');
  assert.equal(normalized.category, 'Eletrônicos');
  assert.equal(normalized.currentPrice, 2499.90);
  assert.equal(normalized.oldPrice, 3299.90);
  assert.equal(normalized.discountPercent, 24.24);
  assert.equal(normalized.permalink, 'https://www.mercadolivre.com.br/p/MLB999888');
  assert.equal(normalized.imageUrl, 'https://http2.mlstatic.com/tv55.jpg');
  assert.equal(normalized.sales, null, 'sales deve ser null quando ausente no SSR');
  assert.equal(normalized.rating, null, 'rating deve ser null quando ausente no SSR');
  assert.equal(normalized.ratingStar, null, 'ratingStar deve ser null quando ausente no SSR');
  assert.equal(normalized.provenance, 'mercadolivre_offers_ssr');
});

test('refill via mercadolivre-official-intents só roda no round >= 2 ou quando native falhar', async () => {
  let refillCalled = false;

  const mockCoverageRunner = async ({ keywords }) => {
    refillCalled = true;
    return {
      products: keywords.map((k, idx) => ({
        item_id: `MLB_REFILL_${idx}`,
        product_id: `MLB_PROD_${idx}`,
        title: `Produto Refill ${k}`,
        current_price: 199.90,
        old_price: 299.90,
        discount_percent: 33.3,
        sold_quantity: 50,
        rating: 4.7,
        product_url: `https://www.mercadolivre.com.br/p/MLB_PROD_${idx}`,
        image_url: `https://http2.mlstatic.com/refill_${idx}.jpg`,
      })),
    };
  };

  const mockTokenProvider = async () => 'mock-token';

  const refillCandidates = await collectMercadoLivreMarketplaceCandidates({
    page: 2,
    coverageRunner: mockCoverageRunner,
    tokenProvider: mockTokenProvider,
  });

  assert.equal(refillCalled, true, 'Refill runner deve ser acionado para round >= 2');
  assert.ok(refillCandidates.length >= 1, 'Deve retornar candidatos do refill');
  assert.equal(refillCandidates[0].sales, 50);
  assert.equal(refillCandidates[0].rating, 4.7);
});

test('freshness e deduplicação funcionam corretamente sobre produtos ML Native', () => {
  const p1 = normalizeMercadoLivreRadarProduct({
    item_id: 'MLB101',
    product_id: 'MLB201',
    title: 'Monitor Gamer 24 Polegadas 144Hz',
    current_price: 899.90,
    old_price: 1199.90,
    discount_percent: 25,
  });

  const p2 = normalizeMercadoLivreRadarProduct({
    item_id: 'MLB102',
    product_id: 'MLB201', // Mesmo productId que p1
    title: 'Monitor Gamer 24 Pol 144Hz IPS',
    current_price: 850.00,
    old_price: 1199.90,
    discount_percent: 29.18,
  });

  const p3 = normalizeMercadoLivreRadarProduct({
    item_id: 'MLB103',
    product_id: 'MLB203',
    title: 'Teclado Mecânico RGB Switch Blue',
    current_price: 199.90,
    old_price: 299.90,
    discount_percent: 33.34,
  });

  // Teste de dedup de catálogo
  const dedupResult = deduplicateCatalogAndSemantic([p1, p2, p3]);
  assert.equal(dedupResult.uniqueCandidates.length, 2, 'Deve manter apenas 2 produtos únicos por productId');
  assert.equal(dedupResult.excludedCatalogDuplicates.length, 1);

  // Teste de freshness
  const recentKeys = new Set([getMarketplaceIdentityKey(p3)]);
  const freshnessCheck = filterCandidatesWithRecency([p1, p3], recentKeys, new Set());
  assert.equal(freshnessCheck.fresh.length, 1);
  assert.equal(freshnessCheck.fresh[0].productId, 'MLB201');
  assert.equal(freshnessCheck.excludedRecentHistory.length, 1);
});



test('enrichMercadoLivreWithHighlightsAndReviews cruza BEST_SELLER oficialmente e mantém sales como null', async () => {
  const { enrichMercadoLivreWithHighlightsAndReviews } = require('../oracle-trends-radar-engine.cjs');
  const { calculateCommercialViabilityV2 } = require('../commercial-viability-v2.cjs');

  const candidates = [
    { itemId: 'MLB1001', productId: 'PROD_BS_1', productName: 'Fone Bluetooth Pro', currentPrice: 149.90, categoryId: 'MLB1055', sales: null, rating: null },
    { itemId: 'MLB1002', productId: 'PROD_NO_BS', productName: 'Cabo USB Simples', currentPrice: 29.90, categoryId: 'MLB1055', sales: null, rating: null },
  ];

  const mockFetch = async (url) => {
    if (url.includes('/highlights/MLB/category/MLB1055')) {
      return {
        ok: true,
        json: async () => ({
          content: [
            { id: 'PROD_BS_1', position: 1, type: 'PRODUCT' },
          ],
        }),
      };
    }
    if (url.includes('/reviews/item/MLB1001')) {
      return {
        ok: true,
        json: async () => ({
          rating_average: 4.85,
          rating_levels: { five_star: 200, four_star: 20 },
        }),
      };
    }
    return { ok: false, status: 404 };
  };

  await enrichMercadoLivreWithHighlightsAndReviews(candidates, {
    accessToken: 'test-token',
    fetchImpl: mockFetch,
  });

  // Validação do Item 1 (com BEST_SELLER)
  assert.ok(candidates[0].marketplaceDemandEvidence, 'Item destacado deve possuir evidência factual');
  assert.equal(candidates[0].marketplaceDemandEvidence.type, 'BEST_SELLER');
  assert.equal(candidates[0].marketplaceDemandEvidence.position, 1);
  assert.equal(candidates[0].sales, null, 'sales NUNCA deve ser inventado/fabricado');
  assert.equal(candidates[0].rating, 4.85, 'rating deve ser capturado de reviews');
  assert.equal(candidates[0].reviewsCount, 220);

  // Viabilidade do Item 1: Deve ser aprovado como MEDIUM pelo destaque factual
  const viab1 = calculateCommercialViabilityV2(candidates[0]);
  assert.equal(viab1.classification, 'medium', 'Item com BEST_SELLER e preço viável deve ser classificado como MEDIUM');
  assert.equal(viab1.isViable, true);

  // Validação do Item 2 (sem BEST_SELLER e sem sales): Deve permanecer insufficient_data
  assert.equal(candidates[1].marketplaceDemandEvidence, undefined);
  assert.equal(candidates[1].sales, null);
  const viab2 = calculateCommercialViabilityV2(candidates[1]);
  assert.equal(viab2.classification, 'insufficient_data', 'Item sem destaque e sem vendas deve permanecer insufficient_data');
  assert.equal(viab2.isViable, false);
});

test('falha na API de highlights ou 404 não derruba Radar', async () => {
  const { enrichMercadoLivreWithHighlightsAndReviews } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [
    { itemId: 'MLB5001', productId: 'P5001', productName: 'Item Resiliente', currentPrice: 80, categoryId: 'MLB_INVALID', sales: null },
  ];

  const mockFetch = async () => {
    throw new Error('Falha de rede momentânea na API ML');
  };

  await enrichMercadoLivreWithHighlightsAndReviews(candidates, {
    accessToken: 'test-token',
    fetchImpl: mockFetch,
  });

  assert.equal(candidates.length, 1, 'Fluxo deve prosseguir normalmente sem travar');
  assert.equal(candidates[0].sales, null);
});


