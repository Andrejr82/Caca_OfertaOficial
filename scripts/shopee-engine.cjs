'use strict';

const crypto = require('node:crypto');
const { validateProductTitle } = require('./product-title-quality.cjs');
const {
  extractProductFamily,
  selectDiversePortfolio,
} = require('./product-diversity-engine.cjs');
const {
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_CATALOG,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
} = require('./editorial-scenario-config.cjs');

const SHOPEE_GRAPHQL_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

const PRODUCT_OFFER_QUERY = `
query ShopeePromotionOffers(
  $keyword: String
  $page: Int
  $limit: Int
  $sortType: Int
) {
  productOfferV2(
    keyword: $keyword
    page: $page
    limit: $limit
    sortType: $sortType
  ) {
    nodes {
      itemId
      shopId
      productName
      productLink
      offerLink
      imageUrl
      price
      priceMin
      priceMax
      priceDiscountRate
      ratingStar
      sales
      commissionRate
      sellerCommissionRate
      shopeeCommissionRate
      shopType
    }
    pageInfo {
      page
      limit
      hasNextPage
    }
  }
}
`;

function getShopeeCredentials(env = process.env) {
  const appId = String(env.SHOPEE_APP_ID || '').trim();
  const appSecret = String(env.SHOPEE_APP_SECRET || '').trim();
  if (!appId || !appSecret) {
    throw new Error('SHOPEE_APP_ID ou SHOPEE_APP_SECRET não configurados no ambiente');
  }
  return { appId, appSecret };
}

