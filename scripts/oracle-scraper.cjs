/**
 * Oracle Worker Discovery-Only V5.
 *
 * O processo executável descobre ofertas nos três marketplaces oficiais,
 * materializa Candidate/Ingestion V1 e encerra em pending_manual_review.
 */

'use strict';

const RETIRED_WORKER_FLAGS = [
  '--amazon-official-dry-run',
  '--discovery-dry-run',
  '--shopee-official-dry-run',
  '--shopee-v4-dry-run',
];
const retiredWorkerFlag = RETIRED_WORKER_FLAGS.find((flag) => process.argv.includes(flag));
if (require.main === module && retiredWorkerFlag) {
  console.error('Modo legado desativado no Oracle Worker Discovery-Only: ' + retiredWorkerFlag);
  process.exit(1);
}

const scenarioArgIndex = process.argv.indexOf('--scenario');
const CLI_SCENARIO_ID = scenarioArgIndex !== -1 ? process.argv[scenarioArgIndex + 1] : null;

global.WebSocket = require('ws');

const crypto = require('node:crypto');
const { validateProductTitle } = require('./product-title-quality.cjs');
const cron = require('node-cron');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
require('dotenv').config({ path: '.env.local' });

function generateMLAffiliateLinkWithId(productUrl, affiliateId) {
  if (!affiliateId || !affiliateId.trim()) return productUrl;
  try {
    const url = new URL(productUrl);
    url.hash = "";
    url.searchParams.set("partner_id", affiliateId.trim());
    url.searchParams.set("utm_source", "caca_oferta");
    url.searchParams.set("utm_medium", "afiliado");
    url.searchParams.set("utm_campaign", "express_publication");
    return url.toString();
  } catch {
    return productUrl;
  }
}

function processMonetization(marketplace, originalUrl) {
  let affiliateUrl = null;
  let valid = false;

  if (marketplace === 'Amazon') {
    const tag = process.env.AMAZON_PARTNER_TAG || 'cacaofertaofi-20';
    try {
      const u = new URL(originalUrl);
      u.searchParams.set('tag', tag);
      affiliateUrl = u.toString();
      valid = true;
    } catch { }
  } else if (marketplace === 'Mercado Livre') {
    const affiliateId = process.env.MERCADO_LIVRE_AFFILIATE_ID || 'cacaofertaoficial';
    affiliateUrl = generateMLAffiliateLinkWithId(originalUrl, affiliateId);
    try {
      const u = new URL(affiliateUrl);
      valid = !!u.searchParams.get('partner_id');
    } catch {
      valid = false;
    }
  } else if (marketplace === 'Shopee') {
    valid = originalUrl.includes('s.shopee.com.br') || originalUrl.includes('shope.ee') || originalUrl.includes('affiliates') || originalUrl.includes('ext_camp') || originalUrl.includes('is_from_login=true');
    if (valid) affiliateUrl = originalUrl;
  } else if (marketplace === 'Shein') {
    valid = originalUrl.includes('affiliateID') || originalUrl.includes('adp');
    if (valid) affiliateUrl = originalUrl;
  } else {
    valid = true;
    affiliateUrl = originalUrl;
  }

  return { valid, affiliateUrl };
}

function prepareDiscoveryCandidate(marketplace, candidate) {
  const monetization = processMonetization(marketplace, candidate?.sourceUrl);
  if (!monetization.valid) return null;
  return { ...candidate, monetization };
}

const AFFILIATE_CHANNELS = Object.freeze([
  { name: 'telegram', prefix: 'tg_' },
  { name: 'whatsapp', prefix: 'wp_' },
  { name: 'facebook', prefix: 'fb_' },
  { name: 'instagram', prefix: 'ig_' },
]);

function buildAffiliateLinkRows(offer, appUrl) {
  const baseUrl = String(appUrl || '').replace(/\/$/, '');
  return AFFILIATE_CHANNELS.map((channel) => ({
    offer_id: offer.id,
    user_id: offer.user_id,
    original_url: offer.original_url,
    channel: channel.name,
    sub_id: `${channel.prefix}${offer.id}`,
    tracked_url: `${baseUrl}/go/${channel.prefix}${offer.id}`,
  }));
}

const shopeeNativeV5 = require('./shopee-native-discovery-v5.cjs');
const { SCENARIOS: SHOPEE_SCENARIOS, getCycleScenario, getCycleStartHour, getSaoPauloHour, matchesScenarioProduct } = require('./shopee-scenario-config.cjs');
const { SCENARIOS: MARKETPLACE_SCENARIOS } = require('./amazon-scenario-config.cjs');
const { runAmazonNativeTop20, runAmazonScenarioDryRun } = require('./amazon-native-top20-v5.cjs');
const { refreshAccessToken: refreshMercadoLivreAccessToken, runMercadoLivreOfficialIntentCoverage } = require('./mercadolivre-official-intents-v5.cjs');
const { classifyMercadoLivreProduct } = require('./mercadolivre-canonical-classifier.cjs');
const { FINAL_STATE, MARKETPLACES, runDiscoveryOnlyCycle } = require('./oracle-worker-discovery-only.cjs');
const { withTimeout, runWithWatchdog, createStageLogger } = require('./oracle-resilience.cjs');
const { getMarketplaceScenarioContract } = require('./marketplace-scenario-contracts.cjs');

function createQualityShadowRunner() {
  if (process.env.OFFER_QUALITY_PIPELINE_V2 !== 'shadow') return null;
  let runtime;
  try {
    runtime = require('./offer-quality-shadow-runtime.cjs');
  } catch (error) {
    return async () => { throw new Error(`Runtime de qualidade shadow indisponível: ${error.message}`); };
  }
  if (typeof runtime.evaluateDiscoveryShadow !== 'function') {
    return async () => { throw new Error('Runtime de qualidade shadow sem avaliador'); };
  }
  return async (payload) => runtime.evaluateDiscoveryShadow(
    payload.candidates || [],
    payload.queue || {},
    {
      runId: `shadow-${payload.correlationId}-${payload.marketplace}`,
      generatedAt: new Date().toISOString(),
      marketplace: payload.marketplace,
    },
  );
}

function createQualityAdmissionRunner() {
  if (process.env.OFFER_QUALITY_PIPELINE_V2 !== 'active') return null;
  let runtime;
  try {
    runtime = require('./offer-quality-queue-runtime.cjs');
  } catch (error) {
    return async () => { throw new Error(`Runtime de qualidade active indisponível: ${error.message}`); };
  }
  if (typeof runtime.selectOfferQualityQueueProducts !== 'function') {
    return async () => { throw new Error('Runtime de qualidade active sem adaptador de fila'); };
  }
  return async (products, marketplace, limits = {}) => runtime.selectOfferQualityQueueProducts(products, {
    marketplace,
    maxAccepted: limits.maxAccepted,
    monetizationValid: (product) => product?.monetization?.valid === true,
  });
}

const ADMIN_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
// Executa ciclos de 4 horas. O roteador transforma cada ciclo em um bundle
// determinístico das janelas editoriais que ele atravessa.
const CRON_SCHEDULE = '0 0,4,8,12,16,20 * * *';
const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '';
const SHOPEE_APP_SECRET = process.env.SHOPEE_APP_SECRET || '';

function getActiveMarketplaceScenario(marketplace = 'Shopee') {
  const routed = CLI_SCENARIO_ID
    ? (MARKETPLACE_SCENARIOS[CLI_SCENARIO_ID] || SHOPEE_SCENARIOS[CLI_SCENARIO_ID])
    : getCycleScenario(getCycleStartHour(getSaoPauloHour()), 4);
  const scenarioId = routed?.scenarioId || routed?.id;
  return getMarketplaceScenarioContract(scenarioId, marketplace) || routed || null;
}

