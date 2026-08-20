'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  processPendingTrendRadarRuns,
  buildTrendRadarProductsFromCandidates,
  collectShopeeMarketplaceCandidates,
  collectMercadoLivreMarketplaceCandidates,
} = require('../oracle-trends-radar-runner.cjs');

test('TEST 1: mesmo Shopee shopId + itemId aparecendo duas vezes -> apenas um candidato', () => {
  const duplicateShopee = [
    {
      marketplace: 'Shopee',
      shopId: '100',
      itemId: '200',
      productName: 'Teclado Gamer Mecânico RGB',
      currentPrice: 150.0,
      discountPercent: 50,
      sales: 1500,
      commissionPercent: 12.0,
      ratingStar: 4.8,
      permalink: 'https://shopee.com.br/product/100/200',
      imageUrl: 'https://cf.shopee.com.br/200.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      shopId: '100',
      itemId: '200',
      productName: 'Teclado Gamer Mecânico RGB Duplicado',
      currentPrice: 150.0,
      discountPercent: 50,
      sales: 1500,
      commissionPercent: 12.0,
      ratingStar: 4.8,
      permalink: 'https://shopee.com.br/product/100/200',
      imageUrl: 'https://cf.shopee.com.br/200.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-1',
    shopeeCandidates: duplicateShopee,
    mlCandidates: [],
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].direct_evidence[0].marketplace_identity.itemId, '200');
  assert.equal(products[0].direct_evidence[0].marketplace_identity.shopId, '100');
});

test('TEST 2: mesmo Mercado Livre productId com itemIds diferentes -> apenas um produto comercial (melhor representante)', () => {
  const mlDuplicates = [
    {
      marketplace: 'Mercado Livre',
      productId: 'MLB123456',
      itemId: 'MLB-item-inferior',
      productName: 'Smart TV 50 Polegadas 4K Seller Secundário',
      currentPrice: 2400.0,
      sales: 10,
      ratingStar: 4.0,
      commercialScore: 50,
      permalink: 'https://produto.mercadolivre.com.br/MLB-item-inferior',
    },
    {
      marketplace: 'Mercado Livre',
      productId: 'MLB123456',
      itemId: 'MLB-item-superior',
      productName: 'Smart TV 50 Polegadas 4K Loja Oficial',
      currentPrice: 2199.0,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.9,
      commercialScore: 90,
      commissionPercent: 10.0,
      permalink: 'https://produto.mercadolivre.com.br/MLB-item-superior',
      imageUrl: 'https://http2.mlstatic.com/MLB-item-superior.jpg',
      provenance: 'mercadolivre_official_intent',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-2',
    shopeeCandidates: [],
    mlCandidates: mlDuplicates,
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].direct_evidence[0].marketplace_identity.productId, 'MLB123456');
  assert.equal(products[0].direct_evidence[0].marketplace_identity.itemId, 'MLB-item-superior');
  assert.equal(products[0].direct_evidence[0].price, 2199.0);
});

test('TEST 3: dois produtos semanticamente equivalentes -> apenas o melhor representante', () => {
  const semanticEquivalent = [
    {
      marketplace: 'Shopee',
      shopId: 'shop-A',
      itemId: 'item-A',
      productName: 'Bola Interativa Inteligente Para Gatos com LED Brinquedo Automático',
      currentPrice: 139.90,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.9,
      commissionPercent: 12.0,
      permalink: 'https://shopee.com.br/product/A/item-A',
      imageUrl: 'https://cf.shopee.com.br/item-A.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      shopId: 'shop-B',
      itemId: 'item-B',
      productName: 'Brinquedo Pet Bola Inteligente Interativa Gato LED Automática',
      currentPrice: 145.00,
      discountPercent: 50,
      sales: 80,
      ratingStar: 4.3,
      commissionPercent: 6.0,
      permalink: 'https://shopee.com.br/product/B/item-B',
      imageUrl: 'https://cf.shopee.com.br/item-B.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-3',
    shopeeCandidates: semanticEquivalent,
    mlCandidates: [],
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].direct_evidence[0].marketplace_identity.itemId, 'item-A');
  assert.equal(products[0].product_term, 'Bola Interativa Inteligente Para Gatos com LED Brinquedo Automático');
});