function createSignedHeaders(bodyString, { appId, appSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha256')
    .update(`${appId}${timestamp}${bodyString}${appSecret}`)
    .digest('hex');

  return {
    'Content-Type': 'application/json',
    Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
  };
}

async function callShopeeGraphQL(operationName, query, variables = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch || fetch;
  let headers = { 'Content-Type': 'application/json' };
  try {
    const { appId, appSecret } = getShopeeCredentials(options.env || process.env);
    const body = JSON.stringify({ operationName, query, variables });
    headers = createSignedHeaders(body, { appId, appSecret });
  } catch (err) {
    if (!options.fetchImpl) throw err;
  }
  const body = JSON.stringify({ operationName, query, variables });
  const timeoutMs = options.timeoutMs || 25000;
  const signal = options.signal || AbortSignal.timeout(timeoutMs);

  const response = await fetchImpl(SHOPEE_GRAPHQL_URL, {
    method: 'POST',
    headers,
    body,
    signal,
  });

  const json = await response.json();
  if (json.errors && json.errors.length > 0) {
    const errorMsg = json.errors.map((e) => e.message).join('; ');
    throw new Error(`Shopee GraphQL Error [${operationName}]: ${errorMsg}`);
  }

  return { status: response.status, data: json.data };
}

function parseNumber(val, defaultVal = 0) {
  const parsed = Number.parseFloat(String(val ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : defaultVal;
}

function parsePercent(val) {
  const num = parseNumber(val);
  return num > 0 && num <= 1 ? Number((num * 100).toFixed(2)) : Number(num.toFixed(2));
}

function normalizeShopeeProduct(node = {}, context = {}) {
  const itemId = String(node.itemId || '').trim();
  const shopId = String(node.shopId || '').trim();
  const productName = String(node.productName || node.title || '').trim();
  const productLink = String(node.productLink || '').trim();
  const offerLink = String(node.offerLink || '').trim();
  const imageUrl = String(node.imageUrl || '').trim();

  const priceMin = parseNumber(node.priceMin);
  const priceMax = parseNumber(node.priceMax);
  const rawPrice = parseNumber(node.price);
  const currentPrice = priceMin > 0 ? priceMin : rawPrice > 0 ? rawPrice : priceMax;

  let discountRate = parsePercent(node.priceDiscountRate);
  let originalPrice = null;

  if (priceMax > currentPrice && priceMin > 0) {
    originalPrice = priceMax;
    discountRate = Math.round(((priceMax - currentPrice) / priceMax) * 100);
  } else if (discountRate > 0 && currentPrice > 0) {
    originalPrice = Number((currentPrice / (1 - discountRate / 100)).toFixed(2));
  }

  const ratingStar = parseNumber(node.ratingStar);
  const sales = parseNumber(node.sales);

  const commissionRate = parsePercent(node.commissionRate);
  const sellerCommissionRate = parsePercent(node.sellerCommissionRate);
  const shopeeCommissionRate = parsePercent(node.shopeeCommissionRate);
  const commissionPercent = Math.max(commissionRate, sellerCommissionRate, shopeeCommissionRate);

  // Score comercial de oportunidade (0 a 100)
  let score = 50;
  if (ratingStar >= 4.8) score += 15;
  else if (ratingStar >= 4.6) score += 10;
  else if (ratingStar >= 4.4) score += 5;

  if (sales >= 1000) score += 15;
  else if (sales >= 200) score += 10;
  else if (sales >= 50) score += 5;

  if (discountRate >= 30) score += 15;
  else if (discountRate >= 15) score += 10;
  else if (discountRate >= 5) score += 5;

  if (commissionPercent >= 8) score += 10;
  else if (commissionPercent >= 5) score += 5;

  return {
    marketplace: 'Shopee',
    itemId,
    shopId,
    productName,
    title: productName,
    productLink,
    offerLink,
    sourceUrl: offerLink || productLink,
    imageUrl,
    currentPrice,
    price: currentPrice,
    originalPrice: originalPrice && originalPrice > currentPrice ? originalPrice : null,
    priceDiscountRate: discountRate,
    discountPercent: discountRate,
    ratingStar,
    sales,
    commissionPercent,
    commissionRate,
    sellerCommissionRate,
    shopeeCommissionRate,
    shopType: Array.isArray(node.shopType) ? node.shopType.map(Number) : [],
    productCatIds: Array.isArray(node.productCatIds) ? node.productCatIds.map(String) : [],
    score: Math.min(100, Math.max(0, score)),
    scenarioId: context.scenarioId || null,
    keyword: context.keyword || null,
  };
}

function isEligibleShopeeCandidate(product) {
  if (!product.itemId || !product.shopId || !product.productName) return false;
  if (!product.imageUrl || !product.imageUrl.startsWith('http')) return false;
  if (!product.sourceUrl || !product.sourceUrl.startsWith('http')) return false;
  if (!(product.currentPrice > 0)) return false;

  // Filtragem de Sanidade de Título (bloqueia peças isoladas e acessórios óbvios)
  const titleQuality = validateProductTitle(product.productName);
  if (!titleQuality.valid) {
    return false;
  }

  // Sanidade mínima de métricas
  if (product.ratingStar > 0 && product.ratingStar < 4.4) return false;
  if (product.sales > 0 && product.sales < 5) return false;

  return true;
}

async function searchShopeeOffers({
  keyword,
  productCatId,
  page = 1,
  limit = 40,
  sortType = 2, // 2 = Top Vendas, 5 = Top Comissão, 1 = Popular
  shopType = [1, 2, 3, 4], // Inclui Shopee Mall / Lojas Oficiais
  options = {},
}) {
  const variables = {
    keyword: keyword || undefined,
    page: Number(page) || 1,
    limit: Number(limit) || 40,
    sortType: Number(sortType) || 2,
  };

  const response = await callShopeeGraphQL(
    'ShopeePromotionOffers',
    PRODUCT_OFFER_QUERY,
    variables,
    options
  );

  const rawNodes = response.data?.productOfferV2?.nodes || [];
  const pageInfo = response.data?.productOfferV2?.pageInfo || {};

  const normalized = rawNodes.map((node) =>
    normalizeShopeeProduct(node, { keyword, scenarioId: options.scenarioId })
  );

  const eligible = normalized.filter(isEligibleShopeeCandidate);

  return {
    rawCount: rawNodes.length,
    eligibleCount: eligible.length,
    pageInfo,
    products: eligible,
  };
}

async function discoverShopeeScenarioOffers(scenarioId, options = {}) {
  const scenarioConfig = (EDITORIAL_SCENARIOS && EDITORIAL_SCENARIOS[scenarioId]) || (EDITORIAL_SCENARIO_CATALOG && EDITORIAL_SCENARIO_CATALOG[scenarioId]);
  if (!scenarioConfig) {
    throw new Error(`Cenário editorial não encontrado: ${scenarioId}`);
  }

  const keywords = scenarioConfig.keywords || [];
  const hour = new Date().getHours();
  const dynamicPage = options.page || (hour % 3) + 1;
  const limitPerKeyword = options.limitPerKeyword || 30;
  const targetTotal = options.targetTotal || 50;

  const allDiscovered = [];
  const seenItemIds = new Set();
  const calls = [];

  // Busca concorrente controlada por palavras-chave (sem parada prematura para cobrir 100% do catálogo)
  const concurrency = 4;
  for (let i = 0; i < keywords.length; i += concurrency) {
    const batch = keywords.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (kw) => {
        const res = await searchShopeeOffers({
          keyword: kw,
          page: dynamicPage,
          limit: limitPerKeyword,
          sortType: 2, // Top Vendas
          shopType: [1, 2, 3, 4],
          options: { ...options, scenarioId },
        });
        calls.push({ keyword: kw, returned: res.rawCount, eligible: res.eligibleCount });
        return res.products;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        for (const item of result.value) {
          if (!seenItemIds.has(item.itemId)) {
            seenItemIds.add(item.itemId);
            allDiscovered.push(item);
          }
        }
      }
    }
  }

  // Ordenação por relevância e oportunidade comercial
  const sorted = [...allDiscovered].sort((a, b) => b.score - a.score || b.sales - a.sales);

  // Aplicação de diversidade por família de produtos (evita monopólio de uma só subcategoria)
  const top = selectDiversePortfolio(sorted, {
    maxPerFamily: options.maxPerFamily || 3,
    targetTotal,
  });

  return {
    scenarioId,
    scenarioName: scenarioConfig.name,
    dynamicPage,
    totalDiscovered: allDiscovered.length,
    topCount: top.length,
    top,
    candidatePool: sorted,
    calls,
  };
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
}

function buildShopeeIngestions(products = [], context = {}) {
  const tenantId = context.tenantId || 'admin';
  const correlationId = context.correlationId || `shopee-run-${Date.now()}`;
  const requestedAt = context.requestedAt || new Date().toISOString();
  const scenarioId = context.scenarioId || 'geral';

  return products.map((product, index) => {
    const identity = `${tenantId}:Shopee:${product.itemId}`;
    const idempotencyKey = stableId('oracle', identity);
    const candidateId = stableId('candidate', identity);

    const candidate = {
      contractVersion: 'pmav5.candidate/v1',
      candidateId,
      idempotencyKey,
      correlationId,
      tenantId,
      marketplace: 'Shopee',
      sourceItemId: product.itemId,
      sourceUrl: product.sourceUrl,
      title: product.productName,
      imageUrl: product.imageUrl,
      currentPrice: product.currentPrice,
      originalPrice: product.originalPrice,
      category: { id: String(product.productCatIds?.[0] || '100010'), name: scenarioId, source: 'Shopee OpenAPI' },
      marketplaceMetrics: {
        sourcePosition: index + 1,
        itemId: product.itemId,
        shopId: product.shopId,
        sales: product.sales,
        rating: product.ratingStar,
        discount: product.discountPercent,
        commissionRate: product.commissionPercent,
      },
      deterministicScore: Number((product.score / 10).toFixed(1)),
      discoveryEvidence: { position: index + 1, category: scenarioId, provider: 'Shopee OpenAPI', discoveredAt: requestedAt },
      discoveredAt: requestedAt,
      rawPayload: product,
      monetization: { valid: true, affiliateUrl: product.offerLink || product.sourceUrl },
    };

    return {
      contractVersion: 'pmav5.ingestion/v1',
      ingestionId: stableId('ingestion', idempotencyKey),
      idempotencyKey,
      correlationId,
      sourceType: 'oracle_shopee_engine',
      tenantId,
      actor: { type: 'service', id: 'shopee-engine' },
      candidate,
      requestedAt,
    };
  });
}

function normalizePriceIntegrity({ price, priceMin, priceMax, priceDiscountRate, officialOldPrice } = {}) {
  const min = parseNumber(priceMin);
  const max = parseNumber(priceMax);
  const simplePrice = parseNumber(price);
  const currentPrice = min > 0 ? min : max > 0 ? max : simplePrice;
  const priceAuthority = min > 0 ? 'priceMin' : max > 0 ? 'priceMax_fallback' : simplePrice > 0 ? 'price' : 'unresolved';
  const rangeAmbiguous = min > 0 && max > 0 && min !== max;
  const apiDiscount = parsePercent(priceDiscountRate);
  const explicitOldPrice = parseNumber(officialOldPrice);
  let oldPrice = null;
  let discountPercent = null;
  let oldPriceAuthority = 'none';
  let discountAuthority = 'none';
  let safeForPublication = currentPrice > 0;

  if (explicitOldPrice > 0) {
    const computedDiscount = currentPrice > 0 && explicitOldPrice > currentPrice
      ? Math.round(((explicitOldPrice - currentPrice) / explicitOldPrice) * 100)
      : null;
    const contradictory = computedDiscount === null || (apiDiscount > 0 && Math.abs(computedDiscount - apiDiscount) > 2);
    if (contradictory) {
      safeForPublication = false;
    } else {
      oldPrice = explicitOldPrice;
      discountPercent = computedDiscount;
      oldPriceAuthority = 'officialOldPrice';
      discountAuthority = 'officialOldPrice';
    }
  }

  return { currentPrice, oldPrice, discountPercent, priceAuthority, oldPriceAuthority, discountAuthority, rangeAmbiguous, safeForPublication };
}

function createSignedRequest({ appId, appSecret, request } = {}) {
  return async function caller(operationName, query, variables = {}, options = {}) {
    const creds = {
      appId: appId || process.env.SHOPEE_APP_ID,
      appSecret: appSecret || process.env.SHOPEE_APP_SECRET,
    };
    const body = JSON.stringify({ operationName, query, variables });
    const headers = createSignedHeaders(body, creds);
    if (typeof request === 'function') {
      return request({ body, headers, signal: options.signal });
    }
    return callShopeeGraphQL(operationName, query, variables, {
      ...options,
      env: { SHOPEE_APP_ID: creds.appId, SHOPEE_APP_SECRET: creds.appSecret },
    });
  };
}

function selectCuratedFamilyRepresentatives(candidates = [], limit = 25) {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, typeof limit === 'number' ? limit : 25);
}

function resolvePriceAuthority(input = {}) {
  const current = parseNumber(input.priceMin) || parseNumber(input.currentPrice) || parseNumber(input.price) || 0;
  const old = parseNumber(input.officialOldPrice) || parseNumber(input.oldPrice) || null;
  return { currentPrice: current, oldPrice: old > current ? old : null };
}

function getShopeeMaxOffersPerCycle() {
  return 25;
}

async function runShopeeOpenApiV1OfficialForScenario(scenarioId, options = {}) {
  try {
    const discovery = await discoverShopeeScenarioOffers(scenarioId, {
      targetTotal: options.targetTotal || 25,
      env: options.env,
    });
    return {
      enabled: true,
      result: {
        scenarios: {
          [scenarioId]: {
            top: discovery.top,
            candidatePool: discovery.top,
            rejected: [],
            metrics: {
              raw: discovery.totalDiscovered,
              deduped: discovery.topCount,
              eligible: discovery.topCount,
              topSelected: discovery.topCount,
            },
          },
        },
        queryEvidence: { calls: discovery.calls },
      },
    };
  } catch (error) {
    return {
      enabled: false,
      reason: error.message,
    };
  }
}

function getControlledPersistDecision(scenarioResult = {}) {
  return { allowed: true, reason: 'shopee_engine_direct' };
}

function buildControlledPersistIngestions(candidates = [], scenarioId = 'editorial') {
  return buildShopeeIngestions(candidates, scenarioId);
}

function buildShopeePeerScoringPool(candidates = []) {
  return Array.isArray(candidates) ? candidates : [];
}

const GRAPHQL_CONTRACTS = Object.freeze({
  productOfferV2: {
    operationName: 'ShopeePromotionOffers',
    query: PRODUCT_OFFER_QUERY,
  },
});

// CLI Execution
async function main() {
  const args = process.argv.slice(2);
  const scenarioArg = args.find((a) => a.startsWith('--scenario='))?.split('=')[1] || 'casa_cozinha_editorial';
  const searchArg = args.find((a) => a.startsWith('--search='))?.split('=')[1];

  console.log('='.repeat(70));
  console.log('🛍️  MOTOR OFICIAL SHOPEE OPENAPI GRAPHQL');
  console.log('='.repeat(70));

  if (searchArg) {
    console.log(`🔎 Executando busca direta por: "${searchArg}"...`);
    const res = await searchShopeeOffers({ keyword: searchArg, limit: 15, sortType: 2 });
    console.log(`\nEncontrados: ${res.rawCount} brutos | ${res.eligibleCount} elegíveis e filtrados:`);
    console.table(
      res.products.map((p) => ({
        ID: p.itemId,
        Produto: p.productName.slice(0, 40) + '...',
        Preço: `R$ ${p.currentPrice.toFixed(2)}`,
        Desconto: `${p.discountPercent}%`,
        Vendas: p.sales,
        Rating: `⭐ ${p.ratingStar}`,
        Comissão: `${p.commissionPercent}%`,
        Score: p.score,
      }))
    );
  } else {
    console.log(`🎯 Executando descoberta para o cenário: "${scenarioArg}"...`);
    const res = await discoverShopeeScenarioOffers(scenarioArg, { targetTotal: 25 });
    console.log(`\n✅ Descoberta Concluída!`);
    console.log(`- Termos pesquisados: ${res.calls.length}`);
    console.log(`- Total descobertos: ${res.totalDiscovered}`);
    console.log(`- Top selecionados para o painel: ${res.topCount}`);
    console.table(
      res.top.slice(0, 15).map((p, i) => ({
        '#': i + 1,
        ID: p.itemId,
        Produto: p.productName.slice(0, 38) + '...',
        Preço: `R$ ${p.currentPrice.toFixed(2)}`,
        Desc: `${p.discountPercent}%`,
        Vendas: p.sales,
        Nota: `⭐ ${p.ratingStar}`,
        Comissão: `${p.commissionPercent}%`,
        Score: p.score,
      }))
    );
  }
}

if (require.main === module) {
  require('dotenv').config({ path: '.env.local', quiet: true });
  main().catch((err) => {
    console.error('❌ Erro no Shopee Engine:', err.message);
    process.exit(1);
  });
}

const SCENARIO_WINDOWS = Object.freeze(Object.keys(EDITORIAL_SCENARIOS).map((id) => ({
  start: EDITORIAL_SCENARIOS[id].queueHour,
  end: EDITORIAL_SCENARIOS[id].queueHour + 1,
  scenarioId: id,
  label: EDITORIAL_SCENARIOS[id].name,
})));

function getScenarioWindow(currentHour) {
  const hour = ((Number(currentHour) % 24) + 24) % 24;
  const window = SCENARIO_WINDOWS.find((w) => hour >= w.start && hour < w.end);
  if (window) return window;
  const scenario = getEditorialScenarioForHour(hour);
  if (!scenario) return null;
  return { start: hour, end: hour + 1, scenarioId: scenario.id, label: scenario.name };
}

function getSaoPauloHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
}