let supabaseClient;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Oracle Worker requer configuração Supabase server-side');
  supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  });
  return supabaseClient;
}

function calculateScoreV1(product) {
  const price = Number(product.current_price || 0);
  const oldPrice = Number(product.old_price || 0);
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    if (price >= 1500 && pct >= 0.10) discountScore = 10;
    else if (pct >= 0.05 && pct <= 0.80) discountScore = Math.min((pct / 0.5) * 10, 10);
    else if (pct > 0.80) discountScore = 2;
  }
  const priceScore = price <= 90 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
  const impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
  const ratingScore = product.rating ? (product.rating / 5) * 10 : 5;
  return Number(((discountScore * 0.35) + (priceScore * 0.30) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

async function fetchAmazonHtmlViaScrapedo(url) {
  const apiKey = process.env.SCRAPEDO_API_KEY;
  if (!apiKey) throw new Error('SCRAPEDO_API_KEY não configurada.');
  const response = await axios.get('https://api.scrape.do', {
    params: { token: apiKey, url, super: true },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (response.status !== 200) throw new Error('Scrape.do HTTP ' + response.status);
  return response.data;
}

async function callShopeeAffiliateApi(payload) {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) return null;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash('sha256')
      .update(SHOPEE_APP_ID + timestamp + payload + SHOPEE_APP_SECRET)
      .digest('hex');
    try {
      const response = await axios.post(SHOPEE_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'SHA256 Credential=' + SHOPEE_APP_ID + ', Timestamp=' + timestamp + ', Signature=' + signature,
        },
        timeout: 60000,
        validateStatus: () => true,
      });
      if (response.status !== 429 || attempt === 2) return response;
      const retryAfter = Number(response.headers?.['retry-after'] ?? 0);
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1)));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

// Legacy native category functions removed. (fetchShopeeNativeCategoriesFromApi, resolveShopeeNativeCategories)

async function refreshShopeeNativeCatalog() {
  // Legacy function.
  console.log('Refresh native catalog is disabled as we now use time-based scenario config.');
  return null;
}

async function fetchShopeeNativeCategoryProducts(category, payloadObject) {
  const response = await callShopeeAffiliateApi(JSON.stringify(payloadObject));
  if (!response) return { http: 0, nodes: [] };
  const retryAfter = response.headers?.['retry-after'] == null ? null : String(response.headers['retry-after']);
  if (response.status === 429) return { http: 429, retryAfter, nodes: [] };
  const errors = Array.isArray(response.data?.errors) ? response.data.errors : [];
  if (response.status !== 200 || errors.length) {
    return { http: response.status, nodes: [], error: errors.map((error) => error.message).filter(Boolean).join(' | ') };
  }
  return {
    http: 200,
    nodes: response.data?.data?.productOfferV2?.nodes || [],
    pageInfo: response.data?.data?.productOfferV2?.pageInfo || null,
  };
}

/**
 * Consulta determinística de um SKU já identificado por shopId/itemId.
 * Esta é a mesma fronteira assinada usada pela descoberta nativa, exposta para
 * consumidores internos como a Publicação Expressa sem compartilhar segredos.
 */
function normalizeShopeeAffiliateProduct(node, shopId, itemId) {
  if (String(node?.itemId || '') !== itemId) return null;
  // The same item id can only be published when it is the product requested by
  // the Express link.  Do not accept a merely similar keyword result.
  if (node?.shopId != null && String(node.shopId) !== shopId) return null;
  const price = Number.parseFloat(String(node.priceMin || '').replace(',', '.'));
  const title = String(node.productName || '').trim();
  const imageUrl = String(node.imageUrl || '').trim();
  if (!title || !imageUrl || !Number.isFinite(price) || price <= 0) return null;
  return {
    shopId,
    itemId,
    title,
    imageUrl: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
    price,
    affiliateUrl: String(node.offerLink || ''),
  };
}

async function lookupShopeeAffiliateProduct(shopId, itemId, keyword = '') {
  const normalizedShopId = String(shopId || '').trim();
  const normalizedItemId = String(itemId || '').trim();
  if (!/^\d+$/.test(normalizedShopId) || !/^\d+$/.test(normalizedItemId)) return null;

  // The automatic Oracle cycle has already confirmed these rows through the
  // official Shopee API. Reusing an exact stored identity avoids a needless
  // second marketplace request and preserves the same discovery contract.
  const { data: knownOffer, error: knownOfferError } = await getSupabase()
    .from('offers')
    .select('product_name, image_url, current_price, original_url, shopee_item_id, shopee_shop_id')
    .eq('user_id', ADMIN_USER_ID)
    .eq('platform', 'Shopee')
    .eq('shopee_item_id', normalizedItemId)
    .eq('shopee_shop_id', normalizedShopId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (knownOfferError) throw new Error('Consulta de oferta Shopee já descoberta falhou: ' + knownOfferError.message);
  if (knownOffer) {
    const price = Number(knownOffer.current_price);
    const title = String(knownOffer.product_name || '').trim();
    const imageUrl = String(knownOffer.image_url || '').trim();
    if (title && imageUrl && Number.isFinite(price) && price > 0) {
      return {
        shopId: normalizedShopId,
        itemId: normalizedItemId,
        title,
        imageUrl,
        price,
        affiliateUrl: String(knownOffer.original_url || ''),
      };
    }
  }

  const query = 'query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId } } }';
  const normalizedKeyword = String(keyword || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const keywords = [
    `https://shopee.com.br/product/${normalizedShopId}/${normalizedItemId}`,
    normalizedItemId,
    ...(normalizedKeyword ? [normalizedKeyword] : []),
  ];

  for (const keyword of keywords) {
    const payload = JSON.stringify({
      operationName: 'ShopeePromotionOffers',
      query,
      variables: { keyword, productCatId: null, page: 1, limit: normalizedKeyword === keyword ? 50 : 20, sortType: 2, isAMSOffer: true },
    });
    const response = await callShopeeAffiliateApi(payload);
    if (!response || response.status !== 200 || (response.data?.errors || []).length) continue;
    const nodes = response.data?.data?.productOfferV2?.nodes || [];
    const product = nodes.find((node) => normalizeShopeeAffiliateProduct(node, normalizedShopId, normalizedItemId));
    const normalizedProduct = normalizeShopeeAffiliateProduct(product, normalizedShopId, normalizedItemId);
    if (normalizedProduct) return normalizedProduct;
  }
  return null;
}

async function loadShopeeNoveltyKeys() {
  const { data, error } = await getSupabase()
    .from('offers')
    .select('shopee_item_id, shopee_shop_id, original_url, status')
    .eq('platform', 'Shopee')
    .eq('user_id', ADMIN_USER_ID);
  if (error) throw new Error('Novelty Shopee V5: ' + error.message);
  const keys = new Set();
  for (const offer of data || []) {
    if (offer.shopee_item_id) keys.add('item:' + offer.shopee_item_id);
    if (offer.shopee_item_id && offer.shopee_shop_id) {
      keys.add('shopItem:' + offer.shopee_shop_id + ':' + offer.shopee_item_id);
    }
    const normalized = offer.original_url
      ? shopeeNativeV5.sanitizeProduct(
        { itemId: 'probe', productName: 'probe', productLink: offer.original_url, priceMin: 1 },
        { productCatId: 'probe', name: 'probe', order: 0 },
      )?.normalizedUrl
      : null;
    if (normalized) keys.add('url:' + normalized);
  }
  return keys;
}

async function executeShopeeNativeDiscoveryV5(options = {}) {
  const dryRun = options.dryRun === true;
  const noveltyKeys = dryRun ? new Set() : await loadShopeeNoveltyKeys();
  
  let forcedScenario = null;
  if (options.scenario) {
    const scenarioConfig = require('./shopee-scenario-config.cjs');
    forcedScenario = typeof options.scenario === 'string'
      ? scenarioConfig.SCENARIOS[options.scenario]
      : options.scenario;
    if (!forcedScenario) {
      throw new Error(`Cenário Shopee '--scenario ${options.scenario}' não encontrado.`);
    }
  }

  const result = await shopeeNativeV5.runNativeDiscovery({
    fetchProducts: fetchShopeeNativeCategoryProducts,
    isNovel: (product) => ![
      'item:' + product.itemId,
      product.shopId && 'shopItem:' + product.shopId + ':' + product.itemId,
      product.normalizedUrl && 'url:' + product.normalizedUrl,
    ].filter(Boolean).some((key) => noveltyKeys.has(key)),
    dryRun,
    maxFinalists: shopeeNativeV5.getShopeeMaxOffersPerCycle(),
    maxPagesPerKeyword: forcedScenario?.maxPagesPerKeyword,
    scenario: forcedScenario,
  });
  return {
    ...result,
    executedAt: new Date().toISOString(),
    categorySource: 'scenario_config',
    aiCalled: false,
    databaseChanged: false,
    postsCreated: 0,
  };
}


async function loadActiveDiscoveryHistory(marketplace) {
  const supabase = getSupabase();
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await withTimeout(
      supabase
        .from('offers')
        .select('item_id, product_id, shopee_item_id, shopee_shop_id, original_url, product_name, category, status, created_at, updated_at, current_price, old_price')
        .eq('user_id', ADMIN_USER_ID)
        .eq('platform', marketplace)
        .range(from, from + pageSize - 1),
      Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000),
      `loadActiveDiscoveryHistory_${marketplace}`
    );
    if (error) throw new Error('Novelty ' + marketplace + ': ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  // Every existing identity is excluded from automatic discovery, including
  // previously rejected offers. Re-selecting rejected rows was inflating the
  // persisted counter without creating new panel items.
  return rows;
}

async function loadRecentDiscoveryHistory(marketplace) {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await withTimeout(
      supabase
        .from('offers')
        .select('item_id, product_id, shopee_item_id, shopee_shop_id, product_name, created_at, updated_at, current_price, old_price')
        .eq('user_id', ADMIN_USER_ID)
        .eq('platform', marketplace)
        .gte('created_at', cutoff)
        .range(from, from + 999),
      Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000),
      `loadRecentDiscoveryHistory_${marketplace}`,
    );
    if (error) throw new Error('Freshness ' + marketplace + ': ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const ML_IDENTITY_STOPWORDS = new Set([
  'com', 'de', 'da', 'do', 'das', 'dos', 'para', 'por', 'em', 'e', 'a', 'o',
  'kit', 'novo', 'nova', 'original', 'promocao', 'oferta', 'frete', 'gratis',
  'preto', 'preta', 'branco', 'branca', 'cinza', 'azul', 'vermelho', 'vermelha'
]);

function normalizeMercadoLivreIdentityTokens(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token.length >= 2 && !ML_IDENTITY_STOPWORDS.has(token));
}