test('TEST 4: dois produtos realmente diferentes da mesma categoria -> ambos permanecem', () => {
  const distinctProducts = [
    {
      marketplace: 'Shopee',
      shopId: 'shop-1',
      itemId: 'item-airfryer',
      productName: 'Fritadeira Elétrica Air Fryer 4L Inox Digital',
      currentPrice: 299.0,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 10.0,
      permalink: 'https://shopee.com.br/product/1/item-airfryer',
      imageUrl: 'https://cf.shopee.com.br/airfryer.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      shopId: 'shop-2',
      itemId: 'item-liquidificador',
      productName: 'Liquidificador Turbo 1200W com Jarra de Vidro',
      currentPrice: 169.0,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 10.0,
      permalink: 'https://shopee.com.br/product/2/item-liquidificador',
      imageUrl: 'https://cf.shopee.com.br/liquidificador.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-4',
    shopeeCandidates: distinctProducts,
    mlCandidates: [],
  });

  assert.equal(products.length, 2);
});

test('TEST 5: produto visto dentro da janela de recência -> bloqueado', async () => {
  const recentBlockedItem = {
    marketplace: 'Shopee',
    shopId: 'shop-rec',
    itemId: 'item-rec-1',
    productName: 'Mouse Sem Fio Recarregável',
    currentPrice: 50.0,
    sales: 100,
  };

  const freshItem = {
    marketplace: 'Shopee',
    shopId: 'shop-fresh',
    itemId: 'item-fresh-1',
    productName: 'Teclado Mecânico RGB',
    currentPrice: 150.0,
    discountPercent: 50,
    sales: 1500,
    commissionPercent: 12.0,
    ratingStar: 4.8,
    permalink: 'https://shopee.com.br/product/fresh/item-fresh-1',
    imageUrl: 'https://cf.shopee.com.br/fresh.jpg',
    provenance: 'shopee_openapi_productOfferV2',
  };

  let insertedProducts = [];
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-test-5', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({
                order: async () => ({
                  data: [{ id: 'run-prev-1', created_at: new Date().toISOString(), status: 'completed' }],
                  error: null,
                }),
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: async () => ({
              data: [{
                radar_run_id: 'run-prev-1',
                marketplace: 'Shopee',
                direct_evidence: [{ marketplace_identity: { shopId: 'shop-rec', itemId: 'item-rec-1' } }],
              }],
              error: null,
            }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async (prods) => {
            insertedProducts = prods;
            return { error: null };
          },
        };
      }
      if (table === 'offers') {
        return {
          select: () => ({
            range: async () => ({ data: [], error: null }),
          }),
        };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: async () => [recentBlockedItem, freshItem],
    mlCollector: async () => [],
  });

  assert.equal(result.processed, true);
  assert.equal(insertedProducts.length, 1);
  assert.equal(insertedProducts[0].product_term, 'Teclado Mecânico RGB');
});

test('TEST 6: produto visto fora da janela de recência -> pode voltar a ser elegível', async () => {
  const agedOutItem = {
    marketplace: 'Shopee',
    shopId: 'shop-old',
    itemId: 'item-old-1',
    productName: 'Umidificador de Ar Ultrassônico',
    currentPrice: 150.0,
    discountPercent: 50,
    sales: 1500,
    commissionPercent: 12.0,
    ratingStar: 4.8,
    permalink: 'https://shopee.com.br/product/old/item-old-1',
    imageUrl: 'https://cf.shopee.com.br/old.jpg',
    provenance: 'shopee_openapi_productOfferV2',
  };

  let insertedProducts = [];
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-test-6', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({
                // Nenhuma run recente dentro de 7 dias (run anterior tem 20 dias e ficou de fora do gte)
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async (prods) => {
            insertedProducts = prods;
            return { error: null };
          },
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: async () => [agedOutItem],
    mlCollector: async () => [],
  });

  assert.equal(result.processed, true);
  assert.equal(insertedProducts.length, 1);
  assert.equal(insertedProducts[0].product_term, 'Umidificador de Ar Ultrassônico');
});

