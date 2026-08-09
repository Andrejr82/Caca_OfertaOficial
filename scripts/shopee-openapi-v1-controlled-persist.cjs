'use strict';

const crypto = require('node:crypto');
const { normalizePriceIntegrity } = require('./shopee-openapi-shadow-engine-v1.cjs');

const CONTROLLED_PERSIST_SCENARIOS = new Set([
  'casa_cozinha_editorial',
  'organizacao_editorial',
  'ferramentas_editorial',
  'informatica_editorial',
  'celulares_editorial',
  'beleza_editorial',
  'moda_editorial',
  'esporte_editorial',
  'pet_editorial',
  'games_editorial',
  'tv_audio_editorial',
  'eletrodomesticos_editorial',
  'moveis_editorial',
]);

const CONTROLLED_PERSIST_SCENARIO = 'casa_cozinha_editorial';
const BLOCKED_SCENARIO = 'grandes_ofertas_editorial';

function isTrue(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function isOne(value) {
  return String(value ?? '').trim() === '1';
}

function getControlledPersistDecision(scenarioId, env = process.env) {
  const normalizedScenario = String(scenarioId || '').trim();

  if (normalizedScenario === BLOCKED_SCENARIO) {
    return { enabled: false, reason: 'blocked_v1_scenario', next: 'manual_or_v2' };
  }

  if (!isTrue(env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED)) {
    return { enabled: false, reason: 'feature_flag_disabled' };
  }

  if (!isTrue(env.SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED)) {
    return { enabled: false, reason: 'persist_flag_disabled' };
  }

  if (!CONTROLLED_PERSIST_SCENARIOS.has(normalizedScenario)) {
    return { enabled: false, reason: 'controlled_persist_scenario_not_allowlisted' };
  }

  if (isOne(env.DRY_RUN)) return { enabled: false, reason: 'dry_run_enabled' };
  if (isOne(env.NO_DB_WRITE)) return { enabled: false, reason: 'no_db_write_enabled' };

  if (!isOne(env.NO_PUBLISH)) {
    return { enabled: false, reason: 'publish_flags_required' };
  }

  return {
    enabled: true,
    mode: 'controlled-persist',
    scenarioId: normalizedScenario,
  };
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
}

function buildControlledPersistIngestions(top, { scenarioId, tenantId, correlationId, requestedAt }) {
  const normalizedScenario = String(scenarioId || '').trim();

  if (!CONTROLLED_PERSIST_SCENARIOS.has(normalizedScenario)) {
    throw new Error(`Controlled persist scenario not allowlisted: ${normalizedScenario}`);
  }

  if (!tenantId || !correlationId || !requestedAt) {
    throw new Error('Controlled persist context is incomplete');
  }

  // The OpenAPI V1 ingestion is one stage of the cycle, not a nested cycle.
  // Keep its correlation id identical to discovery_runs and explainability.
  const v1CorrelationId = correlationId;

  return (Array.isArray(top) ? top : []).map((product, index) => {
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
    const payloadV1 = {
      ...product,
      price: currentPrice,
      currentPrice,
      originalPrice,
      priceIntegrity,
    };

    if (
      !/^\d+$/.test(sourceItemId) ||
      !/^\d+$/.test(shopId) ||
      !title ||
      !/^https:\/\//i.test(sourceUrl) ||
      !/^https:\/\//i.test(imageUrl) ||
      !Number.isFinite(currentPrice) ||
      currentPrice <= 0
    ) {
      throw new Error(`Invalid Shopee V1 controlled payload at rank ${index + 1}`);
    }

    const identity = `${tenantId}:Shopee:${sourceItemId}`;

    const candidate = {
      contractVersion: 'pmav5.candidate/v1',
      candidateId: stableId('candidate', identity),
      idempotencyKey: stableId('oracle', identity),
      correlationId: v1CorrelationId,
      tenantId,
      marketplace: 'Shopee',
      sourceItemId,
      sourceUrl,
      title,
      imageUrl,
      currentPrice,
      originalPrice: Number.isFinite(originalPrice) && originalPrice >= currentPrice ? originalPrice : null,
      category: {
        id: String(product.productCatIds?.[0] || 'unknown'),
        name: normalizedScenario,
        source: 'Shopee OpenAPI V1',
      },
      marketplaceMetrics: {
        sourcePosition: index + 1,
        itemId: sourceItemId,
        shopId,
        productCatId: String(product.productCatIds?.[0] || 'unknown'),
        sales: product.sales,
        rating: product.ratingStar,
        discount: priceIntegrity.discountPercent,
        priceDiscountRate: product.priceDiscountRate ?? null,
        commissionRate: product.commissionPercent ?? product.commissionRate,
      },
      deterministicScore: Math.max(0, Math.min(10, Number(product.score || 0) / 10)),
      discoveryEvidence: {
        position: index + 1,
        category: normalizedScenario,
        provider: 'Shopee OpenAPI V1',
        discoveredAt: requestedAt,
      },
      discoveredAt: requestedAt,
      rawPayload: product,
      monetization: { valid: true, affiliateUrl: String(product.offerLink || '') },
      persistenceMetadata: {
        engine: 'shopee_openapi_v1',
        mode: 'controlled-persist',
        scenarioId: normalizedScenario,
        correlation_id: v1CorrelationId,
        payload_v1: payloadV1,
        priceIntegrity,
      },
    };

    return {
      contractVersion: 'pmav5.ingestion/v1',
      ingestionId: stableId('ingestion', candidate.idempotencyKey),
      idempotencyKey: candidate.idempotencyKey,
      correlationId: v1CorrelationId,
      sourceType: 'oracle_shopee_openapi_v1_controlled_persist',
      tenantId,
      actor: { type: 'service', id: 'oracle-scraper' },
      candidate,
      requestedAt,
    };
  });
}

module.exports = {
  CONTROLLED_PERSIST_SCENARIO,
  CONTROLLED_PERSIST_SCENARIOS,
  getControlledPersistDecision,
  buildControlledPersistIngestions,
};
