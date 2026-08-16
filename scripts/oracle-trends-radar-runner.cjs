const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { SCENARIO_QUERY_PLANS, GRAPHQL_CONTRACTS, createSignedRequest } = require('./shopee-openapi-shadow-engine-v1.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('./mercadolivre-official-intents-v5.cjs');
const { SCENARIOS: EDITORIAL_SCENARIOS } = require('./editorial-scenario-config.cjs');

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

const RUNNER_CONTRACT_VERSION = 'trend-executive.oracle-radar-runner/v1';

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

  // Priorizar run com marcação explícita oracle/requested
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

async function collectShopeeMarketplaceCandidates({
  request = null,
  queries = ['fone bluetooth', 'relogio inteligente', 'liquidificador', 'air fryer', 'teclado gamer', 'tenis corrida'],
  maxPerQuery = 5,
  env = process.env,
} = {}) {
  const caller = request || defaultShopeeApiCaller();
  if (!caller) return [];
  const candidates = [];
  const seenItemIds = new Set();

  for (const query of queries) {
    try {
      const response = await caller('ShopeePromotionOffers', GRAPHQL_CONTRACTS.productOfferV2.query, {
        keyword: query,
        page: 1,
        limit: Math.max(5, maxPerQuery),
        sortType: 2, // Sort by popular / sales
        isAMSOffer: true,
      }, { timeoutMs: 15000 });

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
        const rating = parseNumber(node.ratingStar, 4.5);
        const commission = parseNumber(node.commissionRate, 0) * 100;
        const link = String(node.offerLink || node.productLink || '');

        candidates.push({
          marketplace: 'Shopee',
          itemId,
          shopId: String(node.shopId || ''),
          productName,
          category: 'Marketplace Deals',
          currentPrice: price,
          oldPrice: oldPrice > price ? oldPrice : null,
          discountPercent: discount,
          sales,
          rating,
          commissionPercent: commission,
          permalink: link,
          imageUrl: String(node.imageUrl || ''),
          queryUsed: query,
          observedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      // Falhas parciais não abortam coleta global
    }
  }

  return candidates;
}

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
        sales,
        rating,
        commissionPercent: 0,
        permalink: String(product.product_url || product.permalink || ''),
        imageUrl: String(product.image_url || product.thumbnail || ''),
        queryUsed: product.intent || keywords[0],
        observedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    // Falha em ML não aborta execução
  }

  return candidates;
}

function buildTrendRadarProductsFromCandidates({
  radarRunId,
  shopeeCandidates = [],
  mlCandidates = [],
  maxProducts = 20,
  now = new Date(),
}) {
  const combined = [];
  const seenIdentities = new Set();

  // Intercalar candidatos Shopee e Mercado Livre (Marketplace-First)
  const maxLen = Math.max(shopeeCandidates.length, mlCandidates.length);
  for (let i = 0; i < maxLen; i++) {
    if (shopeeCandidates[i]) combined.push(shopeeCandidates[i]);
    if (mlCandidates[i]) combined.push(mlCandidates[i]);
  }

  const prioritizedProducts = [];

  for (const candidate of combined) {
    if (prioritizedProducts.length >= maxProducts) break;

    const normalizedTerm = normalizeText(candidate.productName);
    const identityKey = `${normalizedTerm}\u0000${candidate.marketplace}`;
    if (!normalizedTerm || seenIdentities.has(identityKey)) continue;
    seenIdentities.add(identityKey);

    const priority = prioritizedProducts.length + 1;
    const isFocus = priority <= 3;
    const sales = candidate.sales || 0;
    const rating = candidate.rating || 4.5;
    const discount = candidate.discountPercent || 0;

    // Indicador provisório para Task 2 (Task 3 construirá o score definitivo)
    const provisionalScore = Math.min(
      99,
      Math.max(40, Math.round(50 + (sales > 100 ? 20 : sales > 10 ? 10 : 0) + (discount > 15 ? 15 : 5) + (rating >= 4.7 ? 10 : 0)))
    );

    const directEvidence = [
      {
        claim: `Produto comercial em alta no ${candidate.marketplace}`,
        evidence_type: 'marketplace_listing',
        source_url: candidate.permalink || null,
        observed_at: candidate.observedAt || now.toISOString(),
        rank_position: priority,
        best_seller_flag: sales >= 50,
        trending_flag: true,
        sold_quantity: sales,
        price: candidate.currentPrice || null,
        old_price: candidate.oldPrice || null,
        discount_percent: discount || null,
        rating: rating || null,
        marketplace_identity: {
          itemId: candidate.itemId || null,
          shopId: candidate.shopId || null,
          productId: candidate.productId || null,
        },
      },
    ];

    const inferredSignals = [
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
      confidence: Math.min(95, Math.max(60, Math.round(60 + (sales > 50 ? 20 : 10) + (rating >= 4.5 ? 15 : 5)))),
      direct_evidence: directEvidence,
      inferred_signals: inferredSignals,
      affiliate_potential: sales >= 100 || (candidate.commissionPercent && candidate.commissionPercent > 5) ? 'high' : 'medium',
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
    return {
      runId: run.id,
      productsCount: products.length,
      shopeeCount,
      mlCount,
      persisted: false,
    };
  }

  // 1. Limpar produtos anteriores deste run (se houver)
  const { error: deleteError } = await client
    .from('trend_radar_products')
    .delete()
    .eq('radar_run_id', run.id);

  if (deleteError) {
    throw new Error(`Falha ao limpar produtos antigos do Radar: ${deleteError.message}`);
  }

  // 2. Inserir novos produtos
  if (products.length > 0) {
    const { error: insertError } = await client
      .from('trend_radar_products')
      .insert(products);

    if (insertError) {
      throw new Error(`Falha ao persistir produtos do Radar: ${insertError.message}`);
    }
  }

  // 3. Atualizar status do run para completed
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
    generated_by: 'oracle_marketplace_first_engine',
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

  if (updateError) {
    throw new Error(`Falha ao concluir status do trend_radar_run: ${updateError.message}`);
  }

  return {
    runId: run.id,
    productsCount: products.length,
    shopeeCount,
    mlCount,
    persisted: true,
  };
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
    if (stageLogger) stageLogger.log('radar.check', { status: 'idle', message: 'Nenhuma solicitação pendente do Radar.' });
    return {
      processed: false,
      reason: 'no_pending_requests',
      googleTrendsUsed: false,
      publishCalls: 0,
    };
  }

  console.log(`[Oracle Trends Radar] Processando solicitação runId=${pendingRun.id} data=${pendingRun.radar_date}`);

  // Marcar como running se não for dry-run
  if (!dryRun) {
    await markTrendRadarRunRunning(supabase, pendingRun.id, pendingRun.source_health);
  }

  // 1. Coleta Shopee (Marketplace-First)
  const shopeeCandidates = await shopeeCollector({ env });
  console.log(`[Oracle Trends Radar] Shopee: ${shopeeCandidates.length} candidatos comerciais coletados`);

  // 2. Coleta Mercado Livre (Marketplace-First)
  const mlCandidates = await mlCollector({ env });
  console.log(`[Oracle Trends Radar] Mercado Livre: ${mlCandidates.length} candidatos comerciais coletados`);

  // 3. Google Trends NÃO participa do fluxo principal
  const googleTrendsUsed = false;

  // 4. Montar snapshot de produtos
  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: pendingRun.id,
    shopeeCandidates,
    mlCandidates,
    maxProducts: 20,
  });

  // 5. Persistir no Supabase
  const result = await persistTrendRadarSnapshot({
    client: supabase,
    run: pendingRun,
    products,
    shopeeCount: shopeeCandidates.length,
    mlCount: mlCandidates.length,
    dryRun,
  });

  console.log(`[Oracle Trends Radar] Concluído runId=${pendingRun.id} produtos=${products.length} persisted=${result.persisted}`);

  return {
    processed: true,
    runId: pendingRun.id,
    productsCount: products.length,
    shopeeCount: shopeeCandidates.length,
    mlCount: mlCandidates.length,
    googleTrendsUsed,
    publishCalls: 0,
    postsWrites: 0,
    offersWrites: 0,
    persisted: result.persisted,
  };
}

module.exports = {
  RUNNER_CONTRACT_VERSION,
  normalizeText,
  findPendingTrendRadarRun,
  markTrendRadarRunRunning,
  collectShopeeMarketplaceCandidates,
  collectMercadoLivreMarketplaceCandidates,
  buildTrendRadarProductsFromCandidates,
  persistTrendRadarSnapshot,
  processPendingTrendRadarRuns,
};
