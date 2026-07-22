'use strict';

const crypto = require('node:crypto');

const MARKETPLACES = Object.freeze(['Shopee', 'Mercado Livre', 'Amazon']);
const FINAL_STATE = 'pending_manual_review';

const COPY_QUEUE_DEFAULTS = Object.freeze({ maxTotal: 20, maxPerMarketplace: 5, maxPerCategory: 3 });

function normalizeQueueText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function queueGroupKey(product) {
  const title = normalizeQueueText(product.title);
  const type = normalizeQueueText(product.category?.name) || title.split(' ').slice(0, 3).join(' ');
  const model = title.match(/\b(?:[a-z]{1,5}\s*)?\d{2,5}[a-z0-9-]*\b/i)?.[0] || '';
  const capacity = title.match(/\b\d+(?:[.,]\d+)?\s*(?:l|ml|kg|g|w|xicaras?)\b/i)?.[0] || '';
  return `${type}|${normalizeQueueText(model)}|${normalizeQueueText(capacity)}`;
}

function queueCategory(product) {
  return normalizeQueueText(product.category?.name) || 'sem categoria';
}

function queueScore(product) {
  const price = Number(product.currentPrice || 0);
  const oldPrice = Number(product.originalPrice || 0);
  const discount = oldPrice > price && price > 0 ? (oldPrice - price) / oldPrice : 0;
  const metrics = product.marketplaceMetrics || {};
  return Number(product.deterministicScore || 0) * 10 + Math.min(30, discount * 30) + Math.min(20, Number(metrics.sales || 0) > 0 ? 10 : 0) + Math.min(10, Number(metrics.rating || 0) >= 4.5 ? 10 : 0);
}

