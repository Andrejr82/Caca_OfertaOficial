'use strict';

const {
  calculateCommercialOpportunityScoreVNext,
} = require('./commercial-opportunity-score-vnext.cjs');
const {
  classifyBenchmarkFamily,
} = require('./benchmark-peer-engine.cjs');

const RADAR_VNEXT_SELECTOR_VERSION = 'radar-vnext-selector/1';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nativeKey(candidate = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || 'unknown').trim().toLowerCase();
  const itemId = String(candidate.itemId || candidate.item_id || '').trim();
  const productId = String(candidate.productId || candidate.product_id || '').trim();
  const shopId = String(candidate.shopId || candidate.shop_id || '').trim();

  if (marketplace.includes('shopee') && itemId) {
    return `${marketplace}:shop:${shopId || 'unknown'}:item:${itemId}`;
  }
  if (productId) return `${marketplace}:product:${productId}`;
  if (itemId) return `${marketplace}:item:${itemId}`;

  return `${marketplace}:fallback:${String(candidate.productName || candidate.product_term || '').trim().toLowerCase()}:${candidate.currentPrice ?? candidate.price ?? ''}`;
}

function storeKey(candidate = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || 'unknown').trim().toLowerCase();
  const shopId = String(candidate.shopId || candidate.shop_id || candidate.sellerId || candidate.seller_id || '').trim();
  return shopId ? `${marketplace}:${shopId}` : null;
}

function diversityFamily(candidate = {}) {
  const family = classifyBenchmarkFamily(candidate);
  const unclassified = family.peerType === 'item_isolado';
  return {
    ...family,
    diversityKey: unclassified ? null : family.familyKey,
  };
}

function deterministicSort(a, b) {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;

  const aComp = finite(a.score?.breakdown?.competitiveness) || 0;
  const bComp = finite(b.score?.breakdown?.competitiveness) || 0;
  if (bComp !== aComp) return bComp - aComp;

  const aDemand = finite(a.score?.breakdown?.demandAcceleration) || 0;
  const bDemand = finite(b.score?.breakdown?.demandAcceleration) || 0;
  if (bDemand !== aDemand) return bDemand - aDemand;

  const aPrice = finite(a.candidate.currentPrice ?? a.candidate.price) ?? Number.POSITIVE_INFINITY;
  const bPrice = finite(b.candidate.currentPrice ?? b.candidate.price) ?? Number.POSITIVE_INFINITY;
  if (aPrice !== bPrice) return aPrice - bPrice;

  return a.nativeKey.localeCompare(b.nativeKey);
}

function selectRadarVNext(candidates = [], options = {}) {
  const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const maxProducts = Math.max(1, Math.min(100, Math.floor(Number(options.maxProducts) || 20)));
  const minScore = Math.max(0, Math.min(100, Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 50));
  const maxPerStore = Math.max(1, Math.floor(Number(options.maxPerStore) || 2));
  const maxPerFamily = Math.max(1, Math.floor(Number(options.maxPerFamily) || 3));
  const scoreCandidate = typeof options.scoreCandidate === 'function'
    ? options.scoreCandidate
    : (candidate, context) => calculateCommercialOpportunityScoreVNext(candidate, context);

  const scored = pool.map((candidate) => {
    const extraContext = typeof options.contextForCandidate === 'function'
      ? (options.contextForCandidate(candidate) || {})
      : {};
    const score = scoreCandidate(candidate, { ...extraContext, pool });
    const family = diversityFamily(candidate);
    return {
      candidate,
      score,
      family,
      nativeKey: nativeKey(candidate),
      storeKey: storeKey(candidate),
    };
  }).filter((row) =>
    row.score
    && row.score.decision !== 'IGNORAR'
    && Number(row.score.total) >= minScore,
  );

  scored.sort(deterministicSort);

  const selected = [];
  const seenNative = new Set();
  const storeCounts = new Map();
  const familyCounts = new Map();

  for (const row of scored) {
    if (selected.length >= maxProducts) break;
    if (seenNative.has(row.nativeKey)) continue;

    const storeCount = row.storeKey ? (storeCounts.get(row.storeKey) || 0) : 0;
    if (row.storeKey && storeCount >= maxPerStore) continue;

    const familyKey = row.family.diversityKey;
    const familyCount = familyKey ? (familyCounts.get(familyKey) || 0) : 0;
    if (familyKey && familyCount >= maxPerFamily) continue;

    selected.push({
      ...row,
      rank: selected.length + 1,
      selectorVersion: RADAR_VNEXT_SELECTOR_VERSION,
    });
    seenNative.add(row.nativeKey);
    if (row.storeKey) storeCounts.set(row.storeKey, storeCount + 1);
    if (familyKey) familyCounts.set(familyKey, familyCount + 1);
  }

  return selected;
}

module.exports = {
  RADAR_VNEXT_SELECTOR_VERSION,
  nativeKey,
  diversityFamily,
  deterministicSort,
  selectRadarVNext,
};
