'use strict';

const crypto = require('node:crypto');
const { normalizePriceIntegrity } = require('./shopee-openapi-shadow-engine-v1.cjs');
const { getShopeeV1Flags, isShopeeV1Shadow } = require('./shopee-v1-flags.cjs');

const CONTROLLED_PERSIST_SCENARIOS = new Set([
  'casa_cozinha_editorial', 'organizacao_editorial', 'ferramentas_editorial', 'informatica_editorial',
  'celulares_editorial', 'beleza_editorial', 'moda_editorial', 'esporte_editorial', 'pet_editorial',
  'tv_audio_editorial', 'eletrodomesticos_editorial', 'moveis_editorial',
]);
const CONTROLLED_PERSIST_SCENARIO = 'casa_cozinha_editorial';
const BLOCKED_SCENARIO = 'grandes_ofertas_editorial';
const CONTROLLED_PERSIST_MAX_EXISTING_CANDIDATES = 5;

function isOne(value) { return String(value ?? '').trim() === '1'; }

function getControlledPersistDecision(scenarioId, env = process.env, { maxCandidates } = {}) {
  const normalizedScenario = String(scenarioId || '').trim();
  if (normalizedScenario === BLOCKED_SCENARIO) return { enabled: false, reason: 'blocked_v1_scenario', next: 'manual_or_v2' };
  const flags = getShopeeV1Flags(env);
  if (!flags.engine) return { enabled: false, reason: 'feature_flag_disabled' };
  if (!flags.persistence) return { enabled: false, reason: 'persist_flag_disabled' };
  if (!CONTROLLED_PERSIST_SCENARIOS.has(normalizedScenario)) return { enabled: false, reason: 'controlled_persist_scenario_not_allowlisted' };
  if (isOne(env.DRY_RUN)) return { enabled: false, reason: 'dry_run_enabled' };
  if (isOne(env.NO_DB_WRITE)) return { enabled: false, reason: 'no_db_write_enabled' };
  if (isShopeeV1Shadow(env.ARGV || process.argv)) return { enabled: false, reason: 'shadow_mode_enabled' };
  if (!isOne(env.NO_PUBLISH)) return { enabled: false, reason: 'publish_flags_required' };
  const operationalLimit = Number(maxCandidates);
  if (!Number.isInteger(operationalLimit) || operationalLimit < 1) return { enabled: false, reason: 'controlled_persist_limit_missing' };
  return { enabled: true, mode: 'controlled-persist', scenarioId: normalizedScenario, maxCandidates: operationalLimit };
}