function selectCopyQueue(products, options = {}) {
  const limits = { ...COPY_QUEUE_DEFAULTS, ...options };
  const marketplaceCounts = new Map();
  const categoryCounts = new Map();
  const groups = new Set();
  const selected = [];
  const skipped = [];
  const ranked = [...products].sort((a, b) => queueScore(b) - queueScore(a));
  for (const product of ranked) {
    const marketplace = String(product.marketplace || '').toLowerCase();
    const category = queueCategory(product);
    const group = queueGroupKey(product);
    if (groups.has(group)) { skipped.push({ sourceItemId: product.sourceItemId, reason: 'grupo_ja_representado' }); continue; }
    if ((marketplaceCounts.get(marketplace) || 0) >= limits.maxPerMarketplace) { skipped.push({ sourceItemId: product.sourceItemId, reason: 'limite_marketplace' }); continue; }
    if ((categoryCounts.get(category) || 0) >= limits.maxPerCategory) { skipped.push({ sourceItemId: product.sourceItemId, reason: 'limite_categoria' }); continue; }
    if (selected.length >= limits.maxTotal) { skipped.push({ sourceItemId: product.sourceItemId, reason: 'limite_total' }); continue; }
    selected.push(product);
    groups.add(group);
    marketplaceCounts.set(marketplace, (marketplaceCounts.get(marketplace) || 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }
  return { selected, skipped, limits };
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
}

function assertCandidateInput(product) {
  const required = ['sourceItemId', 'sourceUrl', 'title', 'imageUrl', 'currentPrice', 'category', 'deterministicScore', 'discoveredAt'];
  const missing = required.filter((field) => product?.[field] == null || product[field] === '');
  if (missing.length) throw new Error(`Candidate V1 inválido: ${missing.join(', ')}`);
  if (!/^https:\/\//i.test(product.sourceUrl) || !/^https:\/\//i.test(product.imageUrl)) {
    throw new Error('Candidate V1 inválido: URLs devem usar HTTPS');
  }
  if (!Number.isFinite(Number(product.currentPrice)) || Number(product.currentPrice) <= 0) {
    throw new Error('Candidate V1 inválido: currentPrice');
  }
  if (product.originalPrice != null && (
    !Number.isFinite(Number(product.originalPrice))
    || Number(product.originalPrice) < Number(product.currentPrice)
  )) {
    throw new Error('Candidate V1 inválido: originalPrice');
  }
  if (!Number.isFinite(Number(product.deterministicScore)) || product.deterministicScore < 0 || product.deterministicScore > 10) {
    throw new Error('Candidate V1 inválido: deterministicScore');
  }
}

function createCandidateV1({ marketplace, product, tenantId, correlationId }) {
  assertCandidateInput(product);
  const identity = `${tenantId}:${marketplace}:${product.sourceItemId}`;
  return Object.freeze({
    contractVersion: 'pmav5.candidate/v1',
    candidateId: stableId('candidate', identity),
    idempotencyKey: stableId('oracle', identity),
    correlationId,
    tenantId,
    marketplace,
    sourceItemId: String(product.sourceItemId),
    sourceUrl: product.sourceUrl,
    title: String(product.title).trim(),
    imageUrl: product.imageUrl,
    currentPrice: Number(product.currentPrice),
    originalPrice: product.originalPrice == null ? null : Number(product.originalPrice),
    category: Object.freeze({ ...product.category }),
    marketplaceMetrics: Object.freeze({ ...(product.marketplaceMetrics || {}) }),
    deterministicScore: Number(product.deterministicScore),
    discoveryEvidence: Object.freeze({
      position: product.marketplaceMetrics?.sourcePosition ?? product.marketplaceMetrics?.position ?? null,
      category: product.category.name,
      provider: product.category.source,
      discoveredAt: product.discoveredAt,
    }),
    discoveredAt: product.discoveredAt,
  });
}

function createIngestionV1(candidate, requestedAt) {
  return Object.freeze({
    contractVersion: 'pmav5.ingestion/v1',
    ingestionId: stableId('ingestion', candidate.idempotencyKey),
    idempotencyKey: candidate.idempotencyKey,
    correlationId: candidate.correlationId,
    sourceType: 'oracle_candidate',
    tenantId: candidate.tenantId,
    actor: Object.freeze({ type: 'service', id: 'oracle-worker' }),
    candidate,
    requestedAt,
  });
}

async function runDiscoveryOnlyCycle({ tenantId, correlationId, requestedAt, discover, persist, observe, persistV2Metadata, notifyWorkPending, copyQueueOptions = null }) {
  if (!tenantId || !correlationId || !requestedAt) throw new Error('Contexto do ciclo Discovery-Only inválido');
  if (typeof discover !== 'function' || typeof persist !== 'function') throw new Error('Dependências Discovery-Only inválidas');

  const startedAt = Date.now();
  const executionId = crypto.randomUUID();
  const safeObserve = async (eventType, details = {}) => {
    if (typeof observe !== 'function') return;
    try {
      await observe(Object.freeze({
        eventVersion: 'pmav5.observability/v1',
        eventId: crypto.randomUUID(),
        eventType,
        timestamp: new Date().toISOString(),
        service: 'oracle-worker',
        component: 'discovery-only',
        environment: process.env.NODE_ENV || 'unknown',
        commandId: null,
        idempotencyKey: null,
        correlationId,
        causationId: null,
        executionId,
        tenantId,
        ...details,
      }));
    } catch {
      // Telemetry is best-effort and must never change Discovery behavior.
    }
  };
  await safeObserve('discovery.started');
  await safeObserve('worker.heartbeat');
  const summaries = [];
  const materializedOfferIds = new Set();
  try {
    for (const marketplace of MARKETPLACES) {
      const marketplaceStartedAt = Date.now();
      await safeObserve('discovery.marketplace.started', { marketplace });
      const products = await discover(marketplace);
      if (!Array.isArray(products)) throw new Error(`Discovery ${marketplace} retornou payload inválido`);
      const uniqueProducts = [];
      const seenSourceItems = new Set();
      let duplicatesRejected = 0;
      for (const product of products) {
        const sourceItemId = String(product?.sourceItemId || '');
        if (sourceItemId && seenSourceItems.has(sourceItemId)) {
          duplicatesRejected += 1;
          continue;
        }
        if (sourceItemId) seenSourceItems.add(sourceItemId);
        uniqueProducts.push(product);
      }
      const queue = copyQueueOptions ? selectCopyQueue(uniqueProducts, copyQueueOptions) : { selected: uniqueProducts, skipped: [], limits: null };
      if (typeof persistV2Metadata === 'function') {
        await persistV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products: uniqueProducts, queue });
      }
      const ingestions = [];
      let rejected = 0;
      for (const product of queue.selected) {
        try {
          ingestions.push(createIngestionV1(createCandidateV1({
            marketplace,
            product,
            tenantId,
            correlationId,
          }), requestedAt));
        } catch (error) {
          rejected += 1;
          console.warn(`[Oracle Discovery-Only] Candidate rejeitado marketplace=${marketplace}: ${error.message}`);
        }
      }
      const persisted = await persist(ingestions, marketplace);
      if (persisted?.state !== FINAL_STATE) {
        throw new Error(`Oracle Worker só pode encerrar em ${FINAL_STATE}`);
      }
      for (const offerId of persisted.offerIds || []) {
        if (typeof offerId === 'string' && offerId) materializedOfferIds.add(offerId);
      }
      const summary = Object.freeze({
        marketplace,
        discovered: products.length,
        duplicatesRejected,
        queueSelected: queue.selected.length,
        queueSkipped: queue.skipped.length,
        queueLimits: queue.limits,
        rejected,
        persisted: Number(persisted.accepted || 0),
        state: FINAL_STATE,
      });
      summaries.push(summary);
      await safeObserve('discovery.marketplace.completed', {
        marketplace,
        finalState: FINAL_STATE,
        durationMs: Date.now() - marketplaceStartedAt,
        metadata: summary,
      });
    }
  } catch (error) {
    await safeObserve('discovery.failed', {
      result: 'failed',
      severity: 'ERROR',
      errorCode: 'DISCOVERY_CYCLE_FAILED',
      failureStage: 'discovery',
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }

  const result = Object.freeze({
    correlationId,
    marketplaces: Object.freeze(summaries),
    offerIds: Object.freeze([...materializedOfferIds]),
    finalState: FINAL_STATE,
  });
  await safeObserve('discovery.completed', {
    result: 'success',
    finalState: FINAL_STATE,
    durationMs: Date.now() - startedAt,
  });

  if (typeof notifyWorkPending === 'function' && result.offerIds.length > 0) {
    try {
      await notifyWorkPending(result);
    } catch (error) {
      await safeObserve('discovery.notification.failed', {
        error: error.message || String(error),
      });
    }
  }

  return result;
}

module.exports = {
  FINAL_STATE,
  MARKETPLACES,
  createCandidateV1,
  createIngestionV1,
  runDiscoveryOnlyCycle,
};
