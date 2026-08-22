'use strict';

/**
 * Radar VNext Benchmark Peer Engine
 *
 * Reaproveita a classificação funcional e de quantidade do Achadinho V1.2,
 * mas separa o conceito de benchmark autoritativo do score final.
 * LOW/NONE nunca afirmam competitividade comprovada.
 */

const {
  classifyPeerIdentity,
} = require('../../../scripts/shopee-achadinho-v12.cjs');

const BENCHMARK_PEER_ENGINE_VERSION = 'benchmark-peer-engine/v1';

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function classifyBenchmarkFamily(candidate = {}) {
  const identity = classifyPeerIdentity(candidate.productName || candidate.product_term || candidate.title || '');
  return {
    ...identity,
    familyKey: `${identity.peerFamily}:${identity.peerType}:${identity.quantityClass}`,
  };
}

function sameNativeIdentity(a = {}, b = {}) {
  if (a === b) return true;

  const marketplace = String(a.marketplace || a.platform || b.marketplace || b.platform || '').toLowerCase();
  const aItem = String(a.itemId || a.item_id || '').trim();
  const bItem = String(b.itemId || b.item_id || '').trim();

  if (marketplace.includes('shopee')) {
    const aShop = String(a.shopId || a.shop_id || '').trim();
    const bShop = String(b.shopId || b.shop_id || '').trim();
    return Boolean(aItem && bItem && aShop && bShop && aItem === bItem && aShop === bShop);
  }

  if (aItem && bItem) return aItem === bItem;

  const aProduct = String(a.productId || a.product_id || '').trim();
  const bProduct = String(b.productId || b.product_id || '').trim();
  return Boolean(aProduct && bProduct && aProduct === bProduct);
}

function peerConfidenceForCount(peerCount) {
  if (peerCount >= 5) return 'HIGH';
  if (peerCount >= 3) return 'MEDIUM';
  if (peerCount >= 1) return 'LOW';
  return 'NONE';
}

function buildBenchmarkContext(candidate = {}, pool = []) {
  const currentPrice = finitePositive(candidate.currentPrice ?? candidate.price);
  const family = classifyBenchmarkFamily(candidate);

  const empty = (benchmarkStatus) => ({
    version: BENCHMARK_PEER_ENGINE_VERSION,
    ...family,
    peers: [],
    peerCount: 0,
    peerConfidence: 'NONE',
    peerPriceMin: null,
    peerPriceMedian: null,
    peerPriceMax: null,
    priceVsMedianPercent: null,
    benchmarkStatus,
    priceCompetitive: false,
  });

  if (currentPrice === null) return empty('invalid_price');
  if (family.peerType === 'item_isolado') return empty('unclassified_family');

  const peers = (Array.isArray(pool) ? pool : []).filter((other) => {
    if (!other || sameNativeIdentity(candidate, other)) return false;
    const otherPrice = finitePositive(other.currentPrice ?? other.price);
    if (otherPrice === null) return false;

    const otherFamily = classifyBenchmarkFamily(other);
    return otherFamily.peerType === family.peerType
      && otherFamily.quantityClass === family.quantityClass;
  });

  const prices = peers
    .map((peer) => finitePositive(peer.currentPrice ?? peer.price))
    .filter((price) => price !== null);
  const peerCount = prices.length;
  const peerConfidence = peerConfidenceForCount(peerCount);
  const peerPriceMedian = median(prices);
  const priceVsMedianPercent = peerPriceMedian === null
    ? null
    : Math.round((((peerPriceMedian - currentPrice) / peerPriceMedian) * 100) * 10) / 10;
  const authoritative = peerConfidence === 'MEDIUM' || peerConfidence === 'HIGH';

  return {
    version: BENCHMARK_PEER_ENGINE_VERSION,
    ...family,
    peers,
    peerCount,
    peerConfidence,
    peerPriceMin: prices.length ? Math.min(...prices) : null,
    peerPriceMedian,
    peerPriceMax: prices.length ? Math.max(...prices) : null,
    priceVsMedianPercent,
    benchmarkStatus: authoritative ? 'authoritative' : 'insufficient_peers',
    priceCompetitive: authoritative
      && priceVsMedianPercent !== null
      && priceVsMedianPercent >= -15,
  };
}

module.exports = {
  BENCHMARK_PEER_ENGINE_VERSION,
  classifyBenchmarkFamily,
  buildBenchmarkContext,
  peerConfidenceForCount,
};
