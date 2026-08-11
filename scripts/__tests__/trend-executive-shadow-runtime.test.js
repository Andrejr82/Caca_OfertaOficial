'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRadarShadowState,
  resolveShopeeScenarioForIntent,
  runTrendExecutiveShadow,
} = require('../trend-executive-shadow-runtime.cjs');

const scenarios = {
  gamer_tecnologia: {
    id: 'gamer_tecnologia',
    name: 'Gamer e Tecnologia',
    keywords: ['fone bluetooth sem fio', 'mouse gamer rgb'],
  },
  beleza_autocuidado: {
    id: 'beleza_autocuidado',
    name: 'Beleza e Autocuidado',
    keywords: ['escova secadora', 'secador de cabelo profissional'],
  },
};

function snapshot() {
  return {
    run: { id: 'run-1', status: 'completed' },
    products: [
      { id: 'p1', priority: 1, product_term: 'Fone Bluetooth M90 Pro 5.3 TWS', category: 'Tecnologia', marketplace: 'Shopee', marketplace_key: 'shopee', evidence_status: 'verified' },
      { id: 'p2', priority: 2, product_term: 'Escova Secadora Britânia 4 em 1', category: 'Beleza', marketplace: 'Shopee', marketplace_key: 'shopee', evidence_status: 'partial' },
      { id: 'p3', priority: 3, product_term: 'Produto sem cenário', category: 'Outro', marketplace: 'Shopee', marketplace_key: 'shopee', evidence_status: 'verified' },
    ],
  };
}

test('maps Radar product intent to an existing Shopee scenario deterministically', () => {
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'Fone Bluetooth M90 Pro', category: 'Tecnologia' }, scenarios), 'gamer_tecnologia');
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'Escova Secadora 4 em 1', category: 'Beleza' }, scenarios), 'beleza_autocuidado');
  assert.equal(resolveShopeeScenarioForIntent({ productTerm: 'Produto sem cenário', category: 'Outro' }, scenarios), null);
});

test('builds at most five executable Shopee shadow contracts from a completed Radar run', () => {
  const state = buildRadarShadowState(snapshot(), { scenarios, maxIntents: 5 });
  assert.equal(state.status, 'completed');
  assert.equal(state.radarRunId, 'run-1');
  assert.equal(state.contracts.length, 2);
  assert.equal(state.contracts[0].authority, 'shadow_only');
  assert.equal(state.contracts[0].scenarioId, 'gamer_tecnologia');
  assert.equal(state.rejected.length, 1);
  assert.equal(state.rejected[0].reason, 'scenario_unmapped');
});

test('allows marketplace-neutral and Mercado Livre evidence in the Shopee shadow runner', () => {
  const neutralSnapshot = {
    run: { id: 'run-neutral', status: 'completed' },
    products: [
      { id: 'n1', priority: 1, product_term: 'Fone Bluetooth M90 Pro 5.3 TWS', category: 'Tecnologia', marketplace: null, marketplace_key: '', evidence_status: 'partial' },
      { id: 'n2', priority: 2, product_term: 'Escova Secadora Britânia 4 em 1', category: 'Beleza', marketplace: null, marketplace_key: '', evidence_status: 'partial' },
      { id: 'ml1', priority: 3, product_term: 'Fone Bluetooth M90 Pro 5.3 TWS', category: 'Tecnologia', marketplace: 'Mercado Livre', marketplace_key: 'mercadolivre', evidence_status: 'verified' },
    ],
  };

  const state = buildRadarShadowState(neutralSnapshot, { scenarios, maxIntents: 5 });
  assert.deepEqual(state.contracts.map((contract) => contract.radarProductId), ['n1', 'n2', 'ml1']);
  assert.ok(state.contracts.every((contract) => contract.marketplace === 'Shopee'));
  assert.deepEqual(
    state.contracts.map((contract) => contract.marketplaceSource),
    ['shadow_runner_default', 'shadow_runner_default', 'radar_cross_marketplace'],
  );
  assert.equal(state.rejected.length, 0);
});

test('off mode never executes Oracle shadow discovery', async () => {
  let calls = 0;
  const report = await runTrendExecutiveShadow({
    env: { TREND_EXECUTIVE_MODE: 'off' },
    snapshot: snapshot(),
    scenarios,
    runShopeeShadow: async () => { calls += 1; return {}; },
  });
  assert.equal(calls, 0);
  assert.equal(report.effectiveMode, 'off');
  assert.equal(report.authority, 'legacy_scenario');
  assert.equal(report.executedIntents, 0);
});

test('shadow executes mapped scenarios without persistence or publication authority', async () => {
  const calls = [];
  const report = await runTrendExecutiveShadow({
    env: { TREND_EXECUTIVE_MODE: 'shadow', SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'true', NO_PUBLISH: '0' },
    snapshot: snapshot(),
    scenarios,
    runShopeeShadow: async ({ scenarioId, env }) => {
      calls.push({ scenarioId, env });
      return {
        persistCalls: 0,
        writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
        marketplaces: [{ marketplace: 'Shopee', discovered: 12, persisted: 0, queueSelected: 0 }],
      };
    },
  });

  assert.deepEqual(calls.map((entry) => entry.scenarioId), ['gamer_tecnologia', 'beleza_autocuidado']);
  assert.ok(calls.every((entry) => entry.env.SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED === 'false'));
  assert.ok(calls.every((entry) => entry.env.NO_PUBLISH === '1'));
  assert.equal(report.effectiveMode, 'shadow');
  assert.equal(report.authority, 'legacy_scenario');
  assert.equal(report.executedIntents, 2);
  assert.equal(report.persistence, 'none');
  assert.equal(report.automaticPublication, false);
});

test('shadow fails closed if the Oracle diagnostic reports any write', async () => {
  await assert.rejects(() => runTrendExecutiveShadow({
    env: { TREND_EXECUTIVE_MODE: 'shadow' },
    snapshot: snapshot(),
    scenarios,
    runShopeeShadow: async () => ({
      persistCalls: 1,
      writeAudit: { supabaseWrites: 1, offersWrites: 1, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
      marketplaces: [],
    }),
  }), /shadow.*write/i);
});