test('TEST 7: produto presente em oferta existente quando política exigir bloqueio -> excluído', async () => {
  const existingOfferShopee = {
    marketplace: 'Shopee',
    shopId: 'shop-exist',
    itemId: 'item-exist-99',
    productName: 'Oferta Já Existente no Painel',
    currentPrice: 80.0,
    sales: 100,
  };

  const freshShopee = {
    marketplace: 'Shopee',
    shopId: 'shop-fresh',
    itemId: 'item-fresh-99',
    productName: 'Nova Oferta Descoberta',
    currentPrice: 150.0,
    discountPercent: 50,
    sales: 1500,
    commissionPercent: 12.0,
    ratingStar: 4.8,
    permalink: 'https://shopee.com.br/product/fresh/item-fresh-99',
    imageUrl: 'https://cf.shopee.com.br/fresh-99.jpg',
    provenance: 'shopee_openapi_productOfferV2',
  };

  let insertedProducts = [];
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-test-7', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async (prods) => {
            insertedProducts = prods;
            return { error: null };
          },
        };
      }
      if (table === 'offers') {
        return {
          select: () => ({
            range: async () => ({
              data: [{ platform: 'shopee', shopee_item_id: 'item-exist-99', item_id: 'item-exist-99' }],
              error: null,
            }),
          }),
        };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: async () => [existingOfferShopee, freshShopee],
    mlCollector: async () => [],
  });

  assert.equal(result.processed, true);
  assert.equal(insertedProducts.length, 1);
  assert.equal(insertedProducts[0].product_term, 'Nova Oferta Descoberta');
});

test('TEST 8: produto low viability -> excluído', () => {
  const lowViability = {
    marketplace: 'Shopee',
    shopId: 'shop-bad',
    itemId: 'item-bad',
    productName: 'Clipe de Papel 1 Unidade',
    currentPrice: 1.50,
    sales: 2,
    commissionPercent: 2.0,
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-8',
    shopeeCandidates: [lowViability],
    mlCandidates: [],
  });

  assert.equal(products.length, 0);
});

test('TEST 9: produto high viability -> elegível', () => {
  const highViability = {
    marketplace: 'Shopee',
    shopId: 'shop-high',
    itemId: 'item-high',
    productName: 'Monitor Gamer 24 Polegadas 165Hz IPS Full HD',
    currentPrice: 699.0,
    discountPercent: 50,
    sales: 1500,
    ratingStar: 4.85,
    commissionPercent: 8.0,
    permalink: 'https://shopee.com.br/product/high/item-high',
    imageUrl: 'https://cf.shopee.com.br/item-high.jpg',
    provenance: 'shopee_openapi_productOfferV2',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-9',
    shopeeCandidates: [highViability],
    mlCandidates: [],
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].is_focus, true);
});

test('TEST 10: produto medium viability -> elegível', () => {
  const mediumViability = {
    marketplace: 'Mercado Livre',
    productId: 'MLB888',
    itemId: 'MLB888-1',
    productName: 'Organizador de Cabos e Fios com Velcro 5 Metros',
    currentPrice: 150.0,
    discountPercent: 50,
    permalink: 'https://produto.mercadolivre.com.br/MLB888-1',
    imageUrl: 'https://http2.mlstatic.com/MLB888-1.jpg',
    sales: 1500,
    ratingStar: 4.8,
    commissionPercent: 12.0,
    provenance: 'mercadolivre_official_intent',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-10',
    shopeeCandidates: [],
    mlCandidates: [mediumViability],
  });

  assert.equal(products.length, 1);
});

test('TEST 11: produto insufficient_data -> não ocupa vaga comercial principal', () => {
  const invalidPriceItem = {
    marketplace: 'Shopee',
    shopId: 'shop-inv',
    itemId: 'item-inv',
    productName: 'Produto com Preço Zerado ou Nulo',
    currentPrice: null,
    sales: 500,
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-11',
    shopeeCandidates: [invalidPriceItem],
    mlCandidates: [],
  });

  assert.equal(products.length, 0);
});

