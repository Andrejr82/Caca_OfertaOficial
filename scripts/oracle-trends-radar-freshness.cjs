'use strict';

/**
 * Oracle Trends Radar Freshness V2 — Caça Ofertas Oficial
 *
 * Princípios:
 * 1. Janela de recência configurável (elimina a blacklist eterna / esgotamento de universo).
 * 2. Identidade comercial Mercado Livre: prioridade 1 para productId de catálogo.
 * 3. Identidade comercial Shopee: shopId + itemId nativo.
 * 4. Produtos com data anterior à janela de recência tornam-se novamente elegíveis.
 */

const DEFAULT_RECENCY_DAYS = 7;
const BLOCKING_OFFER_STATUSES = Object.freeze(['approved', 'selected', 'posted']);

function normalizeIdentityPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeMarketplaceSlug(marketplace) {
  const norm = normalizeIdentityPart(marketplace);
  if (norm === 'mercado-livre' || norm === 'mercadolivre' || norm === 'meli') return 'mercadolivre';
  if (norm === 'shopee') return 'shopee';
  if (norm === 'amazon') return 'amazon';
  return norm || 'unknown';
}

function firstEvidence(value) {
  return Array.isArray(value) && value[0] && typeof value[0] === 'object' ? value[0] : {};
}

function getMarketplaceIdentityKey(value = {}) {
  const evidence = firstEvidence(value.direct_evidence);
  const identity = value.marketplaceIdentity || value.marketplace_identity || evidence.marketplace_identity || {};
  const marketplace = normalizeMarketplaceSlug(value.marketplace || value.platform || evidence.marketplace);

  if (marketplace === 'mercadolivre') {
    const productId = String(
      value.productId ||
      value.product_id ||
      identity.productId ||
      identity.product_id ||
      ''
    ).trim();

    if (productId) {
      return `mercadolivre:catalog:${normalizeIdentityPart(productId)}`;
    }

    const itemId = String(
      value.itemId ||
      value.item_id ||
      value.id ||
      identity.itemId ||
      identity.item_id ||
      ''
    ).trim();

    if (itemId) {
      return `mercadolivre:item:${normalizeIdentityPart(itemId)}`;
    }

    const productName = normalizeIdentityPart(
      value.productName || value.product_term || value.normalized_product_term || evidence.claim || ''
    );
    return productName ? `mercadolivre:name:${productName}` : null;
  }

  if (marketplace === 'shopee') {
    const shopId = String(
      value.shopId ||
      value.shop_id ||
      identity.shopId ||
      identity.shop_id ||
      ''
    ).trim();

    const itemId = String(
      value.itemId ||
      value.item_id ||
      value.shopee_item_id ||
      identity.itemId ||
      identity.item_id ||
      ''
    ).trim();

    if (shopId && itemId) {
      return `shopee:shop:${normalizeIdentityPart(shopId)}:item:${normalizeIdentityPart(itemId)}`;
    }

    if (itemId) {
      return `shopee:native:${normalizeIdentityPart(itemId)}`;
    }

    const productName = normalizeIdentityPart(
      value.productName || value.product_term || value.normalized_product_term || evidence.claim || ''
    );
    return productName ? `shopee:name:${productName}` : null;
  }

  // Outros marketplaces (Amazon, etc.)
  const nativeId = String(
    value.itemId ||
    value.productId ||
    value.asin ||
    value.item_id ||
    value.product_id ||
    identity.itemId ||
    identity.productId ||
    ''
  ).trim();

  if (nativeId) return `${marketplace}:native:${normalizeIdentityPart(nativeId)}`;

  const productName = normalizeIdentityPart(
    value.productName || value.product_term || value.normalized_product_term || evidence.claim || ''
  );
  return productName ? `${marketplace}:name:${productName}` : null;
}

