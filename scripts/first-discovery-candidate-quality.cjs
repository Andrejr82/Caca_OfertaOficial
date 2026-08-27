'use strict';

const { matchesFirstDiscoveryIntent } = require('./first-discovery-quality.cjs');

const FIRST_DISCOVERY_CANDIDATE_QUALITY_VERSION = 'first-discovery-candidate-quality/v1';

function finiteNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getNested(candidate, keys, fallback = null) {
  for (const key of keys) {
    const parts = key.split('.');
    let value = candidate;
    for (const part of parts) value = value?.[part];
    if (value != null) return value;
  }
  return fallback;
}

function sanitizeDiscountEvidence(candidate = {}) {
  const currentPrice = finiteNumber(getNested(candidate, ['current_price', 'currentPrice', 'price', 'priceMin']), null);
  const oldPrice = finiteNumber(getNested(candidate, ['old_price', 'oldPrice', 'originalPrice']), null);
  const statedDiscount = finiteNumber(getNested(candidate, [
    'discount',
    'discountPercent',
    'priceDiscountRate',
    'marketplace_metrics.discountPercent',
    'marketplace_metrics.priceDiscountRate',
    'explainability.marketplace_metrics.discountPercent',
    'explainability.marketplace_metrics.priceDiscountRate',
  ]), null);

  if (currentPrice != null && oldPrice != null && currentPrice > 0 && oldPrice > currentPrice) {
    const ratio = oldPrice / currentPrice;
    const delta = oldPrice - currentPrice;
    if (ratio >= 8 && delta >= 300) {
      return Object.freeze({ validDiscountPercent: null, rejected: true, reason: 'implausible_reference_price' });
    }

    const calculated = ((oldPrice - currentPrice) / oldPrice) * 100;
    if (calculated >= 3 && calculated <= 80) {
      return Object.freeze({ validDiscountPercent: calculated, rejected: false, reason: null });
    }
  }

  if (statedDiscount != null && statedDiscount >= 3 && statedDiscount <= 80) {
    return Object.freeze({ validDiscountPercent: statedDiscount, rejected: false, reason: null });
  }

  return Object.freeze({ validDiscountPercent: null, rejected: false, reason: null });
}

function extractCommon(candidate = {}) {
  return {
    title: String(getNested(candidate, ['title', 'productName', 'product_name', 'name'], '') || ''),
    currentPrice: finiteNumber(getNested(candidate, ['current_price', 'currentPrice', 'price', 'priceMin']), null),
    rating: finiteNumber(getNested(candidate, [
      'rating',
      'ratingStar',
      'marketplace_metrics.rating',
      'explainability.marketplace_metrics.rating',
      'explainability.payload_v1.ratingStar',
    ]), null),
    reviewCount: finiteNumber(getNested(candidate, ['reviewCount', 'review_count', 'marketplace_metrics.reviewCount']), null),
    sourcePosition: finiteNumber(getNested(candidate, [
      'sourcePosition',
      'source_position',
      'marketplace_metrics.sourcePosition',
      'explainability.marketplace_metrics.sourcePosition',
      'explainability.payload_v1.sourcePosition',
    ]), null),
    sales: finiteNumber(getNested(candidate, [
      'sales',
      'marketplace_metrics.sales',
      'explainability.marketplace_metrics.sales',
      'explainability.payload_v1.sales',
    ]), null),
    coupon: Boolean(getNested(candidate, ['coupon', 'marketplace_metrics.coupon', 'explainability.payload_v1.coupon'], false)),
    prime: Boolean(getNested(candidate, ['prime', 'marketplace_metrics.prime'], false)),
    shippingFree: Boolean(getNested(candidate, ['shippingFree', 'shipping_free', 'marketplace_metrics.shippingFree', 'explainability.marketplace_metrics.shippingFree'], false)),
    officialStoreId: getNested(candidate, ['officialStoreId', 'marketplace_metrics.officialStoreId', 'explainability.marketplace_metrics.officialStoreId'], null),
    bestSeller: Boolean(getNested(candidate, ['bestSeller', 'isBestSeller', 'best_seller', 'marketplace_metrics.bestSeller'], false)),
    shopQuality: Boolean(getNested(candidate, ['shopQuality', 'preferredShop', 'officialShop', 'marketplace_metrics.shopQuality'], false)),
  };
}