test('TEST 12: primeira coleta gera apenas 3 candidatos finais -> refill executa nova rodada', async () => {
  let refillCalls = 0;
  const mockShopeeCollector = async ({ page = 1 } = {}) => {
    refillCalls += 1;
    if (page === 1) {
      return [
        { marketplace: 'Shopee', shopId: 's1', itemId: 'p1', productName: 'Teclado Mecânico Pro 1', currentPrice: 150, discountPercent: 50, sales: 1500, ratingStar: 4.8, commissionPercent: 12, permalink: 'https://shopee.com.br/product/1/p1', imageUrl: 'https://cf.shopee.com.br/p1.jpg', provenance: 'shopee_openapi_productOfferV2' },
        { marketplace: 'Shopee', shopId: 's1', itemId: 'p2', productName: 'Mouse Sem Fio Ultra 2', currentPrice: 160, discountPercent: 50, sales: 1500, ratingStar: 4.8, commissionPercent: 12, permalink: 'https://shopee.com.br/product/1/p2', imageUrl: 'https://cf.shopee.com.br/p2.jpg', provenance: 'shopee_openapi_productOfferV2' },
        { marketplace: 'Shopee', shopId: 's1', itemId: 'p3', productName: 'Monitor Gamer 165Hz 3', currentPrice: 170, discountPercent: 50, sales: 1500, ratingStar: 4.8, commissionPercent: 12, permalink: 'https://shopee.com.br/product/1/p3', imageUrl: 'https://cf.shopee.com.br/p3.jpg', provenance: 'shopee_openapi_productOfferV2' },
      ];
    }
    return [
      { marketplace: 'Shopee', shopId: 's1', itemId: `p${page}_4`, productName: `Headset Surround Pro ${page} 4`, currentPrice: 180, discountPercent: 50, sales: 1500, ratingStar: 4.8, commissionPercent: 12, permalink: `https://shopee.com.br/product/1/p${page}_4`, imageUrl: `https://cf.shopee.com.br/p${page}_4.jpg`, provenance: 'shopee_openapi_productOfferV2' },
      { marketplace: 'Shopee', shopId: 's1', itemId: `p${page}_5`, productName: `Webcam Full HD Pro ${page} 5`, currentPrice: 190, discountPercent: 50, sales: 1500, ratingStar: 4.8, commissionPercent: 12, permalink: `https://shopee.com.br/product/1/p${page}_5`, imageUrl: `https://cf.shopee.com.br/p${page}_5.jpg`, provenance: 'shopee_openapi_productOfferV2' },
    ];
  };

  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-refill-test', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: async () => [],
    maxRefillRounds: 3,
  });

  assert.equal(result.processed, true);
  assert.ok(refillCalls > 1, 'Refill collector deve ter sido chamado mais de 1 vez');
  assert.ok(savedSourceHealth.refill_rounds >= 1);
});

