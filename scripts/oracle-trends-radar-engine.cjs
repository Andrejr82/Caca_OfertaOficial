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
const { runMercadoLivreNativeTop20 } = require('./mercadolivre-native-top20-v5.cjs');
const { runMercadoLivreOfficialIntentCoverage, refreshAccessToken } = require('./mercadolivre-official-intents-v5.cjs');
const {
  COMMERCIAL_OPPORTUNITY_STRATEGY_VERSION,
  calculateCommercialOpportunityScoreV3,
} = require(path.join(__dirname, '../src/core/trends/commercial-opportunity-score-v3.cjs'));
const {
  COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
  classifyTicket,
  calculateCommercialOpportunityScoreV4,
} = require(path.join(__dirname, '../src/core/trends/commercial-opportunity-score-v4.cjs'));
const {
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  calculateCommercialViabilityV2,
  isViableForRadar,
} = require('./commercial-viability-v2.cjs');
const {
  DEFAULT_RECENCY_DAYS,
  normalizeIdentityPart,
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
  100535, // Áudio / TVs / Eletrônicos
  100009, // Moda Masculina
  100011, // Moda Feminina
  100637, // Esportes e Fitness
  100631, // Pet Shop
  100634, // Games e Consoles
  100632, // Brinquedos e Hobbies
  100635, // Bebês e Crianças
  100638, // Saúde e Bem-Estar
  100639, // Automotivo
  100640, // Livros e Papelaria
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
 * Coleta candidatos comerciais da Shopee com paginação oficial, exploração máxima
 * e parada determinística quando vazia.
 */
async function collectShopeeMarketplaceCandidates({
  request = null,
  categoryIds = SHOPEE_BROAD_DISCOVERY_CATEGORIES,
  maxPerCategory = 40,
  maxPagesPerCategory = 2,
  page = 1,
  sortType = 2,
  isAMSOffer = undefined,
  env = process.env,
} = {}) {
  const caller = request || defaultShopeeApiCaller(env);
  if (!caller) return [];
  const candidates = [];
  const seenIdentities = new Set();

  const targetCategories = Array.isArray(categoryIds) && categoryIds.length > 0
    ? categoryIds
    : [null];

  const pageLimit = Math.max(5, Math.min(50, Number(maxPerCategory) || 40));
  const pagesToScan = Math.max(1, Math.min(5, Math.floor(Number(maxPagesPerCategory) || 2)));
  const basePage = Math.max(1, Number(page) || 1);

  for (const catId of targetCategories) {
    try {
      for (let offset = 0; offset < pagesToScan; offset += 1) {
        const currentPage = basePage + offset;
        const variables = {
          page: currentPage,
          limit: pageLimit,
          sortType: typeof sortType === 'number' ? sortType : 2, // Popularidade / Vendas reais
        };
        if (catId) {
          variables.productCatId = catId;
        }
        if (typeof isAMSOffer === 'boolean') {
          variables.isAMSOffer = isAMSOffer;
        }

        const response = await caller(
          'ShopeePromotionOffers',
          GRAPHQL_CONTRACTS.productOfferV2.query,
          variables,
          { timeoutMs: 15000 }
        );

        const nodes = response?.data?.data?.productOfferV2?.nodes || [];
        if (!Array.isArray(nodes) || nodes.length === 0) {
          // Categoria sem mais produtos nesta página -> interrompe paginação desta categoria
          break;
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
          const commissionPercent = Math.round((commRate > 0 && commRate < 1 ? commRate * 100 : commRate) * 100) / 100;
          const sellerCommissionPercent = Math.round((sellerCommRate > 0 && sellerCommRate < 1 ? sellerCommRate * 100 : sellerCommRate) * 100) / 100;
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
            // O percentual informado pela API não substitui preço anterior oficial;
            // em faixas priceMin/priceMax ele permanece apenas como evidência reportada.
            priceDiscountRate: discount,
            discountPercent: discount,
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

        const pageInfo = response?.data?.data?.productOfferV2?.pageInfo;
        if (pageInfo && pageInfo.hasNextPage === false) {
          break;
        }
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

  const provenance = product.source === 'mercadolivre_offers_ssr'
    ? 'mercadolivre_offers_ssr'
    : (product.provenance || 'mercadolivre_official_intent');

  return {
    marketplace: 'Mercado Livre',
    itemId,
    productId: String(product.product_id || product.productId || '').trim(),
    productName,
    category: product.category_name || 'Marketplace Deals',
    categoryId: product.category_id || product.categoryId || null,
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
    provenance,
    observedAt,
  };
}

/**
 * Enriquece candidatos do Mercado Livre cruzando os rankings oficiais de Best Sellers
 * (/highlights/MLB/category/{categoryId}), tendências de busca (/trends/MLB) e avaliações.
 */
async function enrichMercadoLivreWithHighlightsAndReviews(candidates = [], {
  accessToken = null,
  env = process.env,
  fetchImpl = null,
  tokenProvider = refreshAccessToken,
  maxReviews = 25,
} = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;

  const client = fetchImpl || global.fetch;

  let token = accessToken;
  if (!token && typeof tokenProvider === 'function') {
    token = await tokenProvider({ env, fetchImpl: client }).catch(() => null);
  }

  if (!token) return candidates;

  // 1. Extrai categoryIds observados no pool de candidatos
  const categoryIds = new Set();
  for (const c of candidates) {
    if (c.categoryId) categoryIds.add(String(c.categoryId).trim());
  }

  // 2. Consulta /highlights/MLB/category/{categoryId} para obter Best Sellers oficiais
  const bestSellerMap = new Map();
  for (const catId of categoryIds) {
    if (!catId) continue;
    try {
      const res = await client(`https://api.mercadolibre.com/highlights/MLB/category/${catId}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.content || [])) {
          if (item && item.id) {
            bestSellerMap.set(String(item.id).trim(), {
              source: 'mercadolivre_highlights',
              type: 'BEST_SELLER',
              position: item.position || null,
              categoryId: catId,
              itemType: item.type || 'PRODUCT',
            });
          }
        }
      }
    } catch (_err) {
      // Falhas em categorias específicas não abortam o fluxo
    }
  }

  // 3. Consulta opcional de tendências de busca (/trends/MLB)
  let trendsKeywords = [];
  try {
    const resTrends = await client('https://api.mercadolibre.com/trends/MLB', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
    });
    if (resTrends.ok) {
      trendsKeywords = await resTrends.json();
    }
  } catch (_err) {
    // Trends é opcional e não-bloqueante
  }

  // 4. Cruzamento de evidências com os candidatos
  let reviewsCountFetched = 0;

  for (const candidate of candidates) {
    // Cruzamento Best Seller por productId ou itemId
    const matchByProd = candidate.productId && bestSellerMap.get(String(candidate.productId).trim());
    const matchByItem = candidate.itemId && bestSellerMap.get(String(candidate.itemId).trim());
    const bestSellerEvidence = matchByProd || matchByItem;

    if (bestSellerEvidence) {
      candidate.marketplaceDemandEvidence = bestSellerEvidence;

      // Consulta de avaliações somente para itens destacados (limite pequeno)
      if (candidate.itemId && reviewsCountFetched < maxReviews) {
        reviewsCountFetched++;
        try {
          const revRes = await client(`https://api.mercadolibre.com/reviews/item/${candidate.itemId}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined,
          });
          if (revRes.ok) {
            const revData = await revRes.json();
            const ratingAvg = parseOptionalNumber(revData.rating_average);
            if (ratingAvg !== null && ratingAvg >= 1 && ratingAvg <= 5) {
              candidate.rating = ratingAvg;
              candidate.ratingStar = ratingAvg;
            }
            if (revData.rating_levels && typeof revData.rating_levels === 'object') {
              const totalLevels = Object.values(revData.rating_levels).reduce((acc, val) => acc + (Number(val) || 0), 0);
              if (totalLevels > 0) candidate.reviewsCount = totalLevels;
            }
          }
        } catch (_err) {
          // Erro em reviews não impede o candidato de seguir
        }
      }
    }

    // Cruzamento opcional de tendências
    if (Array.isArray(trendsKeywords) && trendsKeywords.length > 0 && candidate.productName) {
      const lowerName = candidate.productName.toLowerCase();
      const matchedTrend = trendsKeywords.find((t) => t.keyword && lowerName.includes(t.keyword.toLowerCase()));
      if (matchedTrend) {
        candidate.marketplaceTrendEvidence = {
          keyword: matchedTrend.keyword,
          source: 'mercadolivre_trends',
        };
      }
    }
  }

  return candidates;
}

/**
 * Coleta candidatos comerciais do Mercado Livre.
 * Fonte primária (round 1): Mercado Livre Native Top 20 (Central Oficial de Ofertas SSR) + Cruzamento Highlights/Trends.
 * Refill secundário (round >= 2 ou fallback): Intenções oficiais com batching determinístico.
 */
async function collectMercadoLivreMarketplaceCandidates({
  keywords = ['smart TV 4K', 'fone bluetooth', 'air fryer', 'notebook', 'tenis corrida', 'cadeira gamer', 'lixeira inox', 'suporte notebook', 'tapete pet'],
  accessToken = null,
  maxPerIntent = 5,
  page = 1,
  batchSize = 3,
  env = process.env,
  nativeCollector = runMercadoLivreNativeTop20,
  coverageRunner = runMercadoLivreOfficialIntentCoverage,
  tokenProvider = refreshAccessToken,
  fetchImpl = null,
  enricher = enrichMercadoLivreWithHighlightsAndReviews,
} = {}) {
  const round = Math.max(1, Number(page) || 1);
  const candidates = [];
  const seenIds = new Set();

  try {
    // 1. Fonte PRIMÁRIA (round 1): Mercado Livre Native Top 20 (SSR Offers)
    if (round === 1 && typeof nativeCollector === 'function') {
      try {
        const nativeResult = await nativeCollector({ fetchImpl });
        const products = Array.isArray(nativeResult?.products) ? nativeResult.products : [];

        for (const product of products) {
          const candidate = normalizeMercadoLivreRadarProduct(product);
          if (!candidate || candidate.currentPrice === null || candidate.currentPrice <= 0) continue;

          const key = candidate.productId ? `ml_prod_${candidate.productId}` : `ml_item_${candidate.itemId}`;
          if (seenIds.has(key)) continue;
          seenIds.add(key);

          candidates.push(candidate);
        }

        if (candidates.length > 0) {
          if (typeof enricher === 'function') {
            await enricher(candidates, {
              accessToken,
              env,
              fetchImpl,
              tokenProvider,
            });
          }
          return candidates;
        }
      } catch (err) {
        console.warn(`[Oracle Trends Radar] Falha ao coletar ML Native (round 1): ${err.message}. Ativando refill de intents.`);
      }
    }

    // 2. REFILL SECUNDÁRIO (round >= 2 ou fallback se round 1 nativo falhou)
    const size = Math.max(1, Number(batchSize) || 3);
    const totalKeywords = Array.isArray(keywords) ? keywords.length : 0;

    const startIndex = (round - 1) * size;
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
      fetchImpl: fetchImpl || global.fetch,
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
    // Falha em ML não aborta execução geral
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
 * Constrói as chaves de identidade oficial estritas de um candidato para matching com ofertas internas.
 * NUNCA usa similaridade de nome.
 */
function getCandidateOfficialIdentityKeys(candidate = {}) {
  const keys = [];
  const marketplace = String(candidate.marketplace || candidate.platform || '').trim().toLowerCase();

  if (marketplace.includes('shopee')) {
    const itemId = normalizeIdentityPart(candidate.itemId || candidate.item_id || candidate.shopee_item_id || '');
    const shopId = normalizeIdentityPart(candidate.shopId || candidate.shop_id || '');
    if (itemId) {
      if (shopId) {
        // Prioriza e restringe à chave composta shopId + itemId (sem match cruzado entre shops)
        keys.push(`shopee:shop:${shopId}:item:${itemId}`);
      } else {
        keys.push(`shopee:item:${itemId}`);
      }
    }
  } else if (marketplace.includes('mercado') || marketplace.includes('meli')) {
    const productId = normalizeIdentityPart(candidate.productId || candidate.product_id || '');
    const itemId = normalizeIdentityPart(candidate.itemId || candidate.item_id || candidate.id || '');
    if (productId) {
      keys.push(`mercadolivre:catalog:${productId}`);
    }
    if (itemId) {
      keys.push(`mercadolivre:item:${itemId}`);
    }
    if (!productId && !itemId && candidate.permalink) {
      const matchP = candidate.permalink.match(/\/p\/(MLB\d+)/i);
      if (matchP && matchP[1]) {
        keys.push(`mercadolivre:catalog:${normalizeIdentityPart(matchP[1])}`);
      }
      const matchU = candidate.permalink.match(/\/up\/(MLBU\d+)/i) || candidate.permalink.match(/MLB-?(\d+)/i);
      if (matchU && matchU[1]) {
        keys.push(`mercadolivre:item:${normalizeIdentityPart(matchU[1])}`);
      }
    }
  }

  return keys;
}

/**
 * Constrói as chaves de identidade oficial de uma linha da tabela `offers`.
 */
function getOfferOfficialIdentityKeys(offer = {}) {
  const keys = [];
  const platform = String(offer.platform || '').trim().toLowerCase();
  const metrics = offer.marketplace_metrics || {};

  if (platform.includes('shopee')) {
    const itemId = normalizeIdentityPart(
      offer.shopee_item_id ||
      offer.item_id ||
      metrics.itemId ||
      metrics.item_id ||
      metrics.sourceItemId ||
      ''
    );
    const shopId = normalizeIdentityPart(
      offer.shopee_shop_id ||
      offer.shop_id ||
      metrics.shopId ||
      metrics.shop_id ||
      ''
    );

    if (itemId) {
      if (shopId) {
        keys.push(`shopee:shop:${shopId}:item:${itemId}`);
      } else {
        keys.push(`shopee:item:${itemId}`);
      }
    }
  } else if (platform.includes('mercado') || platform.includes('meli')) {
    const productId = normalizeIdentityPart(
      offer.product_id ||
      metrics.productId ||
      metrics.product_id ||
      ''
    );
    const itemId = normalizeIdentityPart(
      offer.item_id ||
      metrics.itemId ||
      metrics.item_id ||
      metrics.sourceItemId ||
      ''
    );

    if (productId) {
      keys.push(`mercadolivre:catalog:${productId}`);
    }
    if (itemId) {
      keys.push(`mercadolivre:item:${itemId}`);
    }
    if (!productId && !itemId && offer.original_url) {
      const matchP = offer.original_url.match(/\/p\/(MLB\d+)/i);
      if (matchP && matchP[1]) {
        keys.push(`mercadolivre:catalog:${normalizeIdentityPart(matchP[1])}`);
      }
      const matchU = offer.original_url.match(/\/up\/(MLBU\d+)/i) || offer.original_url.match(/MLB-?(\d+)/i);
      if (matchU && matchU[1]) {
        keys.push(`mercadolivre:item:${normalizeIdentityPart(matchU[1])}`);
      }
    }
  }

  return keys;
}

/**
 * Classifica eventos de clique de forma determinística em:
 * - 'human_probable' (WhatsApp, Telegram, Facebook mobile com ref m.facebook/lm.facebook/l.facebook, Instagram direto)
 * - 'technical_probable' (burst >= 5 ofertas distintas no mesmo minuto por bucket canal/source/device, bots, crawlers, previews)
 * - 'ambiguous' (Facebook desktop não verificado, fontes desconhecidas ou não comprovadas)
 */
function classifyClickEvents(clickEvents = [], {
  linkIdToOfferId = new Map(),
  linkIdToChannel = new Map(),
} = {}) {
  const classifiedEvents = [];
  const statsByOfferId = new Map();

  if (!Array.isArray(clickEvents) || clickEvents.length === 0) {
    return { classifiedEvents, statsByOfferId };
  }

  // 1. Agrupar em buckets por channel / source / device / minuto para detectar bursts técnicos
  const bucketMap = new Map();

  for (const ev of clickEvents) {
    const linkId = ev.affiliate_link_id;
    const offerId = linkIdToOfferId.get(linkId) || ev.offer_id || null;
    const channel = String(linkIdToChannel.get(linkId) || ev.channel || '').trim().toLowerCase();
    const source = String(ev.source || '').trim().toLowerCase();
    const deviceType = String(ev.device_type || '').trim().toLowerCase();
    const createdDate = ev.created_at ? new Date(ev.created_at) : new Date();
    const minuteIso = !isNaN(createdDate.getTime()) ? createdDate.toISOString().slice(0, 16) : 'unknown-minute';

    const bucketKey = `${channel}:${source}:${deviceType}:${minuteIso}`;
    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, {
        bucketKey,
        offerIds: new Set(),
        events: [],
      });
    }

    const bucket = bucketMap.get(bucketKey);
    if (offerId) {
      bucket.offerIds.add(offerId);
    }
    bucket.events.push(ev);
  }

  // 2. Classificação determinística de cada evento
  for (const ev of clickEvents) {
    const linkId = ev.affiliate_link_id;
    const offerId = linkIdToOfferId.get(linkId) || ev.offer_id || null;
    const channel = String(linkIdToChannel.get(linkId) || ev.channel || '').trim().toLowerCase();
    const source = String(ev.source || '').trim().toLowerCase();
    const deviceType = String(ev.device_type || '').trim().toLowerCase();
    const createdDate = ev.created_at ? new Date(ev.created_at) : new Date();
    const minuteIso = !isNaN(createdDate.getTime()) ? createdDate.toISOString().slice(0, 16) : 'unknown-minute';
    const bucketKey = `${channel}:${source}:${deviceType}:${minuteIso}`;

    const bucket = bucketMap.get(bucketKey);
    const distinctOffersInMinute = bucket ? bucket.offerIds.size : 0;

    let classification = 'ambiguous';
    let reason = 'unverified_traffic';

    const isFacebook = channel === 'facebook' || source.includes('facebook') || source.includes('fb');
    const isFbMobileRef = /^(?:https?:\/\/)?(?:m|lm|l)\.facebook\.com/i.test(source) ||
      source === 'm.facebook' ||
      source === 'lm.facebook' ||
      source === 'l.facebook' ||
      source.includes('m.facebook') ||
      source.includes('lm.facebook') ||
      source.includes('l.facebook');

    // Regra 1: Burst de >= 5 ofertas distintas no mesmo minuto no mesmo bucket => technical_probable
    if (distinctOffersInMinute >= 5) {
      classification = 'technical_probable';
      reason = `burst_technical_scan_${distinctOffersInMinute}_offers_same_minute`;
    }
    // Regra 2: Bots, crawlers, spiders, previews explícitos => technical_probable
    else if (
      deviceType === 'bot' ||
      source === 'crawler' ||
      source === 'bot' ||
      source === 'preview' ||
      source === 'technical' ||
      source.includes('bot') ||
      source.includes('crawler') ||
      source.includes('spider')
    ) {
      classification = 'technical_probable';
      reason = 'explicit_bot_or_crawler';
    }
    // Regra 3: WhatsApp ou Telegram => human_probable
    else if (
      channel === 'whatsapp' ||
      channel === 'telegram' ||
      source.includes('whatsapp') ||
      source.includes('telegram')
    ) {
      classification = 'human_probable';
      reason = 'direct_messaging_human_click';
    }
    // Regra 4: Facebook com referências móveis explícitas m.facebook / lm.facebook / l.facebook => human_probable
    else if (isFacebook && isFbMobileRef) {
      classification = 'human_probable';
      reason = 'facebook_mobile_human_click';
    }
    // Regra 5: Instagram direto válido => human_probable
    else if (
      channel === 'instagram' ||
      source.includes('instagram') ||
      source.includes('ig') ||
      /^(?:https?:\/\/)?(?:l\.)?instagram\.com/i.test(source)
    ) {
      classification = 'human_probable';
      reason = 'instagram_direct_human_click';
    }
    // Regra 6: Facebook desktop isolado sem evidência humana explícita => ambiguous
    else if (isFacebook && deviceType === 'desktop') {
      classification = 'ambiguous';
      reason = 'facebook_desktop_unverified';
    }
    // Regra 7: Default fail-closed => ambiguous
    else {
      classification = 'ambiguous';
      reason = 'unverified_traffic';
    }

    classifiedEvents.push({
      eventId: ev.id,
      affiliateLinkId: linkId,
      offerId,
      classification,
      reason,
    });

    if (offerId) {
      if (!statsByOfferId.has(offerId)) {
        statsByOfferId.set(offerId, {
          humanProbableClicks: 0,
          technicalClicks: 0,
          ambiguousClicks: 0,
        });
      }
      const stats = statsByOfferId.get(offerId);
      if (classification === 'human_probable') {
        stats.humanProbableClicks += 1;
      } else if (classification === 'technical_probable') {
        stats.technicalClicks += 1;
      } else {
        stats.ambiguousClicks += 1;
      }
    }
  }

  return { classifiedEvents, statsByOfferId };
}

/**
 * Carrega o histórico comercial interno (cliques humanos, vendas atribuídas) do Supabase
 * para os candidatos fornecidos, utilizando APENAS matching determinístico por IDs oficiais.
 */
async function fetchInternalOfferPerformanceMap(client, {
  tenantId = null,
  candidates = [],
  windowDays = 30,
  now = new Date(),
} = {}) {
  const performanceMap = new Map();
  if (!client || !Array.isArray(candidates) || candidates.length === 0) {
    return performanceMap;
  }

  const windowEnd = now;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  try {
    // 1. Carrega ofertas existentes do tenant/usuário
    let offerQuery = client
      .from('offers')
      .select('id, user_id, platform, shopee_item_id, shopee_shop_id, item_id, product_id, marketplace_metrics, original_url');

    if (tenantId) {
      offerQuery = offerQuery.eq('user_id', tenantId);
    }

    const { data: offers, error: offerErr } = await offerQuery;
    if (offerErr || !Array.isArray(offers) || offers.length === 0) {
      return performanceMap;
    }

    // 2. Mapeia chaves oficiais para as ofertas
    const offerByOfficialKey = new Map();
    for (const offer of offers) {
      const keys = getOfferOfficialIdentityKeys(offer);
      for (const k of keys) {
        if (!offerByOfficialKey.has(k)) {
          offerByOfficialKey.set(k, offer);
        }
      }
    }

    // 3. Identifica quais ofertas correspondem aos candidatos por ID oficial
    const candidateToOfferMap = new Map();
    const matchedOfferIdsSet = new Set();

    for (const candidate of candidates) {
      const candidateKeys = getCandidateOfficialIdentityKeys(candidate);
      let matchedOffer = null;

      for (const k of candidateKeys) {
        if (offerByOfficialKey.has(k)) {
          matchedOffer = offerByOfficialKey.get(k);
          break;
        }
      }

      if (matchedOffer) {
        candidateToOfferMap.set(candidate, matchedOffer);
        matchedOfferIdsSet.add(matchedOffer.id);
      }
    }

    if (matchedOfferIdsSet.size === 0) {
      return performanceMap;
    }

    const matchedOfferIds = Array.from(matchedOfferIdsSet);

    // 4. Carrega affiliate_links associados a essas ofertas
    const { data: links, error: linkErr } = await client
      .from('affiliate_links')
      .select('id, offer_id, channel, clicks')
      .in('offer_id', matchedOfferIds);

    const linkIdToOfferId = new Map();
    const linkIdToChannel = new Map();
    const linkIds = [];

    if (!linkErr && Array.isArray(links)) {
      for (const link of links) {
        linkIdToOfferId.set(link.id, link.offer_id);
        if (link.channel) {
          linkIdToChannel.set(link.id, link.channel);
        }
        linkIds.push(link.id);
      }
    }

    // 5. Carrega e classifica click_events granulares para os links dessas ofertas
    let clicksByOfferId = new Map();
    for (const offerId of matchedOfferIds) {
      clicksByOfferId.set(offerId, {
        humanProbableClicks: 0,
        technicalClicks: 0,
        ambiguousClicks: 0,
      });
    }

    if (linkIds.length > 0) {
      const { data: clickEvents, error: clickErr } = await client
        .from('click_events')
        .select('id, affiliate_link_id, source, device_type, created_at')
        .in('affiliate_link_id', linkIds)
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', windowEnd.toISOString());

      if (!clickErr && Array.isArray(clickEvents) && clickEvents.length > 0) {
        const { statsByOfferId } = classifyClickEvents(clickEvents, {
          linkIdToOfferId,
          linkIdToChannel,
        });
        clicksByOfferId = statsByOfferId;
      }
    }

    // 6. Carrega sales atribuídas a essas ofertas
    const salesByOfferId = new Map();
    for (const offerId of matchedOfferIds) {
      salesByOfferId.set(offerId, 0);
    }

    const { data: sales, error: salesErr } = await client
      .from('sales')
      .select('id, offer_id, status, sold_at')
      .in('offer_id', matchedOfferIds)
      .neq('status', 'cancelled')
      .gte('sold_at', windowStart.toISOString())
      .lte('sold_at', windowEnd.toISOString());

    if (!salesErr && Array.isArray(sales)) {
      for (const sale of sales) {
        if (sale.offer_id && salesByOfferId.has(sale.offer_id)) {
          salesByOfferId.set(sale.offer_id, salesByOfferId.get(sale.offer_id) + 1);
        }
      }
    }

    // 7. Monta o internalPerformance consolidado por candidato
    for (const candidate of candidates) {
      const matchedOffer = candidateToOfferMap.get(candidate);
      if (matchedOffer) {
        const clickStats = clicksByOfferId.get(matchedOffer.id) || { humanProbableClicks: 0, technicalClicks: 0, ambiguousClicks: 0 };
        const attributedSales = salesByOfferId.get(matchedOffer.id) || 0;

        const perf = {
          matched: true,
          matchedOfferId: matchedOffer.id,
          humanProbableClicks: clickStats.humanProbableClicks,
          technicalClicks: clickStats.technicalClicks,
          ambiguousClicks: clickStats.ambiguousClicks,
          attributedSales,
          internalHistoryWindow: {
            days: windowDays,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
          },
        };

        const primaryKey = getCandidateOfficialIdentityKeys(candidate)[0] || candidate.itemId;
        performanceMap.set(primaryKey, perf);
        // Também indexa por todas as chaves do candidato para lookups flexíveis
        for (const k of getCandidateOfficialIdentityKeys(candidate)) {
          performanceMap.set(k, perf);
        }
      }
    }
  } catch (err) {
    console.error(`[Oracle Radar] Erro ao carregar histórico interno: ${err.message}`);
  }

  return performanceMap;
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
  internalPerformanceMap = new Map(),
  maxProducts = 20,
  now = new Date(),
}) {
  const allCandidates = [...shopeeCandidates, ...mlCandidates];

  // 1. Deduplicação Nativa & Catálogo (ML productId) & Semântica (Shopee)
  const dedupResult = deduplicateCatalogAndSemantic(allCandidates);
  const uniqueCandidates = dedupResult.uniqueCandidates;

  // 2. Avaliação de Viabilidade Comercial V2 & Score V4
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

    // Resolução do histórico interno determinístico
    let internalPerformance = candidate.internalPerformance;
    if (!internalPerformance && internalPerformanceMap && internalPerformanceMap.size > 0) {
      const keys = getCandidateOfficialIdentityKeys(candidate);
      for (const k of keys) {
        if (internalPerformanceMap.has(k)) {
          internalPerformance = internalPerformanceMap.get(k);
          break;
        }
      }
    }

    if (!internalPerformance) {
      internalPerformance = {
        matched: false,
        matchedOfferId: null,
        humanProbableClicks: 0,
        technicalClicks: 0,
        ambiguousClicks: 0,
        attributedSales: 0,
        internalHistoryWindow: null,
      };
    }

    const scoreV4 = calculateCommercialOpportunityScoreV4({
      ...candidate,
      evidenceStatus,
      velocityInfo,
      internalPerformance,
    }, {
      velocityInfo,
      internalPerformance,
      peers: uniqueCandidates,
    });

    // Gate Task 5 & Task Pré-Merge: Somente 'PRIORIDADE' (>= 80) e 'TESTAR' entram na seleção final do Radar.
    // Candidatos com decisão 'IGNORAR' são excluídos antes do preenchimento de quotas/vagas.
    const decision = scoreV4.selection_decision || scoreV4.decision;
    if (decision === 'IGNORAR') {
      continue;
    }

    viableCandidates.push({
      ...candidate,
      evidenceStatus,
      velocityInfo,
      viability,
      scoreV4,
      internalPerformance,
      commercial_score: scoreV4.total,
      selection_decision: decision,
      ticket_class: scoreV4.ticket_class,
    });
  }

  // 3. Ordenação Determinística: Score V4 > High Viability (em empate) > Sales Velocity > Sales > Rating > Discount
  const sortCandidatesDeterministic = (a, b) => {
    // 3.1 Score V4 total (maior primeiro)
    if (b.scoreV4.total !== a.scoreV4.total) {
      return b.scoreV4.total - a.scoreV4.total;
    }

    // 3.2 Prioridade de Viabilidade: High antes de Medium SOMENTE em empate de Score V4
    if (a.viability.classification === 'high' && b.viability.classification !== 'high') return -1;
    if (b.viability.classification === 'high' && a.viability.classification !== 'high') return 1;

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
    const aDiscount = typeof a.discountPercent === 'number' ? a.discountPercent : 0;
    const bDiscount = typeof b.discountPercent === 'number' ? b.discountPercent : 0;
    return bDiscount - aDiscount;
  };

  viableCandidates.sort(sortCandidatesDeterministic);

  // 3.1 Garantir unicidade final por marketplace + normalized_product_term
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

  // 4. Montagem da Carteira Comercial Top 20 por Faixas de Ticket & Capping Familiar
  const selectedCandidates = [];
  const selectedKeys = new Set();
  const familyCounts = new Map();
  let impulseCount = 0;
  let coreCount = 0;
  let upperCount = 0;
  let premiumCount = 0;

  const canSelectCandidate = (candidate) => {
    const marketplace = String(candidate.marketplace || '').trim().toLowerCase();
    const normalizedTerm = normalizeText(candidate.productName);
    const key = `${marketplace}:${normalizedTerm}`;
    if (selectedKeys.has(key)) return false;

    const famKey = extractSemanticClusterKey({
      productName: candidate.productName,
      category: candidate.category,
      marketplace: candidate.marketplace,
      itemId: candidate.itemId,
    });
    const currentFamilyCount = familyCounts.get(famKey) || 0;
    if (currentFamilyCount >= 3) return false;

    return true;
  };

  const selectCandidate = (candidate) => {
    const marketplace = String(candidate.marketplace || '').trim().toLowerCase();
    const normalizedTerm = normalizeText(candidate.productName);
    const key = `${marketplace}:${normalizedTerm}`;
    const famKey = extractSemanticClusterKey({
      productName: candidate.productName,
      category: candidate.category,
      marketplace: candidate.marketplace,
      itemId: candidate.itemId,
    });

    selectedKeys.add(key);
    familyCounts.set(famKey, (familyCounts.get(famKey) || 0) + 1);
    selectedCandidates.push(candidate);

    if (candidate.ticket_class === 'impulse') impulseCount += 1;
    else if (candidate.ticket_class === 'core') coreCount += 1;
    else if (candidate.ticket_class === 'upper') upperCount += 1;
    else if (candidate.ticket_class === 'premium') premiumCount += 1;
  };

  const candidatesByTicket = {
    premium: uniqueTermCandidates.filter(c => c.ticket_class === 'premium'),
    upper: uniqueTermCandidates.filter(c => c.ticket_class === 'upper'),
    core: uniqueTermCandidates.filter(c => c.ticket_class === 'core'),
    impulse: uniqueTermCandidates.filter(c => c.ticket_class === 'impulse'),
  };

  // Pass 1: Metas estruturais de representação por faixa
  // Premium: até 2
  for (const c of candidatesByTicket.premium) {
    if (premiumCount >= 2 || selectedCandidates.length >= maxProducts) break;
    if (canSelectCandidate(c)) selectCandidate(c);
  }

  // Upper: até 4
  for (const c of candidatesByTicket.upper) {
    if (upperCount >= 4 || selectedCandidates.length >= maxProducts) break;
    if (canSelectCandidate(c)) selectCandidate(c);
  }

  // Core: até 5
  for (const c of candidatesByTicket.core) {
    if (coreCount >= 5 || selectedCandidates.length >= maxProducts) break;
    if (canSelectCandidate(c)) selectCandidate(c);
  }

  // Impulse: até 6
  for (const c of candidatesByTicket.impulse) {
    if (impulseCount >= 6 || selectedCandidates.length >= maxProducts) break;
    if (canSelectCandidate(c)) selectCandidate(c);
  }

  // Pass 2: Preenchimento preferencial de vagas restantes por faixas superiores (core/upper/premium)
  for (const candidate of uniqueTermCandidates) {
    if (selectedCandidates.length >= maxProducts) break;
    if (!canSelectCandidate(candidate)) continue;

    // Se for impulse e já atingiu o teto de 6, verificar se ainda há candidatos viáveis de outras faixas
    if (candidate.ticket_class === 'impulse' && impulseCount >= 6) {
      const hasOtherTiersAvailable = uniqueTermCandidates.some(
        other => other.ticket_class !== 'impulse' && canSelectCandidate(other)
      );
      if (hasOtherTiersAvailable) {
        continue;
      }
    }

    selectCandidate(candidate);
  }

  // Pass 2.1: Se ainda restarem vagas e não houver mais candidatos de outras faixas, redistribuir vagas com os melhores candidatos restantes
  if (selectedCandidates.length < maxProducts) {
    for (const candidate of uniqueTermCandidates) {
      if (selectedCandidates.length >= maxProducts) break;
      if (!canSelectCandidate(candidate)) continue;
      selectCandidate(candidate);
    }
  }

  // Pass 3: Ordenação final da carteira por Score V4 para o snapshot
  selectedCandidates.sort(sortCandidatesDeterministic);

  // 5. Formatação do Top 20 Final para Persistência e Auditoria
  const prioritizedProducts = [];
  const seenFinalKeys = new Set();

  for (let index = 0; index < selectedCandidates.length; index += 1) {
    const candidate = selectedCandidates[index];
    const finalKey = `${String(candidate.marketplace || '').toLowerCase()}:${normalizeText(candidate.productName)}`;
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

    const finalScoreV4 = calculateCommercialOpportunityScoreV4({
      ...candidate,
      isFocus,
      evidenceStatus: candidate.evidenceStatus,
      velocityInfo,
    }, {
      velocityInfo,
      internalPerformance: candidate.internalPerformance,
      peers: uniqueCandidates,
    });

    const directEvidence = [
      {
        claim: `Produto comercial identificado em ${candidate.marketplace}`,
        evidence_type: 'marketplace_snapshot',
        provenance: candidate.provenance || (candidate.marketplace === 'Shopee' ? 'shopee_openapi_productOfferV2' : 'mercadolivre_official_intent'),
        source_url: candidate.permalink || null,
        image_url: candidate.imageUrl || candidate.image_url || candidate.thumbnail || null,
        observed_at: candidate.observedAt || now.toISOString(),
        rank_position: priority,
        best_seller_flag: sales !== null && sales >= 50,
        trending_flag: hasVelocity && velocityInfo.sales_velocity > 0,
        sold_quantity: sales,
        price,
        old_price: oldPrice,
        discount_percent: discount,
        rating,
        decision: finalScoreV4.selection_decision || finalScoreV4.decision,
        selection_decision: finalScoreV4.selection_decision || finalScoreV4.decision,
        raw_decision: finalScoreV4.raw_decision || finalScoreV4.decision,
        strategy_version: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
        score_strategy_version: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
        viability_version: COMMERCIAL_VIABILITY_STRATEGY_VERSION,
        viability_classification: viability.classification,
        ticket_class: finalScoreV4.ticket_class,
        family_key: finalScoreV4.family_key,
        normalized_unit: finalScoreV4.normalized_unit,
        normalized_price: finalScoreV4.normalized_price,
        peer_count: finalScoreV4.peer_count,
        relative_price_position: finalScoreV4.relative_price_position,
        competitiveness_reason: finalScoreV4.competitiveness_reason,
        effective_commission_percent: finalScoreV4.economic_return.effectiveCommissionPercent,
        estimated_commission_per_sale: finalScoreV4.economic_return.estimatedCommissionPerSale,
        commission_status: finalScoreV4.economic_return.commissionStatus,
        internal_conversion_status: finalScoreV4.internal_conversion.internalConversionStatus,
        human_probable_clicks: finalScoreV4.internal_conversion.humanProbableClicks,
        attributed_sales: finalScoreV4.internal_conversion.attributedSales,
        internal_conversion_rate: finalScoreV4.internal_conversion.internalConversionRate,
        score_breakdown: finalScoreV4.breakdown,
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
          effectiveCommissionPercent: finalScoreV4.economic_return.effectiveCommissionPercent,
          estimatedCommissionPerSale: finalScoreV4.economic_return.estimatedCommissionPerSale,
          image_url: candidate.imageUrl || candidate.image_url || candidate.thumbnail || null,
          family_key: finalScoreV4.family_key,
          normalized_unit: finalScoreV4.normalized_unit,
          normalized_price: finalScoreV4.normalized_price,
          peer_count: finalScoreV4.peer_count,
          relative_price_position: finalScoreV4.relative_price_position,
          competitiveness_reason: finalScoreV4.competitiveness_reason,
        },
        temporal_metrics: velocityInfo,
      },
    ];

    const determiningReasons = [
      ...viability.reasons,
      ...finalScoreV4.determining_reasons,
    ];

    const inferredSignals = [
      hasVelocity && velocityInfo.sales_velocity > 0 ? 'real_sales_acceleration' : 'baseline_catalog_snapshot',
      sales !== null && sales >= 50 ? 'marketplace_bestseller' : 'marketplace_catalog',
      discount >= 10 ? 'marketplace_promotion' : 'marketplace_standard',
      `viability_${viability.classification}`,
      `v4_decision_${(finalScoreV4.selection_decision || finalScoreV4.decision).toLowerCase()}`,
      `ticket_${finalScoreV4.ticket_class}`,
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
      commercial_score: finalScoreV4.total,
      score_breakdown: finalScoreV4.breakdown,
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
    strategy_version: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
    score_strategy_version: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
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
    strategy_version: COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
    generated_by: 'oracle_radar_commercial_opportunity_v4_engine',
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
  enrichMercadoLivreWithHighlightsAndReviews,
  computeCandidateSalesVelocity,
  fetchRecentSnapshotItemsMap,
  getCandidateOfficialIdentityKeys,
  getOfferOfficialIdentityKeys,
  classifyClickEvents,
  fetchInternalOfferPerformanceMap,
  buildTrendRadarProductsFromCandidates,
  persistTrendRadarSnapshot,
};