function mercadoLivreIdentityKey(product) {
  const metrics = product?.marketplaceMetrics || product?.marketplace_metrics || {};
  const raw = product?.rawPayload || product?.raw_payload || {};
  const category = normalizeMercadoLivreIdentityTokens(product?.category?.name || product?.category || '').join('-');
  const brand = normalizeMercadoLivreIdentityTokens(metrics.brand || raw.brand || '').join('-');
  const model = normalizeMercadoLivreIdentityTokens(metrics.model || raw.model || '').join('-');
  const capacity = normalizeMercadoLivreIdentityTokens(metrics.capacity || raw.capacity || '').join('-');
  const voltage = normalizeMercadoLivreIdentityTokens(metrics.voltage || raw.voltage || '').join('-');
  const titleTokens = normalizeMercadoLivreIdentityTokens(product?.title || product?.product_name);
  const modelTokens = titleTokens.filter((token) => /[a-z]/.test(token) && /\d/.test(token) && token.length >= 3);

  if (model || modelTokens.length || (brand && (capacity || voltage))) {
    return `ml|${category}|${brand}|${model || modelTokens.sort().join('-')}|${capacity}|${voltage}`;
  }

  if (titleTokens.length < 5) return null;
  return `ml|${category}|title:${titleTokens.join('-')}`;
}

function mercadoLivreTokenSimilarity(left, right) {
  const a = new Set(normalizeMercadoLivreIdentityTokens(left));
  const b = new Set(normalizeMercadoLivreIdentityTokens(right));
  if (a.size < 5 || b.size < 5) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size);
}

function isEquivalentMercadoLivreProduct(candidate, existing) {
  const candidateKey = mercadoLivreIdentityKey(candidate);
  const existingKey = mercadoLivreIdentityKey(existing);
  if (candidateKey && existingKey && candidateKey === existingKey) return true;
  const candidateCategory = normalizeMercadoLivreIdentityTokens(candidate?.category?.name || candidate?.category).join(' ');
  const existingCategory = normalizeMercadoLivreIdentityTokens(existing?.category?.name || existing?.category).join(' ');
  return Boolean(candidateCategory && candidateCategory === existingCategory
    && mercadoLivreTokenSimilarity(candidate?.title, existing?.product_name || existing?.title) >= 0.9);
}

async function loadDeferredDiscoveryIngestions(marketplace) {
  const supabase = getSupabase();
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await withTimeout(
      supabase
        .from('offers')
        .select('id, platform, product_name, category, original_url, image_url, current_price, old_price, score, explainability, item_id, product_id, shopee_item_id, shopee_shop_id, shopee_product_cat_id, native_category_order, native_category_position, seller_id, seller_name, shipping_free, source_categories')
        .eq('user_id', ADMIN_USER_ID)
        .eq('platform', marketplace)
        .eq('status', 'deferred')
        .range(from, from + pageSize - 1),
      Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000),
      `loadDeferredDiscoveryIngestions_${marketplace}`
    );
    if (error) throw new Error('Deferred ' + marketplace + ': ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  
  return rows.map(row => {
     const exp = row.explainability || {};
     const metrics = exp.marketplace_metrics || {};
     let sourceItemId = '';
     if (marketplace === 'Shopee') {
        sourceItemId = row.shopee_item_id || metrics.itemId;
     } else if (marketplace === 'Mercado Livre') {
        sourceItemId = row.item_id || row.product_id || metrics.itemId || metrics.productId;
     } else if (marketplace === 'Amazon') {
        sourceItemId = row.product_id || metrics.asin;
     }
     
     return {
        sourceItemId: String(sourceItemId || ''),
        sourceUrl: row.original_url,
        title: row.product_name,
        imageUrl: row.image_url,
        currentPrice: row.current_price,
        originalPrice: row.old_price,
        category: { name: row.category, ...exp.discovery_evidence },
        marketplaceMetrics: metrics,
        deterministicScore: row.score,
        discoveredAt: exp.discovery_evidence?.discoveredAt || new Date().toISOString(),
        
        deferredAt: exp.deferred_at,
        lastAttemptAt: exp.last_attempt_at,
        nextEligibleAt: exp.next_eligible_at,
        attempts: exp.attempts,
        initialReason: exp.initial_reason,
        finalReason: exp.final_reason,
        curationScore: exp.curation_score,
        commercialHash: exp.commercial_hash,
     };
  }).filter(r => r.sourceItemId);
}

function normalizeShopeeCandidate(product, discoveredAt) {
  return {
    sourceItemId: product.itemId,
    sourceUrl: product.offerLink || product.productLink,
    title: product.productName,
    imageUrl: product.imageUrl,
    currentPrice: product.price,
    originalPrice: product.originalPrice,
    category: { id: product.productCatId, name: product.category, source: 'Shopee Affiliate Open API' },
    marketplaceMetrics: {
      sourcePosition: product.position,
      itemId: product.itemId,
      shopId: product.shopId,
      productCatId: product.productCatId,
      categoryOrder: product.categoryOrder,
      sales: product.sales,
      discount: product.discount,
      rating: product.rating,
      commissionRate: product.commissionRate,
    },
    deterministicScore: Math.max(0, Math.min(10, Number(product.score || 0) / 10)),
    discoveredAt,
    rawPayload: product,
  };
}

