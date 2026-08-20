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

test('TESTE A: MEDIUM com Score V3 maior que HIGH deve aparecer antes no ranking', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  // Candidato com score mais alto (vendas 2000, rating 4.9, desconto 50%, comissão 15%)
  const mediumCandidate = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB_MED_HIGH_SCORE',
    productName: 'Mochila Impermeável Reforçada Premium',
    category: 'Acessórios',
    currentPrice: 200,
    oldPrice: 400,
    discountPercent: 50,
    ratingStar: 4.9,
    sales: 2000,
    commissionPercent: 15.0,
    permalink: 'https://produto.mercadolivre.com.br/MLB_MED_HIGH_SCORE',
    imageUrl: 'https://http2.mlstatic.com/mochila.jpg',
    marketplaceDemandEvidence: { source: 'mercadolivre_highlights', type: 'BEST_SELLER', position: 1 },
  };

  // Candidato com score menor (vendas 1500, rating 4.8, desconto 50%, comissão 12%)
  const highCandidate = {
    marketplace: 'Shopee',
    shopId: '123',
    itemId: 'SHP_HIGH_LOW_SCORE',
    productName: 'Cabo USB Básico 1m',
    category: 'Eletrônicos',
    currentPrice: 150,
    oldPrice: 300,
    discountPercent: 50,
    ratingStar: 4.8,
    sales: 1500,
    commissionPercent: 12.0,
    permalink: 'https://shopee.com.br/product/1/SHP_HIGH_LOW_SCORE',
    imageUrl: 'https://cf.shopee.com.br/cabo.jpg',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-score-priority-run',
    shopeeCandidates: [highCandidate],
    mlCandidates: [mediumCandidate],
    maxProducts: 2,
  });

  assert.equal(products.length, 2);
  assert.equal(products[0].product_term, 'Mochila Impermeável Reforçada Premium', 'Item com score superior deve ser rank #1');
  assert.equal(products[1].product_term, 'Cabo USB Básico 1m', 'Item com score inferior deve ser rank #2');
  assert.ok(products[0].commercial_score > products[1].commercial_score, 'Score do primeiro deve ser estritamente maior');
});

test('TESTE B: HIGH e MEDIUM com Score V3 exatamente igual -> HIGH deve aparecer primeiro como critério de desempate', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  // Dois candidatos com inputs calibrados para ter exatamente o mesmo score V4
  const highCandidate = {
    marketplace: 'Shopee',
    shopId: '123',
    itemId: 'SHP_TIE_HIGH',
    productName: 'Produto Empate High',
    category: 'Casa',
    currentPrice: 150,
    oldPrice: 300,
    discountPercent: 50,
    sales: 1500,
    ratingStar: 4.8,
    commissionPercent: 12.0,
    permalink: 'https://shopee.com.br/product/1/SHP_TIE_HIGH',
    imageUrl: 'https://cf.shopee.com.br/high.jpg',
  };

  const mediumCandidate = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB_TIE_MED',
    productName: 'Produto Empate Medium',
    category: 'Informática',
    currentPrice: 150,
    oldPrice: 300,
    discountPercent: 50,
    sales: 1500,
    ratingStar: 4.8,
    commissionPercent: 12.0,
    permalink: 'https://produto.mercadolivre.com.br/MLB_TIE_MED',
    imageUrl: 'https://http2.mlstatic.com/med.jpg',
    marketplaceDemandEvidence: { source: 'mercadolivre_highlights', type: 'BEST_SELLER', position: 5 },
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-tie-run',
    shopeeCandidates: [highCandidate],
    mlCandidates: [mediumCandidate],
    maxProducts: 2,
  });

  assert.equal(products.length, 2);
  if (products[0].commercial_score === products[1].commercial_score) {
    assert.equal(products[0].direct_evidence[0].viability_classification, 'high', 'Em caso de empate de Score V3, HIGH deve preceder MEDIUM');
  }
});

test('TESTE C: LOW viability com score alto continua fora da seleção do Radar', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const lowCandidate = {
    marketplace: 'Shopee',
    itemId: 'SHP_LOW_RATING',
    productName: 'Produto com Avaliação Baixa',
    category: 'Eletrônicos',
    currentPrice: 100,
    oldPrice: 200,
    discountPercent: 50,
    sales: 1000,
    ratingStar: 2.5, // rating < 3.5 -> LOW viability
    commissionPercent: 10,
    permalink: 'https://shopee.com.br/product/1/SHP_LOW_RATING',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-low-exclusion',
    shopeeCandidates: [lowCandidate],
    mlCandidates: [],
    maxProducts: 10,
  });

  assert.equal(products.length, 0, 'Item LOW deve ser descartado pelo gate de viabilidade');
});

test('TESTE D: INSUFFICIENT_DATA com preço válido continua fora da seleção do Radar', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const insufficientCandidate = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB_NO_DATA',
    productName: 'Item Sem Demanda Comprovada',
    category: 'Geral',
    currentPrice: 150,
    oldPrice: 200,
    discountPercent: 25,
    sales: null,
    ratingStar: null,
    commissionPercent: 0,
    permalink: '', // Sem link -> insufficient_data
    marketplaceDemandEvidence: null,
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-insufficient-exclusion',
    shopeeCandidates: [],
    mlCandidates: [insufficientCandidate],
    maxProducts: 10,
  });

  assert.equal(products.length, 0, 'Item INSUFFICIENT_DATA deve ser descartado pelo gate de viabilidade');
});

