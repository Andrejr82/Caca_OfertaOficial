'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTrendRadarProductsFromCandidates,
  processPendingTrendRadarRuns,
} = require('../oracle-trends-radar-runner.cjs');

test('dois itemIds diferentes com mesmo normalized_product_term no mesmo marketplace -> apenas um vai para o resultado final', () => {
  const candidates = [
    {
      marketplace: 'Shopee',
      itemId: 'shopee-item-1',
      shopId: 'shop-1',
      productName: 'Capa Para Colchão Impermeável Matelado com Elástico',
      currentPrice: 120.0,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.9,
      commissionPercent: 12.0,
      permalink: 'https://shopee.com.br/product/1/shopee-item-1',
      imageUrl: 'https://cf.shopee.com.br/item1.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      itemId: 'shopee-item-2',
      shopId: 'shop-2',
      productName: 'Capa para colchao impermeavel matelado com elastico!', // Mesmo normalized_product_term
      currentPrice: 130.0,
      discountPercent: 50,
      sales: 300,
      ratingStar: 4.5,
      commissionPercent: 10.0,
      permalink: 'https://shopee.com.br/product/2/shopee-item-2',
      imageUrl: 'https://cf.shopee.com.br/item2.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-collision-test',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 10,
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].normalized_product_term, 'capa para colchao impermeavel matelado com elastico');
  assert.equal(products[0].direct_evidence[0].marketplace_identity.itemId, 'shopee-item-1');
});

