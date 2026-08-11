'use strict';

const { createClient } = require('@supabase/supabase-js');
const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
const { buildTrendExecutiveDiscoveryPlan } = require('./trend-executive-mode.cjs');
const { runOracleScraperShopeeShadowLocal } = require('./oracle-scraper.cjs');
require('dotenv').config({ path: '.env.local' });

const DEFAULT_MAX_INTENTS = 5;
const ELIGIBLE_EVIDENCE = new Set(['verified', 'partial']);
const TOKEN_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'por',
  'com', 'sem', 'um', 'uma', 'kit', 'produto', 'oferta', 'novo', 'nova',
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !TOKEN_STOPWORDS.has(token));
}

function scenarioSearchText(scenario) {
  return [
    scenario?.id,
    scenario?.scenarioId,
    scenario?.name,
    ...(Array.isArray(scenario?.keywords) ? scenario.keywords : []),
    ...(Array.isArray(scenario?.allowedProductTerms) ? scenario.allowedProductTerms : []),
  ].filter(Boolean).join(' ');
}

function resolveShopeeScenarioForIntent(intent, scenarios = SHOPEE_SCENARIOS) {
  const intentText = `${intent?.productTerm || ''} ${intent?.category || ''}`;
  const intentTokens = [...new Set(tokenize(intentText))];
  if (intentTokens.length === 0) return null;

  const ranked = Object.entries(scenarios || {}).map(([key, scenario]) => {
    const haystack = normalizeText(scenarioSearchText(scenario));
    const matchedTokens = intentTokens.filter((token) => haystack.includes(token));
    const normalizedTerm = normalizeText(intent?.productTerm);
    const phraseBonus = normalizedTerm && haystack.includes(normalizedTerm) ? 3 : 0;
    return {
      id: String(scenario?.id || scenario?.scenarioId || key),
      score: matchedTokens.length + phraseBonus,
    };
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return ranked[0]?.id || null;
}

function isShopeeProduct(product) {
  const key = normalizeText(product?.marketplace_key || product?.marketplace);
  return key === 'shopee';
}

function buildRadarShadowState(snapshot, { scenarios = SHOPEE_SCENARIOS, maxIntents = DEFAULT_MAX_INTENTS } = {}) {
  const run = snapshot?.run || null;
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];
  const completed = String(run?.status || '').toLowerCase() === 'completed';
  if (!completed) {
    return { status: 'failed', radarRunId: run?.id || null, contracts: [], rejected: [] };
  }

  const contracts = [];
  const rejected = [];
  const ordered = [...products].sort((a, b) => Number(a?.priority || 999) - Number(b?.priority || 999));

  for (const product of ordered) {
    if (!isShopeeProduct(product)) continue;
    if (!ELIGIBLE_EVIDENCE.has(String(product?.evidence_status || '').toLowerCase())) {
      rejected.push({ radarProductId: product?.id || null, reason: 'evidence_ineligible' });
      continue;
    }
    const productTerm = String(product?.product_term || '').trim();
    if (!productTerm) {
      rejected.push({ radarProductId: product?.id || null, reason: 'missing_product_term' });
      continue;
    }
    const scenarioId = resolveShopeeScenarioForIntent({ productTerm, category: product?.category }, scenarios);
    if (!scenarioId) {
      rejected.push({ radarProductId: product?.id || null, reason: 'scenario_unmapped', productTerm });
      continue;
    }
    if (contracts.length >= Math.max(1, Math.min(Number(maxIntents) || DEFAULT_MAX_INTENTS, DEFAULT_MAX_INTENTS))) break;
    contracts.push({
      radarRunId: run.id,
      radarProductId: product.id,
      marketplace: 'Shopee',
      searchTerms: [productTerm],
      category: product?.category || null,
      priority: Number(product?.priority || contracts.length + 1),
      scenarioId,
      authority: 'shadow_only',
    });
  }

  return { status: 'completed', radarRunId: run.id, contracts, rejected };
}

function assertShadowReadOnly(result) {
  const audit = result?.writeAudit || {};
  const writeCount = [
    result?.persistCalls,
    audit.supabaseWrites,
    audit.offersWrites,
    audit.postsWrites,
    audit.affiliateLinkWrites,
    audit.publishCalls,
  ].reduce((sum, value) => sum + Number(value || 0), 0);
  if (writeCount > 0) {
    throw new Error(`Trend Executive shadow write detected (${writeCount}); execução bloqueada.`);
  }
}

async function runTrendExecutiveShadow({
  env = process.env,
  snapshot,
  scenarios = SHOPEE_SCENARIOS,
  runShopeeShadow = runOracleScraperShopeeShadowLocal,
  maxIntents = DEFAULT_MAX_INTENTS,
} = {}) {
  const radar = buildRadarShadowState(snapshot, { scenarios, maxIntents });
  const plan = buildTrendExecutiveDiscoveryPlan({ env, radar, legacyScenario: 'current_oracle_scenario' });
  const baseReport = {
    contract: 'trend-executive.oracle-shadow-runtime/v1',
    requestedMode: plan.requestedMode,
    effectiveMode: plan.effectiveMode,
    authority: 'legacy_scenario',
    radarRunId: plan.radarRunId || radar.radarRunId,
    rejectedRadarProducts: radar.rejected,
    persistence: 'none',
    automaticPublication: false,
    executedIntents: 0,
    results: [],
  };

  if (plan.effectiveMode !== 'shadow') return baseReport;

  const safeEnv = {
    ...env,
    TREND_EXECUTIVE_MODE: 'shadow',
    SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED: 'false',
    NO_PUBLISH: '1',
  };
  const seenScenarios = new Set();
  const results = [];

  for (const intent of plan.shadowIntents.slice(0, DEFAULT_MAX_INTENTS)) {
    const scenarioId = intent.scenarioId;
    if (!scenarioId || seenScenarios.has(scenarioId)) continue;
    seenScenarios.add(scenarioId);
    const execution = await runShopeeShadow({ scenarioId, env: safeEnv });
    assertShadowReadOnly(execution);
    const summary = Array.isArray(execution?.marketplaces) ? execution.marketplaces[0] : null;
    results.push({
      radarProductId: intent.radarProductId,
      productTerm: intent.searchTerms?.[0] || null,
      scenarioId,
      marketplace: 'Shopee',
      discovered: Number(summary?.discovered || 0),
      persisted: Number(summary?.persisted || 0),
      queueSelected: Number(summary?.queueSelected || 0),
      writeAudit: execution?.writeAudit || null,
    });
  }

  return { ...baseReport, effectiveMode: 'shadow', executedIntents: results.length, results };
}

async function loadLatestRadarSnapshot({ env = process.env, client = null } = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!client && (!url || !key)) throw new Error('Supabase não configurado para leitura do Radar.');
  const supabase = client || createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: run, error: runError } = await supabase
    .from('trend_radar_runs')
    .select('id,user_id,radar_date,strategy_version,status,generated_at,created_at')
    .eq('status', 'completed')
    .order('radar_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw new Error(`Falha ao ler último Radar: ${runError.message}`);
  if (!run) return { run: null, products: [] };

  const { data: products, error: productsError } = await supabase
    .from('trend_radar_products')
    .select('id,radar_run_id,priority,product_term,category,marketplace,marketplace_key,evidence_status,commercial_score,confidence,is_focus,created_at')
    .eq('radar_run_id', run.id)
    .order('priority', { ascending: true })
    .limit(20);
  if (productsError) throw new Error(`Falha ao ler produtos do Radar: ${productsError.message}`);
  return { run, products: products || [] };
}

async function main() {
  const snapshot = await loadLatestRadarSnapshot();
  const report = await runTrendExecutiveShadow({ env: process.env, snapshot });
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[Trend Executive Shadow] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_MAX_INTENTS,
  buildRadarShadowState,
  loadLatestRadarSnapshot,
  resolveShopeeScenarioForIntent,
  runTrendExecutiveShadow,
};
