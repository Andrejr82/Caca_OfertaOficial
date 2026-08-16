/**
 * Oracle Trends Radar Runner - Task 2B
 *
 * Motor autônomo executado na VPS Oracle para processamento do Radar de Tendências.
 * Regras:
 * 1. MARKETPLACE-FIRST: Shopee e Mercado Livre como fontes primárias de descoberta comercial.
 * 2. SEM SEEDS FIXAS: Descoberta ampla via categorias oficiais, sortType da OpenAPI e feeds oficiais.
 * 3. SNAPSHOT COMERCIAL: Persistência de itemId, shopId, sales, rating, preços, comissões, shopType e provenance.
 * 4. TENDÊNCIA BASEADA EM HISTÓRICO: sales_velocity = sales_atual - sales_anterior.
 *    Sem histórico => status = insufficient_history (nunca inventar crescimento).
 * 5. RANKING TASK 2B: Ordenação por sales_velocity > 0, fallback explícito para sales absoluto.
 * 6. ZERO PUBLISH: Nenhuma chamada externa de publicação, nenhum post gerado.
 * 7. ZERO CONCORRÊNCIA: Integrado ao ciclo do oracle-scraper sem novo daemon ou scheduler.
 */

'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { SCENARIO_CONTRACTS, GRAPHQL_CONTRACTS, createSignedRequest } = require('./shopee-openapi-shadow-engine-v1.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('./mercadolivre-official-intents-v5.cjs');

const RUNNER_CONTRACT_VERSION = 'trend-executive.oracle-radar-runner/v2b';

// Categorias oficiais amplas da Shopee para descoberta abrangente sem seeds fixas
const SHOPEE_BROAD_DISCOVERY_CATEGORIES = Object.freeze([
  100010, // Casa e Cozinha / Eletroportáteis
  100013, // Celulares e Acessórios
  100644, // Informática e Periféricos
  100636, // Móveis e Decoração / Ferramentas
  100630, // Beleza e Cuidados Pessoais
  100535, // Áudio / TVs
  100009, // Moda Masculina
  100011, // Moda Feminina
  100637, // Esportes e Fitness
  100631, // Pet Shop
  100634, // Games e Consoles
]);

function defaultShopeeApiCaller() {
  const appId = process.env.SHOPEE_APP_ID;
  const appSecret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !appSecret) return null;
  return createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch('https://open-api.affiliate.shopee.com.br/graphql', {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, data: await response.json() };
    },
  });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNumber(value, fallback = 0) {
  const result = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(result) ? result : fallback;
}

function getSupabaseAdmin(env = process.env, customClient = null) {
  if (customClient) return customClient;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado (URL ou SERVICE_ROLE_KEY ausente).');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findPendingTrendRadarRun(client) {
  const { data: runs, error } = await client
    .from('trend_radar_runs')
    .select('id, user_id, radar_date, window_start, window_end, strategy_version, status, source_health, executive_summary, created_at')
    .eq('status', 'building')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) throw new Error(`Falha ao buscar solicitações do Radar: ${error.message}`);
  if (!Array.isArray(runs) || runs.length === 0) return null;

  const requestedRun = runs.find((run) => {
    const health = run.source_health || {};
    return health.runtime === 'oracle' || health.status === 'requested' || health.status === 'building';
  });

  return requestedRun || runs[0];
}