function getActiveScenario(currentHour) {
  const window = getScenarioWindow(currentHour);
  if (!window) return null;
  const scenario = EDITORIAL_SCENARIOS[window.scenarioId];
  if (!scenario) return null;
  return { ...scenario, name: window.label, schedule: window };
}

function getCycleScenario(startHour, durationHours = 4) {
  const hour = ((Number(startHour) % 24) + 24) % 24;
  const editorialScenario = getEditorialScenarioForDiscoveryHour(hour);
  if (!editorialScenario) return null;
  const scenarioId = editorialScenario.id;
  const scenario = EDITORIAL_SCENARIOS[scenarioId];
  const window = getScenarioWindow(scenario.queueHour);
  return {
    ...scenario,
    id: scenarioId,
    scenarioId,
    scenarioIds: [scenarioId],
    name: scenario.name || window?.label || scenarioId,
    schedule: window ? [window] : [],
    routingMode: 'editorial_queue',
    discoveryHour: hour,
    publicationHour: scenario.queueHour,
  };
}

function buildProductOfferPayload(keyword, productCatId, page = 1, limit = 20, sortType = 5) {
  return {
    operationName: 'ShopeePromotionOffers',
    query: PRODUCT_OFFER_QUERY,
    variables: {
      keyword,
      productCatId,
      page,
      limit,
      sortType,
    },
  };
}

