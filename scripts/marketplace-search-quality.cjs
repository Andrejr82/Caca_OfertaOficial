'use strict';

const DEFAULT_COOLDOWN_DAYS = 7;
const MATERIAL_PRICE_DROP = 0.10;
// A busca pode trazer várias variantes legítimas da mesma intenção. O limite
// editorial fica na fila de copy (maxPerCategory); este limite técnico evita
// enxurradas sem reduzir uma intenção a apenas três itens.
const DEFAULT_MAX_PER_INTENT = 10;

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function identityFor(marketplace, product) {
  const metrics = product?.marketplaceMetrics || {};
  const m = String(marketplace || '').toLowerCase();
  if (m === 'mercado livre') {
    return String(metrics.catalog_id || metrics.catalogId || metrics.item_id || metrics.itemId || product?.sourceItemId || '');
  }
  if (m === 'shopee') {
    const shop = metrics.shop_id || metrics.shopId || metrics.shopee_shop_id || '';
    const item = metrics.item_id || metrics.itemId || metrics.shopee_item_id || product?.sourceItemId || '';
    return shop && item ? `${shop}:${item}` : String(item || '');
  }
  if (m === 'amazon') return String(metrics.asin || metrics.product_id || product?.sourceItemId || '').toUpperCase();
  return String(product?.sourceItemId || '');
}

function equivalenceKey(marketplace, product) {
  const metrics = product?.marketplaceMetrics || {};
  const m = String(marketplace || '').toLowerCase();
  if (m === 'mercado livre') return String(metrics.catalog_id || metrics.catalogId || identityFor(marketplace, product));
  return identityFor(marketplace, product);
}

function validateOfficialPrice(product) {
  const current = number(product?.currentPrice);
  const original = number(product?.originalPrice);
  if (!current || current <= 0) return { valid: false, reason: 'preco_atual_invalido' };
  if (original != null && (original <= 0 || original < current)) return { valid: false, reason: 'preco_anterior_inconsistente' };
  return {
    valid: true,
    currentPrice: current,
    originalPrice: original,
    discountPercent: original && original > current ? Math.round(((original - current) / original) * 100) : null,
  };
}

function isMateriallyBetter(product, previous) {
  const current = number(product?.currentPrice);
  const old = number(previous?.current_price ?? previous?.currentPrice);
  if (!current || !old || old <= 0) return false;
  return current <= old * (1 - MATERIAL_PRICE_DROP);
}

function selectEquivalentWinners(marketplace, products) {
  const groups = new Map();
  const rejected = [];
  for (const product of Array.isArray(products) ? products : []) {
    const key = equivalenceKey(marketplace, product);
    if (!key) {
      rejected.push({ sourceItemId: product?.sourceItemId, reason: 'identidade_insuficiente_para_equivalencia' });
      continue;
    }
    const current = number(product.currentPrice);
    const previous = groups.get(key);
    if (!previous || current < number(previous.currentPrice)) groups.set(key, product);
  }
  return { products: [...groups.values()], rejected };
}

function diversifyByIntent(marketplace, products, maxPerIntent = DEFAULT_MAX_PER_INTENT) {
  const counts = new Map();
  const accepted = [];
  const rejected = [];
  for (const product of Array.isArray(products) ? products : []) {
    const intent = String(product.intentId || product.scenarioId || product.category?.id || product.category?.name || 'sem_intencao');
    const count = counts.get(intent) || 0;
    if (count >= maxPerIntent) {
      rejected.push({ sourceItemId: product.sourceItemId, reason: 'diversidade_intencao' });
      continue;
    }
    counts.set(intent, count + 1);
    accepted.push(product);
  }
  return { products: accepted, rejected };
}

function evaluateSearchQuality(marketplace, products, options = {}) {
  const priceRejected = [];
  const priced = [];
  for (const product of Array.isArray(products) ? products : []) {
    const price = validateOfficialPrice(product);
    if (!price.valid) {
      priceRejected.push({ sourceItemId: product?.sourceItemId, reason: price.reason });
      continue;
    }
    priced.push({ ...product, ...price });
  }
  const equivalent = selectEquivalentWinners(marketplace, priced);
  const diverse = diversifyByIntent(marketplace, equivalent.products, Number(options.maxPerIntent || DEFAULT_MAX_PER_INTENT));
  return {
    accepted: diverse.products,
    rejected: [...priceRejected, ...equivalent.rejected, ...diverse.rejected],
    metrics: {
      marketplace,
      received: Array.isArray(products) ? products.length : 0,
      accepted: diverse.products.length,
      rejected: priceRejected.length + equivalent.rejected.length + diverse.rejected.length,
      priceRejected: priceRejected.length,
      equivalentGroups: equivalent.products.length,
      diversityRejected: diverse.rejected.length,
      cooldownDays: Number(options.cooldownDays || DEFAULT_COOLDOWN_DAYS),
    },
  };
}

module.exports = {
  DEFAULT_COOLDOWN_DAYS,
  MATERIAL_PRICE_DROP,
  identityFor,
  equivalenceKey,
  validateOfficialPrice,
  isMateriallyBetter,
  selectEquivalentWinners,
  diversifyByIntent,
  evaluateSearchQuality,
};
