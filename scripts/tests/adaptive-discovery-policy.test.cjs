'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  ADAPTIVE_DISCOVERY_POLICY_VERSION,
  assessAdaptiveDiscovery,
} = require('../adaptive-discovery-policy.cjs');

test('Amazon expande por carteira fraca e pouca diversidade mesmo com amostra bruta suficiente', () => {
  const decision = assessAdaptiveDiscovery({
    marketplace: 'Amazon',
    extracted: 245,
    afterQualityGate: 67,
    portfolioSelected: 5,
    distinctEditorialTypes: 3,
    expansionRound: 0,
    basePagesPerTerm: 1,
    baseCandidateLimit: 7,
  });

  assert.equal(decision.contractVersion, ADAPTIVE_DISCOVERY_POLICY_VERSION);
  assert.equal(decision.shouldExpand, true);
  assert.equal(decision.reasons.includes('catalog_sample_too_small'), false);
  assert.equal(decision.reasons.includes('portfolio_below_target'), true);
  assert.equal(decision.reasons.includes('portfolio_diversity_too_low'), true);
  assert.equal(decision.next.maxPagesPerTerm, 2);
  assert.equal(decision.next.candidateLimit, 11);
});

test('Mercado Livre expande quando a amostra do catálogo é pequena', () => {
  const decision = assessAdaptiveDiscovery({
    marketplace: 'Mercado Livre',
    extracted: 42,
    afterQualityGate: 37,
    portfolioSelected: 1,
    distinctEditorialTypes: 1,
    expansionRound: 0,
    basePagesPerTerm: 1,
    baseCandidateLimit: 10,
  });

  assert.equal(decision.shouldExpand, true);
  assert.ok(decision.reasons.includes('catalog_sample_too_small'));
  assert.ok(decision.reasons.includes('portfolio_below_target'));
  assert.ok(decision.reasons.includes('portfolio_diversity_too_low'));
  assert.equal(decision.next.maxPagesPerTerm, 2);
  assert.equal(decision.next.candidateLimit, 15);
});

test('Shopee expande quando a amostra e o pool qualificado são insuficientes', () => {
  const decision = assessAdaptiveDiscovery({
    marketplace: 'Shopee',
    extracted: 60,
    afterQualityGate: 7,
    portfolioSelected: 4,
    distinctEditorialTypes: 3,
    expansionRound: 0,
    basePagesPerTerm: 1,
    baseCandidateLimit: 7,
  });

  assert.equal(decision.shouldExpand, true);
  assert.ok(decision.reasons.includes('catalog_sample_too_small'));
  assert.ok(decision.reasons.includes('qualified_pool_too_small'));
  assert.ok(decision.reasons.includes('portfolio_below_target'));
  assert.ok(decision.reasons.includes('portfolio_diversity_too_low'));
});

test('não expande quando carteira e cobertura já são saudáveis', () => {
  const decision = assessAdaptiveDiscovery({
    marketplace: 'Amazon',
    extracted: 260,
    afterQualityGate: 35,
    portfolioSelected: 7,
    distinctEditorialTypes: 5,
    expansionRound: 0,
    basePagesPerTerm: 2,
    baseCandidateLimit: 10,
  });

  assert.equal(decision.shouldExpand, false);
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.next.maxPagesPerTerm, 2);
  assert.equal(decision.next.candidateLimit, 10);
});

test('não ultrapassa o número máximo de rodadas adaptativas', () => {
  const decision = assessAdaptiveDiscovery({
    marketplace: 'Mercado Livre',
    extracted: 20,
    afterQualityGate: 2,
    portfolioSelected: 1,
    distinctEditorialTypes: 1,
    expansionRound: 2,
    basePagesPerTerm: 3,
    baseCandidateLimit: 20,
  });

  assert.equal(decision.canExpand, false);
  assert.equal(decision.shouldExpand, false);
  assert.ok(decision.reasons.length > 0);
  assert.equal(decision.next.expansionRound, 2);
  assert.equal(decision.next.maxPagesPerTerm, 3);
  assert.equal(decision.next.candidateLimit, 20);
});