function sanitizeProduct(node, options = {}) {
  if (!node || !node.itemId || !node.productName) return null;
  const rating = parseFloat(node.ratingStar) || 0;
  const sales = parseInt(node.sales, 10) || 0;
  const shopTypes = Array.isArray(node.shopType) ? node.shopType.map(Number) : [];
  const isOfficialOrPreferred = shopTypes.some((t) => [1, 2, 3].includes(t));
  const isTrustedSeller = rating >= 4.5 && sales >= 50;

  if (!isOfficialOrPreferred && !isTrustedSeller) {
    return null;
  }

  const price = parseFloat(node.priceMin || node.price || 0);
  const discount = parseFloat(node.priceDiscountRate || node.discount || 0);

  return {
    itemId: String(node.itemId),
    productName: String(node.productName),
    productLink: node.productLink || '',
    price,
    discount,
    sales,
    ratingStar: rating,
    commissionRate: parseFloat(node.commissionRate || 0),
    category: options.name || '',
    categoryId: options.productCatId || null,
  };
}

function calculateObjectiveScore(product) {
  if (!product) return 0;
  const discount = product.discount || product.discountPercent || 0;
  const rating = product.ratingStar || product.rating || 0;
  const sales = product.sales || 0;
  return Number((discount * 0.4 + rating * 10 + Math.min(sales, 1000) * 0.05).toFixed(2));
}

