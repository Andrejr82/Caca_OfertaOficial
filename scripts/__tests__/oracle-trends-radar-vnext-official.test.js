const test = require('node:test');
const assert = require('node:assert/strict');

const runnerFinal = require('../oracle-trends-radar-runner-final.cjs');
const engine = require('../oracle-trends-radar-engine.cjs');

// Candidate Fixtures
function createShopeeCandidate(id, overrides = {}) {
  return {
    itemId: String(id),
    shopId: String(id + 10),
    productName: `Fone Bluetooth TWS Sem Fio Mod ${id}`,
    category: 'Audio',
    currentPrice: 20,
    sales: 5000,
    ratingStar: 4.8,
    marketplace: 'Shopee',
    discountPercent: 25,
    commissionRate: 8,
    commissionSource: 'observed',
    permalink: `https://shopee.com.br/item${id}`,
    imageUrl: `https://img.shopee.com.br/${id}.jpg`,
    provenance: 'shopee_openapi_productOfferV2',
    evidenceStatus: 'verified',
    ...overrides,
  };
}

// 1. Feature Flag helper detection
test('1. isRadarVNextOfficialEnabled helper correctly detects flag values', () => {
  assert.equal(typeof runnerFinal.isRadarVNextOfficialEnabled, 'function');
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: '1' }), true);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: 'true' }), true);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: 'yes' }), true);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: 'on' }), true);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: '0' }), false);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: 'false' }), false);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: 'no' }), false);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({ TRENDS_RADAR_VNEXT_OFFICIAL: 'off' }), false);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled({}), false);
  assert.equal(runnerFinal.isRadarVNextOfficialEnabled(null), false);
});

// 2. Official OFF uses V4
test('2. buildTrendRadarProductsFromCandidates uses V4 when flag is OFF', () => {
  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 120, sales: 5000, discountPercent: 35, commissionRate: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.ok(products.length > 0);
  assert.equal(products[0].direct_evidence[0].strategy_version, 'commercial-opportunity-v4');
});

// 3. Official ON uses VNext
test('3. buildTrendRadarProductsFromCandidates uses VNext when flag is ON', () => {
  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 15, sales: 5000, discountPercent: 25 }),
    createShopeeCandidate(102, { currentPrice: 25, sales: 300, discountPercent: 10 }),
    createShopeeCandidate(103, { currentPrice: 22, sales: 400, discountPercent: 12 }),
    createShopeeCandidate(104, { currentPrice: 28, sales: 200, discountPercent: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length > 0);
  assert.equal(products[0].direct_evidence[0].strategy_version, 'commercial-opportunity-vnext/1');
  assert.ok(products[0].commercial_score >= 50);
  assert.ok(products[0].direct_evidence[0].benchmark);
});

// 4. V4 preserves v4_decision_<decision> in inferred_signals
test('4. V4 preserves v4_decision_<decision> in inferred_signals', () => {
  const candidate = createShopeeCandidate(101, { currentPrice: 120, sales: 5000, discountPercent: 35, commissionRate: 10 });
  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: [candidate],
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.ok(products.length > 0);
  const decisionSignal = products[0].inferred_signals.find(s => s.startsWith('v4_decision_'));
  assert.ok(decisionSignal, 'V4 must include v4_decision_<decision> signal');
});

// 5. V4 preserves ticket_<ticket_class> in inferred_signals
test('5. V4 preserves ticket_<ticket_class> in inferred_signals', () => {
  const candidate = createShopeeCandidate(101, { currentPrice: 120, sales: 5000, discountPercent: 35, commissionRate: 10 });
  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: [candidate],
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.ok(products.length > 0);
  const ticketSignal = products[0].inferred_signals.find(s => s.startsWith('ticket_'));
  assert.ok(ticketSignal, 'V4 must include ticket_<ticket_class> signal');
});

// 6. V4 preserves legacy evidence_status without artificial fallback
test('6. V4 preserves legacy evidence_status', () => {
  const candidate = createShopeeCandidate(101, { currentPrice: 120, sales: 5000, discountPercent: 35, evidenceStatus: 'catalog_unverified' });
  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: [candidate],
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.ok(products.length > 0);
  assert.equal(products[0].evidence_status, 'catalog_unverified');
});

// 7. V4 preserves legacy affiliate_potential and direct_evidence contract
test('7. V4 preserves legacy affiliate_potential and direct_evidence contract', () => {
  const candidate = createShopeeCandidate(101, { currentPrice: 120, sales: 5000, discountPercent: 35, commissionRate: 10 });
  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: [candidate],
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.ok(products.length > 0);
  const p = products[0];
  assert.equal(p.affiliate_potential, 'high');
  assert.equal(p.direct_evidence[0].viability_version, 'commercial-viability/v2');
  assert.equal(p.direct_evidence[0].strategy_version, 'commercial-opportunity-v4');
});