function evaluateFirstDiscoveryCandidate({ marketplace, candidate = {}, intent = null } = {}) {
  const market = String(marketplace || '').trim();
  const data = extractCommon(candidate);
  const discountEvidence = sanitizeDiscountEvidence(candidate);
  const hardRejections = [];
  const signals = [];

  if (!data.title) hardRejections.push('missing_title');
  if (data.currentPrice == null || data.currentPrice <= 0) hardRejections.push('invalid_current_price');
  if (intent && !matchesFirstDiscoveryIntent(intent, data.title)) hardRejections.push('intent_mismatch');

  if ((market === 'Amazon' || market === 'Shopee') && data.rating != null && data.rating < 4.3) {
    hardRejections.push('rating_too_low');
  }

  if (market === 'Amazon') {
    if (data.rating != null && data.rating >= 4.5) signals.push('rating_4_5_plus');
    if (data.reviewCount != null && data.reviewCount >= 30) signals.push('review_count_30_plus');
    if (discountEvidence.validDiscountPercent != null && discountEvidence.validDiscountPercent >= 10) signals.push('real_discount_10_plus');
    if (data.coupon) signals.push('coupon');
    if (data.prime) signals.push('prime');
    if (data.sourcePosition != null && data.sourcePosition <= 10) signals.push('source_top_10');
  } else if (market === 'Mercado Livre') {
    const rawDomain = getNested(candidate, [
      'domain_id',
      'domainId',
      'marketplaceMetrics.domainId',
      'marketplaceMetrics.domain_id',
      'marketplace_metrics.domainId',
      'marketplace_metrics.domain_id',
      'rawPayload.domain_id',
    ]);
    const domainId = String(rawDomain || '').toUpperCase();
    const catName = String(getNested(candidate, [
      'category.name',
      'category_name',
      'marketplaceMetrics.categoryName',
      'marketplace_metrics.categoryName',
      'rawPayload.category_name',
    ], '')).toLowerCase();

    if (/PET.*(?:COLOGNE|PERFUME)/i.test(domainId) || (intent?.term === 'perfume' && catName.includes('pet'))) {
      hardRejections.push('incompatible_domain');
    } else if (/(?:CAT_AND_DOG|PET).*SHAMPOO/i.test(domainId) || (intent?.term === 'shampoo' && /cachorro|cao|caes|gato|pet/.test(catName))) {
      hardRejections.push('incompatible_domain');
    } else if (/BAKERY.*MOULDER/i.test(domainId) || (intent?.term === 'modelador' && /padaria|donut|alimento/.test(catName))) {
      hardRejections.push('incompatible_domain');
    } else if (/BOOKEND/i.test(domainId) || (intent?.term === 'aparador' && /aparador.*livro|livro/.test(catName))) {
      hardRejections.push('incompatible_domain');
    }

    if (data.bestSeller) signals.push('best_seller');
    if (data.officialStoreId != null) signals.push('official_store');
    if (discountEvidence.validDiscountPercent != null && discountEvidence.validDiscountPercent >= 10) signals.push('real_discount_10_plus');
    if (data.shippingFree) signals.push('shipping_free');
    if (data.sourcePosition != null && data.sourcePosition <= 10) signals.push('source_top_10');
  } else if (market === 'Shopee') {
    const lowerTitle = data.title.toLowerCase();
    const isDisposable = /\b(?:aplicador\s+descartavel|descartaveis|pincel\s+descartavel)\b/i.test(lowerTitle);
    if (!isDisposable) {
      if (data.sales != null && data.sales >= 300) signals.push('sales_300_plus');
      if (data.rating != null && data.rating >= 4.7) signals.push('rating_4_7_plus');
      if (discountEvidence.validDiscountPercent != null && discountEvidence.validDiscountPercent >= 10) signals.push('real_discount_10_plus');
      if (data.shopQuality) signals.push('shop_quality');
      if (data.sourcePosition != null && data.sourcePosition <= 10) signals.push('source_top_10');
    }
  }

  const eligible = hardRejections.length === 0;
  const strong = eligible && signals.length >= 2;

  return Object.freeze({
    contractVersion: FIRST_DISCOVERY_CANDIDATE_QUALITY_VERSION,
    marketplace: market,
    eligible,
    strong,
    intent: intent ? Object.freeze({
      term: intent.term || null,
      tier: intent.tier || null,
      family: intent.family || null,
    }) : null,
    hardRejections: Object.freeze(hardRejections),
    signals: Object.freeze(signals),
    evidence: Object.freeze({
      ...data,
      validDiscountPercent: discountEvidence.validDiscountPercent,
      discountEvidenceRejected: discountEvidence.rejected,
      discountEvidenceReason: discountEvidence.reason,
    }),
    commissionInfluencesStrength: false,
  });
}

module.exports = {
  FIRST_DISCOVERY_CANDIDATE_QUALITY_VERSION,
  sanitizeDiscountEvidence,
  evaluateFirstDiscoveryCandidate,
};
