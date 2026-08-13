'use strict';

const crypto = require('node:crypto');
const { validateProductTitle } = require('./product-title-quality.cjs');
const { qualityGate, scoreCandidate } = require('./curation-policy.cjs');
const { interleavePublicationQueue } = require('./publication-queue.cjs');
const { selectBestVariants } = require('./family-variant-selector.cjs');
const { filterFreshCandidates } = require('./offer-freshness-gate.cjs');
const { evaluateSearchQuality } = require('./marketplace-search-quality.cjs');
const { classifyCandidate, buildClassificationCoverage } = require('./classification-coverage.cjs');
const {
  computeAllKeys,
  extractBaselineTokens,
  extractProductTypeSlug,
} = require('./family-key-engine.cjs');
const {
  createDiscoveryFunnel,
  canonicalRejectionReason,
  readDiscoveryFunnelMeta,
  deriveMarketplaceTerminalStatus,
} = require('./discovery-funnel-contract.cjs');

// --- BRIDGE COMMONJS ⇄ TYPESCRIPT (Motor Shopee V1) ---
let oracleAdapterTs = null;
let oracleAdapterLoadAttempted = false;

function getOracleAdapter() {
  if (oracleAdapterLoadAttempted) return oracleAdapterTs;
  oracleAdapterLoadAttempted = true;
  try {
    require('tsx/cjs');
    oracleAdapterTs = require('../src/lib/shopee/ranking/oracle-adapter.ts');
    console.log('[ORACLE-WORKER] Bridge TypeScript (Motor Shopee V1) carregada com sucesso.');
  } catch (error) {
    console.warn('[ORACLE-WORKER] Falha ao carregar bridge TypeScript do Motor Shopee V1:', error.message);
  }
  return oracleAdapterTs;
}

/**
 * Preparação da chamada ao Motor Shopee V1.
 * O fallback ou bloqueio ocorre internamente via adapter.
 */
function safeEvaluateShopeeOracleCandidate(candidate) {
  const adapter = getOracleAdapter();
  if (!adapter || typeof adapter.evaluateShopeeOracleCandidate !== 'function') {
    return null;
  }
  try {
    return adapter.evaluateShopeeOracleCandidate(candidate);
  } catch (error) {
    console.warn('[ORACLE-WORKER] Erro na execução do Motor Shopee V1:', error.message);
    return null;
  }
}
// ------------------------------------------------------



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
  if (product._v1Score !== undefined) return product._v1Score;
  return scoreCandidate(product);
}

const SHOPEE_GROUP_KEY_VERSION = 'shopee-family-v1';

function shopeeNativeCategory(product) {
  const metrics = product?.marketplaceMetrics || {};
  return String(product?.category?.id || metrics.productCatId || metrics.product_cat_id || 'unknown');
}

function shopeeGender(product) {
  const title = normalizeQueueText(product?.title);
  if (/\b(feminina|feminino|mulher|menina)\b/.test(title)) return 'feminino';
  if (/\b(masculina|masculino|homem|menino)\b/.test(title)) return 'masculino';
  return 'unisex';
}

function canonicalizeShopeeFamilyKey(familyKey) {
  const parts = String(familyKey || '').split('|');
  if (parts.length !== 5 || !parts[3]) return String(familyKey || '');
  parts[3] = parts[3].split('-').filter(Boolean).sort().join('-');
  return parts.join('|');
}

function buildShopeeQueueGroupKey(product) {
  const family = computeAllKeys({
    ...product,
    marketplace: 'Shopee',
  });
  const nativeCategory = shopeeNativeCategory(product);
  if (family.canGroup && family.family_key) {
    return `shopee|native:${nativeCategory}|family:${canonicalizeShopeeFamilyKey(family.family_key)}`;
  }

  const type = extractProductTypeSlug(product);
  const baseline = extractBaselineTokens(product);
  const gender = shopeeGender(product);
  if (type || baseline) {
    return `shopee|native:${nativeCategory}|semantic:${type || 'unknown'}|gender:${gender}|line:${baseline || 'unknown'}`;
  }

  return queueGroupKey(product);
}

