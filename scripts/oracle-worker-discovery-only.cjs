'use strict';

const crypto = require('node:crypto');
const { validateProductTitle } = require('./product-title-quality.cjs');
const { qualityGate, scoreCandidate } = require('./curation-policy.cjs');
const { interleavePublicationQueue } = require('./publication-queue.cjs');
const { selectBestVariants } = require('./family-variant-selector.cjs');
const { filterFreshCandidates } = require('./offer-freshness-gate.cjs');
const { evaluateSearchQuality } = require('./marketplace-search-quality.cjs');
const { classifyCandidate, buildClassificationCoverage } = require('./classification-coverage.cjs');


const MARKETPLACES = Object.freeze(['Shopee', 'Mercado Livre', 'Amazon']);
const FINAL_STATE = 'pending_manual_review';

function validateCanonicalUrl(url) {
  const str = String(url || '').trim();
  if (!str) return false;
  if (!/^https?:\/\//i.test(str)) return false;
  if (str.includes('click.linksynergy.com') || str.includes('onelink.shein.com')) return false;
  
  // Rejeitar Amazon /r/ se não tiver identificador na URL (mas permitir amzn.to)
  if (str.includes('amazon.') && str.includes('/r/')) {
    if (!str.includes('/dp/') && !str.includes('/gp/product/')) return false;
  }
  return true;
}

function validateNativeIdentity(marketplace, product) {
  const m = String(marketplace || '').toLowerCase();
  const metrics = product.marketplaceMetrics || {};

  if (m === 'mercado livre') {
    const id = metrics.item_id || metrics.itemId || metrics.product_id;
    if (!id || id === 'null' || id === 'undefined') return false;
    if (String(id).includes('http') || String(id).includes('/')) return false;
    return true;
  }

  if (m === 'amazon') {
    const id = metrics.asin || metrics.product_id || product.sourceItemId;
    if (!id || id === 'null' || id === 'undefined') return false;
    if (!/^[A-Z0-9]{10}$/i.test(String(id))) return false;
    return true;
  }

  if (m === 'shopee') {
    const id = metrics.shopee_item_id || metrics.itemId;
    if (!id || id === 'null' || id === 'undefined') return false;
    if (product.title && product.title.toLowerCase().includes('test product')) return false;
    return true;
  }

  return false;
}

function allowsAccessoryByIntent(marketplace, product) {
  const normalizedMarketplace = String(marketplace || '').toLowerCase();
  if (!['amazon', 'mercado livre'].includes(normalizedMarketplace)) return false;
  const intent = String(product?.intent || '').toLowerCase();
  return ['informatica_editorial', 'celulares_editorial', 'games_editorial', 'tv_audio_editorial', 'moda_editorial'].includes(intent);
}


const COPY_QUEUE_DEFAULTS = Object.freeze({ maxTotal: 30, maxPerMarketplace: 10, maxPerCategory: 10 });

function normalizeQueueText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function queueGroupKey(product) {
  const title = normalizeQueueText(product.title);
  const type = normalizeQueueText(product.classification?.productType || product.category?.name) || title.split(' ').slice(0, 3).join(' ');
  const model = title.match(/\b(?:[a-z]{1,5}\s*)?\d{2,5}[a-z0-9-]*\b/i)?.[0] || '';
  const capacity = title.match(/\b\d+(?:[.,]\d+)?\s*(?:l|ml|kg|g|w|xicaras?)\b/i)?.[0] || '';
  return `${type}|${normalizeQueueText(model)}|${normalizeQueueText(capacity)}`;
}

function queueCategory(product) {
  return normalizeQueueText(product.classification?.productType || product.category?.name) || 'sem categoria';
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

  // ─── Fase de seleção familiar (APÓS gate e scores) ─────────────────────────
  // Ajuste #1: a agregação por família ocorre depois que os candidatos já
  // passaram pelo qualityGate. Produtos inválidos não competem por família.
  const eligibleForFamily = [];
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
    // Candidato elegível: guardar gate para uso no FamilyVariantSelector
    eligibleForFamily.push({ ...product, _gate: entry.gate });
  }

  // Aplica dedup por família: seleciona melhor variante, demais ficam como familyDeferred
  const activeFamilyMap = options.activeFamilyMap instanceof Map ? options.activeFamilyMap : new Map();
  const familyResult = selectBestVariants(eligibleForFamily, activeFamilyMap);

  // Produtos sem família detectada passam direto para o loop de seleção normal
  const postFamilySelected = [...familyResult.selected, ...familyResult.ungrouped];

  // Variantes preteridas por família → deferred com motivo específico
  for (const fp of familyResult.familyDeferred) {
    const attempts = (fp.attempts || 0) + 1;
    const marketplace = String(fp.marketplace || limits.marketplace || '').toLowerCase();
    deferred.push({
      ...fp,
      attempts,
      deferredAt: fp.deferredAt || nowIso,
      lastAttemptAt: nowIso,
      nextEligibleAt: new Date(nowMs + 2 * 60 * 60 * 1000).toISOString(),
      initialReason: fp.initialReason || fp._deferralReason,
      finalReason: fp._deferralReason,
      curationScore: queueScore(fp),
      commercialHash: crypto.createHash('sha256').update(`${marketplace}:${fp.sourceItemId}`).digest('hex'),
      // Persistir identidade familiar em explainability (Ajuste #2 e #8)
      familyKey: fp._familyKey || null,
      familyEvidence: fp._familyEvidence || [],
      familyConfidence: fp._familyConfidence || 0,
      selectedSourceItemId: fp._selectedSourceItemId || null,
    });
  }

  // ─── Aplica limites de marketplace/categoria nos eleitos ──────────────────
  for (const product of postFamilySelected) {
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
        commercialHash: crypto.createHash('sha256').update(`${marketplace}:${product.sourceItemId}`).digest('hex'),
        familyKey: product._familyKey || null,
        familyEvidence: product._familyEvidence || [],
        familyConfidence: product._familyConfidence || 0,
      });
      continue;
    }

    const { _gate, _familyKey, _familyEvidence, _familyConfidence, _selectedVariantReason, _variantScore, isDeferred, ...cleanProduct } = product;
    selected.push({
      ...cleanProduct,
      curation: _gate || qualityGate(product),
      curationScore: queueScore(product),
      familyKey: _familyKey || null,
      familyEvidence: _familyEvidence || [],
      familyConfidence: _familyConfidence || 0,
      selectedVariantReason: _selectedVariantReason || null,
    });
    groups.add(group);
    marketplaceCounts.set(marketplace, (marketplaceCounts.get(marketplace) || 0) + 1);
    categoryCounts.set(category, categoryCount + 1);
  }
  if (cycleState) cycleState.selectedCount = Number(cycleState.selectedCount || 0) + selected.length;
  if (stageLogger) stageLogger.end('selectCopyQueue', stageStartedAt, selected.length);
  return { selected: interleavePublicationQueue(selected), skipped, deferred, limits, familySummary: familyResult.familySummary };
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
}

