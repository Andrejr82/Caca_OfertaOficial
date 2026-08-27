'use strict';

// Instala a política de recência antes do runner legado ser carregado,
// pois oracle-trends-radar-runner.cjs captura essa função por destructuring.
const freshness = require('./oracle-trends-radar-freshness.cjs');
const engine = require('./oracle-trends-radar-engine.cjs');
const marketplaceContracts = require('./commercial-niche-contracts.cjs');
const amazonModule = require('./amazon-native-top20-v5.cjs');
const { createObservationAwareRecencyFilter, installSevenNicheRuntime } = require('./oracle-trends-radar-seven-niches-runtime.cjs');

freshness.filterCandidatesWithRecency = createObservationAwareRecencyFilter(freshness.getCandidateIdentityKeys);

// runner-final aplica correções de comissão Shopee e então carrega o runner base.
const runner = require('./oracle-trends-radar-runner-final.cjs');

// Reinstala os adapters depois do runner-final para que o coletor Shopee seguro
// seja mantido como base, mas limitado aos 7 nichos. O runner base consulta as
// funções do engine em runtime, então não é necessário duplicar sua orquestração.
installSevenNicheRuntime({
  freshness,
  engine,
  marketplaceContracts,
  amazonModule,
  fetchImpl: global.fetch,
});

module.exports = runner;
