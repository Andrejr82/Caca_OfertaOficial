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

function parseScenarioArg(argv = process.argv) {
  const equalsArg = argv.find((arg) => String(arg).startsWith('--scenario='));
  if (equalsArg) return String(equalsArg).slice('--scenario='.length).trim() || null;
  const scenarioArgIndex = argv.indexOf('--scenario');
  return scenarioArgIndex !== -1 ? String(argv[scenarioArgIndex + 1] || '').trim() || null : null;
}

const CLI_SCENARIO_ID = parseScenarioArg();

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
const { classifyCandidate } = require('./classification-coverage.cjs');
const { FINAL_STATE, MARKETPLACES, runDiscoveryOnlyCycle } = require('./oracle-worker-discovery-only.cjs');
const { attachDiscoveryFunnelMeta, normalizeRpcOutcome, readDiscoveryFunnelMeta } = require('./discovery-funnel-contract.cjs');
const { createDiscoveryScenarioRuntimeContract } = require('./scenario-runtime-contract.cjs');
const { withTimeout, runWithWatchdog, createStageLogger } = require('./oracle-resilience.cjs');
const { getMarketplaceScenarioContract, matchesMarketplaceContract } = require('./marketplace-scenario-contracts.cjs');
const { assertEditorialScheduleValid } = require('./editorial-scenario-config.cjs');
const { runShopeeOpenApiV1OfficialForScenario } = require('./shopee-openapi-v1-adapter.cjs');
const {
  getControlledPersistDecision,
  buildControlledPersistIngestions,
} = require('./shopee-openapi-v1-controlled-persist.cjs');
const { isFirstDiscoveryQualityActive } = require('./first-discovery-flags.cjs');
const { resolveNichePlanFromLegacyScenario } = require('./commercial-niche-runtime-adapter.cjs');

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
// Executa descoberta nos 7 horários canônicos dos nichos editoriais ativos (06h, 08h, 10h, 12h, 14h, 16h, 18h).
// A fila de cupons das 22h permanece manual e não dispara busca de produtos.
const CRON_SCHEDULE = '0 6,8,10,12,14,16,18 * * *';
const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '';
const SHOPEE_APP_SECRET = process.env.SHOPEE_APP_SECRET || '';
const SHOPEE_OPENAPI_REQUEST_TIMEOUT_MS = 15_000;
const SHOPEE_OPENAPI_MAX_RETRIES = 1;
const SHOPEE_OPENAPI_STAGE_TIMEOUT_MS = 90_000;

function selectOracleReleaseId({ gitHead = '', env = process.env, releaseData = {} } = {}) {
  return String(gitHead || '').trim()
    || String(env.ORACLE_RELEASE_ID || '').trim()
    || String(releaseData.release_id || releaseData.commit || '').trim()
    || 'unknown';
}

function getActiveMarketplaceScenario(marketplace = 'Shopee') {
  const routed = CLI_SCENARIO_ID
    ? (MARKETPLACE_SCENARIOS[CLI_SCENARIO_ID] || SHOPEE_SCENARIOS[CLI_SCENARIO_ID])
    : getCycleScenario(getSaoPauloHour(), 1);
  const scenarioId = routed?.scenarioId || routed?.id;
  const contract = getMarketplaceScenarioContract(scenarioId, marketplace) || routed || null;
  if (isFirstDiscoveryQualityActive() && contract) {
    const nichePlan = resolveNichePlanFromLegacyScenario(scenarioId, [marketplace])?.plans?.[marketplace];
    if (nichePlan?.firstDiscovery?.intents?.length) {
      const queries = nichePlan.firstDiscovery.intents.flatMap((i) => i.queries);
      return {
        ...contract,
        keywords: queries,
        terms: queries,
        browseNodeIds: marketplace === 'Amazon' ? (nichePlan.contract?.amazonBrowseNodes || contract.browseNodeIds) : contract.browseNodeIds,
        apiCategories: marketplace === 'Shopee' ? (nichePlan.contract?.shopeeApiCategories || contract.apiCategories) : contract.apiCategories,
      };
    }
  }
  return contract;
}

