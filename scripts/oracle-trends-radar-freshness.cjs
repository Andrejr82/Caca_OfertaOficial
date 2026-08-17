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
  const marketplace = normalizeIdentityPart(value.marketplace || evidence.marketplace || 'unknown');
  const nativeId = String(
    value.itemId ||
    value.productId ||
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

function filterCandidatesOutsidePreviousSnapshot(candidates = [], previousSnapshotIdentityKeys = new Set()) {
  const fresh = [];
  const excluded = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = getMarketplaceIdentityKey(candidate);
    if (key && previousSnapshotIdentityKeys.has(key)) excluded.push(candidate);
    else fresh.push(candidate);
  }

  return { fresh, excluded };
}

async function fetchLatestCompletedSnapshotIdentityKeys(client, tenantId = null) {
  const identityKeys = new Set();
  if (!client) return { runId: null, identityKeys };

  let runQuery = client
    .from('trend_radar_runs')
    .select('id')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (tenantId) runQuery = runQuery.eq('user_id', tenantId);

  const { data: runs, error: runsError } = await runQuery;
  if (runsError || !Array.isArray(runs) || !runs[0]?.id) {
    return { runId: null, identityKeys };
  }

  const runId = runs[0].id;
  const { data: products, error: productsError } = await client
    .from('trend_radar_products')
    .select('marketplace, product_term, normalized_product_term, direct_evidence')
    .eq('radar_run_id', runId);

  if (productsError || !Array.isArray(products)) return { runId, identityKeys };

  for (const product of products) {
    const key = getMarketplaceIdentityKey(product);
    if (key) identityKeys.add(key);
  }

  return { runId, identityKeys };
}

module.exports = {
  normalizeIdentityPart,
  getMarketplaceIdentityKey,
  filterCandidatesOutsidePreviousSnapshot,
  fetchLatestCompletedSnapshotIdentityKeys,
};
