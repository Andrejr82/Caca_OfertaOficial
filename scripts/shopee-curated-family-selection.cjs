'use strict';

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultFamilyKey(product = {}) {
  return String(product.curatedFamily || '').trim();
}

function orderCuratedProducts(products = []) {
  return [...products].sort((left, right) =>
    numeric(right.score) - numeric(left.score)
    || numeric(right.sales) - numeric(left.sales)
    || String(left.itemId || left.sourceItemId || '').localeCompare(String(right.itemId || right.sourceItemId || '')));
}

function selectCuratedFamilyRepresentatives(products = [], limit = 3, resolveFamily = defaultFamilyKey) {
  const selected = [];
  const seenFamilies = new Set();
  for (const product of orderCuratedProducts(products)) {
    const family = String(resolveFamily(product) || '').trim();
    if (!family || seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    selected.push(product);
    if (selected.length >= Math.max(0, Number(limit) || 0)) break;
  }
  return selected;
}

module.exports = { orderCuratedProducts, selectCuratedFamilyRepresentatives };