function createScenarioRuntimeResolver({ plannedScenarioId = null, discoveryHour = getSaoPauloHour(), schedulerSource = 'oracle-node-cron' } = {}) {
  return (marketplace, products = [], discoveryMeta = {}, scenario = null) => {
    const resolvedScenarioId = typeof scenario === 'string'
      ? scenario
      : scenario?.scenarioId || scenario?.id || discoveryMeta?.scenario || plannedScenarioId;
    return createDiscoveryScenarioRuntimeContract({
      discoveryHour,
      schedulerSource,
      plannedScenarioId,
      resolvedScenarioId,
      marketplace,
      marketplaceContract: getMarketplaceScenarioContract(resolvedScenarioId, marketplace),
      coverageStatus: discoveryMeta?.coverageStatus || 'pending',
    });
  };
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

async function callShopeeAffiliateApi(payload, { timeoutMs = SHOPEE_OPENAPI_REQUEST_TIMEOUT_MS, maxRetries = SHOPEE_OPENAPI_MAX_RETRIES, signal, appId = SHOPEE_APP_ID, appSecret = SHOPEE_APP_SECRET } = {}) {
  if (!appId || !appSecret) return null;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) {
      const error = new Error('Shopee OpenAPI abortada pelo timeout da etapa');
      error.code = 'SHOPEE_OPENAPI_ABORTED';
      throw error;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash('sha256')
      .update(appId + timestamp + payload + appSecret)
      .digest('hex');
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort(signal?.reason);
    const timeoutId = setTimeout(() => attemptController.abort(), timeoutMs);
    signal?.addEventListener('abort', abortAttempt, { once: true });
    try {
      const response = await axios.post(SHOPEE_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'SHA256 Credential=' + appId + ', Timestamp=' + timestamp + ', Signature=' + signature,
        },
        timeout: timeoutMs,
        signal: attemptController.signal,
        validateStatus: () => true,
      });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === maxRetries) return response;
      const retryAfter = Number(response.headers?.['retry-after'] ?? 0);
      await new Promise((resolve, reject) => {
        const retryTimer = setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2_000) : 500);
        const abortRetry = () => { clearTimeout(retryTimer); reject(Object.assign(new Error('Shopee retry abortado pelo timeout da etapa'), { code: 'SHOPEE_OPENAPI_ABORTED' })); };
        signal?.addEventListener('abort', abortRetry, { once: true });
      });
    } catch (error) {
      lastError = error;
      if (signal?.aborted || attempt >= maxRetries) throw error;
      await new Promise((resolve, reject) => {
        const retryTimer = setTimeout(resolve, 500);
        const abortRetry = () => { clearTimeout(retryTimer); reject(Object.assign(new Error('Shopee retry abortado pelo timeout da etapa'), { code: 'SHOPEE_OPENAPI_ABORTED' })); };
        signal?.addEventListener('abort', abortRetry, { once: true });
      });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortAttempt);
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

  const queryKeyword = 'query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId shopType ratingStar sales commissionRate sellerCommissionRate priceDiscountRate } } }';
  const queryItemId = `{ productOfferV2(itemId: ${normalizedItemId}, page: 1, limit: 20) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink shopId shopType ratingStar sales commissionRate sellerCommissionRate priceDiscountRate } } }`;

  const normalizedKeyword = String(keyword || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const strategies = [
    { type: 'itemId', payload: JSON.stringify({ query: queryItemId }) },
    { type: 'keyword', keyword: `https://shopee.com.br/product/${normalizedShopId}/${normalizedItemId}` },
    { type: 'keyword', keyword: normalizedItemId },
    ...(normalizedKeyword ? [{ type: 'keyword', keyword: normalizedKeyword }] : []),
  ];

  for (const strategy of strategies) {
    let payload;
    if (strategy.type === 'itemId') {
      payload = strategy.payload;
    } else {
      payload = JSON.stringify({
        operationName: 'ShopeePromotionOffers',
        query: queryKeyword,
        variables: { keyword: strategy.keyword, productCatId: null, page: 1, limit: normalizedKeyword === strategy.keyword ? 50 : 20, sortType: 2, isAMSOffer: true },
      });
    }

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
  if (process.env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED === 'true') {
    return {
      decision: 'blocked_v1_enabled',
      engine: 'shopee_openapi_v1',
      categories: [],
      executedAt: new Date().toISOString(),
      aiCalled: false,
      databaseChanged: false,
      postsCreated: 0,
    };
  }
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

async function runAmazonScenarioDiscovery(scenario, options = {}) {
  if (scenario?.discoveryMode === 'manual_only') {
    return {
      pipeline: 'Amazon Scenario Discovery V5',
      dry_run: true,
      scenario: scenario.label,
      products: [],
      raw_products: 0,
      duplicates: 0,
      queries: [],
      split_scenarios: [],
      queryTelemetry: [],
      telemetryTotals: { attempted: 0, succeeded: 0, failed: 0, empty: 0 },
      sourceStatus: 'empty',
      telemetry: {
        contract_version: 'pmav5.amazon-query-telemetry/v1',
        correlation_id: options.correlationId || null,
        scenario: scenario.id || scenario.scenarioId || scenario.label || null,
        release_id: options.releaseId || 'unknown',
        schedulerSource: options.schedulerSource || 'unknown',
        fetch_path: 'global.fetch',
        provider: 'amazon_public_search',
        config: { keywords: [], browse_node_ids: [], max_retries: 0, retry_delay_ms: 0, inter_query_delay_ms: 0, max_per_keyword: 0 },
        queries: [],
        total_queries_attempted: 0,
        total_queries_succeeded: 0,
        total_queries_failed: 0,
        total_queries_empty: 0,
      },
    };
  }
  const parts = Array.isArray(scenario?.splitInto) && scenario.splitInto.length
    ? scenario.splitInto.map((id) => getMarketplaceScenarioContract(id, 'Amazon')).filter(Boolean)
    : [scenario];
  const results = [];
  for (const part of parts) {
    const result = await runAmazonScenarioDryRun({ scenario: part, ...options });
    results.push({ part, result });
  }
  const seen = new Set();
  const products = results.flatMap(({ part, result }) => result.products.map((product) => ({ ...product, intent: part.scenarioId || part.id || scenario?.scenarioId || scenario?.id || null }))).filter((product) => {
    const key = String(product.asin || product.canonical_url || product.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const telemetryParts = results.map((entry) => entry.result.telemetry).filter(Boolean);
  const queryTelemetry = telemetryParts.flatMap((part) => part.queries || []);
  const telemetryTotals = queryTelemetry.reduce((totals, query) => {
    totals.attempted += 1;
    if (query.status === 'ok') totals.succeeded += 1;
    else if (['http_error', 'transport_error'].includes(query.status)) totals.failed += 1;
    else totals.empty += 1;
    return totals;
  }, { attempted: 0, succeeded: 0, failed: 0, empty: 0 });
  const sourceStatus = telemetryTotals.failed > 0
    ? telemetryTotals.succeeded > 0 || telemetryTotals.empty > 0 ? 'partial' : 'failed'
    : telemetryTotals.succeeded > 0 ? 'completed'
      : queryTelemetry.length > 0 && queryTelemetry.every((query) => query.status === 'parse_empty') ? 'parse_zero' : 'empty';
  const telemetry = {
    ...(telemetryParts[0] || {}),
    queries: queryTelemetry,
    total_queries_attempted: telemetryTotals.attempted,
    total_queries_succeeded: telemetryTotals.succeeded,
    total_queries_failed: telemetryTotals.failed,
    total_queries_empty: telemetryTotals.empty,
    source_status: sourceStatus,
  };
  return {
    ...(results[0]?.result || { pipeline: 'Amazon Scenario Discovery V5', dry_run: true, scenario: scenario?.label }),
    products,
    raw_products: results.reduce((total, entry) => total + Number(entry.result.raw_products || 0), 0),
    duplicates: results.reduce((total, entry) => total + Number(entry.result.duplicates || 0), 0) + results.reduce((total, entry) => total + entry.result.products.length, 0) - products.length,
    queries: results.flatMap((entry) => entry.result.queries || []),
    split_scenarios: parts.map((part) => part.scenarioId || part.id),
    queryTelemetry,
    telemetryTotals,
    sourceStatus,
    telemetry,
  };
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

function normalizeShopeeCandidate(product, discoveredAt, intent = null) {
  return {
    intent: product.intent || intent,
    sourceItemId: product.itemId,
    sourceUrl: product.offerLink || product.productLink,
    title: product.productName,
    imageUrl: product.imageUrl,
    currentPrice: product.price,
    originalPrice: product.originalPrice,
    category: { id: product.productCatId, name: product.category, source: 'Shopee Affiliate Open API' },
    is_official_shop: product.isOfficialShop,
    shop_type_tags: product.shopTypeTags,
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

function normalizeMercadoLivreCandidate(product, intent = null) {
  const currentPrice = Number(product.current_price);
  const originalPrice = Number(product.old_price) > currentPrice ? Number(product.old_price) : null;
  const score = calculateScoreV1({
    current_price: currentPrice,
    old_price: originalPrice,
    rating: null,
  });
  return {
    intent: product.intent || intent,
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

function normalizeAmazonCandidate(product, discoveredAt, intent = null) {
  // product.marketplaceMetrics é gerado por extractProductCommercials no parser.
  // Antes desta correção, prime/coupon/promotion/rating/reviewCount ficavam
  // apenas no rawPayload e nunca chegavam ao qualityGate nem ao scoreCandidate.
  const pm = product.marketplaceMetrics || {};
  return {
    intent: product.intent || intent,
    sourceItemId: product.asin,
    sourceUrl: product.canonical_url,
    title: product.title,
    imageUrl: product.image,
    currentPrice: product.price,
    originalPrice: product.original_price,
    category: {
      id: product.node_id,
      name: product.subcategory,
      source: 'Amazon Public Search / Browse Node',
      browseNodeId: product.node_id,
      parentBrowseNodeId: product.parent_node_id,
      evidenceUrl: product.source_url,
    },
    marketplaceMetrics: {
      sourcePosition: product.rank,
      asin: product.asin,
      nodeId: product.node_id,
      parentNodeId: product.parent_node_id,
      browseNodeId: product.node_id,
      browseNodeEvidenceUrl: product.source_url,
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
  const sourceMeta = readDiscoveryFunnelMeta(products);
  if (!Array.isArray(products) || products.length === 0) {
    return attachDiscoveryFunnelMeta([], { ...sourceMeta, afterNovelty: 0 });
  }
  
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
    return attachDiscoveryFunnelMeta(filtered, {
      ...sourceMeta,
      afterNovelty: filtered.length,
      knownIdentityRejected: products.length - filtered.length,
    });
  } catch (err) {
    if (stageLogger) stageLogger.error('filterNovelNormalizedProducts', stageStartedAt, err.message);
    throw err;
  }
}

async function persistDiscoveryV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products, queue, funnel = null }, stageLogger = null) {
  if (process.env.NO_DB_WRITE === '1' || process.env.DRY_RUN === '1') {
    return { skipped: true, reason: 'write_blocked_by_runtime_flags', supabaseWrites: 0 };
  }
  let stageStartedAt;
  if (stageLogger) stageStartedAt = stageLogger.start('persistDiscoveryV2Metadata', products.length);

  try {
    const supabase = getSupabase();
    
    const insertRunPromise = supabase.from('discovery_runs').insert({
      user_id: tenantId, marketplace, scenario: queue?.limits ? 'oracle-worker-v2' : 'oracle-worker', started_at: requestedAt, finished_at: new Date().toISOString()
    }).select('id').single();
    
    const { data: run, error: runError } = await withTimeout(insertRunPromise, Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000), `persistV2Metadata_insertRun`);
    if (runError || !run) throw new Error(`Discovery V2 run failed: ${runError?.message || 'run not created'}`);
    if (funnel && run.id) {
      const { error: metadataError } = await withTimeout(
        supabase.from('discovery_runs').update({ metadata: { contract: funnel.contractVersion, funnel, scenarioRuntime: funnel.scenarioRuntime || null } }).eq('id', run.id),
        Number(process.env.EXTERNAL_REQUEST_TIMEOUT_MS || 30000),
        `persistV2Metadata_updateFunnel`
      );
      if (metadataError) {
        console.warn(`[Discovery Funnel V1] metadata não persistido marketplace=${marketplace}: ${metadataError.message}`);
      }
    }
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
      const classification = classifyCandidate(product, marketplace);
      const productType = classification.productType;
      const groupKey = discoveryGroupKey(product, productType);
      const groupKind = groupKey.includes('||') ? 'family' : 'exact';
      const titleQuality = validateProductTitle(product.title);
      const intelligence = { score: Number(product.deterministicScore || 0), marketplace, queueSelected: Boolean(queue?.selected?.some((entry) => entry.sourceItemId === product.sourceItemId)), reasons: [] };
      const classificationStatus = !titleQuality.valid || classification.status !== 'classified' ? 'review_required' : 'classified';
      
      const p1 = supabase.from('offer_classifications').upsert({ user_id: tenantId, discovery_item_id: discoveryItemId, classifier_version: `oracle-worker-v4-${String(marketplace).toLowerCase().replace(/\s+/g, '-')}`, classification_status: classificationStatus, product_type: productType, product_role: 'main_product', attributes: { marketplace_intelligence: intelligence, classification: classification.evidence || {}, quality_gate: { status: titleQuality.valid ? 'passed' : 'review_required', reason: titleQuality.reason } }, rule_trace: [`correlation:${correlationId}`, `requested_at:${requestedAt}`, `classifier:${classification.source}`, ...(titleQuality.valid ? [] : ['quality_gate:INVALID_PRODUCT_TITLE'])] }, { onConflict: 'discovery_item_id' });
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

async function scrapeStore(store, stageLogger = null, runtimeContext = {}) {
  const discoveredAt = new Date().toISOString();
  if (store === 'Shopee') {
    // Defensive fallback only: the official cycle bypasses scrapeStore for
    // Shopee and invokes the OpenAPI V1 authority directly. V5 stays disabled.
    return [];
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

    const exploratorySamples = result.mercadolivreDomainCategorySearchV1?.exploratorySamples;
    if (stageLogger && exploratorySamples && Object.keys(exploratorySamples).length > 0) {
      stageLogger.info('ML_exploratory_samples', intentStageStartedAt, JSON.stringify(exploratorySamples));
    }

    const normalized = result.products
      .filter((product) => ![product.item_id, product.product_id, product.product_url]
        .filter(Boolean)
        .some((key) => known.has(String(key))))
      .map((product) => normalizeMercadoLivreCandidate({
      ...product,
      discovered_at: result.generated_at,
      source_categories: [{ category_id: product.category_id, category_name: product.category_name, source_position: product.source_position }]
      }, scenario?.scenarioId || scenario?.id));

    const scenarioRelevant = normalized.filter((product) => matchesScenarioProduct(scenario, product.title));
    const countsByIntent = new Map();
    for (const query of result.queries || []) {
      countsByIntent.set(query.intent, {
        intent: query.intent,
        extracted: Number(query.raw_products || 0),
        unique: Number(query.products || 0),
        novel: 0,
        scenario_relevant: 0,
        source_errors: Number(query.source_errors || 0),
        status: query.status || null,
      });
    }
    for (const product of normalized) {
      const row = countsByIntent.get(product.intent);
      if (row) row.novel += 1;
    }
    for (const product of scenarioRelevant) {
      const row = countsByIntent.get(product.intent);
      if (row) row.scenario_relevant += 1;
    }
    if (stageLogger) stageLogger.info('ML_intent_matrix', intentStageStartedAt, JSON.stringify([...countsByIntent.values()]));
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
      ? await runAmazonScenarioDiscovery(scenario, { minDelayMs: 1200, retryDelayMs: 4000, maxRetries: 1, ...runtimeContext })
      : await runAmazonNativeTop20({
        fetchImpl: global.fetch,
        knownAsins,
        maxCategories: 10,
        maxSubcategoriesPerCategory: 5,
      });
      
    if (stageLogger) stageLogger.end('Amazon_Top20_extraction', amazonStageStartedAt, result.products.length);
    
    const normalized = result.products
      .filter((product) => Number(product.price) > 0 && /^https:\/\//i.test(product.image || ''))
      .map((product) => normalizeAmazonCandidate(product, discoveredAt, scenario?.scenarioId || scenario?.id))
      .filter((product) => matchesScenarioProduct(scenario, product.title));
    attachDiscoveryFunnelMeta(normalized, {
      sourceStatus: result.sourceStatus,
      extracted: result.raw_products,
      afterParse: result.queryTelemetry.reduce((total, query) => total + Number(query.parser_count || 0), 0),
      amazonTelemetry: result.telemetry,
    });
    return filterNovelNormalizedProducts(store, normalized, stageLogger);
  }
  throw new Error('Marketplace não autorizado no Oracle Worker: ' + store);
}

async function selectByIdsInChunks(table, columns, ids, { chunkSize = 100, idColumn = 'id' } = {}) {
  const uniqueIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  const rows = [];
  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    const { data, error } = await getSupabase().from(table).select(columns).in(idColumn, chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function persistDiscoveryIngestionV1(ingestions, marketplace, targetStatus = FINAL_STATE, stageLogger = null, persistenceContext = null) {
  let stageStartedAt;
  if (stageLogger) stageStartedAt = stageLogger.start('persistDiscoveryIngestionV1', ingestions.length);

  try {
    if (process.env.NO_DB_WRITE === '1' || process.env.DRY_RUN === '1') {
      if (stageLogger) stageLogger.end('persistDiscoveryIngestionV1', stageStartedAt, 0);
      return { accepted: 0, inserted: 0, updated: 0, failed: 0, offerIds: [], state: targetStatus, skipped: true, reason: 'write_blocked_by_runtime_flags', supabaseWrites: 0 };
    }
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
      strategy_version: candidate.strategyVersion ?? null,
      score_breakdown: candidate.scoreBreakdown ?? null,
      determining_reasons: candidate.determiningReasons ?? null,
    };
    if (persistenceContext) {
      explainability = {
        ...explainability,
        engine: persistenceContext.engine,
        mode: persistenceContext.mode,
        scenarioId: persistenceContext.scenarioId,
        correlation_id: correlationId,
        payload_v1: candidate.persistenceMetadata?.payload_v1 || rawPayload,
      };
    }

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
    let affiliateLinkWrites = 0;
    if (offerIds.length > 0) {
      let offersData;
      try {
        offersData = await selectByIdsInChunks('offers', 'id, user_id, original_url, explainability', offerIds);
      } catch (selectErr) {
        throw new Error(`Falha ao consultar ofertas persistidas: ${selectErr.message}`);
      }
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
          affiliateLinkWrites = linksToInsert.length;
          const { error: linksError } = await getSupabase()
            .from('affiliate_links')
            .upsert(linksToInsert, { onConflict: 'offer_id, channel' });
          if (linksError) throw new Error(`Falha ao persistir affiliate_links: ${linksError.message}`);

          let persistedLinks;
          let verifyError;
          try {
            persistedLinks = await selectByIdsInChunks('affiliate_links', 'offer_id, channel, tracked_url, sub_id', offersData.map((offer) => offer.id), { idColumn: 'offer_id' });
          } catch (error) {
            verifyError = error;
          }
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
    
    const resolvedOfferIds = await resolvePersistedOfferIds({
      marketplace,
      rows,
      rpcOfferIds: Array.isArray(data.offer_ids) ? data.offer_ids : [],
    });
    const rpcOutcome = normalizeRpcOutcome({
      accepted: data.inserted + data.updated,
      inserted: data.inserted,
      updated: data.updated,
      ignored: data.ignored,
      failed: data.failed,
      offerIds: resolvedOfferIds,
      state: FINAL_STATE,
    });
    if (rpcOutcome.partialSuccess) {
      console.warn(`[Discovery Funnel V1] RPC parcial marketplace=${marketplace} failed=${rpcOutcome.failed}`);
    }
    return {
      ...rpcOutcome,
      state: rpcOutcome.rpcState === 'partial_success' ? 'partial_success' : FINAL_STATE,
      writeAudit: {
        supabaseWrites: Number(data.inserted || 0) + affiliateLinkWrites,
        offersWrites: Number(data.inserted || 0),
        postsWrites: 0,
        affiliateLinkWrites,
        publishCalls: 0,
        oracleCalls: 0,
      },
    };
  } catch (err) {
    if (stageLogger) stageLogger.error('persistDiscoveryIngestionV1', stageStartedAt, err.message);
    throw err;
  }
}

async function resolvePersistedOfferIds({ marketplace, rows, rpcOfferIds = [], supabase = getSupabase() }) {
  const ids = [...new Set((Array.isArray(rpcOfferIds) ? rpcOfferIds : []).filter(Boolean).map(String))];
  const identityColumns = marketplace === 'Shopee'
    ? ['shopee_item_id']
    : marketplace === 'Amazon'
      ? ['product_id']
      : marketplace === 'Mercado Livre'
        ? ['item_id', 'product_id']
        : [];

  for (const row of Array.isArray(rows) ? rows : []) {
    for (const column of identityColumns) {
      const identity = row?.[column];
      if (!identity) continue;
      const query = await supabase
        .from('offers')
        .select('id')
        .eq('user_id', row.user_id)
        .eq('platform', marketplace)
        .eq(column, identity)
        .maybeSingle();
      if (query.error) throw new Error(`Falha ao recuperar offer persistida (${marketplace}/${column}): ${query.error.message}`);
      if (query.data?.id && !ids.includes(String(query.data.id))) ids.push(String(query.data.id));
      if (query.data?.id) break;
    }
  }
  return ids;
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
          noPublish: process.env.NO_PUBLISH === '1',
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
    ['casa_e_cozinha', 'casa_cozinha_editorial'], ['organizacao', 'organizacao_editorial'],
    ['ferramentas', 'ferramentas_editorial'], ['informatica', 'informatica_editorial'],
    ['celulares', 'celulares_editorial'], ['beleza', 'beleza_editorial'],
    ['moda', 'moda_editorial'], ['esporte', 'esporte_editorial'],
    ['petshop', 'pet_editorial'], ['tv_e_audio', 'tv_audio_editorial'],
    ['eletrodomesticos', 'eletrodomesticos_editorial'], ['moveis', 'moveis_editorial'],
    ['grandes_ofertas', 'grandes_ofertas_editorial'], ['cupons', 'cupons_aprovados_editorial'],
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
    shopeeDiscovery: createShopeeOpenApiV1OfficialDiscovery(),
    persistShopee: createShopeeOpenApiV1OfficialPersistRunner(),
    discover: async (marketplace) => {
      const marketplaceScenario = getMarketplaceScenarioContract(scenarioId || scenario.scenarioId || scenario.id, marketplace) || scenario;
      if (marketplace === 'Shopee') {
        return [];
      }
      if (marketplace === 'Amazon') {
        const discovered = await runAmazonScenarioDiscovery(marketplaceScenario, { minDelayMs: 1200, retryDelayMs: 4000, maxRetries: 1, correlationId, schedulerSource: 'manual-scenario-recording', releaseId: process.env.ORACLE_RELEASE_ID || 'unknown' });
        const normalized = discovered.products.map((product) => normalizeAmazonCandidate(product, requestedAt));
        attachDiscoveryFunnelMeta(normalized, {
          sourceStatus: discovered.sourceStatus,
          extracted: discovered.raw_products,
          afterParse: discovered.queryTelemetry.reduce((total, query) => total + Number(query.parser_count || 0), 0),
          amazonTelemetry: discovered.telemetry,
        });
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
    copyQueueOptions: { maxTotal: Math.min(30, perMarketplace * selectedMarketplaces.length), maxPerMarketplace: perMarketplace, maxPerCategory: 10 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
    scenarioResolver: () => scenarioId || scenario?.scenarioId || scenario?.id || 'unknown',
    scenarioRuntimeResolver: createScenarioRuntimeResolver({
      plannedScenarioId: scenarioId || scenario?.scenarioId || scenario?.id || null,
      discoveryHour: getSaoPauloHour(),
      schedulerSource: 'manual-scenario-recording',
    }),
  });
  return { ...result, category: category || 'Geral', scenarioId: scenarioId || null, requestedMarketplaces: selectedMarketplaces, limit: perMarketplace };
}

function createShopeeOpenApiV1OfficialDiscovery({ env = process.env, request } = {}) {
  return async function runShopeeOpenApiV1OfficialDiscovery(input = {}) {
    const scenarioId = String(input.scenario || 'unknown');
    const controller = new AbortController();
    const timeoutMs = Number(env.SHOPEE_OPENAPI_STAGE_TIMEOUT_MS || SHOPEE_OPENAPI_STAGE_TIMEOUT_MS);
    let rejectStageTimeout;
    const stageTimeout = new Promise((_, reject) => { rejectStageTimeout = reject; });
    const timeoutId = setTimeout(() => {
      controller.abort();
      rejectStageTimeout(Object.assign(new Error(`Timeout Shopee OpenAPI de ${timeoutMs}ms excedido`), { code: 'SHOPEE_OPENAPI_STAGE_TIMEOUT' }));
    }, timeoutMs);
    const boundedRequest = (operationName, query, variables = {}, options = {}) => {
      const requestSignal = options.signal || controller.signal;
      if (requestSignal.aborted) return Promise.resolve({ status: 499, data: { errors: [{ message: 'aborted' }] } });
      return request
        ? request(operationName, query, variables, { signal: requestSignal, timeoutMs: SHOPEE_OPENAPI_REQUEST_TIMEOUT_MS, maxRetries: SHOPEE_OPENAPI_MAX_RETRIES })
        : callShopeeAffiliateApi(JSON.stringify({ operationName, query, variables }), { signal: requestSignal });
    };
    try {
      const response = await Promise.race([runShopeeOpenApiV1OfficialForScenario(scenarioId, {
        env,
        request: boundedRequest,
        signal: controller.signal,
        includeDelta: false,
        includeAuxiliary: false,
      }), stageTimeout]);
      if (!response?.enabled) {
        return { engine: 'shopee_openapi_v1', mode: 'official', scenarioId, decision: 'blocked', top: [], topCount: 0, metrics: {}, error: response?.reason || 'v1_disabled', writeAudit: response?.writeAudit };
      }
      const scenarioResult = response.result?.scenarios?.[scenarioId] || {};
      const calls = response.result?.queryEvidence?.calls || [];
      const sourceErrors = calls.filter((call) => call.stopReason === 'source_error' || call.stopReason === 'source_timeout' || Number(call.status || 0) >= 400);
      const metrics = scenarioResult.metrics || {};
      const decision = sourceErrors.length > 0 && Number(metrics.raw || 0) === 0 ? 'failed' : 'official';
      const rejectionReasons = mergeShopeeOpenApiV1RejectionReasons({ metrics, scenarioResult });
      return {
        engine: 'shopee_openapi_v1', mode: 'official', scenarioId, decision,
        top: Array.isArray(scenarioResult.top) ? scenarioResult.top : [], topCount: Number(scenarioResult.top?.length || 0),
        rejectedCount: Number(scenarioResult.rejected?.length || 0), metrics,
        rejectionReasons, queryEvidence: response.result?.queryEvidence || {},
        ...(sourceErrors.length > 0 ? { error: `Shopee OpenAPI returned ${sourceErrors.length} source error(s)` } : {}),
        writeAudit: response.writeAudit,
      };
    } catch (error) {
      const timedOut = controller.signal.aborted || error?.code === 'SHOPEE_OPENAPI_ABORTED';
      console.error(`[Shopee OpenAPI V1] scenario=${scenarioId} status=${timedOut ? 'timeout' : 'failed'} error=${error?.message || String(error)}`);
      return {
        engine: 'shopee_openapi_v1', mode: 'official', scenarioId,
        topCount: 0, rejectedCount: 0, families: 0, shops: 0, imageLinkRate: 0, scoreAvg: 0,
        decision: timedOut ? 'timeout' : 'failed', top: [],
        writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 },
        error: error?.message || String(error),
      };
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  };
}

function mergeShopeeOpenApiV1RejectionReasons({ metrics = {}, scenarioResult = {} } = {}) {
  return { ...(metrics.rejections || {}), ...(scenarioResult.rejectionReasons || {}) };
}

function createShopeeOpenApiV1OfficialPersistRunner({ persistRunner, stageLogger = null, env = process.env, lookupExistingItemIds } = {}) {
  return async ({ discovery, scenario, tenantId, correlationId, requestedAt, limit }) => {
    const decision = getControlledPersistDecision(scenario, env, { maxCandidates: limit });
    if (!decision.enabled) return { accepted: 0, inserted: 0, updated: 0, failed: 0, state: FINAL_STATE, offerIds: [] };
    const candidatePool = Array.isArray(discovery.top) ? discovery.top : [];
    const itemIds = [...new Set(candidatePool.map((product) => String(product?.itemId || '').trim()).filter((itemId) => /^\d+$/.test(itemId)))];
    let existingItemIds = [];
    if (itemIds.length > 0) {
      if (typeof lookupExistingItemIds === 'function') {
        existingItemIds = await lookupExistingItemIds({ tenantId: tenantId || ADMIN_USER_ID, itemIds });
      } else {
        const { data, error } = await getSupabase()
          .from('offers')
          .select('shopee_item_id')
          .eq('user_id', tenantId || ADMIN_USER_ID)
          .eq('platform', 'Shopee')
          .in('shopee_item_id', itemIds);
        if (error) throw new Error(`Consulta de identidade Shopee falhou: ${error.message}`);
        existingItemIds = (data || []).map((row) => String(row.shopee_item_id));
      }
    }
    const ingestions = buildControlledPersistIngestions(candidatePool, {
      scenarioId: decision.scenarioId,
      tenantId: tenantId || ADMIN_USER_ID,
      correlationId,
      requestedAt,
      existingItemIds,
      maxNewCandidates: decision.maxCandidates,
    });
    const persisted = typeof persistRunner === 'function'
      ? await persistRunner(ingestions, 'Shopee', FINAL_STATE)
      : await persistDiscoveryIngestionV1(ingestions, 'Shopee', FINAL_STATE, stageLogger, {
        engine: 'shopee_openapi_v1', mode: 'controlled-persist', scenarioId: decision.scenarioId,
      });
    if (Number(persisted?.failed || 0) > 0) throw new Error(`Controlled persist RPC failed for ${persisted.failed} candidate(s)`);
    return persisted;
  };
}

async function runScrapingCycleCore() {
  assertEditorialScheduleValid();
  const startedAt = Date.now();
  const correlationId = crypto.randomUUID();
  const stageLogger = createStageLogger(correlationId);
  const discoveryHour = getSaoPauloHour();
  const routedScenario = CLI_SCENARIO_ID
    ? (MARKETPLACE_SCENARIOS[CLI_SCENARIO_ID] || SHOPEE_SCENARIOS[CLI_SCENARIO_ID])
    : null;
  const cycleScenario = routedScenario || getCycleScenario(discoveryHour, 1);
  const plannedScenarioId = cycleScenario?.scenarioId || cycleScenario?.id || null;

  let releaseData = {};
  let deployedAt = '';
  try {
    const fs = require('node:fs');
    releaseData = JSON.parse(fs.readFileSync('.runtime-release.json', 'utf8'));
    deployedAt = releaseData.deployed_at ? ` deployedAt=${releaseData.deployed_at}` : '';
  } catch {}
  let gitHead = '';
  try {
    const { execFileSync } = require('node:child_process');
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {}
  const releaseId = selectOracleReleaseId({ gitHead, env: process.env, releaseData });

  console.log(`[Oracle Boot] release=${releaseId}${deployedAt} amazonMissingCommercialDataPenalty=${process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY || -8} startedAt=${new Date(startedAt).toISOString()}`);

  const shopeeOfficialDiscovery = createShopeeOpenApiV1OfficialDiscovery();
  const result = await runDiscoveryOnlyCycle({
    tenantId: ADMIN_USER_ID,
    correlationId,
    requestedAt: new Date().toISOString(),
    discover: (store) => scrapeStore(store, stageLogger, { correlationId, schedulerSource: 'oracle-node-cron', releaseId }),
    shopeeDiscovery: shopeeOfficialDiscovery,
    persistShopee: createShopeeOpenApiV1OfficialPersistRunner({ stageLogger }),
    loadDeferred: loadDeferredDiscoveryIngestions,
    loadHistory: loadRecentDiscoveryHistory,
    persist: (ingestions, marketplace, targetStatus) => persistDiscoveryIngestionV1(ingestions, marketplace, targetStatus, stageLogger),
    prepareCandidate: (product, marketplace) => prepareDiscoveryCandidate(marketplace, product),
    qualityShadow: createQualityShadowRunner(),
    qualityAdmission: createQualityAdmissionRunner(),
    persistV2Metadata: (args) => persistDiscoveryV2Metadata(args, stageLogger),
    copyQueueOptions: { maxTotal: 30, maxPerMarketplace: 10, maxPerCategory: 10 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
    scenarioResolver: (marketplace) => getActiveMarketplaceScenario(marketplace)?.scenarioId || getActiveMarketplaceScenario(marketplace)?.id || 'unknown',
    scenarioRuntimeResolver: createScenarioRuntimeResolver({ plannedScenarioId, discoveryHour }),
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
      console.log(`[Oracle Funnel V5] ${JSON.stringify({ marketplace: summary.marketplace, funnel: summary.funnel, classificationCoverage: summary.classificationCoverage })}`);
    }
  }
  try {
    const { processPendingTrendRadarRuns } = require('./oracle-trends-radar-runner.cjs');
    await processPendingTrendRadarRuns({ stageLogger });
  } catch (trendsError) {
    console.error(`[Oracle Trends Radar] ${trendsError.message}`);
  }
  console.log('[Oracle Discovery-Only V5] ciclo=' + result.correlationId + ' duração=' + durationSeconds + 's estado=' + result.finalState);
  return result;
}

async function runOracleScraperShopeeShadowLocal({ scenarioId = null, tenantId = ADMIN_USER_ID, request, legacyRunner = executeShopeeNativeDiscoveryV5, runScenario, persistRunner, lookupExistingItemIds, copyQueueOptions = { maxTotal: 0, maxPerMarketplace: 0, maxPerCategory: 0 }, env = process.env, requestedAt = new Date().toISOString() } = {}) {
  const activeScenario = scenarioId || getActiveMarketplaceScenario('Shopee')?.scenarioId || getActiveMarketplaceScenario('Shopee')?.id || 'casa_cozinha_editorial';
  const controlledPersistDecision = getControlledPersistDecision(activeScenario, env, { maxCandidates: copyQueueOptions.maxPerMarketplace });
  const scenario = getMarketplaceScenarioContract(activeScenario, 'Shopee') || getActiveMarketplaceScenario('Shopee');
  const correlationId = crypto.randomUUID();
  let legacyTop = 0;
  let persistCalls = 0;
  let controlledPersistAudit = { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 };
  const shadowRequest = request || (async (operationName, query, variables = {}, requestOptions = {}) => {
    const response = await callShopeeAffiliateApi(JSON.stringify({ operationName, query, variables }), requestOptions);
    return { status: response?.status || 0, data: response?.data || {} };
  });
  const shadowDiscovery = async ({ scenario }) => runShopeeOpenApiV1OfficialForScenario(scenario, {
    env, request: shadowRequest, engine: runScenario, includeDelta: false, includeAuxiliary: false,
  });
  const result = await runDiscoveryOnlyCycle({
    tenantId,
    correlationId,
    requestedAt,
    marketplaces: ['Shopee'],
    discover: async () => [],
    shopeeDiscovery: async (input) => {
      const response = await shadowDiscovery(input);
      const result = response?.result?.scenarios?.[input.scenario] || {};
      return { engine: 'shopee_openapi_v1', mode: 'official', decision: response?.enabled ? 'official' : (response?.reason || 'blocked'), top: result.top || [], metrics: result.metrics || {} };
    },
    persistShopee: controlledPersistDecision.enabled ? async (payload) => {
      persistCalls += 1;
      const persisted = await createShopeeOpenApiV1OfficialPersistRunner({ persistRunner, lookupExistingItemIds, env })(payload);
      controlledPersistAudit = {
        ...controlledPersistAudit,
        ...(persisted?.writeAudit || {}),
        offersWrites: Number(persisted?.inserted || persisted?.accepted || 0),
        supabaseWrites: Number(persisted?.inserted || persisted?.accepted || 0) + Number(persisted?.writeAudit?.affiliateLinkWrites || 0),
        postsWrites: 0,
        publishCalls: 0,
        oracleCalls: 0,
      };
      return persisted;
    } : null,
    loadDeferred: async () => [],
    loadHistory: async () => [],
    persist: async (...args) => {
      persistCalls += 1;
      if (typeof persistRunner === 'function') return persistRunner(...args);
      throw new Error('Persistência bloqueada no Oracle Scraper Shopee shadow local');
    },
    copyQueueOptions,
    scenarioResolver: () => activeScenario,
    scenarioRuntimeResolver: () => ({ scenarioId: activeScenario, mode: 'shadow-local' }),
  });
  const summary = result.marketplaces[0];
  return {
    ...result,
    persistCalls,
    controlledPersist: controlledPersistDecision,
    writeAudit: controlledPersistAudit,
    marketplaces: [{ ...summary, legacyTop, legacySelected: summary.queueSelected, persistCalls }],
  };
}

async function runScrapingCycle() {
  const timeoutMs = Number(process.env.DISCOVERY_CYCLE_TIMEOUT_MS || 2700000); // 45 minutos por padrão
  return runWithWatchdog(runScrapingCycleCore, timeoutMs, () => {
    console.error(`[Watchdog] cycle_status=failed_timeout elapsedMs=${timeoutMs}`);
  });
}

async function runMercadoLivreOfficialDryRun() {
  const scenario = getActiveMarketplaceScenario() || MARKETPLACE_SCENARIOS.informatica_editorial;
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
  return runOracleScraperShopeeShadowLocal({ scenarioId: scenario?.scenarioId || scenario?.id || scenario });
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
    shopeeDiscovery: createShopeeOpenApiV1OfficialDiscovery(),
    persistShopee: createShopeeOpenApiV1OfficialPersistRunner(),
    discover: async (marketplace) => {
      if (marketplace === 'Shopee') {
        return [];
      }
      if (marketplace === 'Amazon') {
        const contract = getMarketplaceScenarioContract(scenarioId, marketplace);
        const result = await runAmazonScenarioDiscovery(contract || scenario, { minDelayMs: 1200, retryDelayMs: 4000, maxRetries: 1, correlationId, schedulerSource: 'manual-scenario-recording', releaseId: process.env.ORACLE_RELEASE_ID || 'unknown' });
        const normalized = result.products
          .filter((product) => matchesMarketplaceContract(contract, product.title))
          .map((product) => normalizeAmazonCandidate(product, requestedAt));
        attachDiscoveryFunnelMeta(normalized, {
          sourceStatus: result.sourceStatus,
          extracted: result.raw_products,
          afterParse: result.queryTelemetry.reduce((total, query) => total + Number(query.parser_count || 0), 0),
          amazonTelemetry: result.telemetry,
        });
        return normalized;
      }
      // Buscar acima do limite de publicação cria margem para duplicatas,
      // filtros de qualidade e caps da fila (10 por marketplace/categoria).
      const result = await runMercadoLivreOfficialIntentCoverage({ accessToken: mlToken, keywords: scenario.keywords, maxPerIntent: 20, delayMs: 300 });
      const contract = getMarketplaceScenarioContract(scenarioId, marketplace);
      return result.products
        .filter((product) => matchesMarketplaceContract(contract, product.title))
        .map((product) => normalizeMercadoLivreCandidate({ ...product, discovered_at: requestedAt }));
    },
    loadDeferred: loadDeferredDiscoveryIngestions,
    loadHistory: loadRecentDiscoveryHistory,
    persist: persistDiscoveryIngestionV1,
    prepareCandidate: (product, marketplace) => prepareDiscoveryCandidate(marketplace, product),
    qualityShadow: createQualityShadowRunner(),
    qualityAdmission: createQualityAdmissionRunner(),
    persistV2Metadata: persistDiscoveryV2Metadata,
    copyQueueOptions: { maxTotal: 30, maxPerMarketplace: 10, maxPerCategory: 10 },
    notifyWorkPending: notifyWorkPendingToOfficialAI,
  });
}

function startOracleScraper({ argv = process.argv, cycle = runScrapingCycle, schedule = cron.schedule } = {}) {
  assertEditorialScheduleValid();
  const run = () => Promise.resolve(cycle()).catch((error) => {
    console.error('[Oracle Discovery-Only V5] ' + error.message);
  });
  if (argv.includes('--run-now')) return run();
  schedule(CRON_SCHEDULE, run, {
    name: 'oracle-worker-discovery-v5',
    timezone: 'America/Sao_Paulo',
    noOverlap: true,
  });
  return undefined;
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
  } else if (process.argv.includes('--process-trends-radar') || process.argv.includes('--trends-radar-dry-run')) {
    const dryRun = process.argv.includes('--trends-radar-dry-run');
    const { processPendingTrendRadarRuns } = require('./oracle-trends-radar-runner.cjs');
    processPendingTrendRadarRuns({ dryRun }).then((res) => {
      console.log(JSON.stringify(res, null, 2));
    }).catch((error) => {
      console.error('[Oracle Trends Radar] ' + error.message);
      process.exitCode = 1;
    });
  } else {
    startOracleScraper();
  }
}

module.exports = {
  CRON_SCHEDULE,
  parseScenarioArg,
  selectOracleReleaseId,
  calculateScoreV1,
  executeShopeeNativeDiscoveryV5,
  fetchAmazonHtmlViaScrapedo,
  fetchMercadoLivreViaScrapedo: fetchAmazonHtmlViaScrapedo,
  notifyWorkPendingToOfficialAI,
  persistDiscoveryIngestionV1,
  resolvePersistedOfferIds,
  resolveOfficialAITriggerEndpoint,
  refreshShopeeNativeCatalog,
  lookupShopeeAffiliateProduct,
  runMercadoLivreOfficialDryRun,
  runShopeeScenarioRecording,
  runMultiMarketplaceScenarioRecording,
  startOracleScraper,
  runManualMarketplaceScenarioRecording,
  createScenarioRuntimeResolver,
  runScrapingCycle,
  runOracleScraperShopeeShadowLocal,
  scrapeStore,
  generateMLAffiliateLinkWithId,
  processMonetization,
  buildAffiliateLinkRows,
  createQualityAdmissionRunner,
  createShopeeOpenApiV1OfficialDiscovery,
  mergeShopeeOpenApiV1RejectionReasons,
  callShopeeAffiliateApi,
  SHOPEE_OPENAPI_REQUEST_TIMEOUT_MS,
  SHOPEE_OPENAPI_MAX_RETRIES,
  SHOPEE_OPENAPI_STAGE_TIMEOUT_MS,
  mercadoLivreIdentityKey,
  isEquivalentMercadoLivreProduct,
  processPendingTrendRadarRuns: require('./oracle-trends-radar-runner.cjs').processPendingTrendRadarRuns,
};