function groupKeyForProduct(product, marketplace) {
  return String(marketplace || product?.marketplace || '').toLowerCase() === 'shopee'
    ? buildShopeeQueueGroupKey(product)
    : queueGroupKey(product);
}

function groupKeyVersionForMarketplace(marketplace) {
  return String(marketplace || '').toLowerCase() === 'shopee' ? SHOPEE_GROUP_KEY_VERSION : 'legacy-v1';
}

function queueTraceItem(product, { decision, reason = null, rank = null, group = null, currentGroup = null, proposedGroup = null, groupKeyVersion = 'legacy-v1', familyKey = null } = {}) {
  const candidate = product || {};
  return {
    decision,
    reason: reason ? canonicalRejectionReason(reason) : null,
    sourceItemId: candidate.sourceItemId ? String(candidate.sourceItemId) : null,
    marketplace: candidate.marketplace || null,
    category: queueCategory(candidate),
    score: Number.isFinite(Number(candidate.curationScore))
      ? Number(candidate.curationScore)
      : Number(queueScore(candidate).toFixed(4)),
    rank,
    groupKey: group || null,
    currentGroupKey: currentGroup || group || null,
    proposedGroupKey: proposedGroup || group || null,
    groupKeyVersion,
    familyKey: familyKey || candidate._familyKey || candidate.familyKey || null,
  };
}

function cloneQueueState(cycleState) {
  return {
    selectedCount: Number(cycleState?.selectedCount || 0),
    marketplaceCounts: new Map(cycleState?.marketplaceCounts || []),
    categoryCounts: new Map(cycleState?.categoryCounts || []),
    groups: new Set(cycleState?.groups || []),
  };
}

function simulateQueueByGroup(products, limits, cycleState, groupKeyResolver) {
  const state = cloneQueueState(cycleState);
  const selected = [];
  const decisions = new Map();
  for (const product of products) {
    const marketplace = String(product.marketplace || limits.marketplace || '').toLowerCase();
    const category = queueCategory(product);
    const group = groupKeyResolver(product, marketplace);
    let reason = null;
    if (state.groups.has(group)) reason = 'grupo_ja_representado';
    else if ((state.marketplaceCounts.get(marketplace) || 0) >= limits.maxPerMarketplace) reason = 'limite_marketplace';
    else if ((state.categoryCounts.get(category) || 0) >= limits.maxPerCategory) reason = 'limite_categoria';
    else if (state.selectedCount >= limits.maxTotal) reason = 'limite_total';

    if (reason) {
      decisions.set(String(product.sourceItemId), { decision: 'rejected', reason });
      continue;
    }
    selected.push(product);
    decisions.set(String(product.sourceItemId), { decision: 'selected', reason: null });
    state.groups.add(group);
    state.marketplaceCounts.set(marketplace, (state.marketplaceCounts.get(marketplace) || 0) + 1);
    state.categoryCounts.set(category, (state.categoryCounts.get(category) || 0) + 1);
    state.selectedCount += 1;
  }
  return { selected, decisions };
}