function getMarketplaceImageUrl(value = {}) {
  const evidence = firstEvidence(value.direct_evidence);
  const raw = String(value.imageUrl || value.image_url || evidence.image_url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function withMarketplaceImageEvidence(directEvidence, imageUrl) {
  const normalizedImageUrl = getMarketplaceImageUrl({ image_url: imageUrl });
  if (!normalizedImageUrl) return Array.isArray(directEvidence) ? directEvidence : [];
  const evidence = Array.isArray(directEvidence) ? [...directEvidence] : [];
  const first = evidence[0] && typeof evidence[0] === 'object' ? evidence[0] : {};
  evidence[0] = { ...first, image_url: normalizedImageUrl };
  return evidence;
}

function filterCandidatesOutsidePreviousSnapshot(candidates = [], excludedIdentityKeys = new Set()) {
  const fresh = [];
  const excluded = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = getMarketplaceIdentityKey(candidate);
    if (key && excludedIdentityKeys && excludedIdentityKeys.has(key)) {
      excluded.push(candidate);
    } else {
      fresh.push(candidate);
    }
  }

  return { fresh, excluded };
}

function getCandidateIdentityKeys(candidate) {
  const keys = [];
  const primaryKey = getMarketplaceIdentityKey(candidate);
  if (primaryKey) keys.push(primaryKey);

  const evidence = firstEvidence(candidate.direct_evidence);
  const identity = candidate.marketplaceIdentity || candidate.marketplace_identity || evidence.marketplace_identity || {};
  const marketplace = normalizeMarketplaceSlug(candidate.marketplace || candidate.platform || evidence.marketplace);

  const itemId = String(
    candidate.itemId ||
    candidate.item_id ||
    candidate.shopee_item_id ||
    candidate.id ||
    identity.itemId ||
    identity.item_id ||
    ''
  ).trim();

  if (itemId) {
    keys.push(`${marketplace}:native:${normalizeIdentityPart(itemId)}`);
    keys.push(`${marketplace}:item:${normalizeIdentityPart(itemId)}`);
  }

  const productId = String(
    candidate.productId ||
    candidate.product_id ||
    identity.productId ||
    identity.product_id ||
    ''
  ).trim();

  if (productId) {
    keys.push(`${marketplace}:catalog:${normalizeIdentityPart(productId)}`);
  }

  return keys;
}

function filterCandidatesWithRecency(
  candidates = [],
  recentIdentityKeys = new Set(),
  existingOfferKeys = new Set()
) {
  const fresh = [];
  const excludedRecentHistory = [];
  const excludedExistingOffers = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const keys = getCandidateIdentityKeys(candidate);
    const isRecent = keys.some((k) => recentIdentityKeys && recentIdentityKeys.has(k));
    if (isRecent) {
      excludedRecentHistory.push(candidate);
      continue;
    }

    const isExistingOffer = keys.some((k) => existingOfferKeys && existingOfferKeys.has(k));
    if (isExistingOffer) {
      excludedExistingOffers.push(candidate);
      continue;
    }

    fresh.push(candidate);
  }

  return {
    fresh,
    excludedRecentHistory,
    excludedExistingOffers,
  };
}

function chunks(values, size = 50) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Consulta as chaves de identidade dos Radars concluídos na janela de recência.
 * Produtos mais antigos que a janela de recência NÃO são retornados (ficam elegíveis).
 */
async function fetchCompletedRadarIdentityKeys(client, tenantId = null, options = {}) {
  const recencyDays = typeof options.recencyDays === 'number' ? options.recencyDays : DEFAULT_RECENCY_DAYS;
  const now = options.now instanceof Date ? options.now : new Date();
  const windowStart = new Date(now.getTime() - (recencyDays * 24 * 60 * 60 * 1000)).toISOString();
  const recentIdentityKeys = new Set();

  if (!client) {
    return {
      latestRunId: null,
      runCount: 0,
      recentIdentityKeys,
      identityKeys: recentIdentityKeys,
      recencyDays,
      windowStart,
    };
  }

  let runQuery = client
    .from('trend_radar_runs')
    .select('id, created_at')
    .eq('status', 'completed')
    .gte('created_at', windowStart);

  if (tenantId) runQuery = runQuery.eq('user_id', tenantId);

  runQuery = runQuery.order('created_at', { ascending: false });

  const { data: runs, error: runsError } = await runQuery;
  if (runsError || !Array.isArray(runs) || runs.length === 0) {
    return {
      latestRunId: null,
      runCount: 0,
      recentIdentityKeys,
      identityKeys: recentIdentityKeys,
      recencyDays,
      windowStart,
    };
  }

  const runIds = runs.map((run) => run.id).filter(Boolean);
  const latestRunId = runIds[0] || null;

  for (const runIdChunk of chunks(runIds)) {
    const { data: products, error: productsError } = await client
      .from('trend_radar_products')
      .select('marketplace, product_term, normalized_product_term, direct_evidence')
      .in('radar_run_id', runIdChunk);

    if (productsError || !Array.isArray(products)) {
      return {
        latestRunId,
        runCount: runIds.length,
        recentIdentityKeys,
        identityKeys: recentIdentityKeys,
        recencyDays,
        windowStart,
      };
    }

    for (const product of products) {
      const key = getMarketplaceIdentityKey(product);
      if (key) recentIdentityKeys.add(key);
    }
  }

  return {
    latestRunId,
    runCount: runIds.length,
    recentIdentityKeys,
    identityKeys: recentIdentityKeys,
    recencyDays,
    windowStart,
  };
}

async function fetchExistingOfferIdentityKeys(client, tenantId = null) {
  const identityKeys = new Set();
  if (!client) return identityKeys;

  const pageSize = 1000;
  let from = 0;

  while (true) {
    let query = client
      .from('offers')
      .select('platform, shopee_item_id, item_id, product_id, status')
      .in('status', BLOCKING_OFFER_STATUSES);

    if (tenantId) query = query.eq('user_id', tenantId);

    const { data: offers, error } = await query.range(from, from + pageSize - 1);
    if (error || !Array.isArray(offers)) return identityKeys;

    for (const offer of offers) {
      const key = getMarketplaceIdentityKey(offer);
      if (key) identityKeys.add(key);
    }

    if (offers.length < pageSize) break;
    from += pageSize;
  }

  return identityKeys;
}

module.exports = {
  DEFAULT_RECENCY_DAYS,
  BLOCKING_OFFER_STATUSES,
  normalizeIdentityPart,
  normalizeMarketplaceSlug,
  getMarketplaceIdentityKey,
  getCandidateIdentityKeys,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
  filterCandidatesOutsidePreviousSnapshot,
  filterCandidatesWithRecency,
  fetchCompletedRadarIdentityKeys,
  fetchExistingOfferIdentityKeys,
};
