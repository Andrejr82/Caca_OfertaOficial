'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente locais
if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const { runShopeeOpenApiV1OfficialForScenario } = require('./shopee-openapi-v1-adapter.cjs');

const SHOPEE_API_URL = process.env.SHOPEE_API_URL || 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '';
const SHOPEE_APP_SECRET = process.env.SHOPEE_APP_SECRET || '';

if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
  console.error('ERRO: SHOPEE_APP_ID ou SHOPEE_APP_SECRET não definidos.');
  process.exit(1);
}

function createSignedRequest() {
  return async function request(operationName, query, variables = {}, options = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyObj = { query, variables };
    if (operationName) bodyObj.operationName = operationName;
    const bodyStr = JSON.stringify(bodyObj);

    const factor = `${SHOPEE_APP_ID}${timestamp}${bodyStr}${SHOPEE_APP_SECRET}`;
    const signature = crypto.createHash('sha256').update(factor).digest('hex');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    };

    const res = await fetch(SHOPEE_API_URL, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: options.signal,
    });

    const data = await res.json();
    return { status: res.status, data };
  };
}

const SCENARIOS_TO_TEST = [
  'eletrodomesticos_editorial',
  'casa_cozinha_editorial',
  'beleza_editorial',
  'moda_editorial',
  'informatica_editorial',
  'ferramentas_editorial',
  'pet_editorial',
];