test('ranking repõe o duplicado de normalized_product_term pelo próximo candidato viável', () => {
  const candidates = [
    {
      marketplace: 'Shopee',
      itemId: 'item-best-duplicate',
      shopId: 'shop-1',
      productName: 'Mini Ventilador Turbo Portátil LED',
      currentPrice: 120.0,
      discountPercent: 50,
      sales: 2000,
      ratingStar: 4.9,
      commissionPercent: 12.0,
      permalink: 'https://shopee.com.br/product/1/item-best-duplicate',
      imageUrl: 'https://cf.shopee.com.br/best.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      itemId: 'item-worst-duplicate',
      shopId: 'shop-2',
      productName: 'Mini Ventilador Turbo Portatil Led - USB', // Mesmo normalized_product_term
      currentPrice: 130.0,
      discountPercent: 50,
      sales: 200,
      ratingStar: 4.2,
      commissionPercent: 8.0,
      permalink: 'https://shopee.com.br/product/2/item-worst-duplicate',
      imageUrl: 'https://cf.shopee.com.br/worst.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
    {
      marketplace: 'Shopee',
      itemId: 'item-third-candidate',
      shopId: 'shop-3',
      productName: 'Comedouro Elevado Para Pet MDF',
      currentPrice: 120.0,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12.0,
      permalink: 'https://shopee.com.br/product/3/item-third-candidate',
      imageUrl: 'https://cf.shopee.com.br/third.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-refill-dup-test',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 2,
  });

  assert.equal(products.length, 2);
  assert.equal(products[0].direct_evidence[0].marketplace_identity.itemId, 'item-best-duplicate');
  assert.equal(products[1].direct_evidence[0].marketplace_identity.itemId, 'item-third-candidate');
  assert.equal(products[1].normalized_product_term, 'comedouro elevado para pet mdf');
});

test('mantém target de 20 produtos únicos mesmo com colisões de títulos no catálogo', () => {
  const categories = [
    'Teclado Mecânico RGB', 'Mouse Gamer Sem Fio', 'Monitor Gamer 165Hz', 'Cadeira Ergonômica Pro',
    'Headset 7.1 Surround', 'Webcam Full HD 1080p', 'Microfone Condensador USB', 'Suporte Articulado Monitor',
    'Luminária de Mesa LED', 'Gabinete Gamer Vidro', 'Memória RAM 16GB DDR4', 'Processador Octa Core',
    'Placa de Vídeo 8GB', 'Fonte 650W 80 Plus', 'Cooler Duplo Heatpipe', 'SSD NVMe 1TB PCIe',
    'HD Externo 2TB USB', 'Roteador Wi-Fi 6 Mesh', 'Switch Gigabit 8 Portas', 'Cabo HDMI 2.1 8K',
  ];
  const candidates = [];
  // Gera 30 candidatos, sendo 10 duplicatas de termos de outros 10
  for (let i = 1; i <= 20; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `item-unique-${i}`,
      shopId: `shop-${i}`,
      productName: `${categories[i - 1]} Modelo ${i}`,
      currentPrice: 150 + i,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12.0,
      permalink: `https://shopee.com.br/product/${i}/item-${i}`,
      imageUrl: `https://cf.shopee.com.br/item-${i}.jpg`,
      provenance: 'shopee_openapi_productOfferV2',
    });
  }
  for (let i = 1; i <= 10; i++) {
    // Colisões intencionais com os 10 primeiros
    candidates.push({
      marketplace: 'Shopee',
      itemId: `item-duplicate-${i}`,
      shopId: `shop-dup-${i}`,
      productName: `${categories[i - 1]} Modelo ${i}!!`,
      currentPrice: 180 + i,
      discountPercent: 50,
      sales: 50,
      ratingStar: 4.0,
      commissionPercent: 10.0,
      permalink: `https://shopee.com.br/product/dup/${i}`,
      imageUrl: `https://cf.shopee.com.br/dup-${i}.jpg`,
      provenance: 'shopee_openapi_productOfferV2',
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-target-20-test',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 20);
  const seenKeys = new Set();
  for (const p of products) {
    const key = `${p.marketplace}:${p.normalized_product_term}`;
    assert.equal(seenKeys.has(key), false, `Chave duplicada encontrada: ${key}`);
    seenKeys.add(key);
  }
});

test('processPendingTrendRadarRuns marca o run como failed com PERSISTENCE_ERROR em caso de falha no banco', async () => {
  const mockRun = {
    id: 'run-fail-test',
    user_id: 'user-fail',
    radar_date: '2026-08-19',
    status: 'building',
    source_health: { runtime: 'oracle', status: 'requested' },
  };

  let runUpdates = [];

  const mockClient = {
    from: (table) => {
      if (table === 'trend_radar_runs') {
        const queryBuilder = {
          eq: () => queryBuilder,
          gte: () => queryBuilder,
          order: () => queryBuilder,
          limit: async () => ({ data: [mockRun], error: null }),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        queryBuilder[Symbol.asyncIterator] = async function* () { yield { data: [], error: null }; };
        return {
          select: () => queryBuilder,
          update: (payload) => ({
            eq: async (col, val) => {
              runUpdates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'trend_radar_products') {
        return {
          select: () => ({
            eq: () => ({ then: (resolve) => resolve({ data: [], error: null }) }),
            in: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }), then: (resolve) => resolve({ data: [], error: null }) }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
          insert: async () => {
            return {
              error: {
                message: 'duplicate key value violates unique constraint "trend_radar_products_radar_run_id_normalized_product_term_m_key"',
                code: 'PERSISTENCE_ERROR',
              },
            };
          },
        };
      }
      if (table === 'offers') {
        const offersBuilder = {
          eq: () => offersBuilder,
          range: async () => ({ data: [], error: null }),
        };
        return {
          select: () => offersBuilder,
        };
      }
      return {};
    },
  };

  const mockShopeeCollector = async () => [
    {
      marketplace: 'Shopee',
      itemId: 'shopee-1',
      shopId: 'shop-1',
      productName: 'Produto Teste Falha',
      currentPrice: 150,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: 'https://shopee.com.br/product/1/shopee-1',
      imageUrl: 'https://cf.shopee.com.br/shopee-1.jpg',
      provenance: 'shopee_openapi_productOfferV2',
    },
  ];

  await assert.rejects(
    async () => {
      await processPendingTrendRadarRuns({
        client: mockClient,
        shopeeCollector: mockShopeeCollector,
        mlCollector: async () => [],
        dryRun: false,
      });
    },
    /Falha ao inserir produtos/
  );

  // Verifica que o run foi atualizado para 'failed' no Supabase
  const failedUpdate = runUpdates.find((u) => u.status === 'failed');
  assert.ok(failedUpdate, 'Run deveria ter sido atualizado para status: failed');
  assert.equal(failedUpdate.failure_code, 'PERSISTENCE_ERROR');
  assert.equal(failedUpdate.source_health.status, 'failed');
  assert.ok(failedUpdate.source_health.failed_at);
});