function normalizeProductOffer(rawNode, options = {}) {
  const norm = normalizeShopeeProduct(rawNode, options);
  const price = norm.currentPrice || Number(rawNode.price || 0);
  const priceMin = Number(rawNode.priceMin || 0);
  const ratingStar = norm.ratingStar || 0;
  const commissionPercent = norm.commissionPercent || 0;

  return {
    accepted: true,
    product: {
      ...norm,
      itemId: String(rawNode.itemId || norm.itemId),
      price,
      priceMin,
      ratingStar,
      commissionPercent,
      commissionUnresolved: commissionPercent === 0,
    },
  };
}

module.exports = {
  GRAPHQL_CONTRACTS,
  PRODUCT_OFFER_QUERY,
  callShopeeGraphQL,
  createSignedHeaders,
  createSignedRequest,
  normalizePriceIntegrity,
  normalizeShopeeProduct,
  normalizeProductOffer,
  isEligibleShopeeCandidate,
  selectCuratedFamilyRepresentatives,
  resolvePriceAuthority,
  getShopeeMaxOffersPerCycle,
  searchShopeeOffers,
  discoverShopeeScenarioOffers,
  runShopeeOpenApiV1OfficialForScenario,
  getControlledPersistDecision,
  buildControlledPersistIngestions,
  buildShopeePeerScoringPool,
  buildShopeeIngestions,
  SCENARIOS: EDITORIAL_SCENARIOS,
  SCENARIO_WINDOWS,
  getActiveScenario,
  getCycleScenario,
  getScenarioWindow,
  getSaoPauloHour,
  extractProductFamily,
  selectDiversePortfolio,
  buildProductOfferPayload,
  sanitizeProduct,
  calculateObjectiveScore,
};

