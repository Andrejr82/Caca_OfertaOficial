'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../trend-radar-seven-niches-v4.cjs');

const niches = {
  informatica: {
    name: 'Informática',
    guardrails: { allowedProductTerms: ['notebook'], blockedProductTerms: [] },
  },
};

function commercialAmazon(overrides = {}) {
  return {
    marketplace: 'Amazon',
    itemId: 'B123456789',
    asin: 'B123456789',
    productName: 'Notebook Gamer',
    currentPrice: 1000,
    permalink: 'https://www.amazon.com.br/dp/B123456789',
    imageUrl: 'https://images.amazon.com/notebook.jpg',
    rank: 1,
    rankAuthoritative: true,
    bestSeller: true,
    amazonBestSeller: true,
    marketplaceTrendEvidence: { source: 'amazon best sellers', keyword: 'notebook' },
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('produto sem histórico nunca é verified mesmo com Best Seller e evidência nativa', () => {
  const [item] = core.evaluateCandidates([commercialAmazon()], new Map(), { niches });

  assert.equal(item.trending, false);
  assert.equal(item.evidenceStatus, 'partial');
  assert.equal(item.temporal.baselineStatus, 'no_history');
});

test('contrato comercial inválido é rejected e não entra no snapshot', () => {
  const evaluated = core.evaluateCandidates([
    commercialAmazon({ itemId: 'B123456780', asin: 'B123456780', permalink: null, imageUrl: null }),
  ], new Map(), { niches });
  const snapshot = core.selectSnapshot(evaluated);

  assert.equal(evaluated[0].evidenceStatus, 'rejected');
  assert.deepEqual(evaluated[0].rejectionReasons, ['image_https_required', 'permalink_https_required']);
  assert.equal(snapshot.persisted.length, 0);
  assert.equal(snapshot.rejected.length, 1);

  const persisted = core.toPersistedRow(evaluated[0]);
  assert.equal(persisted.evidence_status, 'rejected');
  assert.equal(persisted.confidence, 0);
  assert.deepEqual(persisted.direct_evidence[0].rejection_reasons, ['image_https_required', 'permalink_https_required']);
});

test('repetição recente sem nova evidência significativa não é selecionada', () => {
  const identity = 'Amazon:B123456789';
  const history = new Map([[identity, [{ sales: null, rank: 1, observedAt: new Date(Date.now() - 12 * 3600000).toISOString() }]]]);
  const evaluated = core.evaluateCandidates([commercialAmazon()], history, { niches });
  const snapshot = core.selectSnapshot(evaluated);

  assert.equal(evaluated[0].repeatBlocked, true);
  assert.equal(evaluated[0].evidenceStatus, 'partial');
  assert.equal(snapshot.verified.length, 0);
});

test('repetição recente pode voltar somente quando surge evidência significativa nova', () => {
  const identity = 'Amazon:B123456789';
  const history = new Map([[identity, [{ sales: 100, rank: 10, observedAt: new Date(Date.now() - 12 * 3600000).toISOString() }]]]);
  const evaluated = core.evaluateCandidates([commercialAmazon({ sales: 200, rank: 5 })], history, { niches });

  assert.equal(evaluated[0].repeatBlocked, false);
  assert.equal(evaluated[0].evidenceStatus, 'verified');
});

test('uma evidência de vendas isolada atende ao gate de evidência, sem exigir as três métricas', () => {
  const candidate = commercialAmazon({
    marketplace: 'Shopee',
    itemId: '44001',
    asin: null,
    permalink: 'https://shopee.com.br/product/44001',
    imageUrl: 'https://cf.shopee.com.br/notebook.jpg',
    bestSeller: false,
    amazonBestSeller: false,
    marketplaceTrendEvidence: null,
    sales: 150,
  });
  const previous = [{ sales: 100, observedAt: new Date(Date.now() - 6 * 3600000).toISOString() }];
  const result = core.calculateTrendEvidence({
    ...candidate,
    nicheId: 'informatica',
    matchedTerm: 'notebook',
    primaryFamilyMatch: true,
  }, previous);

  assert.equal(result.strongSalesAcceleration, true);
});

test('seleção garante diversidade mínima quando há cobertura dos sete nichos', () => {
  const nicheIds = ['pet', 'beleza', 'moda', 'eletrodomesticos', 'informatica', 'ferramentas', 'casa'];
  const evaluated = [
    ...Array.from({ length: 3 }, (_, index) => ({ identityKey: `pet-${index}`, nicheId: 'pet', trendScore: 99 - index, trending: true, commercialScore: 80 })),
    ...Array.from({ length: 3 }, (_, index) => ({ identityKey: `beleza-${index}`, nicheId: 'beleza', trendScore: 89 - index, trending: true, commercialScore: 80 })),
    ...nicheIds.slice(2).map((nicheId, index) => ({ identityKey: `${nicheId}-1`, nicheId, trendScore: 70 - index, trending: true, commercialScore: 80 })),
  ];
  const snapshot = core.selectSnapshot(evaluated, { maxRows: 7 });

  assert.deepEqual(new Set(snapshot.verified.map((item) => item.nicheId)), new Set(nicheIds));
});
