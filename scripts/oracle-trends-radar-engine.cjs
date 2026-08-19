/**
 * Oracle Trends Radar Engine V2 — Caça Ofertas Oficial
 *
 * Motor de descoberta, viabilidade comercial, deduplicação e ranking executivo.
 *
 * Regras do Contrato:
 * 1. MARKETPLACE-FIRST: Shopee e Mercado Livre como fontes primárias de descoberta comercial.
 * 2. GOOGLE TRENDS FORA: google_trends_used = false sempre.
 * 3. IDENTIDADE MERCADO LIVRE: prioridade 1 para productId de catálogo.
 * 4. IDENTIDADE SHOPEE: shopId + itemId nativo.
 * 5. DEDUPLICAÇÃO SEMÂNTICA: eliminação de produtos equivalentes/variantes redundantes.
 * 6. COMMERCIAL VIABILITY V2: cálculo determinístico de dados observados (high | medium | low | insufficient_data).
 * 7. ZERO PUBLISH: Nenhuma publicação automática, nenhuma oferta criada automaticamente.
 * 8. REFILL CONTROLADO: Alvo 20 produtos (mínimo 10).
 */

'use strict';

const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const {
  GRAPHQL_CONTRACTS,
  createSignedRequest,
  normalizePriceIntegrity,
} = require('./shopee-openapi-shadow-engine-v1.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('./mercadolivre-official-intents-v5.cjs');
const {
  COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
  calculateCommercialOpportunityScoreV3,
} = require(path.join(__dirname, '../src/core/trends/commercial-opportunity-score-v3.cjs'));
const {
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  calculateCommercialViabilityV2,
  isViableForRadar,
} = require('./commercial-viability-v2.cjs');
const {
  DEFAULT_RECENCY_DAYS,
  getMarketplaceIdentityKey,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
  filterCandidatesWithRecency,
  fetchCompletedRadarIdentityKeys,
  fetchExistingOfferIdentityKeys,
} = require('./oracle-trends-radar-freshness.cjs');
const {
  extractSemanticClusterKey,
  deduplicateCatalogAndSemantic,
  applyFamilyDiversityCap,
} = require('./radar-semantic-dedup-v2.cjs');

const RUNNER_CONTRACT_VERSION = 'trend-executive.oracle-radar-runner/v4-viability-v2';

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

function defaultShopeeApiCaller(env = process.env) {
  const appId = env.SHOPEE_APP_ID;
  const appSecret = env.SHOPEE_APP_SECRET;
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

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(String(value).replace(',', '.'));
  return Number.isFinite(result) ? result : null;
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
 * Coleta candidatos comerciais da Shopee com paginação oficial e parada quando vazia.
 */
async function collectShopeeMarketplaceCandidates({
  request = null,
  categoryIds = SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  maxPerCategory = 30,
  page = 1,
  env = process.env,
} = {}) {
  const caller = request || defaultShopeeApiCaller(env);
  if (!caller) return [];
  const candidates = [];
  const seenIdentities = new Set();

  const targetCategories = Array.isArray(categoryIds) && categoryIds.length > 0
    ? categoryIds
    : [null];

  for (const catId of targetCategories) {
    try {
      const variables = {
        page: Math.max(1, Number(page) || 1),
        limit: Math.max(5, Number(maxPerCategory) || 30),
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
      if (!Array.isArray(nodes) || nodes.length === 0) {
        // Categoria sem mais produtos nesta página
        continue;
      }

      for (const node of nodes) {
        const itemId = String(node.itemId || '').trim();
        const shopId = String(node.shopId || '').trim();
        const productName = String(node.productName || '').trim();
        if (!itemId || !productName) continue;

        const identityKey = `${shopId || '0'}:${itemId}`;
        if (seenIdentities.has(identityKey)) continue;
        seenIdentities.add(identityKey);

        const priceIntegrity = normalizePriceIntegrity({
          price: node.price,
          priceMin: node.priceMin,
          priceMax: node.priceMax,
          priceDiscountRate: node.priceDiscountRate,
          officialOldPrice: node.officialOldPrice,
        });
        const price = priceIntegrity.currentPrice;
        if (!(price > 0)) continue;

        const oldPrice = priceIntegrity.oldPrice;
        const discount = priceIntegrity.discountPercent ?? 0;
        const marketplaceReportedDiscountPercent = parseNumber(node.priceDiscountRate, 0);
        const sales = parseInt(String(node.sales || '0'), 10) || 0;
        const ratingStar = parseNumber(node.ratingStar, 0);
        const commRate = parseNumber(node.commissionRate, 0);
        const sellerCommRate = parseNumber(node.sellerCommissionRate, 0);
        const commissionPercent = Math.round((commRate > 0 && commRate <= 1 ? commRate * 100 : commRate) * 100) / 100;
        const sellerCommissionPercent = Math.round((sellerCommRate > 0 && sellerCommRate <= 1 ? sellerCommRate * 100 : sellerCommRate) * 100) / 100;
        const shopType = Array.isArray(node.shopType) ? node.shopType : [];
        const link = String(node.offerLink || node.productLink || '');

        candidates.push({
          marketplace: 'Shopee',
          itemId,
          shopId,
          shopName: String(node.shopName || ''),
          productName,
          category: 'Marketplace Deals',
          currentPrice: price,
          oldPrice,
          priceDiscountRate: parseNumber(node.priceDiscountRate, discount),
          discountPercent: discount || parseNumber(node.priceDiscountRate, 0),
          marketplaceReportedDiscountPercent,
          priceRangeAmbiguous: priceIntegrity.rangeAmbiguous,
          priceAuthority: priceIntegrity.priceAuthority,
          oldPriceAuthority: priceIntegrity.oldPriceAuthority,
          discountAuthority: priceIntegrity.discountAuthority,
          sales,
          ratingStar: ratingStar > 0 ? ratingStar : null,
          rating: ratingStar > 0 ? ratingStar : null,
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
    } catch (_err) {
      // Falha em uma categoria não aborta a coleta geral
    }
  }

  return candidates;
}

function normalizeMercadoLivreRadarProduct(product, observedAt = new Date().toISOString()) {
  const itemId = String(product?.item_id || product?.id || '').trim();
  const productName = String(product?.product_name || product?.title || '').trim();
  if (!itemId || !productName) return null;

  const price = parseOptionalNumber(product.current_price ?? product.price);
  const oldPriceValue = parseOptionalNumber(product.old_price ?? product.original_price);
  const oldPrice = oldPriceValue !== null && price !== null && oldPriceValue > price ? oldPriceValue : null;
  const explicitDiscount = parseOptionalNumber(product.discount_percent);
  const discount = oldPrice !== null && price !== null && price > 0
    ? Math.round((((oldPrice - price) / oldPrice) * 100) * 100) / 100
    : (explicitDiscount ?? 0);
  const sales = parseOptionalNumber(product.sold_quantity ?? product.sales);
  const rating = parseOptionalNumber(product.rating ?? product.ratingStar);

  return {
    marketplace: 'Mercado Livre',
    itemId,
    productId: String(product.product_id || product.productId || '').trim(),
    productName,
    category: product.category_name || 'Marketplace Deals',
    currentPrice: price,
    oldPrice,
    discountPercent: discount,
    priceDiscountRate: discount,
    sales,
    ratingStar: rating,
    rating,
    commissionPercent: 0,
    permalink: String(product.product_url || product.permalink || ''),
    imageUrl: String(product.image_url || product.thumbnail || ''),
    provenance: 'mercadolivre_official_intent',
    observedAt,
  };
}

/**
 * Coleta candidatos comerciais do Mercado Livre via intenções oficiais.
 * Divide as keywords em batches determinísticos e não sobrepostos por round (page).
 * Quando todos os batches/intents forem consumidos, retorna [] sinalizando esgotamento factual.
 */
async function collectMercadoLivreMarketplaceCandidates({
  keywords = ['smart TV 4K', 'fone bluetooth', 'air fryer', 'notebook', 'tenis corrida', 'cadeira gamer', 'lixeira inox', 'suporte notebook', 'tapete pet'],
  accessToken = null,
  maxPerIntent = 5,
  page = 1,
  batchSize = 3,
  env = process.env,
  coverageRunner = runMercadoLivreOfficialIntentCoverage,
  tokenProvider = refreshAccessToken,
} = {}) {
  const candidates = [];
  const seenIds = new Set();

  try {
    const round = Math.max(1, Number(page) || 1);
    const size = Math.max(1, Number(batchSize) || 3);
    const totalKeywords = Array.isArray(keywords) ? keywords.length : 0;

    const startIndex = (round - 1) * size;
    // Se a página/round solicitar um índice além do total de keywords disponíveis,
    // todos os batches foram consumidos: sinalizar esgotamento real retornando vazio.
    if (startIndex >= totalKeywords) {
      return [];
    }

    const endIndex = Math.min(startIndex + size, totalKeywords);
    const roundKeywords = keywords.slice(startIndex, endIndex);
    if (!roundKeywords.length) {
      return [];
    }

    const token = accessToken || (await tokenProvider({ env }).catch(() => null));
    if (!token) return [];

    const result = await coverageRunner({
      accessToken: token,
      keywords: roundKeywords,
      maxPerIntent: Math.max(3, maxPerIntent),
      delayMs: 150,
    });

    const products = Array.isArray(result?.products) ? result.products : [];
    for (const product of products) {
      const candidate = normalizeMercadoLivreRadarProduct(product);
      if (!candidate || candidate.currentPrice === null || candidate.currentPrice <= 0) continue;

      const key = candidate.productId ? `ml_prod_${candidate.productId}` : `ml_item_${candidate.itemId}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);

      candidates.push(candidate);
    }
  } catch (_err) {
    // Falha em ML não aborta execução
  }

  return candidates;
}

/**
 * Calcula sales_velocity com base no histórico real anterior do item.
 */
function computeCandidateSalesVelocity(candidate, previousItemsMap = new Map()) {
  const itemId = String(candidate.itemId || '').trim();
  const currentSales = typeof candidate.sales === 'number' ? candidate.sales : null;
  const currentObservedAt = candidate.observedAt || new Date().toISOString();

  if (currentSales === null || !itemId || !previousItemsMap || !previousItemsMap.has(itemId)) {
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
  const prevSales = typeof previous.sales === 'number' ? previous.sales : null;
  const prevObservedAt = previous.observedAt || previous.observed_at || null;
  if (prevSales === null) {
    return {
      velocity_status: 'insufficient_history',
      sales_velocity: null,
      sales_delta: null,
      previous_sales: null,
      current_sales: currentSales,
      observed_window: null,
    };
  }

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

    if (tenantId) runQuery = runQuery.eq('user_id', tenantId);

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
          const sales = ev?.commercial_metrics?.sales ?? ev?.sold_quantity ?? null;
          const observedAt = ev?.observed_at || prod.created_at;
          map.set(itemId, { itemId, sales, observedAt });
        }
      }
    }
  } catch (_err) {
    // Fallback silencioso para insufficient_history
  }

  return map;
}

/**
 * Constrói e ranqueia produtos do Radar integrando Commercial Viability V2,
 * Deduplicação Semântica e Capping de Diversidade.
 */
function buildTrendRadarProductsFromCandidates({
  radarRunId,
  shopeeCandidates = [],
  mlCandidates = [],
  previousItemsMap = new Map(),
  maxProducts = 20,
  now = new Date(),
}) {
  const allCandidates = [...shopeeCandidates, ...mlCandidates];

  // 1. Deduplicação Nativa & Catálogo (ML productId) & Semântica (Shopee)
  const dedupResult = deduplicateCatalogAndSemantic(allCandidates);
  const uniqueCandidates = dedupResult.uniqueCandidates;

  // 2. Avaliação de Viabilidade Comercial V2 & Score V3
  const viableCandidates = [];

  for (const candidate of uniqueCandidates) {
    const velocityInfo = computeCandidateSalesVelocity(candidate, previousItemsMap);
    const viability = calculateCommercialViabilityV2({
      ...candidate,
      velocityInfo,
    });

    // Descarta low e insufficient_data dos slots principais
    if (!isViableForRadar(viability)) continue;

    const evidenceStatus =
      candidate.evidenceStatus ||
      candidate.evidence_status ||
      ((typeof candidate.sales === 'number' && candidate.sales > 0) || (typeof candidate.ratingStar === 'number' && candidate.ratingStar > 0) ? 'verified' : 'partial');

    const scoreV3 = calculateCommercialOpportunityScoreV3({
      ...candidate,
      evidenceStatus,
      velocityInfo,
    });

    viableCandidates.push({
      ...candidate,
      evidenceStatus,
      velocityInfo,
      viability,
      scoreV3,
    });
  }

  // 3. Ordenação Determinística: High Viability > Score V3 > Sales Velocity > Sales > Rating > Discount
  viableCandidates.sort((a, b) => {
    // 3.1 Prioridade de Viabilidade: High antes de Medium
    if (a.viability.classification === 'high' && b.viability.classification !== 'high') return -1;
    if (b.viability.classification === 'high' && a.viability.classification !== 'high') return 1;

    // 3.2 Score V3
    if (b.scoreV3.total !== a.scoreV3.total) {
      return b.scoreV3.total - a.scoreV3.total;
    }

    // 3.3 Aceleração real (velocity)
    const aVelocity = a.velocityInfo.velocity_status === 'computed' ? (a.velocityInfo.sales_velocity || 0) : null;
    const bVelocity = b.velocityInfo.velocity_status === 'computed' ? (b.velocityInfo.sales_velocity || 0) : null;
    if (aVelocity !== null && bVelocity !== null && aVelocity !== bVelocity) {
      return bVelocity - aVelocity;
    }
    if (aVelocity !== null && aVelocity > 0 && (bVelocity === null || bVelocity <= 0)) return -1;
    if (bVelocity !== null && bVelocity > 0 && (aVelocity === null || aVelocity <= 0)) return 1;

    // 3.4 Volume de vendas
    const aSales = typeof a.sales === 'number' ? a.sales : 0;
    const bSales = typeof b.sales === 'number' ? b.sales : 0;
    if (aSales !== bSales) return bSales - aSales;

    // 3.5 Rating
    const aRating = typeof a.ratingStar === 'number' ? a.ratingStar : 0;
    const bRating = typeof b.ratingStar === 'number' ? b.ratingStar : 0;
    if (aRating !== bRating) return bRating - aRating;

    // 3.6 Desconto
    const aDiscount = a.discountPercent || 0;
    const bDiscount = b.discountPercent || 0;
    return bDiscount - aDiscount;
  });

  // 3.1 Garantir unicidade final por marketplace + normalized_product_term
  // Preserva o melhor representante de cada termo normalizado por marketplace,
  // descartando duplicatas secundárias e promovendo os próximos candidatos viáveis.
  const uniqueTermCandidates = [];
  const seenMarketplaceNormalizedTerms = new Set();

  for (const candidate of viableCandidates) {
    const marketplace = String(candidate.marketplace || '').trim().toLowerCase();
    const normalizedTerm = normalizeText(candidate.productName);
    const termKey = `${marketplace}:${normalizedTerm}`;

    if (!termKey || seenMarketplaceNormalizedTerms.has(termKey)) {
      continue;
    }
    seenMarketplaceNormalizedTerms.add(termKey);
    uniqueTermCandidates.push(candidate);
  }

  // 4. Aplicação do Capping de Diversidade Familiar
  const diversityResult = applyFamilyDiversityCap(uniqueTermCandidates, {
    maxPerFamily: 3,
    targetCount: maxProducts,
  });
  const selectedCandidates = diversityResult.diversifiedProducts;

  // 5. Mapeamento final dos produtos para o snapshot
  const prioritizedProducts = [];
  const seenFinalKeys = new Set();

  for (let index = 0; index < selectedCandidates.length; index++) {
    const candidate = selectedCandidates[index];
    const marketplace = candidate.marketplace;
    const normalizedTerm = normalizeText(candidate.productName);
    const finalKey = `${String(marketplace || '').trim().toLowerCase()}:${normalizedTerm}`;

    if (seenFinalKeys.has(finalKey)) {
      continue;
    }
    seenFinalKeys.add(finalKey);

    const priority = prioritizedProducts.length + 1;
    if (priority > maxProducts) break;

    const isFocus = priority <= 3;
    const sales = typeof candidate.sales === 'number' ? candidate.sales : null;
    const rating = typeof candidate.ratingStar === 'number'
      ? candidate.ratingStar
      : (typeof candidate.rating === 'number' ? candidate.rating : null);
    const discount = candidate.discountPercent || 0;
    const price = candidate.currentPrice || 0;
    const oldPrice = candidate.oldPrice || null;
    const velocityInfo = candidate.velocityInfo;
    const hasVelocity = velocityInfo.velocity_status === 'computed' && velocityInfo.sales_velocity !== null;
    const viability = candidate.viability;

    const finalScoreV3 = calculateCommercialOpportunityScoreV3({
      ...candidate,
      isFocus,
      evidenceStatus: candidate.evidenceStatus,
      velocityInfo,
    });

    const directEvidence = [
      {
        claim: `Produto comercial identificado em ${candidate.marketplace}`,
        evidence_type: 'marketplace_snapshot',
        provenance: candidate.provenance || (candidate.marketplace === 'Shopee' ? 'shopee_openapi_productOfferV2' : 'mercadolivre_official_intent'),
        source_url: candidate.permalink || null,
        observed_at: candidate.observedAt || now.toISOString(),
        rank_position: priority,
        best_seller_flag: sales !== null && sales >= 50,
        trending_flag: hasVelocity && velocityInfo.sales_velocity > 0,
        sold_quantity: sales,
        price,
        old_price: oldPrice,
        discount_percent: discount,
        rating,
        decision: finalScoreV3.decision,
        strategy_version: COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
        viability_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
        viability_classification: viability.classification,
        effective_commission_percent: viability.effectiveCommissionPercent,
        estimated_commission_per_sale: viability.estimatedCommissionPerSale,
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
          effectiveCommissionPercent: viability.effectiveCommissionPercent,
          estimatedCommissionPerSale: viability.estimatedCommissionPerSale,
        },
        temporal_metrics: velocityInfo,
      },
    ];

    const determiningReasons = [
      ...viability.reasons,
      ...finalScoreV3.determining_reasons,
    ];

    const inferredSignals = [
      hasVelocity && velocityInfo.sales_velocity > 0 ? 'real_sales_acceleration' : 'baseline_catalog_snapshot',
      sales !== null && sales >= 50 ? 'marketplace_bestseller' : 'marketplace_catalog',
      discount >= 10 ? 'marketplace_promotion' : 'marketplace_standard',
      `viability_${viability.classification}`,
      `v3_decision_${finalScoreV3.decision.toLowerCase()}`,
    ];

    prioritizedProducts.push({
      radar_run_id: radarRunId,
      priority,
      product_term: candidate.productName,
      normalized_product_term: normalizeText(candidate.productName),
      category: candidate.category || null,
      marketplace: candidate.marketplace,
      evidence_status: candidate.evidenceStatus,
      source_count: 1,
      commercial_score: finalScoreV3.total,
      score_breakdown: finalScoreV3.breakdown,
      determining_reasons: determiningReasons,
      confidence: Math.min(
        95,
        Math.max(60, Math.round(60 + (hasVelocity ? 20 : 0) + (sales !== null && sales > 50 ? 10 : 5) + (rating !== null && rating >= 4.5 ? 10 : 5)))
      ),
      direct_evidence: directEvidence,
      inferred_signals: inferredSignals,
      affiliate_potential:
        (sales !== null && sales >= 100) || (viability.effectiveCommissionPercent >= 5) ? 'high' : 'medium',
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
  sourceHealthOverrides = {},
  dryRun = false,
}) {
  if (dryRun) {
    return { runId: run?.id || 'dry-run', productsCount: products.length, persisted: false };
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
    target_products: 20,
    minimum_products: 10,
    target_reached: products.length >= 20,
    strategy_version: COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
    viability_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
    total_products_selected: products.length,
    marketplaces: ['Shopee', 'Mercado Livre'],
    ...sourceHealthOverrides,
  };

  const executiveSummary = {
    products_count: products.length,
    marketplaces: ['Shopee', 'Mercado Livre'],
    top_product: products[0]?.product_term || null,
    top_product_score: products[0]?.commercial_score || null,
    top_product_decision: products[0]?.direct_evidence?.[0]?.decision || null,
    strategy_version: COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
    generated_by: 'oracle_radar_viability_v2_engine',
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

  return { runId: run.id, productsCount: products.length, persisted: true };
}

module.exports = {
  RUNNER_CONTRACT_VERSION,
  SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  normalizeText,
  parseNumber,
  parseOptionalNumber,
  normalizeMercadoLivreRadarProduct,
  findPendingTrendRadarRun,
  markTrendRadarRunRunning,
  collectShopeeMarketplaceCandidates,
  collectMercadoLivreMarketplaceCandidates,
  computeCandidateSalesVelocity,
  fetchRecentSnapshotItemsMap,
  buildTrendRadarProductsFromCandidates,
  persistTrendRadarSnapshot,
};