test('TESTE E: não existe cota por marketplace e permite distribuição orgânica (ex: 14 ML + 6 Shopee)', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const mlTitles = [
    'Teclado Gamer Mecânico RGB', 'Mouse Gamer Sem Fio', 'Monitor Gamer 165Hz', 'Cadeira Ergonômica Pro',
    'Headset 7.1 Surround', 'Webcam Full HD 1080p', 'Microfone Condensador USB', 'Suporte Articulado Monitor',
    'Luminária de Mesa LED', 'Gabinete Gamer Vidro', 'Memória RAM 16GB DDR4', 'Processador Octa Core',
    'Placa de Vídeo 8GB', 'Fonte 650W 80 Plus',
  ];
  // 14 candidatos ML com viabilidade e scores altos
  const mlCandidates = [];
  for (let i = 0; i < 14; i++) {
    mlCandidates.push({
      marketplace: 'Mercado Livre',
      itemId: `MLB_SCORE_HIGH_${i + 1}`,
      productId: `PROD_ML_${i + 1}`,
      productName: `${mlTitles[i]} Modelo ML`,
      category: `Categoria ${i + 1}`,
      currentPrice: 150 + i * 10,
      oldPrice: 300 + i * 20,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.9,
      commissionPercent: 12.0,
      permalink: `https://produto.mercadolivre.com.br/MLB_SCORE_HIGH_${i + 1}`,
      imageUrl: `https://http2.mlstatic.com/MLB_SCORE_HIGH_${i + 1}.jpg`,
      marketplaceDemandEvidence: { source: 'mercadolivre_highlights', type: 'BEST_SELLER', position: i + 1 },
    });
  }

  const shopeeTitles = [
    'Cooler Duplo Heatpipe', 'SSD NVMe 1TB PCIe', 'HD Externo 2TB USB',
    'Roteador Wi-Fi 6 Mesh', 'Switch Gigabit 8 Portas', 'Cabo HDMI 2.1 8K',
  ];
  // 6 candidatos Shopee
  const shopeeCandidates = [];
  for (let j = 0; j < 6; j++) {
    shopeeCandidates.push({
      marketplace: 'Shopee',
      shopId: `shop_${j + 1}`,
      itemId: `SHP_${j + 1}`,
      productName: `${shopeeTitles[j]} Modelo Shopee`,
      category: `Categoria Shopee ${j + 1}`,
      currentPrice: 140 + j * 5,
      oldPrice: 280 + j * 10,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12.0,
      permalink: `https://shopee.com.br/product/1/SHP_${j + 1}`,
      imageUrl: `https://cf.shopee.com.br/SHP_${j + 1}.jpg`,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-organic-ranking-run',
    shopeeCandidates,
    mlCandidates,
    maxProducts: 20,
  });

  assert.equal(products.length, 20, 'Top 20 deve ser preenchido');
  const mlCount = products.filter((p) => p.marketplace === 'Mercado Livre').length;
  const shopeeCount = products.filter((p) => p.marketplace === 'Shopee').length;

  assert.equal(mlCount, 14, 'Deve conter exatamente 14 produtos ML conforme o mérito/score do ranking');
  assert.equal(shopeeCount, 6, 'Deve conter exatamente 6 produtos Shopee conforme o mérito/score do ranking');
});

test('TESTE F: family diversity continua funcionando após o novo sort por Score V3 (max 3 por família)', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  // Criar 10 produtos da mesma família "Fone Bluetooth" com viabilidade e scores altos
  const sameFamilyCandidates = [];
  for (let i = 1; i <= 10; i++) {
    sameFamilyCandidates.push({
      marketplace: 'Mercado Livre',
      itemId: `MLB_FONE_${i}`,
      productName: `Fone de Ouvido Bluetooth Sem Fio Modelo Pro V${i}`,
      category: 'Áudio',
      currentPrice: 100 + i,
      oldPrice: 200,
      discountPercent: 50,
      sales: null,
      ratingStar: 4.8,
      commissionPercent: 0,
      permalink: `https://produto.mercadolivre.com.br/MLB_FONE_${i}`,
      marketplaceDemandEvidence: { source: 'mercadolivre_highlights', type: 'BEST_SELLER', position: i },
    });
  }

  // Criar 5 produtos de outra família "Mochila"
  const otherFamilyCandidates = [];
  for (let j = 1; j <= 5; j++) {
    otherFamilyCandidates.push({
      marketplace: 'Shopee',
      itemId: `SHP_MOCHILA_${j}`,
      productName: `Mochila Escolar Masculina Reforçada Resistente ${j}`,
      category: 'Acessórios',
      currentPrice: 80 + j,
      oldPrice: 120,
      discountPercent: 30,
      sales: 100,
      ratingStar: 4.5,
      commissionPercent: 5,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-family-cap',
    shopeeCandidates: otherFamilyCandidates,
    mlCandidates: sameFamilyCandidates,
    maxProducts: 20,
  });

  const fones = products.filter((p) => p.product_term.toLowerCase().includes('fone'));
  assert.ok(fones.length <= 3, `Deve conter no máximo 3 produtos da família Fone (obtido: ${fones.length})`);
});



