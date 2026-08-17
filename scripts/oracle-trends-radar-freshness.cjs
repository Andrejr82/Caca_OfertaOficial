'use strict';

function normalizeIdentityPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function firstEvidence(value) {
  return Array.isArray(value) && value[0] && typeof value[0] === 'object' ? value[0] : {};
}

function getMarketplaceIdentityKey(value = {}) {
  const evidence = firstEvidence(value.direct_evidence);
  const identity = value.marketplaceIdentity || value.marketplace_identity || evidence.marketplace_identity || {};
  const marketplace = normalizeIdentityPart(value.marketplace || value.platform || evidence.marketplace || 'unknown');
  const nativeId = String(
    value.itemId ||
    value.productId ||
    value.shopee_item_id ||
    value.item_id ||
    value.product_id ||
    identity.itemId ||
    identity.productId ||
    ''
  ).trim();

  if (nativeId) return `${marketplace}:native:${nativeId}`;

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
    if (key && excludedIdentityKeys.has(key)) excluded.push(candidate);
    else fresh.push(candidate);
  }

  return { fresh, excluded };
}

function chunks(values, size = 50) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function fetchCompletedRadarIdentityKeys(client, tenantId = null) {
  const identityKeys = new Set();
  if (!client) return { latestRunId: null, runCount: 0, identityKeys };

  let runQuery = client
    .from('trend_radar_runs')
    .select('id')
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  if (tenantId) runQuery = runQuery.eq('user_id', tenantId);

  const { data: runs, error: runsError } = await runQuery;
  if (runsError || !Array.isArray(runs) || runs.length === 0) {
    return { latestRunId: null, runCount: 0, identityKeys };
  }

  const runIds = runs.map((run) => run.id).filter(Boolean);
  const latestRunId = runIds[0] || null;

  for (const runIdChunk of chunks(runIds)) {
    const { data: products, error: productsError } = await client
      .from('trend_radar_products')
      .select('marketplace, product_term, normalized_product_term, direct_evidence')
      .in('radar_run_id', runIdChunk);

    if (productsError || !Array.isArray(products)) {
      return { latestRunId, runCount: runIds.length, identityKeys };
    }

    for (const product of products) {
      const key = getMarketplaceIdentityKey(product);
      if (key) identityKeys.add(key);
    }
  }

  return { latestRunId, runCount: runIds.length, identityKeys };
}

async function fetchExistingOfferIdentityKeys(client, tenantId = null) {
  const identityKeys = new Set();
  if (!client) return identityKeys;

  const pageSize = 1000;
  let from = 0;

  while (true) {
    let query = client
      .from('offers')
      .select('platform, shopee_item_id, item_id, product_id');

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
  normalizeIdentityPart,
  getMarketplaceIdentityKey,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
  filterCandidatesOutsidePreviousSnapshot,
  fetchCompletedRadarIdentityKeys,
  fetchExistingOfferIdentityKeys,
};