function normalizeMercadoLivreCandidate(product) {
  const currentPrice = Number(product.current_price);
  const originalPrice = Number(product.old_price) > currentPrice ? Number(product.old_price) : null;
  const score = calculateScoreV1({
    current_price: currentPrice,
    old_price: originalPrice,
    rating: null,
  });
  return {
    sourceItemId: product.item_id || product.product_id || product.product_url,
    sourceUrl: product.product_url,
    title: product.title,
    imageUrl: product.image_url,
    currentPrice,
    originalPrice,
    category: { id: product.category_id, name: product.category_name, source: product.source || 'Mercado Livre Ofertas SSR' },
    marketplaceMetrics: {
      sourcePosition: product.source_position,
      itemId: product.item_id,
      productId: product.product_id,
      sellerId: product.seller_id,
      sellerName: product.seller_name,
      officialStoreId: product.official_store_id,
      shippingFree: product.shipping_free,
      discountPercent: product.discount_percent,
      sourceCategories: product.source_categories,
    },
    deterministicScore: Math.max(0, Math.min(10, Number(score || 0))),
    discoveredAt: product.discovered_at,
    rawPayload: product,
  };
}

function normalizeAmazonCandidate(product, discoveredAt) {
  // product.marketplaceMetrics é gerado por extractProductCommercials no parser.
  // Antes desta correção, prime/coupon/promotion/rating/reviewCount ficavam
  // apenas no rawPayload e nunca chegavam ao qualityGate nem ao scoreCandidate.
  const pm = product.marketplaceMetrics || {};
  return {
    sourceItemId: product.asin,
    sourceUrl: product.canonical_url,
    title: product.title,
    imageUrl: product.image,
    currentPrice: product.price,
    originalPrice: product.original_price,
    category: { id: product.node_id, name: product.subcategory, source: 'Amazon Best Sellers' },
    marketplaceMetrics: {
      sourcePosition: product.rank,
      asin: product.asin,
      nodeId: product.node_id,
      parentNodeId: product.parent_node_id,
      category: product.category,
      subcategory: product.subcategory,
      seller: product.seller,
      discount: product.discount,
      novelty: product.novelty,
      // Campos comerciais propagados (corrigido — antes ausentes):
      prime: pm.prime ?? false,
      coupon: pm.coupon ?? false,
      promotion: pm.promotion ?? false,
      rating: pm.rating ?? null,
      reviewCount: pm.reviewCount ?? null,
    },
    deterministicScore: Math.max(0, Math.min(10, Number(product.score || 0))),
    discoveredAt,
    rawPayload: product,
  };
}

function discoveryGroupKey(product, productType) {
  const title = String(product.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const model = title.match(/\b(?:[a-z]{1,5}\s*)?\d{2,5}[a-z0-9-]*\b/i)?.[0] || '';
  const capacity = title.match(/\b\d+(?:[.,]\d+)?\s*(?:l|ml|kg|g|w|xicaras?)\b/i)?.[0] || '';
  return `${productType}|${model.trim()}|${capacity.trim()}`.replace(/\s+/g, ' ').trim();
}

async function filterNovelNormalizedProducts(marketplace, products, stageLogger) {
  if (!Array.isArray(products) || products.length === 0) return [];
  
  let stageStartedAt;
  if (stageLogger) stageStartedAt = stageLogger.start('filterNovelNormalizedProducts', products.length);

  try {
    const history = await loadActiveDiscoveryHistory(marketplace, stageLogger);
    const known = new Set(history.flatMap((row) => [
      row.item_id,
      row.product_id,
      row.shopee_item_id,
      row.original_url,
    ].filter(Boolean).map(String)));
    
    const filtered = products.filter((product) => {
      const hasKnownIdentity = [product.sourceItemId, product.sourceUrl]
        .filter(Boolean).some((key) => known.has(String(key)));
      if (hasKnownIdentity) return false;
      if (marketplace !== 'Mercado Livre') return true;
      return !history.some((row) => isEquivalentMercadoLivreProduct(product, row));
    });

    if (stageLogger) stageLogger.end('filterNovelNormalizedProducts', stageStartedAt, filtered.length);
    return filtered;
  } catch (err) {
    if (stageLogger) stageLogger.error('filterNovelNormalizedProducts', stageStartedAt, err.message);
    throw err;
  }
}

async function persistDiscoveryV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products, queue }, stageLogger = null) {
  let stageStartedAt;
  if (stageLogger) stageStartedAt = stageLogger.start('persistDiscoveryV2Metadata', products.length);

  try {
    const supabase = getSupabase();
    
    const insertRunPromise = supabase.from('discovery_runs').insert({
      user_id: tenantId, marketplace, scenario: queue?.limits ? 'oracle-worker-v2' : 'oracle-worker', started_at: requestedAt, finished_at: new Date().toISOString()
    }).select('id').single();
    
    const { data: run, error: runError } = await withTimeout(insertRunPromise, Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000), `persistV2Metadata_insertRun`);
    if (runError || !run) throw new Error(`Discovery V2 run failed: ${runError?.message || 'run not created'}`);
    const itemRows = products.map((product) => ({ user_id: tenantId, discovery_run_id: run.id, marketplace, external_id: String(product.sourceItemId), source_url: product.sourceUrl, raw_payload: product.rawPayload || product, title_raw: String(product.title) }));
    
    let items = [], itemError = null;
    if (itemRows.length) {
      const itemsResult = await withTimeout(
        supabase.from('discovery_items').insert(itemRows).select('id,external_id'),
        Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000),
        `persistV2Metadata_insertItems`
      );
      items = itemsResult.data;
      itemError = itemsResult.error;
    }
    
    if (itemError) throw new Error(`Discovery V2 items failed: ${itemError.message}`);
  const itemByExternal = new Map((items || []).map((item) => [String(item.external_id), item.id]));
    for (const product of products) {
      const discoveryItemId = itemByExternal.get(String(product.sourceItemId));
      if (!discoveryItemId) continue;
      const classification = classifyMercadoLivreProduct({ title: product.title, domainId: product.rawPayload?.domain_id, categoryId: product.rawPayload?.category_id });
      const productType = classification.productType;
      const groupKey = discoveryGroupKey(product, productType);
      const groupKind = groupKey.includes('||') ? 'family' : 'exact';
      const titleQuality = validateProductTitle(product.title);
      const intelligence = { score: Number(product.deterministicScore || 0), marketplace, queueSelected: Boolean(queue?.selected?.some((entry) => entry.sourceItemId === product.sourceItemId)), reasons: [] };
      const classificationStatus = !titleQuality.valid || classification.status !== 'classified' ? 'review_required' : 'classified';
      
      const p1 = supabase.from('offer_classifications').upsert({ user_id: tenantId, discovery_item_id: discoveryItemId, classifier_version: 'oracle-worker-v3-mercadolivre-canonical', classification_status: classificationStatus, product_type: productType, product_role: 'main_product', attributes: { marketplace_intelligence: intelligence, quality_gate: { status: titleQuality.valid ? 'passed' : 'review_required', reason: titleQuality.reason } }, rule_trace: [`correlation:${correlationId}`, `requested_at:${requestedAt}`, `classifier:${classification.source}`, ...(titleQuality.valid ? [] : ['quality_gate:INVALID_PRODUCT_TITLE'])] }, { onConflict: 'discovery_item_id' });
      await withTimeout(p1, Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000), `persistV2Metadata_upsertClassification`);
      
      const p2 = supabase.from('product_groups').upsert({ user_id: tenantId, group_kind: groupKind, group_key: groupKey, product_type: productType, attributes: { marketplace } }, { onConflict: 'user_id,group_kind,group_key' }).select('id').single();
      const { data: group } = await withTimeout(p2, Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000), `persistV2Metadata_upsertGroup`);
      
      if (group?.id) {
        const p3 = supabase.from('product_group_members').upsert({ product_group_id: group.id, discovery_item_id: discoveryItemId }, { onConflict: 'product_group_id,discovery_item_id' });
        await withTimeout(p3, Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000), `persistV2Metadata_upsertMember`);
      }
    }
    if (stageLogger) stageLogger.end('persistDiscoveryV2Metadata', stageStartedAt, products.length);
  } catch (err) {
    if (stageLogger) stageLogger.error('persistDiscoveryV2Metadata', stageStartedAt, err.message);
    throw err;
  }
}

