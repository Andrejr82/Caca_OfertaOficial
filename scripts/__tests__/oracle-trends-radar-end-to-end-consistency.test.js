'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decisionFromScore,
  calculateCommercialOpportunityScoreVNext,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');
const {
  selectRadarVNext,
  canonicalFunctionalFamily,
  canonicalMacroFamily,
} = require('../../src/core/trends/radar-vnext-selector.cjs');
const {
  materializeTrendRadarProduct,
} = require('../../scripts/oracle-trends-radar-engine.cjs');
const {
  validateFinalRadarSnapshot,
} = require('../../src/core/trends/radar-snapshot-validator.cjs');

test('TESTE 1: decisionFromScore canonical thresholds exatos', () => {
  assert.equal(decisionFromScore(100), 'PRIORIDADE');
  assert.equal(decisionFromScore(80), 'PRIORIDADE');
  assert.equal(decisionFromScore(79), 'TESTAR');
  assert.equal(decisionFromScore(65), 'TESTAR');
  assert.equal(decisionFromScore(64), 'OBSERVAR');
  assert.equal(decisionFromScore(63), 'OBSERVAR');
  assert.equal(decisionFromScore(62), 'OBSERVAR');
  assert.equal(decisionFromScore(50), 'OBSERVAR');
  assert.equal(decisionFromScore(49), 'IGNORAR');
  assert.equal(decisionFromScore(0), 'IGNORAR');
});

test('TESTE 2: Canonical functional family unifica variantes e kits da mesma família', () => {
  const itemSingle = { productName: "Câmera Segurança Prova D'água Infravermelho Lâmpada Externa 360 Sem Fio Wifi 2.4G G4" };
  const itemPlus = { productName: "Câmera wifi ip sem fio giratória 360 com encaixe lampada bocal rosca ptz full HD visão noturna segurança+MICROSD 16GB" };
  const itemKit = { productName: "Kit 1 - 2 Câmera Segurança Prova D'água Infravermelho Lâmpada Externa 360 Sem Fio Wifi 2.4G - ICSEE YOOSEE" };

  const fam1 = canonicalFunctionalFamily(itemSingle);
  const fam2 = canonicalFunctionalFamily(itemPlus);
  const fam3 = canonicalFunctionalFamily(itemKit);

  assert.equal(fam1, 'camera_lampada_360');
  assert.equal(fam2, 'camera_lampada_360');
  assert.equal(fam3, 'camera_lampada_360');
});

test('TESTE 3: Selector limita estritamente maxPerFamily = 2 sem fallback quando pool é abundante', () => {
  const candidates = [
    { marketplace: 'Shopee', itemId: 'cam-1', shopId: 's1', productName: "Câmera Segurança 360 Lâmpada Wifi Modelo A", currentPrice: 50, sales: 5000, commissionRate: 15, permalink: 'https://shopee.com.br/1', imageUrl: 'https://img.com/1', provenance: 'shopee_openapi_productOfferV2', evidenceStatus: 'verified' },
    { marketplace: 'Shopee', itemId: 'cam-2', shopId: 's2', productName: "Câmera wifi ip sem fio giratória 360 lâmpada Modelo B", currentPrice: 55, sales: 4000, commissionRate: 15, permalink: 'https://shopee.com.br/2', imageUrl: 'https://img.com/2', provenance: 'shopee_openapi_productOfferV2', evidenceStatus: 'verified' },
    { marketplace: 'Shopee', itemId: 'cam-3', shopId: 's3', productName: "Kit 2 Câmera Segurança 360 Lâmpada Wifi Modelo C", currentPrice: 90, sales: 3000, commissionRate: 15, permalink: 'https://shopee.com.br/3', imageUrl: 'https://img.com/3', provenance: 'shopee_openapi_productOfferV2', evidenceStatus: 'verified' },
    { marketplace: 'Shopee', itemId: 'mix-1', shopId: 's4', productName: "Mixer Elétrico Batedor Portátil 2 em 1", currentPrice: 20, sales: 8000, commissionRate: 20, permalink: 'https://shopee.com.br/4', imageUrl: 'https://img.com/4', provenance: 'shopee_openapi_productOfferV2', evidenceStatus: 'verified' },
    { marketplace: 'Shopee', itemId: 'fat-1', shopId: 's5', productName: "Fatiador De Legumes 16 em 1 Multifuncional", currentPrice: 35, sales: 9000, commissionRate: 15, permalink: 'https://shopee.com.br/5', imageUrl: 'https://img.com/5', provenance: 'shopee_openapi_productOfferV2', evidenceStatus: 'verified' },
  ];

  const selected = selectRadarVNext(candidates, {
    maxProducts: 4,
    maxPerFamily: 2,
    maxPerMacro: 4,
  });

  const selectedCameras = selected.filter(s => canonicalFunctionalFamily(s.candidate) === 'camera_lampada_360');
  assert.equal(selectedCameras.length, 2, 'Deve selecionar exatamente no máximo 2 câmeras lâmpada 360');
});

test('TESTE 4: Materialização preserva decisionFromScore e functionalFamily canônica no objeto final', () => {
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'item-test-1',
    shopId: 'shop-1',
    productName: 'Suporte Articulado Para Monitor 13 a 32 Pistão a Gás',
    currentPrice: 90.56,
    sales: 1500,
    commissionRate: 10,
    permalink: 'https://shopee.com.br/item-1',
    imageUrl: 'https://img.com/1',
    provenance: 'shopee_openapi_productOfferV2',
    evidenceStatus: 'verified',
  };

  const score = calculateCommercialOpportunityScoreVNext(candidate, { pool: [candidate] });
  assert.equal(score.total, 63);
  assert.equal(score.decision, 'OBSERVAR');

  const materialized = materializeTrendRadarProduct({
    candidate,
    score,
    strategyVersion: 'commercial-opportunity-vnext/1',
    rank: 1,
    radarRunId: 'test-run-123',
    now: new Date(),
  });

  const ev = materialized.direct_evidence[0];
  assert.equal(ev.decision, 'OBSERVAR', 'direct_evidence[0].decision deve ser OBSERVAR para score 63');
  assert.equal(ev.selection_decision, 'OBSERVAR');
  assert.equal(ev.functionalFamily, 'suporte_monitor_articulado');
});

test('TESTE 5: validateFinalRadarSnapshot valida coerência ponta a ponta e rejeita contradições', () => {
  const validSnapshot = {
    run: {
      id: 'run-valid',
      strategy_version: 'commercial-opportunity-vnext/1',
      source_health: {
        official_strategy: 'commercial-opportunity-vnext/1',
        vnext_official: true,
        candidate_pool_count: 50,
        valid_candidate_count: 50,
      },
    },
    products: Array.from({ length: 20 }, (_, i) => ({
      priority: i + 1,
      marketplace: 'Shopee',
      product_term: `Produto Teste ${i + 1}`,
      commercial_score: 70 - i, // de 70 a 51
      direct_evidence: [{
        price: 25.00,
        decision: decisionFromScore(70 - i),
        functionalFamily: `familia_${Math.floor(i / 2)}`,
        macroFamily: `macro_${Math.floor(i / 4)}`,
        marketplace_identity: { shopId: `s_${i}`, itemId: `i_${i}` },
      }],
    })),
  };

  const res = validateFinalRadarSnapshot(validSnapshot);
  assert.equal(res.overall, 'PASS');
  assert.equal(res.threshold_violations, 0);
  assert.equal(res.diversity_violations, 0);
  assert.equal(res.duplicate_selected_identities, 0);
});