// 8. VNext strategy_version is commercial-opportunity-vnext/1
test('8. VNext strategy_version is commercial-opportunity-vnext/1', () => {
  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 15, sales: 5000, discountPercent: 25 }),
    createShopeeCandidate(102, { currentPrice: 25, sales: 300, discountPercent: 10 }),
    createShopeeCandidate(103, { currentPrice: 22, sales: 400, discountPercent: 12 }),
    createShopeeCandidate(104, { currentPrice: 28, sales: 200, discountPercent: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length > 0);
  assert.equal(products[0].direct_evidence[0].strategy_version, 'commercial-opportunity-vnext/1');
  assert.equal(products[0].direct_evidence[0].score_strategy_version, 'commercial-opportunity-vnext/1');
});

// 9. VNext preserves factual economicReturn from score.economicReturn
test('9. VNext preserves factual economicReturn from score.economicReturn into direct_evidence', () => {
  const shopeeCandidates = [
    createShopeeCandidate(501, { currentPrice: 20, sales: 5000, discountPercent: 25, commissionRate: 8, commissionSource: 'observed' }),
    createShopeeCandidate(502, { currentPrice: 25, sales: 300, discountPercent: 10, commissionRate: 7, commissionSource: 'observed' }),
    createShopeeCandidate(503, { currentPrice: 22, sales: 400, discountPercent: 12, commissionRate: 8, commissionSource: 'observed' }),
    createShopeeCandidate(504, { currentPrice: 28, sales: 200, discountPercent: 10, commissionRate: 8, commissionSource: 'observed' }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length > 0);
  const ev = products[0].direct_evidence[0];
  assert.ok(ev.economic_return);
  assert.equal(ev.economic_return.status, 'observed');
  assert.equal(ev.economic_return.effectiveCommissionPercent, 8);
  assert.equal(ev.economic_return.estimatedCommissionPerSale, 1.6);
  assert.equal(ev.effective_commission_percent, 8);
  assert.equal(ev.estimated_commission_per_sale, 1.6);
});

// 10. VNext preserves benchmark metrics
test('10. VNext preserves benchmark metrics (peerCount, peerConfidence, benchmarkStatus, peer prices)', () => {
  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 15, sales: 5000, discountPercent: 25 }),
    createShopeeCandidate(102, { currentPrice: 25, sales: 300, discountPercent: 10 }),
    createShopeeCandidate(103, { currentPrice: 22, sales: 400, discountPercent: 12 }),
    createShopeeCandidate(104, { currentPrice: 28, sales: 200, discountPercent: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length > 0);
  const bm = products[0].direct_evidence[0].benchmark;
  assert.ok(bm, 'benchmark object must exist');
  assert.equal(bm.peerCount, 3);
  assert.equal(bm.peerConfidence, 'MEDIUM');
  assert.equal(bm.benchmarkStatus, 'authoritative');
  assert.equal(bm.peerPriceMin, 22);
  assert.equal(bm.peerPriceMedian, 25);
  assert.equal(bm.peerPriceMax, 28);
  assert.equal(bm.priceCompetitive, true);
});