async function scrapeStore(store, stageLogger = null) {
  const discoveredAt = new Date().toISOString();
  if (store === 'Shopee') {
    const scenario = getActiveMarketplaceScenario('Shopee');
    const result = await executeShopeeNativeDiscoveryV5({ persist: false, scenario });
    const normalized = result.categories
      .flatMap((category) => category.products)
      .map((product) => normalizeShopeeCandidate(product, discoveredAt))
      .filter((product) => matchesScenarioProduct(scenario, product.title));
    return filterNovelNormalizedProducts(store, normalized, stageLogger);
  }
  if (store === 'Mercado Livre') {
    const accessToken = await refreshMercadoLivreAccessToken({ persist: true });
    const scenario = getActiveMarketplaceScenario('Mercado Livre');
    const history = await loadActiveDiscoveryHistory(store);
    const known = new Set(history.flatMap((row) => [row.item_id, row.product_id, row.original_url].filter(Boolean).map(String)));

    let intentStageStartedAt;
    if (stageLogger) intentStageStartedAt = stageLogger.start('ML_official_intents', scenario?.keywords?.length || 0);

    const result = await runMercadoLivreOfficialIntentCoverage({
      accessToken,
      keywords: scenario?.keywords,
      maxPerIntent: 20,
      delayMs: 500,
    });

    if (stageLogger) stageLogger.end('ML_official_intents', intentStageStartedAt, result.products.length);

    const normalized = result.products
      .filter((product) => ![product.item_id, product.product_id, product.product_url]
        .filter(Boolean)
        .some((key) => known.has(String(key))))
      .map((product) => normalizeMercadoLivreCandidate({
      ...product,
      discovered_at: result.generated_at,
      source_categories: [{ category_id: product.category_id, category_name: product.category_name, source_position: product.source_position }]
      }));

    const scenarioRelevant = normalized.filter((product) => matchesScenarioProduct(scenario, product.title));
    const filteredNovel = await filterNovelNormalizedProducts(store, scenarioRelevant, stageLogger);
    if (filteredNovel.length > 0) return filteredNovel;

    if (stageLogger) stageLogger.info('ML_scenario_empty', intentStageStartedAt, 'Nenhum candidato novo aderente ao cenário; fallback amplo bloqueado');
    return [];
  }
  if (store === 'Amazon') {
    const history = await loadActiveDiscoveryHistory(store);
    const knownAsins = new Set(history.flatMap((row) => [row.product_id, row.item_id].filter(Boolean).map(String)));
    const scenario = getActiveMarketplaceScenario('Amazon');
    
    let amazonStageStartedAt;
    if (stageLogger) amazonStageStartedAt = stageLogger.start('Amazon_Top20_extraction', scenario?.keywords?.length || 0);
    
    const result = scenario?.keywords?.length
      ? await runAmazonScenarioDryRun({ scenario, minDelayMs: 1200, retryDelayMs: 4000, maxRetries: 1 })
      : await runAmazonNativeTop20({
        fetchImpl: global.fetch,
        knownAsins,
        maxCategories: 10,
        maxSubcategoriesPerCategory: 5,
      });
      
    if (stageLogger) stageLogger.end('Amazon_Top20_extraction', amazonStageStartedAt, result.products.length);
    
    const normalized = result.products
      .filter((product) => Number(product.price) > 0 && /^https:\/\//i.test(product.image || ''))
      .map((product) => normalizeAmazonCandidate(product, discoveredAt))
      .filter((product) => matchesScenarioProduct(scenario, product.title));
    return filterNovelNormalizedProducts(store, normalized, stageLogger);
  }
  throw new Error('Marketplace não autorizado no Oracle Worker: ' + store);
}

async function persistDiscoveryIngestionV1(ingestions, marketplace, targetStatus = FINAL_STATE, stageLogger = null) {
  let stageStartedAt;
  if (stageLogger) stageStartedAt = stageLogger.start('persistDiscoveryIngestionV1', ingestions.length);

  try {
    if (!ingestions.length) {
      if (stageLogger) stageLogger.end('persistDiscoveryIngestionV1', stageStartedAt, 0);
      return { accepted: 0, offerIds: [], state: targetStatus };
    }
  const rows = ingestions.map(({ candidate, ingestionId, correlationId }) => {
    const metrics = candidate.marketplaceMetrics;
    const isDeferred = targetStatus === 'deferred';
    const rawPayload = candidate.rawPayload || candidate;
    
    let explainability = {
      contract_version: candidate.contractVersion,
      ingestion_contract_version: 'pmav5.ingestion/v1',
      candidate_id: candidate.candidateId,
      ingestion_id: ingestionId,
      correlation_id: correlationId,
      discovery_evidence: candidate.discoveryEvidence,
      marketplace_metrics: metrics,
    };

    const monetization = candidate.monetization || processMonetization(marketplace, candidate.sourceUrl);
    if (!monetization.valid) {
      return null;
    }
    explainability.affiliate_url = monetization.affiliateUrl;


    if (isDeferred) {
      explainability = {
        ...explainability,
        deferred_at: rawPayload.deferredAt || new Date().toISOString(),
        last_attempt_at: rawPayload.lastAttemptAt || new Date().toISOString(),
        next_eligible_at: rawPayload.nextEligibleAt || new Date().toISOString(),
        attempts: rawPayload.attempts || 1,
        initial_reason: rawPayload.initialReason || 'limite_categoria',
        final_reason: rawPayload.finalReason || 'limite_categoria',
        curation_score: rawPayload.curationScore || candidate.deterministicScore,
        original_position: candidate.discoveryEvidence?.position || null,
        commercial_hash: rawPayload.commercialHash || crypto.createHash('sha256').update(`${marketplace}:${candidate.sourceItemId}`).digest('hex'),
      };
    }

    const row = {
      user_id: candidate.tenantId,
      platform: candidate.marketplace,
      product_name: candidate.title,
      category: candidate.category.name,
      original_url: candidate.sourceUrl,
      image_url: candidate.imageUrl,
      current_price: candidate.currentPrice,
      old_price: candidate.originalPrice,
      score: candidate.deterministicScore,
      status: targetStatus,
      explainability,
      notes: '[Oracle Discovery-Only V5] ' + marketplace + (isDeferred ? '; deferred' : '; aguardando revisão manual.'),
    };
    if (marketplace === 'Shopee') {
      Object.assign(row, {
        shopee_item_id: metrics.itemId,
        shopee_shop_id: metrics.shopId,
        shopee_product_cat_id: metrics.productCatId,
        native_category_order: metrics.categoryOrder,
        native_category_position: metrics.sourcePosition,
      });
    } else if (marketplace === 'Mercado Livre') {
      Object.assign(row, {
        item_id: metrics.itemId,
        product_id: metrics.productId,
        category_id: candidate.category.id,
        category_name: candidate.category.name,
        source_position: metrics.sourcePosition,
        seller_id: metrics.sellerId,
        seller_name: metrics.sellerName,
        shipping_free: metrics.shippingFree,
        source_categories: metrics.sourceCategories,
      });
    } else if (marketplace === 'Amazon') {
      Object.assign(row, { product_id: metrics.asin, source_position: metrics.sourcePosition });
    }
    return row;
  }).filter(Boolean);

  if (rows.length === 0) {
    if (stageLogger) stageLogger.end('persistDiscoveryIngestionV1', stageStartedAt, 0);
    return { accepted: 0, offerIds: [], state: targetStatus };
  }

    const rpcPromise = getSupabase().rpc(
      'upsert_discovery_offers_v2',
      {
        p_marketplace: marketplace,
        p_rows: rows,
      }
    );
    
    let rpcStartedAt;
    if (stageLogger) rpcStartedAt = stageLogger.start('RPC_upsert_discovery_offers_v2', rows.length);
    
    const { data, error } = await withTimeout(
      rpcPromise,
      15000,
      'upsert_discovery_offers_v2'
    );
    if (error) throw new Error(error.message || 'Falha no RPC');

    const offerIds = data?.offer_ids || [];
    if (offerIds.length > 0) {
      const { data: offersData, error: selectErr } = await getSupabase()
        .from('offers')
        .select('id, user_id, original_url, explainability')
        .in('id', offerIds);
        
      if (selectErr) throw new Error(`Falha ao consultar ofertas persistidas: ${selectErr.message}`);
      if (offersData) {
        const linksToInsert = [];
        const updatesToExplainability = [];
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://caca-oferta-oficial.vercel.app';
        
        for (const o of offersData) {
          const affUrl = o.explainability?.affiliate_url;
          if (affUrl) {
            linksToInsert.push(...buildAffiliateLinkRows(o, APP_URL));

            // Mantém o tracked_url primário no explainability, se ainda não houver
            if (!o.explainability?.tracked_url) {
              const primaryTrkUrl = `${APP_URL}/go/tg_${o.id}`;
              const newExp = { ...o.explainability, tracked_url: primaryTrkUrl };
              updatesToExplainability.push(getSupabase().from('offers').update({ explainability: newExp }).eq('id', o.id));
            }
          }
        }
        
        if (linksToInsert.length > 0) {
          const { error: linksError } = await getSupabase()
            .from('affiliate_links')
            .upsert(linksToInsert, { onConflict: 'offer_id, channel' });
          if (linksError) throw new Error(`Falha ao persistir affiliate_links: ${linksError.message}`);

          const { data: persistedLinks, error: verifyError } = await getSupabase()
            .from('affiliate_links')
            .select('offer_id, channel, tracked_url, sub_id')
            .in('offer_id', offersData.map((offer) => offer.id));
          if (verifyError) throw new Error(`Falha ao verificar affiliate_links: ${verifyError.message}`);

          const linksByOffer = new Map();
          for (const link of persistedLinks || []) {
            if (!linksByOffer.has(link.offer_id)) linksByOffer.set(link.offer_id, new Map());
            linksByOffer.get(link.offer_id).set(link.channel, link);
          }
          for (const offer of offersData) {
            if (!offer.explainability?.affiliate_url) continue;
            const byChannel = linksByOffer.get(offer.id);
            for (const channel of AFFILIATE_CHANNELS) {
              const link = byChannel?.get(channel.name);
              const expected = `${String(APP_URL).replace(/\/$/, '')}/go/${channel.prefix}${offer.id}`;
              if (!link || link.tracked_url !== expected || link.sub_id !== `${channel.prefix}${offer.id}`) {
                throw new Error(`affiliate_links incompletos para offer_id=${offer.id}, canal=${channel.name}`);
              }
            }
          }

          const updateResults = await Promise.all(updatesToExplainability);
          const updateError = updateResults.find((result) => result?.error)?.error;
          if (updateError) throw new Error(`Falha ao atualizar explainability: ${updateError.message}`);
        }
      }
    }
    
    if (stageLogger) stageLogger.end('RPC_upsert_discovery_offers_v2', rpcStartedAt, data.inserted + data.updated);
    if (stageLogger) stageLogger.end('persistDiscoveryIngestionV1', stageStartedAt, data.inserted + data.updated);
    
    return { 
      accepted: data.inserted + data.updated,
      inserted: data.inserted,
      updated: data.updated,
      ignored: data.ignored,
      failed: data.failed,
      offerIds: [...new Set(Array.isArray(data.offer_ids) ? data.offer_ids : [])],
      state: FINAL_STATE 
    };
  } catch (err) {
    if (stageLogger) stageLogger.error('persistDiscoveryIngestionV1', stageStartedAt, err.message);
    throw err;
  }
}

function validateOfficialAIUrl(url) {
  if (process.env.NODE_ENV === 'production') {
    if (!url.startsWith('https://')) {
      throw new Error('URL da Official AI deve usar HTTPS em produção');
    }
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      throw new Error('URL da Official AI não pode usar localhost em produção');
    }
  }
  if (!url.endsWith('/api/ai/generate')) {
    throw new Error('URL da Official AI deve terminar em /api/ai/generate');
  }
  if (url.includes('//api/ai/generate') || url.includes('///api/ai/generate')) {
    throw new Error('URL da Official AI não pode conter duas barras antes de api');
  }
  if (url.includes('@') || url.includes('?') || url.includes('#')) {
    throw new Error('URL da Official AI não pode conter credenciais, tokens ou query strings');
  }
  return url;
}

