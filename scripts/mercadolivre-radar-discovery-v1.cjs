'use strict';

const {
  runMercadoLivreOfficialIntentCoverage,
  refreshAccessToken,
  SEARCH_ALIASES,
} = require('./mercadolivre-official-intents-v5.cjs');

const ML_RADAR_DISCOVERY_INTENTS = Object.freeze([
  'televisão 4K',
  'mouse sem fio',
  'suporte notebook alumínio',
  'lixeira inox pedal',
  'jogo de lençol algodão',
  'camiseta masculina',
  'legging fitness',
  'mamadeira anti cólica',
  'tapete higiênico cachorro',
  'mala de bordo 10kg',
]);

const ML_RADAR_INTENT_MACRO_GROUPS = Object.freeze({
  'televisão 4K': 'eletronicos',
  'mouse sem fio': 'informatica',
  'suporte notebook alumínio': 'informatica',
  'lixeira inox pedal': 'casa',
  'jogo de lençol algodão': 'casa',
  'camiseta masculina': 'moda',
  'legging fitness': 'esportes_fitness',
  'mamadeira anti cólica': 'bebe',
  'tapete higiênico cachorro': 'pet',
  'mala de bordo 10kg': 'viagem',
});

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function normalizeMercadoLivreDiscoveryProduct(product, observedAt = new Date().toISOString()) {
  const itemId = String(product?.item_id || product?.id || '').trim();
  const productName = String(product?.product_name || product?.title || '').trim();
  if (!itemId || !productName) return null;

  const currentPrice = parseOptionalNumber(product.current_price ?? product.price);
  const rawOldPrice = parseOptionalNumber(product.old_price ?? product.original_price);
  const oldPrice = rawOldPrice !== null && currentPrice !== null && rawOldPrice > currentPrice
    ? rawOldPrice
    : null;
  const explicitDiscount = parseOptionalNumber(product.discount_percent);
  const discountPercent = oldPrice !== null && currentPrice !== null && currentPrice > 0
    ? Math.round((((oldPrice - currentPrice) / oldPrice) * 100) * 100) / 100
    : (explicitDiscount ?? 0);
  const sourceIntent = String(product.intent || '').trim() || null;

  return {
    marketplace: 'Mercado Livre',
    itemId,
    productId: String(product.product_id || '').trim(),
    productName,
    category: product.category_name || 'Marketplace Deals',
    currentPrice,
    oldPrice,
    discountPercent,
    priceDiscountRate: discountPercent,
    sales: parseOptionalNumber(product.sold_quantity),
    ratingStar: parseOptionalNumber(product.rating),
    rating: parseOptionalNumber(product.rating),
    commissionPercent: 0,
    permalink: String(product.product_url || product.permalink || ''),
    imageUrl: String(product.image_url || product.thumbnail || ''),
    provenance: 'mercadolivre_official_intent',
    sourceIntent,
    macroGroup: sourceIntent ? (ML_RADAR_INTENT_MACRO_GROUPS[sourceIntent] || 'outros') : 'outros',
    domainId: product.domain_id || null,
    categoryId: product.category_id || null,
    sourcePosition: parseOptionalNumber(product.source_position),
    observedAt,
  };
}

async function collectMercadoLivreRadarDiscoveryV1({
  keywords = ML_RADAR_DISCOVERY_INTENTS,
  accessToken = null,
  maxPerIntent = 4,
  delayMs = 100,
  env = process.env,
  coverageRunner = runMercadoLivreOfficialIntentCoverage,
  tokenProvider = refreshAccessToken,
} = {}) {
  const candidates = [];
  const seenNativeIds = new Set();

  const selectedKeywords = Array.isArray(keywords) && keywords.length
    ? keywords.filter((intent) => SEARCH_ALIASES[intent])
    : ML_RADAR_DISCOVERY_INTENTS;
  if (!selectedKeywords.length) return [];

  const token = accessToken || (await tokenProvider({ env }).catch(() => null));
  if (!token) return [];

  const result = await coverageRunner({
    accessToken: token,
    keywords: selectedKeywords,
    maxPerIntent: Math.max(3, Math.min(6, Number(maxPerIntent) || 4)),
    delayMs: Math.max(0, Math.min(200, Number(delayMs) || 0)),
  });

  const products = Array.isArray(result?.products) ? result.products : [];
  for (const product of products) {
    const candidate = normalizeMercadoLivreDiscoveryProduct(product);
    if (!candidate || !(candidate.currentPrice > 0)) continue;

    const nativeId = candidate.itemId || candidate.productId;
    if (!nativeId || seenNativeIds.has(nativeId)) continue;
    seenNativeIds.add(nativeId);
    candidates.push(candidate);
  }

  return candidates;
}

module.exports = {
  ML_RADAR_DISCOVERY_INTENTS,
  ML_RADAR_INTENT_MACRO_GROUPS,
  normalizeMercadoLivreDiscoveryProduct,
  collectMercadoLivreRadarDiscoveryV1,
};
