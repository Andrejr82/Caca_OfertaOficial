'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { validateProductTitle } = require('./product-title-quality.cjs');
const { EDITORIAL_SCENARIOS, EDITORIAL_SCENARIO_CATALOG } = require('./editorial-scenario-config.cjs');

const API_ROOT = 'https://api.mercadolibre.com';
const API_TIMEOUT_MS = 30000;
const DEFAULT_TENANT_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';

// In-memory token cache
let cachedAccessToken = null;
let tokenExpiresAt = 0;

function parseNumber(val, defaultVal = 0) {
  const parsed = Number.parseFloat(String(val ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : defaultVal;
}

function stableId(prefix, seed) {
  const hash = crypto.createHash('sha1').update(String(seed)).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
}

async function persistRefreshedCredentials(data, { env = process.env, supabaseClient } = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = env.CACA_OFERTA_USER_ID || env.SUPABASE_USER_ID || DEFAULT_TENANT_USER_ID;
  if (!url || !serviceKey || !userId) return;

  try {
    const client =
      supabaseClient ||
      createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

    await client.from('app_settings').upsert(
      {
        user_id: userId,
        key: 'ml_credentials',
        value: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(Date.now() + Number(data.expires_in || 21600) * 1000).toISOString(),
          ml_user_id: data.user_id || userId,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' }
    );
  } catch (err) {
    // Non-blocking
  }
}

async function refreshAccessToken({
  fetchImpl = global.fetch,
  env = process.env,
  persist = true,
  supabaseClient,
  force = false,
} = {}) {
  const now = Date.now();
  if (!force && cachedAccessToken && tokenExpiresAt > now + 60000) {
    return cachedAccessToken;
  }

  const clientId = env.MERCADO_LIVRE_APP_ID || env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = env.MERCADO_LIVRE_CLIENT_SECRET;
  const refreshToken = env.MERCADO_LIVRE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    if (env.MERCADO_LIVRE_ACCESS_TOKEN) {
      cachedAccessToken = env.MERCADO_LIVRE_ACCESS_TOKEN;
      tokenExpiresAt = now + 3600000;
      return cachedAccessToken;
    }
    throw new Error('Credenciais OAuth do Mercado Livre ausentes no ambiente.');
  }

  const response = await fetchImpl(`${API_ROOT}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    if (env.MERCADO_LIVRE_ACCESS_TOKEN) {
      cachedAccessToken = env.MERCADO_LIVRE_ACCESS_TOKEN;
      tokenExpiresAt = now + 1800000;
      return cachedAccessToken;
    }
    throw new Error(`OAuth Mercado Livre falhou: HTTP ${response.status} - ${data.message || 'Sem token'}`);
  }

  cachedAccessToken = data.access_token;
  const expiresInMs = Number(data.expires_in || 21600) * 1000;
  tokenExpiresAt = now + expiresInMs;

  if (persist) {
    await persistRefreshedCredentials(data, { env, supabaseClient });
  }

  return cachedAccessToken;
}

async function apiGet(path, { fetchImpl = global.fetch, accessToken, timeoutMs = API_TIMEOUT_MS } = {}) {
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`ML API HTTP ${response.status}: ${body.message || path}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function calculateMercadoLivreScore({
  currentPrice = 0,
  oldPrice = null,
  discountPercent = 0,
  sales = 0,
  ratingStar = 4.8,
  isFull = false,
  freeShipping = false,
  officialStore = false,
}) {
  let score = 50;

  if (discountPercent >= 50) score += 25;
  else if (discountPercent >= 30) score += 20;
  else if (discountPercent >= 15) score += 15;
  else if (discountPercent >= 5) score += 5;

  if (sales >= 5000) score += 20;
  else if (sales >= 1000) score += 15;
  else if (sales >= 200) score += 10;
  else if (sales >= 50) score += 5;

  if (ratingStar >= 4.8) score += 15;
  else if (ratingStar >= 4.5) score += 10;
  else if (ratingStar >= 4.0) score += 5;

  if (isFull) score += 10;
  if (freeShipping) score += 5;
  if (officialStore) score += 5;

  if (currentPrice >= 20 && currentPrice <= 600) score += 5;

  return Math.min(100, Math.max(10, score));
}

function normalizeMercadoLivreProduct(item, options = {}) {
  const itemId = String(item.item_id || item.id || '').trim();
  if (!itemId) return null;

  const title = String(options.productName || item.title || item.name || '').trim();
  if (!title) return null;

  const currentPrice = parseNumber(item.price);
  if (!(currentPrice > 0)) return null;

  const originalPrice = parseNumber(item.original_price);
  const oldPrice = originalPrice > currentPrice ? originalPrice : null;
  const discountPercent =
    oldPrice > currentPrice ? Math.round(((oldPrice - currentPrice) / oldPrice) * 100) : 0;

  const sales = parseInt(String(item.sold_quantity || item.sales || '100'), 10) || 100;
  const ratingStar = parseNumber(options.ratingStar || item.rating || 4.8);
  const reviewCount = parseInt(String(options.reviewCount || item.reviews?.total || '50'), 10) || 50;

  let imageUrl = options.imageUrl || '';
  if (!imageUrl && item.pictures && item.pictures.length > 0) {
    imageUrl = item.pictures[0].secure_url || item.pictures[0].url || '';
  } else if (!imageUrl && (item.secure_thumbnail || item.thumbnail)) {
    imageUrl = String(item.secure_thumbnail || item.thumbnail).replace('-I.jpg', '-O.jpg').replace('-V.jpg', '-O.jpg');
  }

  const permalink = String(options.permalink || item.permalink || `https://produto.mercadolivre.com.br/MLB-${itemId.replace(/^MLB/i, '')}`).split('?')[0];
  const shipping = item.shipping || {};
  const isFull = shipping.logistic_type === 'fulfillment';
  const freeShipping = shipping.free_shipping === true;
  const officialStore = item.official_store_id != null && item.official_store_id > 0;

  const score = calculateMercadoLivreScore({
    currentPrice,
    oldPrice,
    discountPercent,
    sales,
    ratingStar,
    isFull,
    freeShipping,
    officialStore,
  });

  return {
    marketplace: 'Mercado Livre',
    itemId,
    productId: options.productId || item.catalog_product_id || null,
    domainId: options.domainId || item.domain_id || null,
    categoryId: options.categoryId || item.category_id || null,
    productName: title,
    currentPrice,
    oldPrice,
    originalPrice: oldPrice,
    discountPercent,
    sales,
    ratingStar,
    reviewCount,
    imageUrl,
    sourceUrl: permalink,
    permalink,
    offerLink: permalink,
    isFull,
    freeShipping,
    officialStore,
    score,
    sellerId: item.seller_id || null,
    rawPayload: item,
  };
}

function isEligibleMercadoLivreCandidate(product) {
  if (!product || !(product.currentPrice > 0)) return { eligible: false, reason: 'preco_invalido' };

  const titleValidation = validateProductTitle(product.productName);
  if (!titleValidation.valid) {
    return { eligible: false, reason: `titulo_rejeitado: ${titleValidation.reason}` };
  }

  if (product.currentPrice < 5) {
    return { eligible: false, reason: 'preco_muito_baixo' };
  }

  return { eligible: true, score: product.score };
}

async function searchMercadoLivreOffers({
  keyword,
  limit = 20,
  env = process.env,
  fetchImpl = global.fetch,
} = {}) {
  if (!keyword || !keyword.trim()) {
    return { rawCount: 0, eligibleCount: 0, products: [] };
  }

  const token = await refreshAccessToken({ env, fetchImpl });
  const searchTerm = keyword.trim();

  // 1. Descoberta de domínios/categorias relevantes
  let domains = [];
  try {
    const domainData = await apiGet(
      `/sites/MLB/domain_discovery/search?q=${encodeURIComponent(searchTerm)}`,
      { fetchImpl, accessToken: token }
    );
    domains = Array.isArray(domainData) ? domainData : [];
  } catch (err) {
    console.warn(`[ML Engine] Falha domain_discovery para "${searchTerm}":`, err.message);
  }

  const candidateProductMap = new Map();
  const rawDiscoveredOffers = [];
  const selectedDomains = domains.slice(0, 3);

  // 2. Coleta de destaques (Highlights) e Catálogo
  for (const domain of selectedDomains) {
    if (domain.category_id) {
      try {
        const hl = await apiGet(
          `/highlights/MLB/category/${encodeURIComponent(domain.category_id)}`,
          { fetchImpl, accessToken: token }
        );
        for (const entry of hl.content || []) {
          if (entry.type === 'PRODUCT' && entry.id && !candidateProductMap.has(entry.id)) {
            candidateProductMap.set(entry.id, {
              id: entry.id,
              domain_id: domain.domain_id,
              category_id: domain.category_id,
              category_name: domain.category_name,
            });
          }
        }
      } catch {
        // segue
      }
    }

    try {
      const catalogRes = await apiGet(
        `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(searchTerm)}&domain_id=${encodeURIComponent(domain.domain_id)}&limit=15`,
        { fetchImpl, accessToken: token }
      );
      for (const p of catalogRes.results || []) {
        if (p.id && !candidateProductMap.has(p.id)) {
          candidateProductMap.set(p.id, {
            id: p.id,
            name: p.name,
            domain_id: domain.domain_id,
            category_id: domain.category_id,
            category_name: domain.category_name,
            pictures: p.pictures,
          });
        }
      }
    } catch {
      // segue
    }
  }

  // 3. Resolver detalhes e itens de cada produto
  const productList = Array.from(candidateProductMap.values()).slice(0, 15);
  for (const prod of productList) {
    try {
      let prodName = prod.name;
      let prodImg = prod.pictures?.[0]?.url;
      let permalink = `https://www.mercadolivre.com.br/p/${prod.id}`;

      if (!prodName || !prodImg) {
        const meta = await apiGet(`/products/${prod.id}`, { fetchImpl, accessToken: token }).catch(() => null);
        if (meta) {
          prodName = meta.name || prodName;
          prodImg = meta.pictures?.[0]?.url || meta.pictures?.[0]?.secure_url || prodImg;
          if (meta.permalink) permalink = meta.permalink;
        }
      }

      const itemsRes = await apiGet(`/products/${prod.id}/items?limit=4`, { fetchImpl, accessToken: token }).catch(() => null);
      const itemsList = Array.isArray(itemsRes) ? itemsRes : itemsRes?.results || [];

      for (const item of itemsList) {
        if (!item.item_id && !item.id) continue;
        const normalized = normalizeMercadoLivreProduct(item, {
          productName: prodName,
          imageUrl: prodImg,
          permalink,
          productId: prod.id,
          domainId: prod.domain_id,
          categoryId: prod.category_id,
        });

        if (normalized) {
          rawDiscoveredOffers.push(normalized);
        }
      }
    } catch {
      // segue
    }
  }

  // 4. Filtrar e deduplicar
  const seenIds = new Set();
  const eligible = [];

  for (const offer of rawDiscoveredOffers) {
    if (seenIds.has(offer.itemId)) continue;
    seenIds.add(offer.itemId);

    const check = isEligibleMercadoLivreCandidate(offer);
    if (check.eligible) {
      eligible.push(offer);
    }
  }

  eligible.sort((a, b) => b.score - a.score);

  return {
    rawCount: rawDiscoveredOffers.length,
    eligibleCount: eligible.length,
    products: eligible,
  };
}

async function discoverMercadoLivreScenarioOffers(
  scenarioId,
  { targetTotal = 25, env = process.env, fetchImpl = global.fetch } = {}
) {
  const scenario =
    EDITORIAL_SCENARIOS[scenarioId] ||
    EDITORIAL_SCENARIO_CATALOG[scenarioId] ||
    { id: scenarioId, name: scenarioId, keywords: [scenarioId.replace(/_editorial|_v\d+/g, '').replace(/_/g, ' ')] };

  const keywords = Array.isArray(scenario.keywords) && scenario.keywords.length > 0
    ? scenario.keywords
    : [scenario.name || scenarioId];

  const pool = new Map();
  const calls = [];

  for (const kw of keywords) {
    try {
      const res = await searchMercadoLivreOffers({ keyword: kw, limit: 15, env, fetchImpl });
      calls.push({ keyword: kw, raw: res.rawCount, eligible: res.eligibleCount, status: 200 });

      for (const prod of res.products) {
        if (!pool.has(prod.itemId)) {
          pool.set(prod.itemId, prod);
        }
      }

      if (pool.size >= targetTotal * 2) break;
    } catch (err) {
      calls.push({ keyword: kw, error: err.message, status: 500 });
    }
  }

  const allCandidates = Array.from(pool.values());
  allCandidates.sort((a, b) => b.score - a.score);
  const top = allCandidates.slice(0, targetTotal);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    calls,
    totalDiscovered: pool.size,
    topCount: top.length,
    top,
    candidates: top,
  };
}

function buildMercadoLivreIngestions(products = [], scenarioId = 'casa_cozinha_editorial', tenantId = DEFAULT_TENANT_USER_ID) {
  const requestedAt = new Date().toISOString();

  return products.map((product, index) => {
    const idempotencyKey = `ml_${product.itemId}_${requestedAt.slice(0, 10)}`;
    const candidateId = stableId('cand_ml', product.itemId);
    const correlationId = stableId('corr_ml', `${scenarioId}_${requestedAt.slice(0, 13)}`);

    const candidate = {
      contractVersion: 'pmav5.candidate/v1',
      candidateId,
      idempotencyKey,
      correlationId,
      tenantId,
      marketplace: 'Mercado Livre',
      sourceItemId: product.itemId,
      sourceUrl: product.permalink || product.sourceUrl,
      title: product.productName,
      imageUrl: product.imageUrl,
      currentPrice: product.currentPrice,
      originalPrice: product.originalPrice,
      category: { id: String(product.categoryId || 'MLB123'), name: scenarioId, source: 'Mercado Livre OpenAPI' },
      marketplaceMetrics: {
        sourcePosition: index + 1,
        itemId: product.itemId,
        productId: product.productId,
        domainId: product.domainId,
        sales: product.sales,
        rating: product.ratingStar,
        reviewCount: product.reviewCount,
        discount: product.discountPercent,
        isFull: product.isFull,
        freeShipping: product.freeShipping,
        officialStore: product.officialStore,
      },
      deterministicScore: Number((product.score / 10).toFixed(1)),
      discoveryEvidence: { position: index + 1, category: scenarioId, provider: 'Mercado Livre OpenAPI', discoveredAt: requestedAt },
      discoveredAt: requestedAt,
      rawPayload: product,
      monetization: { valid: true, affiliateUrl: product.offerLink || product.sourceUrl },
    };

    return {
      contractVersion: 'pmav5.ingestion/v1',
      ingestionId: stableId('ingestion', idempotencyKey),
      idempotencyKey,
      correlationId,
      sourceType: 'oracle_mercadolivre_engine',
      tenantId,
      actor: { type: 'service', id: 'mercadolivre-engine' },
      candidate,
      requestedAt,
    };
  });
}

// Compatibilidade com executores do Oracle
async function runMercadoLivreOfficialIntentCoverage(options = {}) {
  const scenarioId = options.scenario?.id || options.scenario || 'casa_cozinha_editorial';
  const discovery = await discoverMercadoLivreScenarioOffers(scenarioId, {
    targetTotal: options.limit || 25,
    env: options.env,
    fetchImpl: options.fetchImpl,
  });

  const products = (discovery.top || []).map((p) => ({
    item_id: p.itemId,
    title: p.productName,
    current_price: p.currentPrice,
    old_price: p.oldPrice,
    discount_percent: p.discountPercent,
    permalink: p.permalink,
    product_url: p.permalink,
    source_url: p.permalink,
    thumbnail: p.imageUrl,
    image_url: p.imageUrl,
    sold_quantity: p.sales,
    rating_average: p.ratingStar,
    is_full: p.isFull,
    official_store: p.officialStore,
    category_id: p.categoryId,
    category_name: p.categoryName,
    source_position: p.sourcePosition || 1,
  }));

  return {
    scenarioId,
    keywords: options.keywords || [],
    candidates: discovery.top,
    top: discovery.top,
    products,
    totalDiscovered: discovery.totalDiscovered,
    calls: discovery.calls,
    generated_at: new Date().toISOString(),
  };
}

async function runMercadoLivreNativeTop20(options = {}) {
  return runMercadoLivreOfficialIntentCoverage(options);
}

function classifyMercadoLivreProduct(item) {
  return {
    canonical_classification: 'valid_product',
    confidence: 'high',
    allowed: true,
  };
}

const DEFAULT_MAX_PER_INTENT = 30;
const ML_OPPORTUNITY_STRATEGY_VERSION = 'mercadolivre-opportunity/v1';

const ML_RADAR_DISCOVERY_INTENTS = Object.freeze([
  'lixeira inox pedal',
  'mop giratorio',
  'jogo de lencol percal',
  'protetor solar facial',
  'vitamina c facial',
  'secador de cabelo profissional',
  'mouse sem fio',
  'teclado mecanico',
  'mochila impermeavel notebook',
  'tenis masculino caminhada',
  'mala de bordo 10kg',
]);

const ML_RADAR_INTENT_MACRO_GROUPS = Object.freeze({
  'lixeira inox pedal': 'casa_cozinha',
  'mop giratorio': 'casa_cozinha',
  'jogo de lencol percal': 'casa_cozinha',
  'protetor solar facial': 'beleza_cuidados',
  'vitamina c facial': 'beleza_cuidados',
  'secador de cabelo profissional': 'beleza_cuidados',
  'mouse sem fio': 'informatica',
  'teclado mecanico': 'informatica',
  'mochila impermeavel notebook': 'moda_acessorios',
  'tenis masculino caminhada': 'moda_acessorios',
  'mala de bordo 10kg': 'viagem',
});

const SEARCH_ALIASES = Object.freeze({
  'lixeira inox pedal': ['lixeira inox pedal', 'lixeira automatica inox'],
  'mop giratorio': ['mop giratorio', 'esfregao mop'],
  'jogo de lencol percal': ['jogo de lencol percal', 'jogo lencol casal'],
  'protetor solar facial': ['protetor solar facial', 'protetor solar'],
  'vitamina c facial': ['vitamina c facial', 'serum vitamina c'],
  'secador de cabelo profissional': ['secador de cabelo profissional', 'secador cabelo'],
  'mouse sem fio': ['mouse sem fio', 'mouse wireless'],
  'teclado mecanico': ['teclado mecanico', 'teclado gamer mecanico'],
  'mochila impermeavel notebook': ['mochila impermeavel notebook', 'mochila notebook'],
  'tenis masculino caminhada': ['tenis masculino caminhada', 'tenis caminhada'],
  'mala de bordo 10kg': ['mala de bordo 10kg', 'mala de bordo'],
});

function normalizeMercadoLivreDiscoveryProduct(product) {
  const currentPrice = Number(product.current_price || product.price || 0);
  const oldPrice = product.old_price != null ? Number(product.old_price) : (product.original_price != null ? Number(product.original_price) : null);
  const sourceIntent = product.intent || product.subcategory || 'geral';
  const macroGroup = ML_RADAR_INTENT_MACRO_GROUPS[sourceIntent] || 'geral';

  return {
    itemId: product.item_id || product.id || null,
    productId: product.product_id || null,
    productName: product.product_name || product.title || '',
    categoryName: product.category_name || null,
    currentPrice,
    oldPrice,
    discountPercent: product.discount_percent || 0,
    sourceIntent,
    macroGroup,
    domainId: product.domain_id || null,
    categoryId: product.category_id || null,
    imageUrl: product.image_url || product.image || null,
    productUrl: product.product_url || product.canonical_url || null,
    sourcePosition: product.source_position || product.rank || null,
    commissionPercent: 0,
    sales: null,
    rating: null,
  };
}

async function collectMercadoLivreRadarDiscoveryV1({ accessToken, tokenProvider, coverageRunner, env } = {}) {
  let token = accessToken;
  if (!token && typeof tokenProvider === 'function') {
    token = await tokenProvider({ env, persist: false });
  }

  const runner = coverageRunner || (async (input) => runMercadoLivreOfficialIntentCoverage({ ...input, env }));
  const result = await runner({
    keywords: ML_RADAR_DISCOVERY_INTENTS,
    accessToken: token,
    maxPerIntent: 4,
    delayMs: 200,
  });

  const rawProducts = result?.products || result?.top || [];
  const seenIds = new Set();
  const validProducts = [];

  for (const p of rawProducts) {
    const id = p.item_id || p.id;
    const price = Number(p.current_price || p.price || 0);
    if (!id || seenIds.has(id) || price <= 0) continue;
    seenIds.add(id);
    validProducts.push(normalizeMercadoLivreDiscoveryProduct(p));
  }

  return validProducts;
}

function getMercadoLivreCertifiedFamilies() {
  return [];
}

// CLI Execution
async function main() {
  const args = process.argv.slice(2);
  const scenarioArg = args.find((a) => a.startsWith('--scenario='))?.split('=')[1] || 'casa_cozinha_editorial';
  const searchArg = args.find((a) => a.startsWith('--search='))?.split('=')[1];

  console.log('='.repeat(70));
  console.log('🛒 MOTOR OFICIAL MERCADO LIVRE OPENAPI');
  console.log('='.repeat(70));

  if (searchArg) {
    console.log(`🔎 Executando busca direta por: "${searchArg}"...`);
    const res = await searchMercadoLivreOffers({ keyword: searchArg, limit: 15 });
    console.log(`\nEncontrados: ${res.rawCount} brutos | ${res.eligibleCount} elegíveis e filtrados:`);
    console.table(
      res.products.map((p) => ({
        ID: p.itemId,
        Produto: p.productName.slice(0, 38) + '...',
        Preço: `R$ ${p.currentPrice.toFixed(2)}`,
        Desconto: `${p.discountPercent}%`,
        Vendas: p.sales,
        Nota: `⭐ ${p.ratingStar}`,
        Full: p.isFull ? '⚡ SIM' : 'NÃO',
        LojaOficial: p.officialStore ? '👑 SIM' : 'NÃO',
        Score: p.score,
      }))
    );
  } else {
    console.log(`🎯 Executando descoberta para o cenário: "${scenarioArg}"...`);
    const res = await discoverMercadoLivreScenarioOffers(scenarioArg, { targetTotal: 25 });
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
        Full: p.isFull ? '⚡ SIM' : 'NÃO',
        LojaOficial: p.officialStore ? '👑 SIM' : 'NÃO',
        Score: p.score,
      }))
    );
  }
}

if (require.main === module) {
  require('dotenv').config({ path: '.env.local', quiet: true });
  main().catch((err) => {
    console.error('❌ Erro no Mercado Livre Engine:', err.message);
    process.exit(1);
  });
}

module.exports = {
  API_ROOT,
  DEFAULT_MAX_PER_INTENT,
  ML_OPPORTUNITY_STRATEGY_VERSION,
  ML_RADAR_DISCOVERY_INTENTS,
  ML_RADAR_INTENT_MACRO_GROUPS,
  SEARCH_ALIASES,
  refreshAccessToken,
  persistRefreshedCredentials,
  apiGet,
  normalizeMercadoLivreProduct,
  normalizeMercadoLivreDiscoveryProduct,
  collectMercadoLivreRadarDiscoveryV1,
  isEligibleMercadoLivreCandidate,
  calculateMercadoLivreScore,
  searchMercadoLivreOffers,
  discoverMercadoLivreScenarioOffers,
  buildMercadoLivreIngestions,
  runMercadoLivreOfficialIntentCoverage,
  runMercadoLivreNativeTop20,
  classifyMercadoLivreProduct,
  getMercadoLivreCertifiedFamilies,
};
