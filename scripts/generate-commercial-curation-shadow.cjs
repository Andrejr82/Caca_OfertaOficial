'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const curation = require('./commercial-curation-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const MARKETPLACES = ['Shopee', 'Mercado Livre'];

function parseArgs(argv = []) {
  const args = { mode: 'dry-run', limit: 50, intent: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--write-shadow') args.mode = 'write-shadow';
    if (argv[i] === '--dry-run') args.mode = 'dry-run';
    if (argv[i] === '--intent') args.intent = argv[++i] || null;
    if (argv[i] === '--limit') args.limit = Math.max(1, Number(argv[++i]) || 50);
  }
  return args;
}

function normalize(row) {
  const metrics = row.marketplace_metrics || {};
  return {
    id: row.id,
    sourceOfferId: row.id,
    marketplace: row.platform,
    title: row.product_name || row.short_name || '',
    price: Number(row.current_price),
    oldPrice: Number(row.old_price),
    discountPercent: row.old_price > row.current_price ? ((row.old_price - row.current_price) / row.old_price) * 100 : metrics.priceDiscountRate,
    rating: row.rating ?? metrics.ratingStar,
    sales: metrics.sales,
    imageUrl: row.image_url,
    affiliateUrl: row.original_url,
    category: row.category || row.category_name,
    sellerName: row.seller_name,
    shippingFree: row.shipping_free === true,
    marketplaceMetrics: metrics,
    sourceScenarioId: null,
    status: row.status,
    explainability: row.explainability,
  };
}

function buildShadowMetadata(product) {
  const intent = curation.classifyCommercialIntent(product);
  const candidate = { ...product, commercialIntent: intent };
  return { ...curation.buildCommercialMetadata(candidate), sourceOfferId: product.sourceOfferId || product.id, shadowIdempotencyKey: `commercial-curation-v1:${product.sourceOfferId || product.id}` };
}

function selectShadowCandidates(products, options = {}) {
  const ranked = curation.rankCommercialOffers(products, { includeRejected: true, limit: products.length });
  return ranked.filter((item) => !options.intent || item.commercialIntent === options.intent).slice(0, options.limit || 50);
}

async function fetchOffers(supabase) {
  const { data, error } = await supabase.from('offers').select('id,platform,product_name,short_name,current_price,old_price,marketplace_metrics,rating,image_url,original_url,category,category_name,seller_name,shipping_free,explainability,status').in('platform', MARKETPLACES).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}

async function writeShadow(supabase, candidates) {
  let written = 0; let skipped = 0;
  for (const candidate of candidates) {
    if (candidate.status === 'posted') { skipped += 1; continue; }
    const existing = candidate.explainability && typeof candidate.explainability === 'object' ? candidate.explainability : {};
    if (existing.commercialCuration?.shadowIdempotencyKey === candidate.metadata.shadowIdempotencyKey) { skipped += 1; continue; }
    const { error } = await supabase.from('offers').update({ explainability: { ...existing, commercialCuration: candidate.metadata } }).eq('id', candidate.id).neq('status', 'posted');
    if (error) throw new Error(`falha ao gravar shadow ${candidate.id}: ${error.message}`);
    written += 1;
  }
  return { written, skipped };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Credenciais Supabase ausentes em .env.local');
  if (args.mode === 'write-shadow' && process.env.COMMERCIAL_SHADOW_WRITE_CONFIRM !== 'yes') throw new Error('Para --write-shadow, defina COMMERCIAL_SHADOW_WRITE_CONFIRM=yes explicitamente.');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const rows = await fetchOffers(supabase);
  const candidates = selectShadowCandidates(rows.map(normalize), args).map((item) => ({ ...item, metadata: buildShadowMetadata(item) }));
  const result = { mode: args.mode, candidates: candidates.length, automatic: candidates.filter((x) => x.automaticEligible).length, manualFirst: candidates.filter((x) => x.manualReviewRequired).length, top: candidates.slice(0, 10).map((x) => ({ id: x.id, marketplace: x.marketplace, title: x.title, score: x.score, intent: x.commercialIntent })) };
  if (args.mode === 'write-shadow') Object.assign(result, await writeShadow(supabase, candidates));
  console.log(JSON.stringify(result, null, 2));
  return result;
}

module.exports = { parseArgs, normalize, buildShadowMetadata, selectShadowCandidates, main };
if (require.main === module) main().catch((error) => { console.error(`Shadow falhou: ${error.message}`); process.exitCode = 1; });