// 11. VNext does NOT select products with decision IGNORAR
test('11. VNext does NOT select products with decision IGNORAR', () => {
  const shopeeCandidates = [
    createShopeeCandidate(999, { productName: 'Produto Ruim Sem Vendas', currentPrice: 1500, sales: 0, ratingStar: 1.0, discountPercent: 0, commissionRate: 0 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.equal(products.length, 0);
});

// 12. VNext preserves OBSERVAR products with score >= 50
test('12. VNext preserves OBSERVAR products with score >= 50', () => {
  const shopeeCandidates = [
    createShopeeCandidate(201, { productName: 'Kit 3 Meias Soquete Cano Curto', category: 'Meias', currentPrice: 12.99, sales: 50, ratingStar: 4.5, discountPercent: 5, commissionRate: 5 }),
    createShopeeCandidate(202, { productName: 'Kit 6 Pares Meias Soquete', category: 'Meias', currentPrice: 14.99, sales: 40, ratingStar: 4.4, discountPercent: 5, commissionRate: 5 }),
    createShopeeCandidate(203, { productName: 'Kit 12 Meias Soquete Algodão', category: 'Meias', currentPrice: 16.99, sales: 45, ratingStar: 4.6, discountPercent: 5, commissionRate: 5 }),
    createShopeeCandidate(204, { productName: 'Kit 10 Pares Meias Soquete', category: 'Meias', currentPrice: 15.99, sales: 42, ratingStar: 4.5, discountPercent: 5, commissionRate: 5 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  const observars = products.filter(p => p.selection_decision === 'OBSERVAR');
  for (const p of observars) {
    assert.ok(p.commercial_score >= 50);
  }
});

// 13. VNext can return fewer than 20 products without artificial filler
test('13. VNext can return fewer than 20 products without artificial filler', () => {
  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 15, sales: 5000, discountPercent: 25 }),
    createShopeeCandidate(102, { currentPrice: 25, sales: 300, discountPercent: 10 }),
    createShopeeCandidate(103, { currentPrice: 22, sales: 400, discountPercent: 12 }),
    createShopeeCandidate(104, { currentPrice: 28, sales: 200, discountPercent: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length <= 4);
  assert.ok(products.length < 20);
});

// 14. VNext does not apply ticket quotas (pure merit-based selection)
test('14. VNext does not apply ticket quotas (pure merit-based selection)', () => {
  const shopeeCandidates = [
    createShopeeCandidate(301, { productName: '1000 Peças Bolsa Elástico De Cabelo Feminino Descartável Multicolorido', category: 'Acessórios', currentPrice: 4.99, sales: 10000, discountPercent: 20, commissionRate: 8 }),
    createShopeeCandidate(302, { productName: '1000 Peças Bolsa Elástico De Cabelo Feminino Descartável Colorido', category: 'Acessórios', currentPrice: 4.99, sales: 9000, discountPercent: 18, commissionRate: 8 }),
    createShopeeCandidate(303, { productName: '2000 Peças Bolsa Elástico De Cabelo Feminino Descartável Multicolorido', category: 'Acessórios', currentPrice: 5.99, sales: 8000, discountPercent: 15, commissionRate: 8 }),
    createShopeeCandidate(304, { productName: '1000 Peças Bolsa Elástico De Cabelo Feminino Multicores', category: 'Acessórios', currentPrice: 4.80, sales: 9500, discountPercent: 20, commissionRate: 8 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.length >= 1);
  for (const p of products) {
    assert.ok(p.direct_evidence[0].price < 100);
  }
});

// 15. VNext does not apply marketplace quotas
test('15. VNext does not apply marketplace quotas', () => {
  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 15, sales: 5000, discountPercent: 25 }),
    createShopeeCandidate(102, { currentPrice: 25, sales: 300, discountPercent: 10 }),
    createShopeeCandidate(103, { currentPrice: 22, sales: 400, discountPercent: 12 }),
    createShopeeCandidate(104, { currentPrice: 28, sales: 200, discountPercent: 10 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  assert.ok(products.every(p => p.marketplace === 'Shopee'));
});

// 16. Shopee without observed commission cannot be PRIORIDADE
test('16. Shopee without observed commission cannot be PRIORIDADE', () => {
  const shopeeCandidates = [
    createShopeeCandidate(401, { productName: 'Smartwatch Relógio Inteligente D20', category: 'Eletrônicos', currentPrice: 45, sales: 5000, discountPercent: 30, commissionSource: 'unknown', commissionRate: 0 }),
    createShopeeCandidate(402, { productName: 'Smartwatch D20 Relógio Inteligente', category: 'Eletrônicos', currentPrice: 46, sales: 4000, discountPercent: 28, commissionSource: 'unknown', commissionRate: 0 }),
    createShopeeCandidate(403, { productName: 'Smartwatch D20 Pro Inteligente', category: 'Eletrônicos', currentPrice: 44, sales: 3000, discountPercent: 25, commissionSource: 'unknown', commissionRate: 0 }),
    createShopeeCandidate(404, { productName: 'Smartwatch D20 Plus Inteligente', category: 'Eletrônicos', currentPrice: 48, sales: 2000, discountPercent: 20, commissionSource: 'unknown', commissionRate: 0 }),
  ];

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates,
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
  });

  for (const p of products) {
    if (p.marketplace === 'Shopee') {
      assert.notEqual(p.selection_decision, 'PRIORIDADE', 'Shopee candidate with unknown commission must not be PRIORIDADE');
    }
  }
});

// 17. Fail closed: failure in VNext official path throws and does NOT fallback silently to V4
test('17. Fail closed: failure in VNext official path throws and does NOT fallback silently to V4', () => {
  assert.throws(() => {
    runnerFinal.buildTrendRadarProductsFromCandidates({
      shopeeCandidates: null,
      mlCandidates: null,
      maxProducts: 20,
      env: { TRENDS_RADAR_VNEXT_OFFICIAL: '1' },
      __forceVNextFailure: true,
    });
  });
});

// 18. Official OFF + Shadow ON: Shadow comparison runs and exposes diagnostics
test('18. Official OFF + Shadow ON: Shadow comparison runs and exposes diagnostics', async () => {
  const mockEnv = {
    TRENDS_RADAR_VNEXT_OFFICIAL: '0',
    TRENDS_RADAR_VNEXT_SHADOW: '1',
  };

  const shopeeCandidates = [
    createShopeeCandidate(101, { currentPrice: 120, sales: 5000, discountPercent: 35, commissionRate: 10 }),
    createShopeeCandidate(102, { currentPrice: 150, sales: 4000, discountPercent: 30, commissionRate: 10 }),
    createShopeeCandidate(103, { currentPrice: 130, sales: 4500, discountPercent: 32, commissionRate: 10 }),
    createShopeeCandidate(104, { currentPrice: 140, sales: 3500, discountPercent: 28, commissionRate: 10 }),
  ];

  const res = await runnerFinal.processPendingTrendRadarRuns({
    dryRun: true,
    env: mockEnv,
    runnerProcessPendingTrendRadarRuns: async () => {
      runnerFinal.buildTrendRadarProductsFromCandidates({
        shopeeCandidates,
        mlCandidates: [],
        maxProducts: 20,
        env: mockEnv,
      });
      return {
        processed: true,
        runId: 'run-123',
        sourceHealth: { shopee: 'healthy' },
      };
    },
  });

  assert.ok(res.sourceHealth.vnext_shadow);
  assert.equal(res.sourceHealth.vnext_shadow.version, 'radar-vnext-shadow/v1');
  assert.equal(res.sourceHealth.vnext_shadow.mode, 'shadow');
});

// 19. Official ON + Shadow ON: Shadow is skipped with reason vnext_official_active
test('19. Official ON + Shadow ON: Shadow comparison is skipped with reason vnext_official_active', async () => {
  const mockEnv = {
    TRENDS_RADAR_VNEXT_OFFICIAL: '1',
    TRENDS_RADAR_VNEXT_SHADOW: '1',
  };

  const res = await runnerFinal.processPendingTrendRadarRuns({
    dryRun: true,
    env: mockEnv,
    runnerProcessPendingTrendRadarRuns: async () => ({
      processed: true,
      runId: 'run-456',
      sourceHealth: { shopee: 'healthy' },
    }),
  });

  assert.ok(res.sourceHealth.vnext_shadow);
  assert.equal(res.sourceHealth.vnext_shadow.skipped, true);
  assert.equal(res.sourceHealth.vnext_shadow.reason, 'vnext_official_active');
});

// 20. Deterministic V4 Regression Test: Exact comparison against official V4 schema
test('20. Deterministic V4 Regression Test: Verifies exact snapshot properties of V4', () => {
  const candidate = createShopeeCandidate(101, {
    productName: 'Fone Bluetooth TWS Sem Fio Oficial Teste',
    category: 'Audio',
    currentPrice: 120,
    sales: 5000,
    discountPercent: 35,
    commissionRate: 10,
    commissionSource: 'observed',
    evidenceStatus: 'verified',
  });

  const products = runnerFinal.buildTrendRadarProductsFromCandidates({
    shopeeCandidates: [candidate],
    mlCandidates: [],
    maxProducts: 20,
    env: { TRENDS_RADAR_VNEXT_OFFICIAL: '0' },
  });

  assert.equal(products.length, 1);
  const p = products[0];

  // Critical top-level fields
  assert.equal(p.product_term, 'Fone Bluetooth TWS Sem Fio Oficial Teste');
  assert.equal(p.normalized_product_term, 'fone bluetooth tws sem fio oficial teste');
  assert.equal(p.category, 'Audio');
  assert.equal(p.marketplace, 'Shopee');
  assert.equal(p.evidence_status, 'verified');
  assert.equal(p.source_count, 1);
  assert.ok(p.commercial_score > 0);
  assert.equal(p.selection_decision, 'TESTAR');
  assert.equal(p.affiliate_potential, 'high');
  assert.equal(p.is_focus, true);

  // Critical inferred signals
  assert.ok(p.inferred_signals.includes('v4_decision_testar'));
  assert.ok(p.inferred_signals.some(s => s.startsWith('ticket_')));
  assert.ok(p.inferred_signals.some(s => s.startsWith('viability_')));

  // Critical direct evidence fields
  const ev = p.direct_evidence[0];
  assert.equal(ev.strategy_version, 'commercial-opportunity-v4');
  assert.equal(ev.score_strategy_version, 'commercial-opportunity-v4');
  assert.equal(ev.viability_version, 'commercial-viability/v2');
  assert.equal(ev.decision, 'TESTAR');
  assert.equal(ev.sold_quantity, 5000);
  assert.equal(ev.price, 120);
  assert.equal(ev.discount_percent, 35);
  assert.equal(ev.rating, 4.8);
  assert.equal(ev.marketplace_identity.itemId, '101');
  assert.equal(ev.marketplace_identity.shopId, '111');
});
