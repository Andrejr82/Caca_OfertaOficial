'use strict';

const fs = require('node:fs');
const core = require('./mercadolivre-official-intents-v5-core.cjs');
const { SCENARIOS } = require('./amazon-scenario-config.cjs');

const REPORT_PATH = 'reports/mercadolivre-official-intents-v5-dry-run.json';
const DEMOGRAPHIC_MODIFIERS = new Set([
  'masculino', 'masculina', 'feminino', 'feminina', 'adulto', 'adulta',
  'casual', 'basico', 'basica', 'social', 'profissional', 'premium',
]);

function normalizeKeyword(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function relaxedKeyword(keyword) {
  const original = normalizeKeyword(keyword);
  if (!original) return null;
  const tokens = original.split(/\s+/);
  const relaxed = tokens.filter((token) => {
    const normalized = token.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return !DEMOGRAPHIC_MODIFIERS.has(normalized);
  }).join(' ').trim();
  return relaxed && relaxed !== original ? relaxed : null;
}

function compactKeyword(keyword) {
  const original = normalizeKeyword(keyword);
  if (!original) return null;
  const tokens = original.split(/\s+/).filter((token) => !/^(?:de|da|do|das|dos|para|com)$/i.test(token));
  if (tokens.length <= 2) return null;
  const compact = tokens.slice(0, 2).join(' ');
  return compact && compact !== original ? compact : null;
}

function buildMercadoLivreDeepeningKeywords(keywords = [], maxExtra = 12) {
  const originals = new Set((keywords || []).map(normalizeKeyword).filter(Boolean));
  const extras = [];
  for (const keyword of originals) {
    for (const candidate of [relaxedKeyword(keyword), compactKeyword(keyword)]) {
      if (!candidate || originals.has(candidate) || extras.includes(candidate)) continue;
      extras.push(candidate);
      if (extras.length >= maxExtra) return extras;
    }
  }
  return extras;
}

function uniqueProducts(products = []) {
  const map = new Map();
  for (const product of products) {
    const key = String(product?.product_id || product?.item_id || product?.product_url || '').trim();
    if (!key) continue;
    const current = map.get(key);
    if (!current) {
      map.set(key, product);
      continue;
    }
    const currentPrice = Number(current.current_price || Infinity);
    const nextPrice = Number(product.current_price || Infinity);
    if (nextPrice < currentPrice) map.set(key, product);
  }
  return [...map.values()];
}

function coverageSummary(result = {}) {
  const queries = Array.isArray(result.queries) ? result.queries : [];
  const selectable = queries.filter((query) => query.auto_selectable === true || query.status === 'ok').length;
  const empty = queries.filter((query) => Number(query.products || 0) === 0).length;
  return { total: queries.length, selectable, empty };
}

function shouldDeepen(result, keywords, options = {}) {
  if (options.autoDeepen === false) return false;
  const summary = coverageSummary(result);
  const minPool = Math.max(10, Math.min(30, Number(options.minPool || (Array.isArray(keywords) ? keywords.length * 2 : 10))));
  if (Number(result?.products?.length || 0) < minPool) return true;
  if (summary.total > 0 && summary.empty / summary.total >= 0.35) return true;
  return false;
}

async function runMercadoLivreOfficialIntentCoverage(options = {}) {
  const keywords = Array.isArray(options.keywords) ? options.keywords : undefined;
  const primary = await core.runMercadoLivreOfficialIntentCoverage(options);
  const activeKeywords = keywords || primary.keywords || [];
  if (!shouldDeepen(primary, activeKeywords, options)) {
    return { ...primary, deepening: { applied: false, reason: 'primary_pool_sufficient', primaryProducts: Number(primary.products?.length || 0) } };
  }

  const extraKeywords = buildMercadoLivreDeepeningKeywords(activeKeywords, Number(options.maxExtraKeywords || 12));
  if (extraKeywords.length === 0) {
    return { ...primary, deepening: { applied: false, reason: 'no_additional_intents', primaryProducts: Number(primary.products?.length || 0) } };
  }

  const secondary = await core.runMercadoLivreOfficialIntentCoverage({
    ...options,
    keywords: extraKeywords,
    maxPerIntent: Math.max(Number(options.maxPerIntent || 20), Number(options.deepMaxPerIntent || 25)),
    delayMs: Math.min(Number(options.delayMs ?? 500), Number(options.deepDelayMs ?? 250)),
  });
  const products = uniqueProducts([...(primary.products || []), ...(secondary.products || [])]);
  return {
    ...primary,
    products,
    raw_products: Number(primary.raw_products || 0) + Number(secondary.raw_products || 0),
    duplicates: Number(primary.duplicates || 0) + Number(secondary.duplicates || 0) + (Number(primary.products?.length || 0) + Number(secondary.products?.length || 0) - products.length),
    calls: Number(primary.calls || 0) + Number(secondary.calls || 0),
    queries: [...(primary.queries || []), ...(secondary.queries || []).map((query) => ({ ...query, deepening: true }))],
    deepening: {
      applied: true,
      reason: 'primary_coverage_insufficient',
      primaryProducts: Number(primary.products?.length || 0),
      finalProducts: products.length,
      primaryCoverage: coverageSummary(primary),
      secondaryCoverage: coverageSummary(secondary),
      extraKeywords,
    },
  };
}

async function main() {
  require('dotenv').config({ path: '.env.local' });
  const scenarioArgIndex = process.argv.indexOf('--scenario');
  const scenarioId = scenarioArgIndex >= 0 ? process.argv[scenarioArgIndex + 1] : 'informatica_editorial';
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Cenário Mercado Livre não encontrado: ${scenarioId}`);
  const accessToken = await core.refreshAccessToken();
  const result = await runMercadoLivreOfficialIntentCoverage({ accessToken, keywords: scenario.keywords });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ file: REPORT_PATH, keywords: result.keywords.length, products: result.products.length, raw_products: result.raw_products, duplicates: result.duplicates, calls: result.calls, deepening: result.deepening, failed: result.queries.filter((query) => query.status !== 'ok').length })}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = {
  ...core,
  runMercadoLivreOfficialIntentCoverage,
  buildMercadoLivreDeepeningKeywords,
  shouldDeepenMercadoLivreCoverage: shouldDeepen,
};
