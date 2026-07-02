'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
process.env.LLM_DIAGNOSTIC = '1';
process.env.LLM_DIAGNOSTIC_RUN_ID = `diag-${Date.now()}`;
process.env.LLM_DIAGNOSTIC_LOG_FILE = '.dbg/cerebras-fallback-diagnostic.ndjson';

const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const {
  crawleeExtract,
  generateOfferAnalysis,
  PROVIDER_CONFIG
} = require('./oracle-scraper.cjs');

const DIAG_FILE = process.env.LLM_DIAGNOSTIC_LOG_FILE;
const RUN_ID = process.env.LLM_DIAGNOSTIC_RUN_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function readDiagnostics() {
  if (!fs.existsSync(DIAG_FILE)) return [];
  return fs
    .readFileSync(DIAG_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter((entry) => entry && entry.runId === RUN_ID);
}

function summarize(entries) {
  const fallbacks = entries.filter((entry) => entry.event === 'fallback');
  const errors = entries.filter((entry) => entry.event === 'error');
  const successes = entries.filter((entry) => entry.event === 'success');
  return {
    requestCount: entries.filter((entry) => entry.event === 'request').length,
    successCount: successes.length,
    errorCount: errors.length,
    fallbackCount: fallbacks.length,
    firstFallback: fallbacks[0] || null,
    firstError: errors[0] || null,
    lastSuccess: successes[successes.length - 1] || null
  };
}

async function fetchOffers(limit) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/offers`);
  url.searchParams.set('select', 'id,product_name,platform,current_price,old_price,status,updated_at,score');
  url.searchParams.set('order', 'updated_at.desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('or', '(status.eq.approved,status.eq.draft)');

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase REST error (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

async function runSingleOfferTest() {
  const [offer] = await fetchOffers(1);
  if (!offer) {
    throw new Error('Nenhuma offer valida encontrada para o teste unitario de copy.');
  }

  const before = readDiagnostics().length;
  const startedAt = Date.now();
  const analysis = await generateOfferAnalysis(offer, offer.platform || 'Especial', {
    offerId: offer.id,
    pipelineBatchSize: 1,
    query: 'diagnostic-single-offer'
  });
  const afterEntries = readDiagnostics().slice(before);

  return {
    offerId: offer.id,
    productName: offer.product_name,
    platform: offer.platform,
    durationMs: Date.now() - startedAt,
    usedFallbackCopy: afterEntries.some((entry) => entry.event === 'fallback' && entry.phase === 'copy'),
    telegramPreview: String(analysis.telegram || '').slice(0, 180),
    diagnostics: summarize(afterEntries)
  };
}

async function runExtractionBatchTest() {
  const queries = [
    { label: 'Echo Show 8', url: 'https://lista.mercadolivre.com.br/Echo%20Show%208' },
    { label: 'Power bank I2GO 20000mAh', url: 'https://lista.mercadolivre.com.br/Power%20bank%20I2GO%2020000mAh' },
    { label: 'Mario Kart 8 Deluxe', url: 'https://lista.mercadolivre.com.br/Mario%20Kart%208%20Deluxe' },
    { label: 'Fechadura digital Intelbras FR 102', url: 'https://lista.mercadolivre.com.br/Fechadura%20digital%20Intelbras%20FR%20102' },
    { label: 'Cafeteira Nespresso Essenza Mini', url: 'https://lista.mercadolivre.com.br/Cafeteira%20Nespresso%20Essenza%20Mini' }
  ];

  const results = [];

  for (const query of queries) {
    const before = readDiagnostics().length;
    const startedAt = Date.now();
    const products = await crawleeExtract(query.url, 6, 'Mercado Livre');
    const afterEntries = readDiagnostics().slice(before);
    const summary = summarize(afterEntries);

    results.push({
      query: query.label,
      durationMs: Date.now() - startedAt,
      approvedProducts: Array.isArray(products) ? products.length : 0,
      usedFallbackExtraction: afterEntries.some((entry) => entry.event === 'fallback' && entry.phase === 'extraction'),
      diagnostics: summary
    });

    if (summary.firstFallback) {
      break;
    }
  }

  return results;
}

async function main() {
  console.log(JSON.stringify({
    runId: RUN_ID,
    model: PROVIDER_CONFIG.cerebras.model,
    timeoutMs: null,
    productsToProcess: PROVIDER_CONFIG.cerebras.productsToProcess
  }, null, 2));

  const singleOffer = await runSingleOfferTest();
  const extractionBatch = await runExtractionBatchTest();

  console.log(JSON.stringify({
    runId: RUN_ID,
    singleOffer,
    extractionBatch
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    runId: RUN_ID,
    fatal: true,
    message: error.message
  }, null, 2));
  process.exit(1);
});