function assertCandidateInput(product) {
  const required = ['sourceItemId', 'sourceUrl', 'title', 'imageUrl', 'currentPrice', 'category', 'deterministicScore', 'discoveredAt'];
  const missing = required.filter((field) => product?.[field] == null || product[field] === '');
  if (missing.length) throw new Error(`Candidate V1 inválido: ${missing.join(', ')}`);
  if (product.sourceItemId === 'null' || product.sourceItemId === 'undefined' || !product.sourceItemId) {
    throw new Error('Candidate V1 inválido: sourceItemId nulo');
  }
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
      browseNodeId: product.category.browseNodeId ?? product.marketplaceMetrics?.browseNodeId ?? null,
      parentBrowseNodeId: product.category.parentBrowseNodeId ?? product.marketplaceMetrics?.parentNodeId ?? null,
      evidenceUrl: product.category.evidenceUrl ?? product.marketplaceMetrics?.browseNodeEvidenceUrl ?? null,
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

async function runDiscoveryOnlyCycle({ tenantId, correlationId, requestedAt, discover, loadDeferred, loadHistory, persist, observe, persistV2Metadata, notifyWorkPending, qualityShadow = null, qualityAdmission = null, prepareCandidate = null, copyQueueOptions = null, marketplaces = MARKETPLACES, stageLogger = null }) {
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
    } catch {}
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
      const history = typeof loadHistory === 'function' ? await loadHistory(marketplace) : [];
      const searchQualityEnabled = process.env.OFFER_SEARCH_QUALITY_V2 === 'active';
      const searchQuality = searchQualityEnabled
        ? evaluateSearchQuality(marketplace, products, {
          cooldownDays: 7,
          maxPerIntent: Number(process.env.OFFER_SEARCH_QUALITY_MAX_PER_INTENT || 10),
        })
        : { accepted: products, rejected: [], metrics: { marketplace, received: products.length, accepted: products.length, rejected: 0, mode: 'disabled' } };
      await safeObserve('discovery.search_quality.evaluated', {
        marketplace,
        ...searchQuality.metrics,
        rejectedReasons: searchQuality.rejected.slice(0, 20),
      });
      const freshness = filterFreshCandidates(
        marketplace,
        searchQuality.accepted,
        history,
        searchQualityEnabled ? { cooldownDays: 7 } : {},
      );
      const freshnessRejected = freshness.rejected || [];
      
      const uniqueProductsMap = new Map();
      let duplicatesRejected = 0;
      let technicalRejections = freshnessRejected.length + (searchQuality.rejected || []).length;
      let rejected = 0;
      const rejectionReasons = {};
      const countRejection = (reason, amount = 1) => {
        const key = String(reason || 'unknown_rejection');
        rejectionReasons[key] = Number(rejectionReasons[key] || 0) + amount;
      };
      for (const item of freshnessRejected) countRejection(item?.reason || 'freshness_rejected');
      for (const item of searchQuality.rejected || []) countRejection(item?.reason || 'search_quality_rejected');
      
      for (let product of freshness.accepted) {
        const sourceItemId = String(product?.sourceItemId || '');
        if (sourceItemId === 'null' || sourceItemId === 'undefined' || !sourceItemId) {
           technicalRejections += 1;
           countRejection('missing_native_identity');
           continue;
        }

        if (!validateNativeIdentity(marketplace, product)) {
           technicalRejections += 1;
           countRejection('invalid_native_identity');
           continue;
        }

        if (!validateCanonicalUrl(product.sourceUrl)) {
           technicalRejections += 1;
           countRejection('invalid_canonical_url');
           continue;
        }

        let preparedProduct = product;
        if (typeof prepareCandidate === 'function') {
          preparedProduct = await prepareCandidate(product, marketplace);
          if (!preparedProduct) {
            technicalRejections += 1;
            countRejection('monetization_prepare_rejected');
            continue;
          }
        }

        preparedProduct = { ...preparedProduct, allowAccessory: allowsAccessoryByIntent(marketplace, preparedProduct) };
        const gate = qualityGate(preparedProduct);
        const titleQuality = validateProductTitle(preparedProduct.title);
        const urlValid = /^https:\/\//i.test(String(preparedProduct.sourceUrl || ''));
        const imgValid = /^https:\/\//i.test(String(preparedProduct.imageUrl || ''));
        const isAccessory = gate.reasons.includes('ACESSORIO_OU_CONSUMIVEL');
        const isPriceInvalid = gate.reasons.includes('PRECO_INVALIDO');
        if (!titleQuality.valid || !urlValid || !imgValid || isPriceInvalid || isAccessory) {
          technicalRejections += 1;
          if (!titleQuality.valid) countRejection(titleQuality.reason || 'invalid_title');
          if (!urlValid) countRejection('invalid_source_url');
          if (!imgValid) countRejection('invalid_image_url');
          if (isPriceInvalid) countRejection('invalid_price');
          if (isAccessory) countRejection('accessory_or_consumable');
          for (const reason of gate.reasons || []) countRejection(reason);
          continue;
        }

        product = preparedProduct;
        let groupKey = sourceItemId;
        const mLower = String(marketplace).toLowerCase();
        if (mLower === 'mercado livre' && product.sourceUrl) {
          const match = product.sourceUrl.match(/\/p\/MLB\d+/i);
          if (match) groupKey = match[0].toLowerCase();
        } else if (mLower === 'amazon') {
          const m = product.marketplaceMetrics || {};
          const asin = m.asin || m.product_id || sourceItemId;
          groupKey = String(asin).toUpperCase();
        } else if (mLower === 'shopee') {
          const m = product.marketplaceMetrics || {};
          const shopeeId = m.shopee_item_id || m.itemId;
          const shopId = m.shop_id || m.shopId;
          if (shopeeId && shopId) {
             groupKey = `${shopeeId}-${shopId}`;
          } else if (shopeeId) {
             groupKey = String(shopeeId);
          }
        }

        const existing = uniqueProductsMap.get(groupKey);
        if (existing) {
           const scoreDiff = scoreCandidate(product) - scoreCandidate(existing);
           const pDisc = (product.originalPrice || product.currentPrice) - product.currentPrice;
           const eDisc = (existing.originalPrice || existing.currentPrice) - existing.currentPrice;
           const discDiff = pDisc - eDisc;
           const priceDiff = existing.currentPrice - product.currentPrice;
           const pPos = product.marketplaceMetrics?.sourcePosition ?? product.marketplaceMetrics?.position ?? 9999;
           const ePos = existing.marketplaceMetrics?.sourcePosition ?? existing.marketplaceMetrics?.position ?? 9999;
           const posDiff = ePos - pPos;
           const pTime = new Date(product.discoveredAt || 0).getTime();
           const eTime = new Date(existing.discoveredAt || 0).getTime();
           const timeDiff = pTime - eTime;

           let shouldReplace = false;
           // Para o mesmo produto/catalogo, menor preco valido e o criterio editorial primario.
           if (priceDiff > 0) shouldReplace = true;
           else if (priceDiff === 0 && scoreDiff > 0) shouldReplace = true;
           else if (priceDiff === 0 && scoreDiff === 0 && discDiff > 0) shouldReplace = true;
           else if (priceDiff === 0 && scoreDiff === 0 && discDiff === 0 && posDiff > 0) shouldReplace = true;
           else if (priceDiff === 0 && scoreDiff === 0 && discDiff === 0 && posDiff === 0 && timeDiff > 0) shouldReplace = true;
           else if (priceDiff === 0 && scoreDiff === 0 && discDiff === 0 && posDiff === 0 && timeDiff === 0) {
             if (product.sourceItemId.localeCompare(existing.sourceItemId) > 0) shouldReplace = true;
           }

           if (shouldReplace) {
             uniqueProductsMap.set(groupKey, product);
           }
           duplicatesRejected += 1;
           countRejection('duplicate_identity');
        } else {
           uniqueProductsMap.set(groupKey, product);
        }
      }
      
      const uniqueProducts = Array.from(uniqueProductsMap.values());
      const classifiedProducts = uniqueProducts.map((candidate) => ({
        ...candidate,
        classification: classifyCandidate(candidate, marketplace),
      }));
      const classificationCoverage = buildClassificationCoverage(classifiedProducts, marketplace);
      let candidatesToPersist = classifiedProducts.filter((candidate) => candidate.classification.status === 'classified');
      technicalRejections += classifiedProducts.length - candidatesToPersist.length;
      for (const candidate of classifiedProducts.filter((item) => item.classification.status !== 'classified')) {
        countRejection(`classification_${candidate.classification.status || 'unknown'}`);
      }
      let deferredForQueue = previouslyDeferred;

      // Active V2 is an explicit opt-in. The default and shadow paths keep the
      // exact V1 candidate set and queue behavior.
      if (process.env.OFFER_QUALITY_PIPELINE_V2 === 'active' && typeof qualityAdmission !== 'function') {
        const missingAdmissionError = new Error('Admissão Offer Quality V2 indisponível');
        await safeObserve('discovery.quality.active.failed', {
          marketplace,
          error: missingAdmissionError.message,
        });
        throw missingAdmissionError;
      }

      if (process.env.OFFER_QUALITY_PIPELINE_V2 === 'active' && typeof qualityAdmission === 'function') {
        try {
          const admission = await qualityAdmission(
            Object.freeze([...candidatesToPersist, ...previouslyDeferred]),
            marketplace,
            { maxAccepted: copyQueueOptions?.maxPerMarketplace ?? COPY_QUEUE_DEFAULTS.maxPerMarketplace },
          );
          const admitted = Array.isArray(admission?.accepted) ? admission.accepted : [];
          const admittedIds = new Set(admitted.map((product) => String(product?.sourceItemId || '')));
          candidatesToPersist = uniqueProducts.filter((product) => admittedIds.has(String(product.sourceItemId)));
          deferredForQueue = previouslyDeferred.filter((product) => admittedIds.has(String(product?.sourceItemId || '')));
          technicalRejections += Array.isArray(admission?.rejected) ? admission.rejected.length : 0;
          for (const item of admission?.rejected || []) for (const reason of item.reasons || ['quality_admission_rejected']) countRejection(reason);
          await safeObserve('discovery.quality.active.completed', {
            marketplace,
            candidates: candidatesToPersist.length,
            admitted: candidatesToPersist.length,
            rejected: Array.isArray(admission?.rejected) ? admission.rejected.length : 0,
          });
        } catch (qualityError) {
          await safeObserve('discovery.quality.active.failed', {
            marketplace,
            error: qualityError?.message || String(qualityError),
          });
          throw qualityError;
        }
      }

      const queue = selectCopyQueue(candidatesToPersist, { ...copyQueueOptions, marketplace }, cycleQueueState, deferredForQueue, stageLogger);
      for (const item of queue.skipped || []) countRejection(item.reason || 'queue_rejected');

      // Shadow mode is observational only. It is deliberately opt-in and never
      // changes queue selection or persistence while the flag is not "shadow".
      if (process.env.OFFER_QUALITY_PIPELINE_V2 === 'shadow' && typeof qualityShadow === 'function') {
        try {
          const shadowResult = await qualityShadow(Object.freeze({
            correlationId,
            marketplace,
            candidates: Object.freeze([...candidatesToPersist]),
            queue: Object.freeze({
              selected: Object.freeze([...(queue.selected || [])]),
              skipped: Object.freeze([...(queue.skipped || [])]),
              deferred: Object.freeze([...(queue.deferred || [])]),
              limits: Object.freeze({ ...(queue.limits || {}) }),
            }),
          }));
          await safeObserve('discovery.quality.shadow.completed', {
            marketplace,
            candidates: candidatesToPersist.length,
            selected: queue.selected.length,
            rejected: queue.skipped.length,
            ...(shadowResult && typeof shadowResult === 'object' ? shadowResult : {}),
          });
        } catch (shadowError) {
          await safeObserve('discovery.quality.shadow.failed', {
            marketplace,
            error: shadowError?.message || String(shadowError),
          });
        }
      }
      
      if (typeof persistV2Metadata === 'function') {
        await persistV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products: candidatesToPersist, queue });
      }

      let persistedAll = { accepted: 0, inserted: 0, updated: 0, state: FINAL_STATE, offerIds: [] };

      if (queue.selected.length > 0) {
        const selectedIngestions = [];
        for (const product of queue.selected) {
          try {
            selectedIngestions.push(createIngestionV1(createCandidateV1({
              marketplace,
              product,
              tenantId,
              correlationId,
            }), requestedAt));
          } catch (error) {
            rejected += 1;
            console.warn(`[Oracle Discovery-Only] Selected candidate rejeitado marketplace=${marketplace}: ${error.message}`);
          }
        }
        
        persistedAll = await persist(selectedIngestions, marketplace, FINAL_STATE);
        if (persistedAll?.state !== FINAL_STATE) {
          throw new Error(`Oracle Worker só pode encerrar em ${FINAL_STATE}`);
        }
        
        for (const offerId of persistedAll.offerIds || []) {
          if (typeof offerId === 'string' && offerId) materializedOfferIds.add(offerId);
        }
        technicalRejections += rejected;
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
          amazon_persisted: Number(persistedAll.accepted || 0),
          reasons: (queue.skipped || []).reduce((acc, s) => { acc[s.reason] = (acc[s.reason] || 0) + 1; return acc; }, {})
        };
      }

      const summary = Object.freeze({
        marketplace,
        discovered: products.length,
        duplicatesRejected,
        freshnessRejected: freshnessRejected.length,
        freshnessReasons: freshnessRejected.reduce((acc, item) => { acc[item.reason] = (acc[item.reason] || 0) + 1; return acc; }, {}),
        queueSelected: queue.selected.length,
        queueSkipped: queue.skipped.length,
        queueDeferred: queue.deferred?.length || 0,
        queueLimits: queue.limits,
        funnel: {
          extracted: products.length,
          searchQualityAccepted: searchQuality.accepted.length,
          freshnessAccepted: freshness.accepted.length,
          unique: uniqueProducts.length,
          classified: classifiedProducts.filter((item) => item.classification.status === 'classified').length,
          candidatesBeforeQueue: candidatesToPersist.length,
          queueSelected: queue.selected.length,
          persisted: Number(persistedAll.accepted || 0),
          rejectionReasons,
        },
        rejected: technicalRejections,
        classificationCoverage,
        persisted: Number(persistedAll.accepted || 0),
        inserted: persistedAll.inserted || 0,
        updated: persistedAll.updated || 0,
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
      if (typeof safeObserve === 'function') {
        await safeObserve('discovery.notification.failed', {
          error: error.message || String(error),
        });
      }
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
  validateCanonicalUrl,
  validateNativeIdentity,
};