function stableId(prefix, value) { return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`; }

function controlledCandidateQuality(product) {
  const rating = Number(product?.ratingStar ?? product?.rating ?? 0);
  const sales = Number(product?.sales ?? 0);
  const min = Number(product?.priceMin ?? 0);
  const max = Number(product?.priceMax ?? 0);
  const reasons = [];
  if (rating > 0 && rating < 4.7) reasons.push('rating_below_4_7');
  if (sales > 0 && sales < 100) reasons.push('sales_below_100');
  if (product?.safeForPublication === false) reasons.push('unsafe_price_for_publication');
  if (product?.priceRangeAmbiguous === true && min > 0 && max > min && max / min >= 2.5) reasons.push('extreme_price_range');
  return { eligible: reasons.length === 0, reasons };
}

function selectControlledPersistCandidates(top, { existingItemIds = [], maxNewCandidates, maxExistingCandidates = CONTROLLED_PERSIST_MAX_EXISTING_CANDIDATES } = {}) {
  const newLimit = Number(maxNewCandidates);
  if (!Number.isInteger(newLimit) || newLimit < 1) return [];
  const existing = new Set((Array.isArray(existingItemIds) ? existingItemIds : []).map((itemId) => String(itemId).trim()).filter(Boolean));
  const selected = [];
  let newCount = 0, existingCount = 0;
  for (const product of Array.isArray(top) ? top : []) {
    if (!controlledCandidateQuality(product).eligible) continue;
    const itemId = String(product?.itemId || '').trim();
    const isExisting = existing.has(itemId);
    if (isExisting) {
      if (existingCount >= maxExistingCandidates) continue;
      existingCount += 1;
    } else {
      if (newCount >= newLimit) continue;
      newCount += 1;
    }
    selected.push(product);
    if (newCount >= newLimit && existingCount >= maxExistingCandidates) break;
  }
  return selected;
}

function buildControlledPersistIngestions(top, { scenarioId, tenantId, correlationId, requestedAt, existingItemIds = [], maxNewCandidates }) {
  const normalizedScenario = String(scenarioId || '').trim();
  if (!CONTROLLED_PERSIST_SCENARIOS.has(normalizedScenario)) throw new Error(`Controlled persist scenario not allowlisted: ${normalizedScenario}`);
  if (!tenantId || !correlationId || !requestedAt) throw new Error('Controlled persist context is incomplete');
  const v1CorrelationId = correlationId;
  const boundedTop = selectControlledPersistCandidates(top, { existingItemIds, maxNewCandidates });
  return boundedTop.map((product, index) => {
    const originalIndex = Array.isArray(top) ? top.indexOf(product) : -1;
    const rankingPosition = originalIndex >= 0 ? originalIndex + 1 : index + 1;
    const sourceItemId = String(product.itemId || '').trim();
    const shopId = String(product.shopId || '').trim();
    const title = String(product.productName || product.title || '').trim();
    const sourceUrl = String(product.offerLink || product.productLink || '').trim();
    const imageUrl = String(product.imageUrl || '').trim();
    const hasV1Range = product.priceMin != null || product.priceMax != null;
    const priceIntegrity = normalizePriceIntegrity({
      price: product.price ?? product.currentPrice,
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      priceDiscountRate: product.priceDiscountRate,
      officialOldPrice: product.officialOldPrice ?? (hasV1Range ? null : product.originalPrice),
    });
    const currentPrice = Number(product.currentPrice ?? product.price ?? priceIntegrity.currentPrice);
    const originalPrice = priceIntegrity.oldPrice;
    const payloadV1 = { ...product, price: currentPrice, currentPrice, originalPrice, priceIntegrity };
    if (!/^\d+$/.test(sourceItemId) || !/^\d+$/.test(shopId) || !title || !/^https:\/\//i.test(sourceUrl) || !/^https:\/\//i.test(imageUrl) || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(`Invalid Shopee V1 controlled payload at rank ${index + 1}`);
    }
    const identity = `${tenantId}:Shopee:${sourceItemId}`;
    const candidate = {
      contractVersion: 'pmav5.candidate/v1', candidateId: stableId('candidate', identity), idempotencyKey: stableId('oracle', identity),
      correlationId: v1CorrelationId, tenantId, marketplace: 'Shopee', sourceItemId, sourceUrl, title, imageUrl, currentPrice,
      originalPrice: Number.isFinite(originalPrice) && originalPrice >= currentPrice ? originalPrice : null,
      category: { id: String(product.productCatIds?.[0] || 'unknown'), name: normalizedScenario, source: 'Shopee OpenAPI V1' },
      marketplaceMetrics: {
        sourcePosition: rankingPosition, itemId: sourceItemId, shopId, productCatId: String(product.productCatIds?.[0] || 'unknown'),
        sales: product.sales, rating: product.ratingStar, discount: priceIntegrity.discountPercent, priceDiscountRate: product.priceDiscountRate ?? null,
        commissionRate: product.commissionPercent ?? product.commissionRate,
      },
      deterministicScore: Math.max(0, Math.min(10, Number(product.score || 0) / 10)),
      discoveryEvidence: { position: rankingPosition, category: normalizedScenario, provider: 'Shopee OpenAPI V1', discoveredAt: requestedAt },
      discoveredAt: requestedAt, rawPayload: product, monetization: { valid: true, affiliateUrl: String(product.offerLink || '') },
      persistenceMetadata: { engine: 'shopee_openapi_v1', mode: 'controlled-persist', scenarioId: normalizedScenario, correlation_id: v1CorrelationId, payload_v1: payloadV1, priceIntegrity },
    };
    return {
      contractVersion: 'pmav5.ingestion/v1', ingestionId: stableId('ingestion', candidate.idempotencyKey), idempotencyKey: candidate.idempotencyKey,
      correlationId: v1CorrelationId, sourceType: 'oracle_shopee_openapi_v1_controlled_persist', tenantId,
      actor: { type: 'service', id: 'oracle-scraper' }, candidate, requestedAt,
    };
  });
}

module.exports = {
  CONTROLLED_PERSIST_SCENARIO, CONTROLLED_PERSIST_SCENARIOS, CONTROLLED_PERSIST_MAX_EXISTING_CANDIDATES,
  getControlledPersistDecision, controlledCandidateQuality, selectControlledPersistCandidates, buildControlledPersistIngestions,
};
