'use strict';

const crypto = require('node:crypto');
const { validateProductTitle } = require('./product-title-quality.cjs');
const { qualityGate, scoreCandidate } = require('./curation-policy.cjs');
const { interleavePublicationQueue } = require('./publication-queue.cjs');

const MARKETPLACES = Object.freeze(['Shopee', 'Mercado Livre', 'Amazon']);
const FINAL_STATE = 'pending_manual_review';

const COPY_QUEUE_DEFAULTS = Object.freeze({ maxTotal: 30, maxPerMarketplace: 10, maxPerCategory: 10 });

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
  return scoreCandidate(product);
}

function selectCopyQueue(products, options = {}, cycleState = null, previouslyDeferred = [], stageLogger = null) {
  let stageStartedAt;
  if (stageLogger) stageStartedAt = stageLogger.start('selectCopyQueue', products.length);

  const limits = { ...COPY_QUEUE_DEFAULTS, ...options };
  const marketplaceCounts = cycleState?.marketplaceCounts || new Map();
  const categoryCounts = cycleState?.categoryCounts || new Map();
  const groups = cycleState?.groups || new Set();
  const selected = [];
  const skipped = [];
  const deferred = [];
  const maxAttempts = Number(limits.deferredMaxAttempts || 3);
  const ttlHours = Number(limits.deferredTtlHours || 24);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const allCandidates = new Map();
  for (const item of previouslyDeferred) {
    if (item.nextEligibleAt && new Date(item.nextEligibleAt).getTime() > nowMs) {
      deferred.push(item);
      continue;
    }
    const ageHours = (nowMs - new Date(item.deferredAt || nowIso).getTime()) / (1000 * 60 * 60);
    if (ageHours > ttlHours) {
      skipped.push({ sourceItemId: item.sourceItemId, reason: 'deferred_ttl_expired' });
      continue;
    }
    if (Number(item.attempts || 0) >= maxAttempts) {
      skipped.push({ sourceItemId: item.sourceItemId, reason: 'deferred_max_attempts' });
      continue;
    }
    allCandidates.set(item.sourceItemId, { ...item, isDeferred: true });
  }

  for (const product of products) {
    if (!allCandidates.has(product.sourceItemId)) {
      allCandidates.set(product.sourceItemId, { ...product, isDeferred: false, attempts: 0 });
    }
  }

  const ranked = Array.from(allCandidates.values())
    .map((product) => {
      const candidate = product.marketplace ? product : { ...product, marketplace: limits.marketplace };
      return { product: candidate, gate: qualityGate(candidate) };
    })
    .sort((a, b) => {
      const scoreDiff = queueScore(b.product) - queueScore(a.product);
      if (scoreDiff !== 0) return scoreDiff;
      const aAge = a.product.deferredAt ? new Date(a.product.deferredAt).getTime() : nowMs;
      const bAge = b.product.deferredAt ? new Date(b.product.deferredAt).getTime() : nowMs;
      if (aAge !== bAge) return aAge - bAge;
      return String(a.product.sourceItemId).localeCompare(String(b.product.sourceItemId));
    });

  for (const entry of ranked) {
    const product = entry.product;
    if (!entry.gate.eligible) {
      skipped.push({ sourceItemId: product.sourceItemId, reason: entry.gate.reasons[0], reasons: entry.gate.reasons, warnings: entry.gate.warnings || [] });
      continue;
    }
    const titleQuality = validateProductTitle(product.title);
    if (!titleQuality.valid) {
      skipped.push({ sourceItemId: product.sourceItemId, reason: titleQuality.reason });
      continue;
    }
    const marketplace = String(product.marketplace || limits.marketplace || '').toLowerCase();
    const category = queueCategory(product);
    const group = queueGroupKey(product);
    
    if (groups.has(group)) { skipped.push({ sourceItemId: product.sourceItemId, reason: 'grupo_ja_representado' }); continue; }
    if ((marketplaceCounts.get(marketplace) || 0) >= limits.maxPerMarketplace) { skipped.push({ sourceItemId: product.sourceItemId, reason: 'limite_marketplace' }); continue; }
    
    const categoryCount = categoryCounts.get(category) || 0;
    const selectedCount = Number(cycleState?.selectedCount || 0) + selected.length;
    
    let deferReason = null;
    if (categoryCount >= limits.maxPerCategory) {
      deferReason = 'limite_categoria';
    } else if (selectedCount >= limits.maxTotal) {
      deferReason = 'limite_total';
    }

    if (deferReason) {
      const attempts = (product.attempts || 0) + 1;
      const deferredAt = product.deferredAt || nowIso;
      deferred.push({ 
        ...product,
        attempts,
        deferredAt,
        lastAttemptAt: nowIso,
        nextEligibleAt: new Date(nowMs + 2 * 60 * 60 * 1000).toISOString(),
        initialReason: product.initialReason || deferReason,
        finalReason: deferReason,
        curationScore: queueScore(product),
        commercialHash: crypto.createHash('sha256').update(`${marketplace}:${product.sourceItemId}`).digest('hex')
      });
      continue;
    }
    
    delete product.isDeferred;
    selected.push({ ...product, curation: entry.gate, curationScore: queueScore(product) });
    groups.add(group);
    marketplaceCounts.set(marketplace, (marketplaceCounts.get(marketplace) || 0) + 1);
    categoryCounts.set(category, categoryCount + 1);
  }
  if (cycleState) cycleState.selectedCount = Number(cycleState.selectedCount || 0) + selected.length;
  if (stageLogger) stageLogger.end('selectCopyQueue', stageStartedAt, selected.length);
  return { selected: interleavePublicationQueue(selected), skipped, deferred, limits };
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

async function runDiscoveryOnlyCycle({ tenantId, correlationId, requestedAt, discover, loadDeferred, persist, observe, persistV2Metadata, notifyWorkPending, copyQueueOptions = null, marketplaces = MARKETPLACES, stageLogger = null }) {
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
  const cycleQueueState = {
    selectedCount: 0,
    marketplaceCounts: new Map(),
    categoryCounts: new Map(),
    groups: new Set(),
  };
  const requestedMarketplaces = [...new Set((Array.isArray(marketplaces) ? marketplaces : MARKETPLACES)
    .map((marketplace) => String(marketplace || '').trim())
    .filter((marketplace) => MARKETPLACES.includes(marketplace)))];
  if (requestedMarketplaces.length === 0) throw new Error('Nenhum marketplace autorizado foi selecionado');
  try {
    for (const marketplace of requestedMarketplaces) {
      const marketplaceStartedAt = Date.now();
      await safeObserve('discovery.marketplace.started', { marketplace });
      const products = await discover(marketplace);
      const previouslyDeferred = typeof loadDeferred === 'function' ? await loadDeferred(marketplace) : [];
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
      const queue = copyQueueOptions
        ? selectCopyQueue(uniqueProducts, { ...copyQueueOptions, marketplace }, cycleQueueState, previouslyDeferred, stageLogger)
        : { selected: uniqueProducts, skipped: [], deferred: [], limits: null };
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
      const persisted = await persist(ingestions, marketplace, FINAL_STATE);
      if (persisted?.state !== FINAL_STATE) {
        throw new Error(`Oracle Worker só pode encerrar em ${FINAL_STATE}`);
      }
      for (const offerId of persisted.offerIds || []) {
        if (typeof offerId === 'string' && offerId) materializedOfferIds.add(offerId);
      }

      if (queue.deferred?.length > 0) {
        const deferredIngestions = [];
        for (const product of queue.deferred) {
          try {
            deferredIngestions.push(createIngestionV1(createCandidateV1({
              marketplace,
              product,
              tenantId,
              correlationId,
            }), requestedAt));
          } catch (error) {
            console.warn(`[Oracle Discovery-Only] Deferred Candidate rejeitado marketplace=${marketplace}: ${error.message}`);
          }
        }
        await persist(deferredIngestions, marketplace, 'deferred');
      }

      let amazonTelemetry = undefined;
      if (marketplace.toLowerCase() === 'amazon') {
        const allProcessed = [...queue.selected.map(s => s.curation), ...(queue.deferred || []).map(d => ({ warnings: [] })), ...(queue.skipped || [])];
        const missing_commercial_data = allProcessed.filter(p => (p?.warnings || []).includes('DADOS_COMERCIAIS_INDISPONIVEIS')).length;
        const quality_rejected = (queue.skipped || []).filter(s => s.reason !== 'limite_marketplace' && s.reason !== 'grupo_ja_representado' && !s.reason?.startsWith('deferred_')).length;
        amazonTelemetry = {
          amazon_discovered: products.length,
          amazon_structurally_valid: uniqueProducts.length,
          amazon_missing_commercial_data: missing_commercial_data,
          amazon_commercial_signal_found: uniqueProducts.length - missing_commercial_data,
          amazon_quality_rejected: quality_rejected,
          amazon_ranked: uniqueProducts.length,
          amazon_selected: queue.selected.length,
          amazon_deferred: queue.deferred?.length || 0,
          amazon_persisted: Number(persisted.accepted || 0),
          reasons: (queue.skipped || []).reduce((acc, s) => { acc[s.reason] = (acc[s.reason] || 0) + 1; return acc; }, {})
        };
      }

      const summary = Object.freeze({
        marketplace,
        discovered: products.length,
        duplicatesRejected,
        queueSelected: queue.selected.length,
        queueSkipped: queue.skipped.length,
        queueDeferred: queue.deferred?.length || 0,
        queueLimits: queue.limits,
        rejected,
        persisted: Number(persisted.accepted || 0),
        inserted: Number(persisted.inserted || 0),
        updated: Number(persisted.updated || 0),
        state: FINAL_STATE,
        ...(amazonTelemetry ? { amazonTelemetry } : {})
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
    tenantId,
    requestedAt,
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
  selectCopyQueue,
  runDiscoveryOnlyCycle,
};