async function markTrendRadarRunRunning(client, runId, existingHealth = {}) {
  const updatedHealth = {
    ...existingHealth,
    runtime: 'oracle',
    status: 'running',
    running_at: new Date().toISOString(),
  };

  const { error } = await client
    .from('trend_radar_runs')
    .update({
      source_health: updatedHealth,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw new Error(`Falha ao marcar Radar como running: ${error.message}`);
  return updatedHealth;
}

/**
 * Coleta candidatos comerciais da Shopee sem autoridade em seeds hardcoded.
 * Utiliza:
 * 1. Categorias amplas com ordenação por popularidade/vendas (sortType: 1/2).
 * 2. Feeds oficiais DELTA/BASE quando disponíveis na conta.
 */
async function collectShopeeMarketplaceCandidates({
  request = null,
  categoryIds = SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  maxPerCategory = 10,
  env = process.env,
} = {}) {
  const caller = request || defaultShopeeApiCaller();
  if (!caller) return [];
  const candidates = [];
  const seenItemIds = new Set();

  const targetCategories = Array.isArray(categoryIds) && categoryIds.length > 0
    ? categoryIds
    : [null];

  for (const catId of targetCategories) {
    try {
      const variables = {
        page: 1,
        limit: Math.max(5, maxPerCategory),
        sortType: 2, // Popularidade / Vendas reais
        isAMSOffer: true,
      };
      if (catId) {
        variables.productCatId = catId;
      }

      const response = await caller(
        'ShopeePromotionOffers',
        GRAPHQL_CONTRACTS.productOfferV2.query,
        variables,
        { timeoutMs: 15000 }
      );

      const nodes = response?.data?.data?.productOfferV2?.nodes || [];
      for (const node of nodes) {
        const itemId = String(node.itemId || '').trim();
        if (!itemId || seenItemIds.has(itemId)) continue;
        seenItemIds.add(itemId);

        const productName = String(node.productName || '').trim();
        if (!productName) continue;

        const price = parseNumber(node.priceMin || node.priceMax, 0);
        const oldPrice = parseNumber(node.priceMax, price);
        const discount = parseNumber(node.priceDiscountRate, 0);
        const sales = parseInt(String(node.sales || '0'), 10) || 0;
        const ratingStar = parseNumber(node.ratingStar, 4.5);
        const commRate = parseNumber(node.commissionRate, 0);
        const sellerCommRate = parseNumber(node.sellerCommissionRate, 0);
        const commissionPercent = Math.round((commRate > 0 && commRate <= 1 ? commRate * 100 : commRate) * 100) / 100;
        const sellerCommissionPercent = Math.round((sellerCommRate > 0 && sellerCommRate <= 1 ? sellerCommRate * 100 : sellerCommRate) * 100) / 100;
        const shopType = Array.isArray(node.shopType) ? node.shopType : [];
        const link = String(node.offerLink || node.productLink || '');

        candidates.push({
          marketplace: 'Shopee',
          itemId,
          shopId: String(node.shopId || ''),
          shopName: String(node.shopName || ''),
          productName,
          category: 'Marketplace Deals',
          currentPrice: price,
          oldPrice: oldPrice > price ? oldPrice : null,
          priceDiscountRate: discount,
          discountPercent: discount,
          sales,
          ratingStar,
          rating: ratingStar,
          commissionRate: commissionPercent,
          commissionPercent,
          sellerCommissionRate: sellerCommissionPercent,
          shopType,
          permalink: link,
          imageUrl: String(node.imageUrl || ''),
          provenance: 'shopee_openapi_productOfferV2',
          observedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      // Falha em uma categoria não aborta a coleta geral
    }
  }

  return candidates;
}

/**
 * Coleta candidatos comerciais do Mercado Livre via intenções oficiais.
 */
async function collectMercadoLivreMarketplaceCandidates({
  keywords = ['smart TV 4K', 'fone bluetooth', 'air fryer', 'notebook', 'tenis corrida', 'cadeira gamer'],
  accessToken = null,
  maxPerIntent = 5,
  env = process.env,
} = {}) {
  const candidates = [];
  const seenItemIds = new Set();

  try {
    const token = accessToken || (await refreshAccessToken({ env }).catch(() => null));
    if (!token) return [];

    const result = await runMercadoLivreOfficialIntentCoverage({
      accessToken: token,
      keywords,
      maxPerIntent: Math.max(3, maxPerIntent),
      delayMs: 200,
    });

    const products = Array.isArray(result?.products) ? result.products : [];
    for (const product of products) {
      const itemId = String(product.item_id || product.id || '').trim();
      if (!itemId || seenItemIds.has(itemId)) continue;
      seenItemIds.add(itemId);

      const productName = String(product.product_name || product.title || '').trim();
      if (!productName) continue;

      const price = parseNumber(product.price, 0);
      const oldPrice = parseNumber(product.original_price, 0);
      const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
      const sales = parseInt(String(product.sold_quantity || '0'), 10) || 0;
      const rating = parseNumber(product.rating, 4.5);

      candidates.push({
        marketplace: 'Mercado Livre',
        itemId,
        productId: String(product.product_id || ''),
        productName,
        category: product.category_name || 'Marketplace Deals',
        currentPrice: price,
        oldPrice: oldPrice > price ? oldPrice : null,
        discountPercent: discount,
        priceDiscountRate: discount,
        sales,
        ratingStar: rating,
        rating,
        commissionPercent: 0,
        permalink: String(product.product_url || product.permalink || ''),
        imageUrl: String(product.image_url || product.thumbnail || ''),
        provenance: 'mercadolivre_official_intent',
        observedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    // Falha em ML não aborta execução
  }

  return candidates;
}

/**
 * Calcula sales_velocity com base no histórico real anterior do item.
 * Se não houver histórico anterior => status = 'insufficient_history' (nunca inventa crescimento).
 */
function computeCandidateSalesVelocity(candidate, previousItemsMap = new Map()) {
  const itemId = String(candidate.itemId || '').trim();
  const currentSales = typeof candidate.sales === 'number' ? candidate.sales : 0;
  const currentObservedAt = candidate.observedAt || new Date().toISOString();

  if (!itemId || !previousItemsMap || !previousItemsMap.has(itemId)) {
    return {
      velocity_status: 'insufficient_history',
      sales_velocity: null,
      sales_delta: null,
      previous_sales: null,
      current_sales: currentSales,
      observed_window: null,
    };
  }

  const previous = previousItemsMap.get(itemId);
  const prevSales = typeof previous.sales === 'number' ? previous.sales : 0;
  const prevObservedAt = previous.observedAt || previous.observed_at || null;

  const delta = currentSales - prevSales;
  let windowHours = null;

  if (prevObservedAt) {
    const diffMs = new Date(currentObservedAt).getTime() - new Date(prevObservedAt).getTime();
    if (diffMs > 0) {
      windowHours = Math.round((diffMs / (1000 * 3600)) * 10) / 10;
    }
  }

  return {
    velocity_status: 'computed',
    sales_velocity: delta,
    sales_delta: delta,
    previous_sales: prevSales,
    current_sales: currentSales,
    observed_window: prevObservedAt
      ? {
          previous_observed_at: prevObservedAt,
          current_observed_at: currentObservedAt,
          window_hours: windowHours,
        }
      : null,
  };
}

/**
 * Busca snapshots anteriores de produtos em trend_radar_products para o mesmo tenant.
 */
async function fetchRecentSnapshotItemsMap(client, tenantId = null) {
  const map = new Map();
  if (!client) return map;

  try {
    let runQuery = client
      .from('trend_radar_runs')
      .select('id, radar_date, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3);

    if (tenantId) {
      runQuery = runQuery.eq('user_id', tenantId);
    }

    const { data: runs, error: runsErr } = await runQuery;
    if (runsErr || !Array.isArray(runs) || runs.length === 0) return map;

    const runIds = runs.map((r) => r.id);

    const { data: products, error: prodErr } = await client
      .from('trend_radar_products')
      .select('id, radar_run_id, direct_evidence, created_at')
      .in('radar_run_id', runIds)
      .order('created_at', { ascending: false });

    if (prodErr || !Array.isArray(products)) return map;

    for (const prod of products) {
      const evidences = Array.isArray(prod.direct_evidence) ? prod.direct_evidence : [];
      for (const ev of evidences) {
        const itemId = ev?.marketplace_identity?.itemId || ev?.itemId;
        if (itemId && !map.has(itemId)) {
          const sales = ev?.commercial_metrics?.sales ?? ev?.sold_quantity ?? 0;
          const observedAt = ev?.observed_at || prod.created_at;
          map.set(itemId, { itemId, sales, observedAt });
        }
      }
    }
  } catch (err) {
    // Falha silenciosa: retorna mapa vazio e ativa fallback de insufficient_history
  }

  return map;
}

/**
 * Constrói produtos do Radar com ordenação temporária da Task 2B.
 */
function buildTrendRadarProductsFromCandidates({
  radarRunId,
  shopeeCandidates = [],
  mlCandidates = [],
  previousItemsMap = new Map(),
  maxProducts = 20,
  now = new Date(),
}) {
  const combined = [];
  const seenIdentities = new Set();

  const allCandidates = [...shopeeCandidates, ...mlCandidates];

  const enrichedCandidates = allCandidates.map((candidate) => {
    const velocity = computeCandidateSalesVelocity(candidate, previousItemsMap);
    return {
      ...candidate,
      velocityInfo: velocity,
    };
  });

  enrichedCandidates.sort((a, b) => {
    const aVelocity = a.velocityInfo.velocity_status === 'computed' ? (a.velocityInfo.sales_velocity || 0) : null;
    const bVelocity = b.velocityInfo.velocity_status === 'computed' ? (b.velocityInfo.sales_velocity || 0) : null;

    if (aVelocity !== null && bVelocity !== null) {
      if (aVelocity !== bVelocity) return bVelocity - aVelocity;
    }
    if (aVelocity !== null && aVelocity > 0 && (bVelocity === null || bVelocity <= 0)) return -1;
    if (bVelocity !== null && bVelocity > 0 && (aVelocity === null || aVelocity <= 0)) return 1;

    const aSales = a.sales || 0;
    const bSales = b.sales || 0;
    if (aSales !== bSales) return bSales - aSales;

    const aRating = a.ratingStar || a.rating || 0;
    const bRating = b.ratingStar || b.rating || 0;
    if (aRating !== bRating) return bRating - aRating;

    const aDiscount = a.discountPercent || 0;
    const bDiscount = b.discountPercent || 0;
    return bDiscount - aDiscount;
  });

  const prioritizedProducts = [];

  for (const candidate of enrichedCandidates) {
    if (prioritizedProducts.length >= maxProducts) break;

    const normalizedTerm = normalizeText(candidate.productName);
    const identityKey = `${normalizedTerm}\u0000${candidate.marketplace}`;
    if (!normalizedTerm || seenIdentities.has(identityKey)) continue;
    seenIdentities.add(identityKey);

    const priority = prioritizedProducts.length + 1;
    const isFocus = priority <= 3;
    const sales = candidate.sales || 0;
    const rating = candidate.ratingStar || candidate.rating || 4.5;
    const discount = candidate.discountPercent || 0;
    const price = candidate.currentPrice || 0;
    const oldPrice = candidate.oldPrice || null;

    const velocityInfo = candidate.velocityInfo;
    const hasVelocity = velocityInfo.velocity_status === 'computed' && velocityInfo.sales_velocity !== null;

    const provisionalScore = Math.min(
      99,
      Math.max(
        40,
        Math.round(
          50 +
            (hasVelocity && velocityInfo.sales_velocity > 0 ? 25 : 0) +
            (sales > 100 ? 15 : sales > 10 ? 5 : 0) +
            (discount > 15 ? 10 : 5) +
            (rating >= 4.7 ? 10 : 0)
        )
      )
    );

    const directEvidence = [
      {
        claim: `Produto comercial identificado em ${candidate.marketplace}`,
        evidence_type: 'marketplace_snapshot',
        provenance: candidate.provenance || (candidate.marketplace === 'Shopee' ? 'shopee_openapi_productOfferV2' : 'mercadolivre_official_intent'),
        source_url: candidate.permalink || null,
        observed_at: candidate.observedAt || now.toISOString(),
        rank_position: priority,
        best_seller_flag: sales >= 50,
        trending_flag: hasVelocity && velocityInfo.sales_velocity > 0,
        sold_quantity: sales,
        price: price || null,
        old_price: oldPrice || null,
        discount_percent: discount || null,
        rating: rating || null,
        marketplace_identity: {
          itemId: candidate.itemId || null,
          shopId: candidate.shopId || null,
          productId: candidate.productId || null,
          shopType: candidate.shopType || null,
        },
        commercial_metrics: {
          sales,
          ratingStar: rating,
          price,
          priceDiscountRate: candidate.priceDiscountRate || discount,
          commissionRate: candidate.commissionRate || candidate.commissionPercent || 0,
          sellerCommissionRate: candidate.sellerCommissionRate || 0,
        },
        temporal_metrics: velocityInfo,
      },
    ];

    const inferredSignals = [
      hasVelocity && velocityInfo.sales_velocity > 0 ? 'real_sales_acceleration' : 'baseline_catalog_snapshot',
      sales >= 50 ? 'marketplace_bestseller' : 'marketplace_catalog',
      discount >= 10 ? 'marketplace_promotion' : 'marketplace_standard',
    ];

    prioritizedProducts.push({
      radar_run_id: radarRunId,
      priority,
      product_term: candidate.productName,
      normalized_product_term: normalizedTerm,
      category: candidate.category || null,
      marketplace: candidate.marketplace,
      evidence_status: sales > 0 || rating > 0 ? 'verified' : 'partial',
      source_count: 1,
      commercial_score: provisionalScore,
      confidence: Math.min(
        95,
        Math.max(60, Math.round(60 + (hasVelocity ? 20 : 0) + (sales > 50 ? 10 : 5) + (rating >= 4.5 ? 10 : 5)))
      ),
      direct_evidence: directEvidence,
      inferred_signals: inferredSignals,
      affiliate_potential:
        sales >= 100 || (candidate.commissionPercent && candidate.commissionPercent > 5) ? 'high' : 'medium',
      visual_content_potential: isFocus ? 'high' : 'medium',
      recommended_channel: null,
      recommended_format: null,
      match_status: 'pending',
      opportunity_id: null,
      is_focus: isFocus,
    });
  }

  return prioritizedProducts;
}

async function persistTrendRadarSnapshot({
  client,
  run,
  products,
  shopeeCount = 0,
  mlCount = 0,
  dryRun = false,
}) {
  if (dryRun) {
    return { runId: run.id, productsCount: products.length, shopeeCount, mlCount, persisted: false };
  }

  const { error: deleteError } = await client
    .from('trend_radar_products')
    .delete()
    .eq('radar_run_id', run.id);

  if (deleteError) throw new Error(`Falha ao limpar produtos: ${deleteError.message}`);

  if (products.length > 0) {
    const { error: insertError } = await client.from('trend_radar_products').insert(products);
    if (insertError) throw new Error(`Falha ao inserir produtos: ${insertError.message}`);
  }

  const updatedHealth = {
    ...(run.source_health || {}),
    runtime: 'oracle',
    status: 'completed',
    completed_at: new Date().toISOString(),
    google_trends_used: false,
    marketplaces: ['Shopee', 'Mercado Livre'],
    shopee_candidates_found: shopeeCount,
    mercado_livre_candidates_found: mlCount,
    total_products_selected: products.length,
  };

  const executiveSummary = {
    products_count: products.length,
    marketplaces: ['Shopee', 'Mercado Livre'],
    top_product: products[0]?.product_term || null,
    generated_by: 'oracle_marketplace_first_engine_v2b',
    contract: RUNNER_CONTRACT_VERSION,
  };

  const { error: updateError } = await client
    .from('trend_radar_runs')
    .update({
      status: 'completed',
      source_health: updatedHealth,
      executive_summary: executiveSummary,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id);

  if (updateError) throw new Error(`Falha ao concluir run: ${updateError.message}`);

  return { runId: run.id, productsCount: products.length, shopeeCount, mlCount, persisted: true };
}

async function processPendingTrendRadarRuns({
  client = null,
  env = process.env,
  dryRun = false,
  shopeeCollector = collectShopeeMarketplaceCandidates,
  mlCollector = collectMercadoLivreMarketplaceCandidates,
  stageLogger = null,
} = {}) {
  const supabase = getSupabaseAdmin(env, client);
  const pendingRun = await findPendingTrendRadarRun(supabase);

  if (!pendingRun) {
    return { processed: false, reason: 'no_pending_requests', googleTrendsUsed: false, publishCalls: 0 };
  }

  const runId = pendingRun.id;
  const radarDate = pendingRun.radar_date;

  if (stageLogger) stageLogger('trends_radar_identified', { runId, radarDate });
  console.log(`[Oracle Trends Radar] Processando solicitação runId=${runId} data=${radarDate}`);

  if (!dryRun) {
    await markTrendRadarRunRunning(supabase, runId, pendingRun.source_health || {});
  }

  const previousItemsMap = await fetchRecentSnapshotItemsMap(supabase, pendingRun.user_id);

  let shopeeCandidates = [];
  try {
    shopeeCandidates = await shopeeCollector({ env });
    console.log(`[Oracle Trends Radar] Shopee: ${shopeeCandidates.length} candidatos coletados`);
  } catch (err) {
    console.error(`[Oracle Trends Radar] Erro Shopee: ${err.message}`);
  }

  let mlCandidates = [];
  try {
    mlCandidates = await mlCollector({ env });
    console.log(`[Oracle Trends Radar] Mercado Livre: ${mlCandidates.length} candidatos coletados`);
  } catch (err) {
    console.error(`[Oracle Trends Radar] Erro ML: ${err.message}`);
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: runId,
    shopeeCandidates,
    mlCandidates,
    previousItemsMap,
    maxProducts: 20,
  });

  const result = await persistTrendRadarSnapshot({
    client: supabase,
    run: pendingRun,
    products,
    shopeeCount: shopeeCandidates.length,
    mlCount: mlCandidates.length,
    dryRun,
  });

  console.log(`[Oracle Trends Radar] Concluído runId=${runId} produtos=${products.length} persisted=${result.persisted}`);

  return {
    processed: true,
    runId,
    radarDate,
    productsCount: products.length,
    shopeeCandidatesCount: shopeeCandidates.length,
    mlCandidatesCount: mlCandidates.length,
    persisted: result.persisted,
    googleTrendsUsed: false,
    publishCalls: 0,
    postsWrites: 0,
    offersWrites: 0,
  };
}

module.exports = {
  RUNNER_CONTRACT_VERSION,
  SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  normalizeText,
  parseNumber,
  findPendingTrendRadarRun,
  markTrendRadarRunRunning,
  collectShopeeMarketplaceCandidates,
  collectMercadoLivreMarketplaceCandidates,
  computeCandidateSalesVelocity,
  fetchRecentSnapshotItemsMap,
  buildTrendRadarProductsFromCandidates,
  persistTrendRadarSnapshot,
  processPendingTrendRadarRuns,
};