function resolveOfficialAITriggerEndpoint() {
  const explicitTriggerUrl = process.env.OFFICIAL_AI_TRIGGER_URL?.trim();
  if (explicitTriggerUrl) {
    return validateOfficialAIUrl(explicitTriggerUrl);
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const normalizedVercel = vercelUrl
    ? vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')
      ? vercelUrl
      : `https://${vercelUrl}`
    : null;

  const configuredBaseUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    normalizedVercel;

  let endpoint = null;
  if (configuredBaseUrl) {
    endpoint = `${configuredBaseUrl.replace(/\/+$/, '')}/api/ai/generate`;
  } else if (process.env.NODE_ENV !== 'production') {
    endpoint = 'http://127.0.0.1:3000/api/ai/generate';
  }

  if (!endpoint) {
    throw new Error(
      'URL pública da aplicação não configurada para o disparo da Official AI'
    );
  }

  return validateOfficialAIUrl(endpoint);
}

async function notifyWorkPendingToOfficialAI(cycleResult) {
  const endpoint = resolveOfficialAITriggerEndpoint();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const offerIds = [...new Set(cycleResult.offerIds || [])];
  const totalPages = Math.ceil(offerIds.length / 50);
  const visitedPages = new Set();
  try {
    for (let invocation = 0; invocation <= totalPages; invocation += 1) {
      const response = await axios.post(
        endpoint,
        {
          command: 'PROCESS_OFFERS', offerIds, correlationId: cycleResult.correlationId,
          commandId: `ai:cycle:${cycleResult.correlationId}:v1`, tenantId: cycleResult.tenantId || ADMIN_USER_ID,
          requestedAt: cycleResult.requestedAt || new Date().toISOString(),
        },
        {
          headers: {
            'Content-Type': 'application/json', 'x-correlation-id': cycleResult.correlationId,
            ...(serviceKey ? { Authorization: `Bearer ${serviceKey}` } : {}),
          },
          timeout: 120_000,
        }
      );
      if (response.data?.batchCompleted === true) {
        console.log(`[Disparo Oficial da Official AI] Sucesso para ciclo=${cycleResult.correlationId}: status=${response.status} páginas=${response.data.totalPages}`);
        return response.data;
      }
      const pageNumber = Number(response.data?.pageNumber);
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages || visitedPages.has(pageNumber)) {
        throw new Error(`Official AI não avançou o checkpoint do ciclo (pageNumber=${response.data?.pageNumber})`);
      }
      visitedPages.add(pageNumber);
    }
    throw new Error(`Official AI excedeu o limite determinístico de ${totalPages} páginas`);
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.warn(`[Disparo Oficial da Official AI] Aviso para ciclo=${cycleResult.correlationId}: ${msg}`);
    throw error;
  }
}

function normalizeManualScenarioValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveManualScenarioId(category) {
  const requested = normalizeManualScenarioValue(category);
  if (!requested || requested === 'geral') return null;
  const scenarioEntries = Object.entries(MARKETPLACE_SCENARIOS);
  const direct = scenarioEntries.find(([id]) => normalizeManualScenarioValue(id) === requested);
  if (direct) return direct[0];
  const byLabel = scenarioEntries.find(([, scenario]) => normalizeManualScenarioValue(scenario.label || scenario.name) === requested);
  if (byLabel) return byLabel[0];
  const aliases = new Map([
    ['eletronicos', 'tecnologia_desejo'],
    ['informatica', 'tecnologia_desejo'],
    ['televisao', 'tecnologia_desejo'],
    ['eletrodomesticos', 'eletrodomesticos_cozinha'],
    ['eletroportateis', 'eletrodomesticos_cozinha'],
    ['moveis_e_decoracao', 'casa_moveis'],
    ['utilidades_domesticas', 'impulso_casa'],
    ['cama_mesa_e_banho', 'impulso_casa'],
    ['moda_beleza_e_perfumaria', 'moda_fitness_beleza_viagem'],
    ['esporte_e_lazer', 'treino_academia'],
    ['petshop', 'dono_de_pet'],
    ['criancas_e_bebes', 'mae_de_primeira_viagem'],
  ]);
  return aliases.get(requested) || null;
}

async function runManualMarketplaceScenarioRecording({ tenantId, category, marketplaces, limit }) {
  if (!tenantId) throw new Error('tenantId é obrigatório');
  const selectedMarketplaces = [...new Set((Array.isArray(marketplaces) ? marketplaces : [])
    .map((marketplace) => String(marketplace || '').trim())
    .filter((marketplace) => MARKETPLACES.includes(marketplace)))];
  if (selectedMarketplaces.length === 0) throw new Error('Selecione ao menos um marketplace autorizado');
  const scenarioId = resolveManualScenarioId(category);
  const scenario = scenarioId ? MARKETPLACE_SCENARIOS[scenarioId] : getActiveMarketplaceScenario(selectedMarketplaces[0]);
  if (!scenario?.keywords?.length) throw new Error('A categoria selecionada não possui intenções configuradas');
  const perMarketplace = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const correlationId = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const mlToken = selectedMarketplaces.includes('Mercado Livre')
    ? await refreshMercadoLivreAccessToken({ persist: true })
    : null;
  const result = await runDiscoveryOnlyCycle({
    tenantId,
    correlationId,
    requestedAt,
    marketplaces: selectedMarketplaces,
    discover: async (marketplace) => {
      const marketplaceScenario = getMarketplaceScenarioContract(scenarioId || scenario.scenarioId || scenario.id, marketplace) || scenario;
      if (marketplace === 'Shopee') {
        const discovered = await executeShopeeNativeDiscoveryV5({ dryRun: false, scenario: marketplaceScenario });
        const normalized = discovered.categories.flatMap((group) => group.products)
          .map((product) => normalizeShopeeCandidate(product, requestedAt));
        return filterNovelNormalizedProducts(marketplace, normalized);
      }
      if (marketplace === 'Amazon') {
        const discovered = await runAmazonScenarioDryRun({ scenario: marketplaceScenario, minDelayMs: 1200, retryDelayMs: 4000, maxRetries: 1 });
        const normalized = discovered.products.map((product) => normalizeAmazonCandidate(product, requestedAt));
        return filterNovelNormalizedProducts(marketplace, normalized);
      }
      const discovered = await runMercadoLivreOfficialIntentCoverage({
        accessToken: mlToken,
        keywords: marketplaceScenario.keywords,
        maxPerIntent: Math.max(10, Math.min(20, perMarketplace * 2)),
        delayMs: 300,
      });
      const normalized = discovered.products.map((product) => normalizeMercadoLivreCandidate({ ...product, discovered_at: requestedAt }));
      return filterNovelNormalizedProducts(marketplace, normalized);
    },
    loadDeferred: loadDeferredDiscoveryIngestions,
    loadHistory: loadRecentDiscoveryHistory,
    persist: persistDiscoveryIngestionV1,
    prepareCandidate: (product, marketplace) => prepareDiscoveryCandidate(marketplace, product),
    qualityShadow: createQualityShadowRunner(),
    qualityAdmission: createQualityAdmissionRunner(),
    persistV2Metadata: persistDiscoveryV2Metadata,
    copyQueueOptions: { maxTotal: Math.min(50, perMarketplace * selectedMarketplaces.length), maxPerMarketplace: perMarketplace, maxPerCategory: 3 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
  });
  return { ...result, category: category || 'Geral', scenarioId: scenarioId || null, requestedMarketplaces: selectedMarketplaces, limit: perMarketplace };
}

async function runScrapingCycleCore() {
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  const stageLogger = createStageLogger(correlationId);
  
  let releaseId = process.env.ORACLE_RELEASE_ID;
  let deployedAt = '';
  if (!releaseId) {
    try {
      const fs = require('node:fs');
      const releaseData = JSON.parse(fs.readFileSync('.runtime-release.json', 'utf8'));
      releaseId = releaseData.release_id || releaseData.commit || 'unknown';
      deployedAt = releaseData.deployed_at ? ` deployedAt=${releaseData.deployed_at}` : '';
    } catch {
      releaseId = 'unknown';
    }
  }

  console.log(`[Oracle Boot] release=${releaseId}${deployedAt} amazonMissingCommercialDataPenalty=${process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY || -8} startedAt=${new Date(startedAt).toISOString()}`);

  const result = await runDiscoveryOnlyCycle({
    tenantId: ADMIN_USER_ID,
    correlationId,
    requestedAt: new Date().toISOString(),
    discover: (store) => scrapeStore(store, stageLogger),
    loadDeferred: loadDeferredDiscoveryIngestions,
    loadHistory: loadRecentDiscoveryHistory,
    persist: (ingestions, marketplace, targetStatus) => persistDiscoveryIngestionV1(ingestions, marketplace, targetStatus, stageLogger),
    prepareCandidate: (product, marketplace) => prepareDiscoveryCandidate(marketplace, product),
    qualityShadow: createQualityShadowRunner(),
    qualityAdmission: createQualityAdmissionRunner(),
    persistV2Metadata: (args) => persistDiscoveryV2Metadata(args, stageLogger),
    copyQueueOptions: { maxTotal: 15, maxPerMarketplace: 5, maxPerCategory: 3 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
    observe: async (event) => {
      if (event?.eventType === 'discovery.quality.shadow.completed' || event?.eventType === 'discovery.quality.shadow.failed') {
        console.log(`[Offer Quality Shadow] ${JSON.stringify(event)}`);
      }
    },
    stageLogger
  });
  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  if (result.marketplaces) {
    for (const summary of result.marketplaces) {
      console.log(`[Oracle Discovery-Only V5] ${summary.marketplace}: ${summary.discovered} descobertos, ${summary.persisted} persistidos (${summary.inserted} novos, ${summary.updated} atualizados)`);
    }
  }
  console.log('[Oracle Discovery-Only V5] ciclo=' + result.correlationId + ' duração=' + durationSeconds + 's estado=' + result.finalState);
  return result;
}

async function runScrapingCycle() {
  const timeoutMs = Number(process.env.DISCOVERY_CYCLE_TIMEOUT_MS || 2700000); // 45 minutos por padrão
  return runWithWatchdog(runScrapingCycleCore, timeoutMs, () => {
    console.error(`[Watchdog] cycle_status=failed_timeout elapsedMs=${timeoutMs}`);
  });
}

async function runMercadoLivreOfficialDryRun() {
  const scenario = getActiveMarketplaceScenario() || MARKETPLACE_SCENARIOS.eletronicos;
  const accessToken = await refreshMercadoLivreAccessToken({ persist: true });
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken,
    keywords: scenario.keywords,
    maxPerIntent: 20,
    delayMs: 500,
  });
  console.log(`[Mercado Livre Official V5 Dry-Run] cenário=${CLI_SCENARIO_ID || 'ciclo-atual'} intenções=${result.keywords.length} produtos=${result.products.length} duplicatas=${result.duplicates} chamadas=${result.calls}`);
  return result;
}