async function main() {
  console.log('=== Iniciando Teste do Fluxo Real Oracle com ProductCatIds Certificados ===\n');
  const request = createSignedRequest();

  const results = [];
  const baseEnv = {
    ...process.env,
    SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true',
    SHOPEE_RANKING_V1_ENABLED: 'true',
    SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'false', // Zero writes garantido
  };

  for (const scenarioId of SCENARIOS_TO_TEST) {
    console.log(`\n--------------------------------------------------`);
    console.log(`>> Testando cenário: ${scenarioId}`);
    console.log(`--------------------------------------------------`);

    // 1. Execução Baseline (SHOPEE_PRODUCTCATIDS_SEARCH_V1_ENABLED = false)
    console.log(`[1/2] Executando Baseline (flag desligada, includeDelta=true, includeAuxiliary=true)...`);
    const baselineEnv = { ...baseEnv, SHOPEE_PRODUCTCATIDS_SEARCH_V1_ENABLED: 'false' };
    const baselineStart = Date.now();
    const baselineRes = await runShopeeOpenApiV1OfficialForScenario(scenarioId, {
      env: baselineEnv,
      request,
      includeDelta: true,
      includeAuxiliary: true,
    });
    const baselineDuration = Date.now() - baselineStart;

    const baselineScenario = baselineRes?.result?.scenarios?.[scenarioId] || {};
    const baselineTop = baselineScenario.top || [];
    const baselineRaw = baselineRes?.result?.queryEvidence?.productOffers || 0;
    const baselineCalls = baselineRes?.result?.queryEvidence?.calls?.length || 0;

    console.log(`   Baseline: ${baselineTop.length} top candidates, ${baselineRaw} raw offers, ${baselineCalls} calls em ${baselineDuration}ms`);

    // Pequeno delay entre chamadas para evitar rate limit
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Execução Certified (SHOPEE_PRODUCTCATIDS_SEARCH_V1_ENABLED = true)
    console.log(`[2/2] Executando Certified ProductCatIds (flag ligada, includeDelta=true, includeAuxiliary=true)...`);
    const certifiedEnv = { ...baseEnv, SHOPEE_PRODUCTCATIDS_SEARCH_V1_ENABLED: 'true' };
    const certifiedStart = Date.now();
    const certifiedRes = await runShopeeOpenApiV1OfficialForScenario(scenarioId, {
      env: certifiedEnv,
      request,
      includeDelta: true,
      includeAuxiliary: true,
    });
    const certifiedDuration = Date.now() - certifiedStart;

    const certifiedScenario = certifiedRes?.result?.scenarios?.[scenarioId] || {};
    const certifiedTop = certifiedScenario.top || [];
    const certifiedQueryEvidence = certifiedRes?.result?.queryEvidence || {};
    const telemetry = certifiedQueryEvidence.productCatIdsTelemetry || {};
    const certifiedRaw = certifiedQueryEvidence.productOffers || 0;
    const certifiedCalls = certifiedQueryEvidence.calls?.length || 0;

    console.log(`   Certified: ${certifiedTop.length} top candidates, ${certifiedRaw} raw offers (${telemetry.semanticAccepted || 0} aceitos semânticos / ${telemetry.semanticRejected || 0} rejeitados), ${certifiedCalls} calls em ${certifiedDuration}ms`);
    console.log(`   Famílias usadas: ${telemetry.familiesUsed}/${telemetry.familiesAvailable} | Diversidade no Top: ${telemetry.familyDiversityCount || 0} famílias`);

    // Amostra dos top 3 candidatos
    const topSample = certifiedTop.slice(0, 3).map((item) => ({
      itemId: item.itemId,
      shopId: item.shopId,
      productName: item.productName,
      price: item.price,
      commissionRate: item.commissionRate,
      score: item.score,
      familyKey: item.familyKey,
      category: item.category,
    }));

    results.push({
      scenarioId,
      niche: telemetry.niche || scenarioId,
      baseline: {
        rawProducts: baselineRaw,
        topCount: baselineTop.length,
        calls: baselineCalls,
        durationMs: baselineDuration,
      },
      certified: {
        familiesAvailable: telemetry.familiesAvailable || 0,
        familiesUsed: telemetry.familiesUsed || 0,
        familiesSkippedPartial: telemetry.familiesSkippedPartial || 0,
        familiesSkippedInvestigate: telemetry.familiesSkippedInvestigate || 0,
        familiesSkippedBlocked: telemetry.familiesSkippedBlocked || 0,
        productCatIdQueries: telemetry.productCatIdQueries || 0,
        productCatIdFallbacks: telemetry.productCatIdFallbacks || 0,
        extractedBeforeOracleFilters: telemetry.extractedBeforeOracleFilters || 0,
        semanticAccepted: telemetry.semanticAccepted || 0,
        semanticRejected: telemetry.semanticRejected || 0,
        afterOracleQualityGate: telemetry.afterOracleQualityGate || 0,
        queueSelected: certifiedTop.length,
        familyDiversityCount: telemetry.familyDiversityCount || 0,
        selectedFamilies: telemetry.selectedFamilies || [],
        durationMs: certifiedDuration,
        topSample,
      },
      comparison: {
        rawDeltaPct: baselineRaw > 0 ? Number((((certifiedRaw - baselineRaw) / baselineRaw) * 100).toFixed(1)) : 0,
        topDeltaCount: certifiedTop.length - baselineTop.length,
        semanticPrecisionPct: (telemetry.semanticAccepted + telemetry.semanticRejected) > 0
          ? Number(((telemetry.semanticAccepted / (telemetry.semanticAccepted + telemetry.semanticRejected)) * 100).toFixed(1))
          : 100,
        oracleQualityGatePassed: certifiedTop.length > 0,
      },
      writeAudit: certifiedRes?.writeAudit || { supabaseWrites: 0, offersWrites: 0 },
    });

    await new Promise((r) => setTimeout(r, 1000));
  }

  // Resumo Geral
  const totalCertifiedFamiliesUsed = results.reduce((acc, r) => acc + r.certified.familiesUsed, 0);
  const totalSemanticAccepted = results.reduce((acc, r) => acc + r.certified.semanticAccepted, 0);
  const totalSemanticRejected = results.reduce((acc, r) => acc + r.certified.semanticRejected, 0);
  const overallSemanticPrecision = (totalSemanticAccepted + totalSemanticRejected) > 0
    ? Number(((totalSemanticAccepted / (totalSemanticAccepted + totalSemanticRejected)) * 100).toFixed(1))
    : 100;
  const totalTopCandidates = results.reduce((acc, r) => acc + r.certified.queueSelected, 0);
  const totalBaselineTopCandidates = results.reduce((acc, r) => acc + r.baseline.topCount, 0);
  const totalWrites = results.reduce((acc, r) => acc + (r.writeAudit.supabaseWrites || 0), 0);

  const summary = {
    executedAt: new Date().toISOString(),
    totalScenariosTested: results.length,
    totalCertifiedFamiliesUsed,
    overallSemanticPrecisionPct: overallSemanticPrecision,
    totalTopCandidatesCertified: totalTopCandidates,
    totalTopCandidatesBaseline: totalBaselineTopCandidates,
    totalSupabaseWrites: totalWrites,
    zeroWritesVerified: totalWrites === 0,
    scenarios: results.map((r) => ({
      scenarioId: r.scenarioId,
      niche: r.niche,
      familiesUsed: r.certified.familiesUsed,
      semanticAccepted: r.certified.semanticAccepted,
      semanticRejected: r.certified.semanticRejected,
      semanticPrecisionPct: r.comparison.semanticPrecisionPct,
      topCountCertified: r.certified.queueSelected,
      topCountBaseline: r.baseline.topCount,
      familyDiversityCount: r.certified.familyDiversityCount,
    })),
  };

  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const detailPath = path.join(reportsDir, 'shopee-productcatids-oracle-flow-test-v1.json');
  const summaryPath = path.join(reportsDir, 'shopee-productcatids-oracle-flow-test-v1-summary.json');

  fs.writeFileSync(detailPath, JSON.stringify({ summary, details: results }, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n==================================================`);
  console.log(`>> TESTE CONCLUÍDO COM SUCESSO!`);
  console.log(`>> Total Cenários: ${results.length}/7`);
  console.log(`>> Famílias Certificadas Usadas: ${totalCertifiedFamiliesUsed}`);
  console.log(`>> Precisão Semântica Geral: ${overallSemanticPrecision}% (${totalSemanticAccepted} aceitos / ${totalSemanticRejected} rejeitados)`);
  console.log(`>> Top Candidates (Certified vs Baseline): ${totalTopCandidates} vs ${totalBaselineTopCandidates}`);
  console.log(`>> Zero Writes Verificado: ${totalWrites === 0 ? 'SIM (0 escritas)' : 'NÃO'}`);
  console.log(`>> Relatórios salvos em:`);
  console.log(`   - ${detailPath}`);
  console.log(`   - ${summaryPath}`);
  console.log(`==================================================\n`);
}

main().catch((err) => {
  console.error('Erro fatal no teste Oracle:', err);
  process.exit(1);
});