function buildQueueSelectionTelemetry({ products, allCandidates, ranked, selected, skipped, familyDeferred, postFamilySelected, limits, cycleState, marketplace }) {
  const rankBySourceItemId = new Map(ranked.map((entry, index) => [String(entry.product.sourceItemId), index + 1]));
  const candidateBySourceItemId = new Map([
    ...Array.from(allCandidates.values()),
    ...postFamilySelected,
  ].map((candidate) => [String(candidate.sourceItemId), candidate]));
  const rejectionReasons = {};
  const items = [];
  const groupKeyVersion = groupKeyVersionForMarketplace(marketplace);
  const currentSimulation = simulateQueueByGroup(postFamilySelected, limits, cycleState, (product) => queueGroupKey(product));
  const proposedSimulation = simulateQueueByGroup(postFamilySelected, limits, cycleState, (product, currentMarketplace) => groupKeyForProduct(product, currentMarketplace));
  const currentDecisions = currentSimulation.decisions;
  const proposedDecisions = proposedSimulation.decisions;
  const changedRejections = [];
  const addItem = (product, detail) => {
    const candidate = product || {};
    const currentGroup = queueGroupKey(candidate);
    const proposedGroup = groupKeyForProduct(candidate, marketplace);
    const item = queueTraceItem(candidate, {
      ...detail,
      rank: detail.rank ?? rankBySourceItemId.get(String(candidate.sourceItemId)) ?? null,
      currentGroup,
      proposedGroup,
      groupKeyVersion,
    });
    if (item.reason) rejectionReasons[item.reason] = Number(rejectionReasons[item.reason] || 0) + 1;
    items.push(item);
  };

  for (const product of selected) addItem(product, { decision: 'selected', group: groupKeyForProduct(product, marketplace) });
  for (const skippedItem of skipped) {
    const product = candidateBySourceItemId.get(String(skippedItem.sourceItemId)) || skippedItem;
    addItem(product, { decision: 'rejected', reason: skippedItem.reason || 'queue_rejected', group: groupKeyForProduct(product, marketplace) });
  }
  for (const deferredProduct of familyDeferred) {
    addItem(deferredProduct, {
      decision: 'rejected',
      reason: deferredProduct._deferralReason || deferredProduct.finalReason || 'family_active',
      group: groupKeyForProduct(deferredProduct, marketplace),
      familyKey: deferredProduct._familyKey,
    });
  }

  for (const product of postFamilySelected) {
    const sourceItemId = String(product.sourceItemId);
    const currentDecision = currentDecisions.get(sourceItemId);
    const proposedDecision = proposedDecisions.get(sourceItemId);
    if (currentDecision?.decision === 'rejected' && proposedDecision?.decision === 'selected') {
      changedRejections.push({
        sourceItemId,
        currentReason: currentDecision.reason,
        proposedReason: proposedDecision.reason,
        currentGroupKey: queueGroupKey(product),
        proposedGroupKey: groupKeyForProduct(product, marketplace),
        title: String(product.title || '').slice(0, 180),
      });
    }
  }

  return {
    groupKeyVersion,
    candidatesReceived: Math.max(products.length, allCandidates.size),
    candidatesSelected: selected.length,
    candidatesRejected: skipped.length + familyDeferred.length,
    currentSelectedCount: currentSimulation.selected.length,
    proposedSelectedCount: proposedSimulation.selected.length,
    currentRejectedCount: postFamilySelected.length - currentSimulation.selected.length,
    proposedRejectedCount: postFamilySelected.length - proposedSimulation.selected.length,
    changedRejections,
    rejectionReasons,
    items,
    limits: { maxTotal: limits.maxTotal, maxPerMarketplace: limits.maxPerMarketplace, maxPerCategory: limits.maxPerCategory },
  };
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

  // --shopee-ranking-v1-shadow: flag oficial do Shadow Mode do Motor Shopee V1.
  // NÃO usar --shopee-v4-dry-run (flag legada aposentada em oracle-scraper.cjs).
  const isShadowMode = process.argv.includes('--shopee-ranking-v1-shadow');

  const ranked = Array.from(allCandidates.values())
    .map((product) => {
      const candidate = product.marketplace ? product : { ...product, marketplace: limits.marketplace };
      let finalGate = qualityGate(candidate);

      if (String(candidate.marketplace || '').toLowerCase() === 'shopee') {
        const v1Result = safeEvaluateShopeeOracleCandidate(candidate);
        if (v1Result) {
          candidate.strategyVersion = v1Result.strategyVersion;
          candidate.scoreBreakdown = v1Result.scoreBreakdown || { finalScore: v1Result.score };
          candidate.determiningReasons = v1Result.reasons || [];
          
          const v1Gate = {
            eligible: v1Result.eligible,
            reasons: v1Result.reasons || [],
            warnings: []
          };

          if (isShadowMode) {
            candidate._v1ShadowGate = v1Gate;
            candidate._v1Score = v1Result.score;
          } else {
            finalGate = v1Gate;
            candidate._v1Score = v1Result.score;
          }
        }
      }

      return { product: candidate, gate: finalGate };
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
    strategyVersion: product.strategyVersion || null,
    scoreBreakdown: product.scoreBreakdown ? Object.freeze({ ...product.scoreBreakdown }) : null,
    determiningReasons: product.determiningReasons ? Object.freeze([...product.determiningReasons]) : null,
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

async function runDiscoveryOnlyCycle({ tenantId, correlationId, requestedAt, discover, shopeeDiscovery = null, persistShopee = null, loadDeferred, loadHistory, persist, observe, persistV2Metadata, notifyWorkPending, qualityShadow = null, qualityAdmission = null, prepareCandidate = null, copyQueueOptions = null, marketplaces = MARKETPLACES, stageLogger = null, scenarioResolver = null, scenarioRuntimeResolver = null }) {
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
  let activeFunnel = null;
  try {
    for (const marketplace of requestedMarketplaces) {
      const marketplaceStartedAt = Date.now();
      await safeObserve('discovery.marketplace.started', { marketplace });
      if (marketplace === 'Shopee' && typeof shopeeDiscovery === 'function') {
        const scenario = typeof scenarioResolver === 'function' ? scenarioResolver(marketplace, [], {}) : 'unknown';
        let scenarioRuntime = null;
        if (typeof scenarioRuntimeResolver === 'function') {
          try { scenarioRuntime = scenarioRuntimeResolver(marketplace, [], {}, scenario) || null; } catch {}
        }
        const funnel = createDiscoveryFunnel({ marketplace, scenario, correlationId, startedAt: new Date(marketplaceStartedAt).toISOString(), scenarioRuntime });
        activeFunnel = funnel;
        let discovery;
        try {
          discovery = await shopeeDiscovery(Object.freeze({ marketplace, scenario, correlationId, requestedAt }));
        } catch (error) {
          discovery = { engine: 'shopee_openapi_v1', mode: 'official', decision: 'failed', top: [], metrics: {}, error: error?.message || String(error) };
        }
        const metrics = discovery?.metrics || {};
        const top = Array.isArray(discovery?.top) ? discovery.top : [];
        funnel.count('extracted', metrics.raw ?? discovery?.extracted ?? top.length);
        funnel.count('afterParse', metrics.parsed ?? top.length);
        funnel.count('afterRelevance', metrics.approvedContract ?? top.length);
        funnel.count('afterIdentityDedup', metrics.scoreable ?? top.length);
        funnel.count('afterQualityGate', metrics.final ?? top.length);
        for (const [reason, count] of Object.entries(discovery?.rejectionReasons || {})) funnel.reject(reason, count);
        const sourceFailure = ['failed', 'timeout'].includes(discovery?.decision);
        const sourceBlocked = discovery?.decision === 'blocked';
        if (sourceFailure || sourceBlocked) {
          if (sourceFailure) funnel.count('failed', 1).setFailed();
          else funnel.setSourceStatus('blocked').setTerminalStatus('blocked');
          if (typeof persistV2Metadata === 'function') {
            await persistV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products: [], queue: { selected: [], skipped: [], deferred: [], limits: { engine: 'shopee_openapi_v1', persistenceCap: null } }, funnel: funnel.snapshot() });
          }
          const summary = Object.freeze({ marketplace, discovered: Number(metrics.raw ?? 0), duplicatesRejected: 0, freshnessRejected: 0, freshnessReasons: {}, queueSelected: 0, queueSkipped: 0, queueDeferred: 0, queueLimits: { engine: 'shopee_openapi_v1', persistenceCap: null }, funnel: { extracted: Number(metrics.raw ?? 0), persisted: 0, contractVersion: funnel.snapshot().contractVersion, status: funnel.snapshot().status, counters: funnel.snapshot().counters, rejectionReasons: funnel.snapshot().rejectionReasons }, rejected: 0, classificationCoverage: {}, persisted: 0, inserted: 0, updated: 0, state: FINAL_STATE, funnelContract: funnel.snapshot(), shopeeV1: discovery, shadow: discovery });
          summaries.push(summary);
          await safeObserve('discovery.marketplace.completed', { marketplace, finalState: FINAL_STATE, funnelStatus: funnel.snapshot().status, durationMs: Date.now() - marketplaceStartedAt, metadata: summary });
          continue;
        }
        const v1Candidates = top.map((product, index) => ({
          ...product, sourceItemId: String(product.itemId || '').trim(), title: product.productName || product.title,
          sourceUrl: product.offerLink || product.productLink, imageUrl: product.imageUrl,
          currentPrice: product.currentPrice ?? product.price ?? product.priceMin,
          originalPrice: product.originalPrice ?? product.priceMax,
          discoveredAt: requestedAt, correlationId, intent: scenario,
          category: { id: String(product.productCatIds?.[0] || 'unknown'), name: scenario, source: 'Shopee OpenAPI V1' },
          marketplaceMetrics: { ...(product.marketplaceMetrics || {}), itemId: product.itemId, shopId: product.shopId, shopee_item_id: product.itemId, shopee_shop_id: product.shopId, sourcePosition: index + 1, productCatId: String(product.productCatIds?.[0] || 'unknown') },
          deterministicScore: Math.max(0, Math.min(10, Number(product.score || 0) / 10)),
        }));
        const history = typeof loadHistory === 'function' ? await loadHistory(marketplace) : [];
        const freshness = filterFreshCandidates('Shopee', v1Candidates, history);
        funnel.count('afterNovelty', freshness.accepted.length).count('afterClassification', freshness.accepted.length).count('queueSelected', freshness.accepted.length);
        for (const item of freshness.rejected || []) funnel.reject(item?.reason || 'freshness_rejected');
        const queue = { selected: freshness.accepted, skipped: [], deferred: [], limits: { engine: 'shopee_openapi_v1', persistenceCap: null, maxPerMarketplace: Number(copyQueueOptions?.maxPerMarketplace || 0), selection: 'all_v1_rule_survivors' } };
        funnel.recordQueueSelection({ groupKeyVersion: 'shopee-openapi-v1', candidatesReceived: freshness.accepted.length, candidatesSelected: freshness.accepted.length });
        let persistedAll = { accepted: 0, inserted: 0, updated: 0, ignored: 0, offerIds: [] };
        if (freshness.accepted.length > 0 && typeof persistShopee === 'function') {
          persistedAll = await persistShopee({ discovery: { ...discovery, top: top.filter((product) => freshness.accepted.some((candidate) => candidate.sourceItemId === String(product.itemId || ''))) }, candidates: freshness.accepted, marketplace, scenario, tenantId, correlationId, requestedAt, limit: queue.limits.maxPerMarketplace });
          funnel.count('rpcSent', Math.max(0, freshness.accepted.length - Number(persistedAll?.rpcSent || 0))).mergeRpc(persistedAll || {});
          for (const offerId of persistedAll?.offerIds || []) if (typeof offerId === 'string' && offerId) materializedOfferIds.add(offerId);
        }
        funnel.setTerminalStatus(deriveMarketplaceTerminalStatus({ counters: funnel.snapshot().counters, sourceStatus: freshness.accepted.length === 0 && Number(metrics.raw ?? top.length) === 0 ? 'empty' : undefined }));
        if (typeof persistV2Metadata === 'function') await persistV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products: freshness.accepted, queue, funnel: funnel.snapshot() });
          const summary = Object.freeze({ marketplace, discovered: Number(metrics.raw ?? top.length), duplicatesRejected: Number(metrics.duplicates || 0), freshnessRejected: freshness.rejected?.length || 0, freshnessReasons: (freshness.rejected || []).reduce((all, item) => ({ ...all, [item.reason]: Number(all[item.reason] || 0) + 1 }), {}), queueSelected: freshness.accepted.length, queueSkipped: 0, queueDeferred: 0, queueLimits: queue.limits, funnel: { extracted: Number(metrics.raw ?? top.length), searchQualityAccepted: Number(metrics.final ?? top.length), freshnessAccepted: freshness.accepted.length, unique: Number(metrics.scoreable ?? top.length), classified: freshness.accepted.length, candidatesBeforeQueue: freshness.accepted.length, queueSelected: freshness.accepted.length, persisted: Number(persistedAll.accepted || 0), contractVersion: funnel.snapshot().contractVersion, status: funnel.snapshot().status, counters: funnel.snapshot().counters, rejectionReasons: funnel.snapshot().rejectionReasons }, rejected: Number(metrics.technicalRejected || 0) + Number(metrics.intentRejected || 0) + Number(metrics.duplicates || 0) + (freshness.rejected?.length || 0), classificationCoverage: {}, persisted: Number(persistedAll.accepted || 0), inserted: persistedAll.inserted || 0, updated: persistedAll.updated || 0, state: FINAL_STATE, funnelContract: funnel.snapshot(), shopeeV1: discovery, shadow: discovery });
        summaries.push(summary);
        await safeObserve('discovery.marketplace.completed', { marketplace, finalState: FINAL_STATE, funnelStatus: summary.funnelContract.status, durationMs: Date.now() - marketplaceStartedAt, metadata: summary });
        continue;
      }
      const products = await discover(marketplace);
      const discoveryMeta = readDiscoveryFunnelMeta(products);
      const scenario = typeof scenarioResolver === 'function'
        ? scenarioResolver(marketplace, products, discoveryMeta)
        : products?.[0]?.intent || discoveryMeta.scenario || 'unknown';
      let scenarioRuntime = null;
      if (typeof scenarioRuntimeResolver === 'function') {
        try {
          scenarioRuntime = scenarioRuntimeResolver(marketplace, products, discoveryMeta, scenario) || null;
        } catch (runtimeError) {
          await safeObserve('discovery.scenario_runtime.failed', {
            marketplace,
            error: runtimeError?.message || String(runtimeError),
          });
        }
      }
      const funnel = createDiscoveryFunnel({ marketplace, scenario, correlationId, startedAt: new Date(marketplaceStartedAt).toISOString(), scenarioRuntime });
      activeFunnel = funnel;
      funnel.setFinalByCategory(discoveryMeta.finalByCategory);
      if (marketplace === 'Amazon' && discoveryMeta.amazonTelemetry) {
        funnel.setSourceTelemetry(discoveryMeta.amazonTelemetry);
        const failedQueries = Number(discoveryMeta.amazonTelemetry.total_queries_failed || 0);
        if (failedQueries > 0) funnel.count('failed', failedQueries);
      }
      funnel.count('extracted', discoveryMeta.extracted ?? products?.length ?? 0);
      funnel.count('afterParse', discoveryMeta.afterParse ?? products?.length ?? 0);
      funnel.count('afterRelevance', discoveryMeta.afterRelevance ?? products?.length ?? 0);
      funnel.count('afterNovelty', discoveryMeta.afterNovelty ?? products?.length ?? 0);
      funnel.reject('known_identity', discoveryMeta.knownIdentityRejected || 0);
      funnel.reject('scenario_mismatch', discoveryMeta.scenarioMismatchRejected || 0);
      if (discoveryMeta.sourceStatus && discoveryMeta.sourceStatus !== 'completed') funnel.setSourceStatus(discoveryMeta.sourceStatus);
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
        funnel.reject(key, amount);
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
      funnel.count('afterIdentityDedup', uniqueProducts.length);
      const classifiedProducts = uniqueProducts.map((candidate) => ({
        ...candidate,
        classification: classifyCandidate(candidate, marketplace),
      }));
      const classificationCoverage = buildClassificationCoverage(classifiedProducts, marketplace);
      let candidatesToPersist = classifiedProducts.filter((candidate) => candidate.classification.status === 'classified');
      funnel.count('afterQualityGate', uniqueProducts.length);
      funnel.count('afterClassification', candidatesToPersist.length);
      technicalRejections += classifiedProducts.length - candidatesToPersist.length;
      for (const candidate of classifiedProducts.filter((item) => item.classification.status !== 'classified')) {
        countRejection(`classification_${candidate.classification.status || 'unknown'}`);
      }
      let deferredForQueue = previouslyDeferred;
    const shopeeV1Enabled = marketplace === 'Shopee'
        && require('./shopee-v1-flags.cjs').getShopeeV1Flags().engine;
      const noCommercialCap = Number.MAX_SAFE_INTEGER;
      const effectiveCopyQueueOptions = shopeeV1Enabled
        ? { ...(copyQueueOptions || {}), maxTotal: noCommercialCap, maxPerMarketplace: noCommercialCap, maxPerCategory: noCommercialCap }
        : (copyQueueOptions || {});

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
            { maxAccepted: effectiveCopyQueueOptions.maxPerMarketplace ?? COPY_QUEUE_DEFAULTS.maxPerMarketplace },
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

      const queue = selectCopyQueue(candidatesToPersist, { ...effectiveCopyQueueOptions, marketplace }, cycleQueueState, deferredForQueue, stageLogger);
      funnel.count('queueSelected', queue.selected.length);
      funnel.recordQueueSelection(queue.selectionTelemetry);
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
        funnel.count('rpcSent', selectedIngestions.length);
        funnel.mergeRpc(persistedAll);
        if (persistedAll?.state !== FINAL_STATE && persistedAll?.state !== 'partial_success') {
          throw new Error(`Oracle Worker só pode encerrar em ${FINAL_STATE}`);
        }
        
        for (const offerId of persistedAll.offerIds || []) {
          if (typeof offerId === 'string' && offerId) materializedOfferIds.add(offerId);
        }
        technicalRejections += rejected;
      }

      funnel.setTerminalStatus(deriveMarketplaceTerminalStatus({
        counters: funnel.snapshot().counters,
        sourceStatus: discoveryMeta.sourceStatus,
      }));
      if (typeof persistV2Metadata === 'function') {
        await persistV2Metadata({ tenantId, correlationId, requestedAt, marketplace, products: candidatesToPersist, queue, funnel: funnel.snapshot() });
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
          contractVersion: funnel.snapshot().contractVersion,
          status: funnel.snapshot().status,
          counters: funnel.snapshot().counters,
          rejectionCounts: funnel.snapshot().rejectionReasons,
        },
        rejected: technicalRejections,
        classificationCoverage,
        persisted: Number(persistedAll.accepted || 0),
        inserted: persistedAll.inserted || 0,
        updated: persistedAll.updated || 0,
        state: FINAL_STATE,
        funnelContract: funnel.snapshot(),
        ...(amazonTelemetry ? { amazonTelemetry } : {})
      });
      summaries.push(summary);
      await safeObserve('discovery.marketplace.completed', {
        marketplace,
        finalState: FINAL_STATE,
        funnelStatus: summary.funnelContract.status,
        durationMs: Date.now() - marketplaceStartedAt,
        metadata: summary,
      });
    }
  } catch (error) {
    if (activeFunnel) {
      activeFunnel.count('failed').setFailed();
      await safeObserve('discovery.marketplace.failed', {
        marketplace: activeFunnel.marketplace,
        funnel: activeFunnel.snapshot(),
        error: error?.message || String(error),
      });
    }
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
    status: summaries.some((summary) => summary.funnelContract?.status === 'failed')
      ? 'failed'
      : summaries.some((summary) => summary.funnelContract?.status === 'partial') ? 'partial' : 'completed',
  });
  await safeObserve('discovery.completed', {
    result: result.status === 'failed' ? 'failed' : result.status === 'partial' ? 'partial' : 'success',
    finalState: FINAL_STATE,
    funnelStatus: result.status,
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
  buildShopeeQueueGroupKey,
  groupKeyForProduct,
  queueGroupKey,
  selectCopyQueue,
  runDiscoveryOnlyCycle,
  validateCanonicalUrl,
  validateNativeIdentity,
  safeEvaluateShopeeOracleCandidate,
};