async function runShopeeScenarioRecording(scenario) {
  const correlationId = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const result = await runDiscoveryOnlyCycle({
    tenantId: ADMIN_USER_ID,
    correlationId,
    requestedAt,
    discover: async (marketplace) => {
      if (marketplace !== 'Shopee') return [];
      const discovered = await executeShopeeNativeDiscoveryV5({ dryRun: false, scenario });
      return discovered.categories.flatMap((category) => category.products)
        .map((product) => normalizeShopeeCandidate(product, requestedAt));
    },
    loadDeferred: loadDeferredDiscoveryIngestions,
    loadHistory: loadRecentDiscoveryHistory,
    persist: persistDiscoveryIngestionV1,
    prepareCandidate: (product, marketplace) => prepareDiscoveryCandidate(marketplace, product),
    qualityShadow: createQualityShadowRunner(),
    qualityAdmission: createQualityAdmissionRunner(),
    persistV2Metadata: persistDiscoveryV2Metadata,
    copyQueueOptions: { maxTotal: 11, maxPerMarketplace: 5, maxPerCategory: 3 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
  });
  for (const summary of result.marketplaces || []) {
    console.log(`[Shopee V5 Recording] ${summary.marketplace}: ${summary.discovered} descobertos, ${summary.persisted} persistidos, duplicados=${summary.duplicatesRejected}, rejeitados=${summary.rejected}`);
  }
  console.log(`[Shopee V5 Recording] ciclo=${correlationId} estado=${result.finalState} ofertas=${result.offerIds.length}`);
  return result;
}

async function runMultiMarketplaceScenarioRecording(scenarioId) {
  const scenarioConfig = require('./amazon-scenario-config.cjs').SCENARIOS;
  const scenario = scenarioConfig[scenarioId];
  if (!scenario) throw new Error(`Cenário não encontrado: ${scenarioId}`);
  const correlationId = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const mlToken = await refreshMercadoLivreAccessToken({ persist: true });
  return runDiscoveryOnlyCycle({
    tenantId: ADMIN_USER_ID,
    correlationId,
    requestedAt,
    discover: async (marketplace) => {
      if (marketplace === 'Shopee') {
        const result = await executeShopeeNativeDiscoveryV5({ dryRun: false, scenario: scenarioId });
        return result.categories.flatMap((category) => category.products).map((product) => normalizeShopeeCandidate(product, requestedAt));
      }
      if (marketplace === 'Amazon') {
        const result = await runAmazonScenarioDryRun({ scenario, minDelayMs: 1200, retryDelayMs: 4000, maxRetries: 1 });
        return result.products.map((product) => normalizeAmazonCandidate(product, requestedAt));
      }
      // Buscar acima do limite de publicação cria margem para duplicatas,
      // filtros de qualidade e caps da fila (10 por marketplace/categoria).
      const result = await runMercadoLivreOfficialIntentCoverage({ accessToken: mlToken, keywords: scenario.keywords, maxPerIntent: 20, delayMs: 300 });
      return result.products.map((product) => normalizeMercadoLivreCandidate({ ...product, discovered_at: requestedAt }));
    },
    loadDeferred: loadDeferredDiscoveryIngestions,
    loadHistory: loadRecentDiscoveryHistory,
    persist: persistDiscoveryIngestionV1,
    prepareCandidate: (product, marketplace) => prepareDiscoveryCandidate(marketplace, product),
    qualityShadow: createQualityShadowRunner(),
    qualityAdmission: createQualityAdmissionRunner(),
    persistV2Metadata: persistDiscoveryV2Metadata,
    copyQueueOptions: { maxTotal: 11, maxPerMarketplace: 5, maxPerCategory: 3 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
  });
}

if (require.main === module && process.env.ORACLE_SCRAPER_DISABLE_AUTORUN !== '1') {
  if (process.argv.includes('--shopee-native-top20-dry-run')) {
    executeShopeeNativeDiscoveryV5({ dryRun: true, scenario: CLI_SCENARIO_ID }).catch((error) => {
      console.error('[Shopee V5 Dry-Run] ' + error.message);
      process.exitCode = 1;
    });
  } else if (process.argv.includes('--shopee-native-top20-record')) {
    runShopeeScenarioRecording(CLI_SCENARIO_ID).catch((error) => {
      console.error('[Shopee V5 Recording] ' + error.message);
      process.exitCode = 1;
    });
  } else if (process.argv.includes('--multi-marketplace-scenario-record')) {
    runMultiMarketplaceScenarioRecording(CLI_SCENARIO_ID).then((result) => {
      for (const summary of result.marketplaces || []) console.log(`[Multi V5] ${summary.marketplace}: ${summary.discovered} descobertos, ${summary.persisted} persistidos, duplicados=${summary.duplicatesRejected}, rejeitados=${summary.rejected}`);
      console.log(`[Multi V5] ciclo=${result.correlationId} estado=${result.finalState} ofertas=${result.offerIds.length}`);
    }).catch((error) => {
      console.error('[Multi V5 Recording] ' + error.message);
      process.exitCode = 1;
    });
  } else if (process.argv.includes('--refresh-shopee-native-catalog')) {
    refreshShopeeNativeCatalog().catch((error) => {
      console.error('[Shopee V5 Catalog] ' + error.message);
      process.exitCode = 1;
    });
  } else if (process.argv.includes('--mercadolivre-official-intents-dry-run') || process.argv.includes('--mercadolivre-native-top20-dry-run')) {
    runMercadoLivreOfficialDryRun().catch((error) => {
      console.error('[Mercado Livre V5 Dry-Run] ' + error.message);
      process.exitCode = 1;
    });
  } else {
    runScrapingCycle().catch((error) => console.error('[Oracle Discovery-Only V5] ' + error.message));
    cron.schedule(CRON_SCHEDULE, () => runScrapingCycle().catch((error) => {
      console.error('[Oracle Discovery-Only V5] ' + error.message);
    }), {
      name: 'oracle-worker-discovery-v5',
      timezone: 'America/Sao_Paulo',
      noOverlap: true,
    });
  }
}

module.exports = {
  CRON_SCHEDULE,
  calculateScoreV1,
  executeShopeeNativeDiscoveryV5,
  fetchAmazonHtmlViaScrapedo,
  fetchMercadoLivreViaScrapedo: fetchAmazonHtmlViaScrapedo,
  notifyWorkPendingToOfficialAI,
  persistDiscoveryIngestionV1,
  resolveOfficialAITriggerEndpoint,
  refreshShopeeNativeCatalog,
  lookupShopeeAffiliateProduct,
  runMercadoLivreOfficialDryRun,
  runShopeeScenarioRecording,
  runMultiMarketplaceScenarioRecording,
  runManualMarketplaceScenarioRecording,
  runScrapingCycle,
  scrapeStore,
  generateMLAffiliateLinkWithId,
  processMonetization,
  buildAffiliateLinkRows,
  createQualityAdmissionRunner,
  mercadoLivreIdentityKey,
  isEquivalentMercadoLivreProduct,
};
