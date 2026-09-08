'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const goldenCases = require('../fixtures/multimarketplace-selection-golden.json');
const { validateProductTitle, isAccessoryOnlyProductTitle } = require('../product-title-quality.cjs');
const { createDiscoveryFunnel, buildDiscoveryLossMatrix } = require('../discovery-funnel-contract.cjs');

test('Multimarketplace Golden Set — Integridade da Base', (t) => {
  assert.equal(goldenCases.length, 60, 'Deve conter exatamente 60 casos cadastrados.');
  
  const amazon = goldenCases.filter((c) => c.marketplace === 'Amazon');
  const ml = goldenCases.filter((c) => c.marketplace === 'Mercado Livre');
  const shopee = goldenCases.filter((c) => c.marketplace === 'Shopee');

  assert.equal(amazon.length, 20, 'Deve conter 20 casos da Amazon.');
  assert.equal(ml.length, 20, 'Deve conter 20 casos do Mercado Livre.');
  assert.equal(shopee.length, 20, 'Deve conter 20 casos da Shopee.');

  const mustAccept = goldenCases.filter((c) => c.expectedDecision === 'MUST_ACCEPT');
  const mustReject = goldenCases.filter((c) => c.expectedDecision === 'MUST_REJECT');

  assert.equal(mustAccept.length, 30, 'Deve conter 30 casos de MUST_ACCEPT (10 por marketplace).');
  assert.equal(mustReject.length, 30, 'Deve conter 30 casos de MUST_REJECT (10 por marketplace).');
});

test('Multimarketplace Golden Set — Validação de Rejeições Obrigatórias (MUST_REJECT)', (t) => {
  const mustRejectCases = goldenCases.filter((c) => c.expectedDecision === 'MUST_REJECT');

  for (const candidate of mustRejectCases) {
    const isAccessory = isAccessoryOnlyProductTitle(candidate.title);
    const quality = validateProductTitle(candidate.title);

    assert.equal(
      quality.valid,
      false,
      `[${candidate.marketplace}] Candidato MUST_REJECT "${candidate.title}" deveria ser inválido, mas passou pelo filtro.`
    );
    assert.equal(
      quality.reason,
      'ACCESSORY_ONLY_PRODUCT',
      `[${candidate.marketplace}] Candidato "${candidate.title}" deve conter a razão ACCESSORY_ONLY_PRODUCT.`
    );
  }
});

test('Multimarketplace Golden Set — Validação de Aceites Obrigatórios (MUST_ACCEPT)', (t) => {
  const mustAcceptCases = goldenCases.filter((c) => c.expectedDecision === 'MUST_ACCEPT');

  for (const candidate of mustAcceptCases) {
    const quality = validateProductTitle(candidate.title);

    assert.equal(
      quality.valid,
      true,
      `[${candidate.marketplace}] Candidato MUST_ACCEPT "${candidate.title}" foi rejeitado incorretamente por: ${quality.reason}`
    );
    assert.equal(quality.reason, null, `Candidato MUST_ACCEPT "${candidate.title}" não deve possuir motivo de rejeição.`);
  }
});

test('Multimarketplace Golden Set — Contabilidade do Funil e Rastreabilidade 100%', (t) => {
  const funnel = createDiscoveryFunnel({
    marketplace: 'Multimarketplace-Golden',
    scenario: 'golden-set-accounting-test',
    correlationId: 'test-golden-001',
    startedAt: new Date().toISOString(),
  });

  const total = goldenCases.length;
  funnel.count('extracted', total);
  funnel.count('afterParse', total);
  funnel.count('afterRelevance', total);
  funnel.count('afterIdentityDedup', total);

  let passedQuality = 0;
  let rejectedQuality = 0;

  for (const candidate of goldenCases) {
    const quality = validateProductTitle(candidate.title);
    if (!quality.valid) {
      rejectedQuality += 1;
      funnel.reject(quality.reason || 'INVALID_PRODUCT_TITLE', 1);
    } else {
      passedQuality += 1;
    }
  }

  funnel.count('afterQualityGate', passedQuality);
  funnel.count('afterNovelty', passedQuality);
  funnel.count('afterClassification', passedQuality);
  funnel.count('queueSelected', passedQuality);
  funnel.count('rpcSent', passedQuality);
  funnel.count('inserted', passedQuality);

  const snapshot = funnel.snapshot();
  assert.equal(snapshot.counters.extracted, 60);
  assert.equal(snapshot.counters.afterQualityGate, 30);
  assert.equal(snapshot.rejectionReasons.ACCESSORY_ONLY_PRODUCT, 30);

  const matrix = buildDiscoveryLossMatrix({
    counters: snapshot.counters,
    rejectionReasons: snapshot.rejectionReasons,
  });

  assert.equal(matrix.unaccounted, 0, 'Nenhum candidato pode sumir sem contabilidade explicada (unaccounted deve ser 0).');
});
