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

test('enrichMercadoLivreCandidatesInBatch enriquece lote com sold_quantity e rating sem alterar nulls não observados', async () => {
  const { enrichMercadoLivreCandidatesInBatch } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [
    { itemId: 'MLB001', productId: 'P001', productName: 'Item 1', currentPrice: 100, category: 'Eletrônicos', sales: null, rating: null },
    { itemId: 'MLB002', productId: 'P002', productName: 'Item 2', currentPrice: 200, category: 'Casa', sales: null, rating: null },
    { itemId: 'MLB003', productId: 'P003', productName: 'Item 3', currentPrice: 300, category: 'Ferramentas', sales: null, rating: null },
  ];

  const mockApiGet = async (path) => {
    if (path.includes('MLB001') || path.includes('MLB002')) {
      return [
        { code: 200, body: { id: 'MLB001', sold_quantity: 150, rating: 4.8 } },
        { code: 200, body: { id: 'MLB002', sold_quantity: 0, rating: 4.2 } },
        { code: 404, body: null },
      ];
    }
    return [];
  };

  await enrichMercadoLivreCandidatesInBatch(candidates, {
    accessToken: 'test-token',
    apiGetImpl: mockApiGet,
    maxToEnrich: 10,
    batchSize: 5,
  });

  assert.equal(candidates[0].sales, 150, 'sold_quantity 150 deve ser mapeado para sales');
  assert.equal(candidates[0].rating, 4.8, 'rating 4.8 deve ser mapeado');
  assert.equal(candidates[1].sales, 0, 'sold_quantity 0 deve ser preservado como 0');
  assert.equal(candidates[1].rating, 4.2);
  assert.equal(candidates[2].sales, null, 'Item sem retorno deve manter sales como null estritamente');
  assert.equal(candidates[2].rating, null, 'Item sem retorno deve manter rating como null');
});

test('enrichMercadoLivreCandidatesInBatch respeita limites (maxToEnrich) e diversidade de categorias', async () => {
  const { enrichMercadoLivreCandidatesInBatch } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];
  const categories = ['Celulares', 'Informática', 'Games', 'Casa', 'Moda'];
  for (let i = 1; i <= 50; i++) {
    const cat = categories[i % categories.length];
    candidates.push({
      itemId: `MLB_CAT_${i}`,
      productName: `Produto ${i} de ${cat}`,
      currentPrice: 100 + i,
      discountPercent: (i % 20) + 5,
      category: cat,
      sales: null,
      rating: null,
    });
  }

  const requestedIds = [];
  const mockApiGet = async (path) => {
    const ids = path.replace('/items?ids=', '').split(',');
    requestedIds.push(...ids);
    return ids.map((id) => ({ code: 200, body: { id, sold_quantity: 25, rating: 4.5 } }));
  };

  await enrichMercadoLivreCandidatesInBatch(candidates, {
    accessToken: 'test-token',
    apiGetImpl: mockApiGet,
    maxToEnrich: 15,
    batchSize: 5,
  });

  assert.equal(requestedIds.length, 15, 'Deve enriquecer exatamente maxToEnrich itens');
  // Verifica diversidade: deve conter itens de diferentes categorias
  const enrichedCategories = new Set(
    candidates.filter((c) => c.sales === 25).map((c) => c.category)
  );
  assert.ok(enrichedCategories.size >= 4, 'Deve cobrir múltiplas categorias para garantir diversidade');
});

test('falha parcial ou timeout em chunks de enriquecimento não derruba a coleta ML Native', async () => {
  const { enrichMercadoLivreCandidatesInBatch } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [
    { itemId: 'MLB_FAIL_1', productName: 'Item com Erro', currentPrice: 50, category: 'Geral', sales: null, rating: null },
    { itemId: 'MLB_OK_2', productName: 'Item Sucesso', currentPrice: 80, category: 'Geral', sales: null, rating: null },
  ];

  let calls = 0;
  const mockApiGet = async () => {
    calls++;
    if (calls === 1) throw new Error('Timeout de rede na API ML');
    return [{ code: 200, body: { id: 'MLB_OK_2', sold_quantity: 80, rating: 4.9 } }];
  };

  await enrichMercadoLivreCandidatesInBatch(candidates, {
    accessToken: 'test-token',
    apiGetImpl: mockApiGet,
    maxToEnrich: 2,
    batchSize: 1,
  });

  assert.equal(candidates[0].sales, null, 'Item que falhou mantém sales como null');
  assert.equal(candidates[1].sales, 80, 'Item seguinte é processado normalmente');
});