test('TEST 13: refill consegue elevar o conjunto para 10+ -> execução continua normalmente', async () => {
  const categories = [
    'Teclado Mecânico RGB', 'Mouse Gamer Sem Fio', 'Monitor Gamer 165Hz', 'Cadeira Ergonômica Pro',
    'Headset 7.1 Surround', 'Webcam Full HD 1080p', 'Microfone Condensador USB', 'Suporte Articulado Monitor',
    'Luminária de Mesa LED', 'Gabinete Gamer Vidro', 'Memória RAM 16GB DDR4', 'Processador Octa Core',
  ];
  const mockShopeeCollector = async ({ page = 1 } = {}) => {
    const items = [];
    for (let i = 1; i <= 6; i++) {
      const idx = ((page - 1) * 6 + (i - 1)) % categories.length;
      items.push({
        marketplace: 'Shopee',
        shopId: `shop-${page}`,
        itemId: `item-${page}-${i}`,
        productName: `${categories[idx]} Modelo ${page}_${i}`,
        currentPrice: 140 + i,
        discountPercent: 50,
        sales: 1500,
        ratingStar: 4.8,
        commissionPercent: 12.0,
        permalink: `https://shopee.com.br/product/${page}/item-${page}-${i}`,
        imageUrl: `https://cf.shopee.com.br/item-${page}-${i}.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      });
    }
    return items;
  };

  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-13', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: async () => [],
    maxRefillRounds: 3,
  });

  assert.equal(result.processed, true);
  assert.ok(result.productsCount >= 10, 'Deve atingir 10+ produtos');
});

test('TEST 14: refill consegue chegar a 20 -> target_reached = true', async () => {
  const categories = [
    'Teclado Mecânico RGB', 'Mouse Gamer Sem Fio', 'Monitor Gamer 165Hz', 'Cadeira Ergonômica Pro',
    'Headset 7.1 Surround', 'Webcam Full HD 1080p', 'Microfone Condensador USB', 'Suporte Articulado Monitor',
    'Luminária de Mesa LED', 'Gabinete Gamer Vidro', 'Memória RAM 16GB DDR4', 'Processador Octa Core',
    'Placa de Vídeo 8GB', 'Fonte 650W 80 Plus', 'Cooler Duplo Heatpipe', 'SSD NVMe 1TB PCIe',
    'HD Externo 2TB USB', 'Roteador Wi-Fi 6 Mesh', 'Switch Gigabit 8 Portas', 'Cabo HDMI 2.1 8K',
    'Hub USB-C 7 em 1', 'Carregador GaN 65W', 'Mousepad Speed Extra Grande', 'Controle Bluetooth Gamer',
  ];
  const mockShopeeCollector = async ({ page = 1 } = {}) => {
    const items = [];
    for (let i = 1; i <= 12; i++) {
      const idx = ((page - 1) * 12 + (i - 1)) % categories.length;
      items.push({
        marketplace: 'Shopee',
        shopId: `s-${page}`,
        itemId: `item-${page}-${i}`,
        productName: `${categories[idx]} Modelo ${page}_${i}`,
        currentPrice: 150 + i,
        discountPercent: 50,
        sales: 1500,
        ratingStar: 4.8,
        commissionPercent: 12.0,
        permalink: `https://shopee.com.br/product/${page}/item-${page}-${i}`,
        imageUrl: `https://cf.shopee.com.br/item-${page}-${i}.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      });
    }
    return items;
  };

  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-14', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: async () => [],
    maxRefillRounds: 3,
  });

  assert.equal(result.processed, true);
  assert.equal(result.productsCount, 20);
  assert.equal(savedSourceHealth.target_reached, true);
  assert.equal(savedSourceHealth.target_products, 20);
  assert.equal(savedSourceHealth.minimum_products, 10);
});

test('TEST 15: fontes se esgotam com apenas 7 produtos -> finaliza com 7, target_reached = false e completion_reason explícita', async () => {
  const categories = [
    'Teclado Mecânico RGB', 'Mouse Gamer Sem Fio', 'Monitor Gamer 165Hz', 'Cadeira Ergonômica Pro',
    'Headset 7.1 Surround', 'Webcam Full HD 1080p', 'Microfone Condensador USB',
  ];
  const mockShopeeCollector = async ({ page = 1 } = {}) => {
    if (page === 1) {
      return Array.from({ length: 7 }, (_, i) => ({
        marketplace: 'Shopee',
        shopId: 's1',
        itemId: `item-exhaust-${i}`,
        productName: `${categories[i]} Modelo ${i}`,
        currentPrice: 150,
        discountPercent: 50,
        sales: 1500,
        ratingStar: 4.8,
        commissionPercent: 12,
        permalink: `https://shopee.com.br/product/1/item-exhaust-${i}`,
        imageUrl: `https://cf.shopee.com.br/item-exhaust-${i}.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      }));
    }
    // Páginas subsequentes retornam vazio (fontes esgotadas)
    return [];
  };

  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-15', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: async () => [],
    maxRefillRounds: 3,
  });

  assert.equal(result.processed, true);
  assert.equal(result.productsCount, 7);
  assert.equal(savedSourceHealth.target_reached, false);
  assert.equal(savedSourceHealth.completion_reason, 'eligible_sources_exhausted');
});

test('TEST 16: Top 20 não contém identidade comercial duplicada', () => {
  const pool = [];
  for (let i = 0; i < 30; i++) {
    pool.push({
      marketplace: 'Shopee',
      shopId: `shop-${i % 15}`,
      itemId: `item-${i % 15}`, // 15 pares de itens com mesmo itemId/shopId
      productName: `Produto Gamer Modelo ${i % 15}`,
      currentPrice: 150 + i,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/${i % 15}/item-${i % 15}`,
      imageUrl: `https://cf.shopee.com.br/item-${i % 15}.jpg`,
      provenance: 'shopee_openapi_productOfferV2',
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-16',
    shopeeCandidates: pool,
    mlCandidates: [],
    maxProducts: 20,
  });

  const seen = new Set();
  for (const prod of products) {
    const ev = prod.direct_evidence[0];
    const key = `${ev.marketplace_identity.shopId}:${ev.marketplace_identity.itemId}`;
    assert.equal(seen.has(key), false, `Identidade duplicada encontrada: ${key}`);
    seen.add(key);
  }
});

test('TEST 17: Top 20 não contém duplicatas semânticas proibidas', () => {
  const pool = [
    {
      marketplace: 'Shopee',
      shopId: 's1',
      itemId: 'i1',
      productName: 'Bola Interativa Inteligente Para Gatos com LED Brinquedo Automático',
      currentPrice: 139.9,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.9,
      commissionPercent: 12,
      permalink: 'https://shopee.com.br/product/1/i1',
      imageUrl: 'https://cf.shopee.com.br/i1.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      shopId: 's2',
      itemId: 'i2',
      productName: 'Brinquedo Pet Bola Inteligente Interativa Gato LED Automática',
      currentPrice: 142.0,
      discountPercent: 50,
      sales: 80,
      ratingStar: 4.3,
      commissionPercent: 6,
      permalink: 'https://shopee.com.br/product/2/i2',
      imageUrl: 'https://cf.shopee.com.br/i2.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-17',
    shopeeCandidates: pool,
    mlCandidates: [],
  });

  assert.equal(products.length, 1);
});

test('TEST 18: google_trends_used continua false em toda execução', async () => {
  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-18', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: async () => [{ marketplace: 'Shopee', shopId: 's1', itemId: 'i1', productName: 'Item 1', currentPrice: 50, sales: 50, commissionPercent: 5 }],
    mlCollector: async () => [],
  });

  assert.equal(result.googleTrendsUsed, false);
  assert.equal(savedSourceHealth.google_trends_used, false);
});

