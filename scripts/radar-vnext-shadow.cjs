'use strict';

const { selectRadarVNext } = require('../src/core/trends/radar-vnext-selector.cjs');

const RADAR_VNEXT_SHADOW_VERSION = 'radar-vnext-shadow/v1';

function normalizeIdentity(row = {}) {
  const evidence = Array.isArray(row.direct_evidence) ? row.direct_evidence[0] || {} : {};
  const identity = evidence.marketplace_identity || {};
  const marketplace = String(row.marketplace || row.platform || '').toLowerCase();
  const itemId = String(row.itemId || row.item_id || identity.itemId || '').trim();
  const shopId = String(row.shopId || row.shop_id || identity.shopId || '').trim();
  const productId = String(row.productId || row.product_id || identity.productId || '').trim();
  if (marketplace.includes('shopee') && itemId && shopId) return `shopee:${shopId}:${itemId}`;
  if (itemId) return `${marketplace || 'marketplace'}:item:${itemId}`;
  if (productId) return `${marketplace || 'marketplace'}:product:${productId}`;
  return `${marketplace || 'marketplace'}:name:${String(row.productName || row.product_term || '').trim().toLowerCase()}`;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}

function buildRadarVNextShadowComparison({ candidatePool = [], v4Products = [], maxProducts = 20, minScore = 50 } = {}) {
  const pool = Array.isArray(candidatePool) ? candidatePool : [];
  const official = Array.isArray(v4Products) ? v4Products : [];
  const selected = selectRadarVNext(pool, { maxProducts, minScore });

  const v4Ids = new Set(official.map(normalizeIdentity));
  const vnextIds = new Set(selected.map((row) => normalizeIdentity(row.candidate)));
  const overlapCount = [...vnextIds].filter((id) => v4Ids.has(id)).length;
  const denominator = Math.max(1, Math.min(v4Ids.size || 1, vnextIds.size || 1));

  const peerConfidenceCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  for (const row of selected) {
    const confidence = row.score?.benchmark?.peerConfidence || 'NONE';
    if (confidence in peerConfidenceCounts) peerConfidenceCounts[confidence] += 1;
  }

  return {
    version: RADAR_VNEXT_SHADOW_VERSION,
    mode: 'shadow',
    candidate_pool_count: pool.length,
    v4_count: official.length,
    vnext_count: selected.length,
    overlap_count: overlapCount,
    overlap_ratio: Math.round((overlapCount / denominator) * 10000) / 100,
    v4_average_price: average(official.map((row) => Number(row.direct_evidence?.[0]?.price ?? row.currentPrice ?? row.price))),
    vnext_average_price: average(selected.map((row) => Number(row.candidate.currentPrice ?? row.candidate.price))),
    peer_confidence_counts: peerConfidenceCounts,
    vnext_top: selected.map((row, index) => ({
      rank: index + 1,
      identity: normalizeIdentity(row.candidate),
      product_name: row.candidate.productName || row.candidate.product_term || null,
      marketplace: row.candidate.marketplace || row.candidate.platform || null,
      price: Number(row.candidate.currentPrice ?? row.candidate.price) || null,
      score: row.score.total,
      decision: row.score.decision,
      peer_confidence: row.score.benchmark?.peerConfidence || 'NONE',
      peer_count: row.score.benchmark?.peerCount || 0,
      benchmark_status: row.score.benchmark?.benchmarkStatus || 'unknown',
    })),
  };
}

module.exports = {
  RADAR_VNEXT_SHADOW_VERSION,
  buildRadarVNextShadowComparison,
  normalizeIdentity,
};
