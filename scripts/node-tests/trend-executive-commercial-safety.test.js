'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRadarShadowState,
  classifyTrendCommercialSafety,
  createTargetedShopeeRequest,
  resolveShopeeScenarioForIntent,
  runTrendExecutiveShadow,
} = require('../trend-executive-shadow-runtime.cjs');

const scenarios = {
  celulares_editorial: {
    id: 'celulares_editorial',
    name: 'Celulares',
    keywords: ['iphone celular smartphone airsoft masteron minoxidil vape vibrador'],
  },
};

const editorialScenarios = {
  celulares_editorial: { id: 'celulares_editorial', name: 'Celulares' },
  informatica_editorial: { id: 'informatica_editorial', name: 'Informática' },
  tv_audio_editorial: { id: 'tv_audio_editorial', name: 'TV e Áudio' },
  casa_cozinha_editorial: { id: 'casa_cozinha_editorial', name: 'Casa e Cozinha' },
  moveis_editorial: { id: 'moveis_editorial', name: 'Móveis' },
  esporte_editorial: { id: 'esporte_editorial', name: 'Esporte' },
  beleza_editorial: { id: 'beleza_editorial', name: 'Beleza' },
};

function product(id, priority, productTerm, overrides = {}) {
  return {
    id,
    priority,
    product_term: productTerm,
    category: 'Eletrônicos',
    marketplace: null,
    marketplace_key: '',
    evidence_status: 'partial',
    ...overrides,
  };
}

test('bloqueia produtos regulados antes de criar contrato Shopee', () => {
  const snapshot = {
    run: { id: 'run-safe', status: 'completed' },
    products: [
      product('safe', 1, 'iphone 16'),
      product('weapon', 2, 'airsoft'),
      product('drug', 3, 'masteron injetavel'),
      product('health', 4, 'minoxidil kirkland'),
      product('nicotine', 5, 'vape cigarro eletronico'),
      product('adult', 6, 'vibrador'),
    ],
  };

  const state = buildRadarShadowState(snapshot, { scenarios, maxIntents: 5 });
  assert.deepEqual(state.contracts.map((item) => item.radarProductId), ['safe']);
  assert.deepEqual(
    state.rejected.filter((item) => item.reason === 'commercial_safety_blocked').map((item) => item.radarProductId),
    ['weapon', 'drug', 'health', 'nicotine', 'adult'],
  );
});

test('classifica segurança comercial com motivo auditável', () => {
  assert.deepEqual(classifyTrendCommercialSafety({ productTerm: 'airsoft' }), { eligible: false, reason: 'regulated_weapon' });
  assert.deepEqual(classifyTrendCommercialSafety({ productTerm: 'iphone 16' }), { eligible: true, reason: null });
});

test('aceita tendência originada no Mercado Livre como evidência para descoberta Shopee', () => {
  const state = buildRadarShadowState({
    run: { id: 'run-cross-marketplace', status: 'completed' },
    products: [product('ml', 1, 'notebook', {
      marketplace: 'Mercado Livre',
      marketplace_key: 'Mercado Livre',
    })],
  }, { scenarios: editorialScenarios, maxIntents: 5 });

  assert.equal(state.contracts.length, 1);
  assert.equal(state.contracts[0].marketplace, 'Shopee');
  assert.equal(state.contracts[0].marketplaceSource, 'radar_cross_marketplace');
  assert.equal(state.contracts[0].scenarioId, 'informatica_editorial');
});

test('roteia termos comerciais para cenários editoriais determinísticos e não inventa cenário', () => {
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'iphone 15 pro max', category: 'Eletrônicos' }, editorialScenarios), 'celulares_editorial');
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'notebook', category: 'Eletrônicos' }, editorialScenarios), 'informatica_editorial');
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'playstation 5', category: 'Videogames' }, editorialScenarios), null);
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'fone de ouvido', category: 'Eletrônicos' }, editorialScenarios), 'tv_audio_editorial');
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'calendario 2026', category: 'Papéis e Escritório' }, editorialScenarios), null);
});

test('executa somente uma busca Shopee real pelo termo exato e bloqueia categoria ampla', async () => {
  const calls = [];
  const request = createTargetedShopeeRequest(['iphone 16'], async (payload) => {
    calls.push(JSON.parse(payload));
    return { status: 200, data: { data: { productOfferV2: { nodes: [], pageInfo: { hasNextPage: false } } } } };
  });

  const category = await request('ShopeePromotionOffers', 'query', { productCatId: 100013, page: 1 });
  assert.equal(category.data.data.productOfferV2.nodes.length, 0);
  assert.equal(calls.length, 0);

  await request('ShopeePromotionOffers', 'query', { keyword: 'iphone 16', page: 1 });
  await request('ShopeePromotionOffers', 'query', { keyword: 'smartphone 5g', page: 1 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].variables.keyword, 'iphone 16');
  assert.equal(calls[0].variables.productCatId, null);
});

test('propaga o termo exato do Radar para a execução Shopee shadow', async () => {
  const calls = [];
  const report = await runTrendExecutiveShadow({
    env: { TREND_EXECUTIVE_MODE: 'shadow' },
    snapshot: {
      run: { id: 'run-targeted', status: 'completed' },
      products: [product('safe', 1, 'iphone 16')],
    },
    scenarios,
    runShopeeShadow: async (payload) => {
      calls.push(payload);
      return {
        persistCalls: 0,
        writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
        marketplaces: [{ marketplace: 'Shopee', discovered: 4, persisted: 0, queueSelected: 0 }],
      };
    },
  });

  assert.equal(report.executedIntents, 1);
  assert.deepEqual(calls[0].searchTerms, ['iphone 16']);
  assert.equal(typeof calls[0].request, 'function');
});

test('executa termos distintos mesmo quando pertencem ao mesmo cenário editorial', async () => {
  const calls = [];
  const report = await runTrendExecutiveShadow({
    env: { TREND_EXECUTIVE_MODE: 'shadow' },
    snapshot: {
      run: { id: 'run-same-scenario', status: 'completed' },
      products: [
        product('iphone15', 1, 'iphone 15 pro max'),
        product('iphone16', 2, 'iphone 16'),
      ],
    },
    scenarios: editorialScenarios,
    runShopeeShadow: async (payload) => {
      calls.push(payload.searchTerms[0]);
      return {
        persistCalls: 0,
        writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
        marketplaces: [{ marketplace: 'Shopee', discovered: 1, persisted: 0, queueSelected: 0 }],
      };
    },
  });

  assert.equal(report.executedIntents, 2);
  assert.deepEqual(calls, ['iphone 15 pro max', 'iphone 16']);
});