test('TEST 19: nenhuma publicação automática é criada', async () => {
  const result = await processPendingTrendRadarRuns({
    client: null, // dryRun mode
    dryRun: true,
    shopeeCollector: async () => [],
    mlCollector: async () => [],
  });

  assert.equal(result.publishCalls, 0);
  assert.equal(result.postsWrites, 0);
});

test('TEST 20: nenhuma oferta é criada automaticamente apenas por aparecer no Radar', async () => {
  const result = await processPendingTrendRadarRuns({
    client: null, // dryRun mode
    dryRun: true,
    shopeeCollector: async () => [{ marketplace: 'Shopee', shopId: 's1', itemId: 'i1', productName: 'Item Teste', currentPrice: 50, sales: 50, commissionPercent: 5 }],
    mlCollector: async () => [],
  });

  assert.equal(result.offersWrites, 0);
});

test('TEST 21: collectMercadoLivreMarketplaceCandidates real divide keywords em batches determinísticos e não sobrepostos por round e esgota explicitamente', async () => {
  const capturedCalls = [];
  const testKeywords = [
    'smart TV 4K',
    'fone bluetooth',
    'air fryer',
    'notebook',
    'tenis corrida',
    'cadeira gamer',
    'lixeira inox',
    'suporte notebook',
    'tapete pet',
  ];

  const mockCoverageRunner = async ({ keywords, accessToken }) => {
    capturedCalls.push({ keywords: [...keywords], accessToken });
    return {
      products: keywords.map((kw, idx) => ({
        id: `MLB-${kw.replace(/\s+/g, '-').toLowerCase()}-${idx}`,
        title: `Produto Oficial ${kw}`,
        price: 199.9,
        sold_quantity: 50,
        rating: 4.8,
        intent: kw,
      })),
    };
  };

  // 1. Executa round 1 (Batch A: keywords 0..2)
  const round1Candidates = await collectMercadoLivreMarketplaceCandidates({
    keywords: testKeywords,
    page: 1,
    batchSize: 3,
    accessToken: 'mock-token-ml',
    nativeCollector: null,
    coverageRunner: mockCoverageRunner,
  });

  // 2. Executa round 2 (Batch B: keywords 3..5)
  const round2Candidates = await collectMercadoLivreMarketplaceCandidates({
    keywords: testKeywords,
    page: 2,
    batchSize: 3,
    accessToken: 'mock-token-ml',
    nativeCollector: null,
    coverageRunner: mockCoverageRunner,
  });

  // 3. Executa round 3 (Batch C: keywords 6..8)
  const round3Candidates = await collectMercadoLivreMarketplaceCandidates({
    keywords: testKeywords,
    page: 3,
    batchSize: 3,
    accessToken: 'mock-token-ml',
    nativeCollector: null,
    coverageRunner: mockCoverageRunner,
  });

  // 4. Executa round 4 (além do total de batches disponíveis -> esgotamento factual)
  const round4Candidates = await collectMercadoLivreMarketplaceCandidates({
    keywords: testKeywords,
    page: 4,
    batchSize: 3,
    accessToken: 'mock-token-ml',
    nativeCollector: null,
    coverageRunner: mockCoverageRunner,
  });

  // Validação 1: coverageRunner só deve ser chamado para batches existentes (rounds 1 a 3)
  assert.equal(capturedCalls.length, 3, 'coverageRunner só deve ser chamado para batches com keywords válidas');
  assert.equal(round1Candidates.length, 3);
  assert.equal(round2Candidates.length, 3);
  assert.equal(round3Candidates.length, 3);
  assert.deepEqual(round4Candidates, [], 'Round após esgotamento de batches deve retornar array vazio explicitamente');

  // Validação 2: Conjuntos de keywords por round
  const round1Keywords = capturedCalls[0].keywords;
  const round2Keywords = capturedCalls[1].keywords;
  const round3Keywords = capturedCalls[2].keywords;

  assert.deepEqual(round1Keywords, ['smart TV 4K', 'fone bluetooth', 'air fryer']);
  assert.deepEqual(round2Keywords, ['notebook', 'tenis corrida', 'cadeira gamer']);
  assert.deepEqual(round3Keywords, ['lixeira inox', 'suporte notebook', 'tapete pet']);

  // Validação 3: Prova estrita de não sobreposição (disjunção total)
  const set1 = new Set(round1Keywords);
  const set2 = new Set(round2Keywords);
  const set3 = new Set(round3Keywords);

  for (const kw of round2Keywords) {
    assert.equal(set1.has(kw), false, `Keyword "${kw}" do round 2 não pode existir no round 1`);
  }
  for (const kw of round3Keywords) {
    assert.equal(set1.has(kw), false, `Keyword "${kw}" do round 3 não pode existir no round 1`);
    assert.equal(set2.has(kw), false, `Keyword "${kw}" do round 3 não pode existir no round 2`);
  }
});

test('TEST 22: fontes se esgotam (rounds retornam vazio) → completion_reason = eligible_sources_exhausted', async () => {
  const categories = [
    'Teclado Mecânico RGB', 'Mouse Gamer Sem Fio', 'Monitor Gamer 165Hz', 'Cadeira Ergonômica Pro',
    'Headset 7.1 Surround',
  ];
  // Fontes retornam candidatos apenas no round 1, depois ficam completamente vazias.
  const mockShopeeCollector = async ({ page = 1 } = {}) => {
    if (page === 1) {
      return Array.from({ length: 5 }, (_, i) => ({
        marketplace: 'Shopee',
        shopId: 's1',
        itemId: `item-exhaust-22-${i}`,
        productName: `${categories[i]} Modelo ${i}`,
        currentPrice: 150,
        discountPercent: 50,
        sales: 1500,
        ratingStar: 4.8,
        commissionPercent: 12,
        permalink: `https://shopee.com.br/product/1/item-exhaust-22-${i}`,
        imageUrl: `https://cf.shopee.com.br/item-exhaust-22-${i}.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      }));
    }
    // Rounds 2+ retornam vazio → fontes esgotadas
    return [];
  };

  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-22', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: async () => [],
    maxRefillRounds: 3,
  });

  assert.equal(result.processed, true);
  assert.ok(result.productsCount < 10, 'Menos de 10 produtos (fontes esgotadas)');
  assert.equal(
    savedSourceHealth.completion_reason,
    'eligible_sources_exhausted',
    'Deve registrar eligible_sources_exhausted quando fontes retornarem vazio'
  );
});

test('TEST 23: maxRefillRounds esgota mas fontes ainda ativas → completion_reason = refill_limit_reached', async () => {
  let callCount = 0;
  const mockShopeeCollector = async ({ page = 1 } = {}) => {
    callCount += 1;
    return [
      {
        marketplace: 'Shopee',
        shopId: 's-limit',
        itemId: `item-limit-${page}-A`,
        productName: `Produto Limite Round ${page} A`,
        currentPrice: 150,
        discountPercent: 50,
        sales: 1500,
        ratingStar: 4.8,
        commissionPercent: 12,
        permalink: `https://shopee.com.br/product/limit/item-limit-${page}-A`,
        imageUrl: `https://cf.shopee.com.br/item-limit-${page}-A.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      },
      {
        marketplace: 'Shopee',
        shopId: 's-limit',
        itemId: `item-limit-${page}-B`,
        productName: `Produto Limite Round ${page} B`,
        currentPrice: 160,
        discountPercent: 50,
        sales: 1500,
        ratingStar: 4.8,
        commissionPercent: 12,
        permalink: `https://shopee.com.br/product/limit/item-limit-${page}-B`,
        imageUrl: `https://cf.shopee.com.br/item-limit-${page}-B.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
      },
    ];
  };

  let savedSourceHealth = {};
  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ id: 'run-23', radar_date: '2026-08-19', status: 'building', source_health: { runtime: 'oracle' } }],
                  error: null,
                }),
              }),
              gte: () => ({ order: async () => ({ data: [], error: null }) }),
            }),
          }),
          update: (payload) => {
            if (payload.source_health) savedSourceHealth = payload.source_health;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
          delete: () => ({ eq: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === 'offers') {
        return { select: () => ({ range: async () => ({ data: [], error: null }) }) };
      }
      return {};
    },
  };

  // maxRefillRounds = 2 → loop para por limite (2 rounds × 2 itens = 4 viáveis < 10)
  const result = await processPendingTrendRadarRuns({
    client: mockClient,
    shopeeCollector: mockShopeeCollector,
    mlCollector: async () => [],
    maxRefillRounds: 2,
  });

  assert.equal(result.processed, true);
  // Fontes foram chamadas (não retornaram vazio) — loop parou por maxRefillRounds
  assert.ok(callCount >= 2, 'Shopee collector deve ter sido chamado em ao menos 2 rounds');
  assert.ok(result.productsCount < 10, 'Menos de 10 produtos (não atingiu mínimo)');
  assert.equal(
    savedSourceHealth.completion_reason,
    'refill_limit_reached',
    'Deve registrar refill_limit_reached quando parar por limite operacional, não por esgotamento de fontes'
  );
  assert.notEqual(
    savedSourceHealth.completion_reason,
    'eligible_sources_exhausted',
    'NÃO deve usar eligible_sources_exhausted quando fontes ainda retornam dados'
  );
});

