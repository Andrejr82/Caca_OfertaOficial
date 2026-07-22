'use strict';

const DEFAULT_MIN_PRODUCTS = 15;
const SPARSE_MIN_PRODUCTS = 5;

function coverageStatus(count, minimum = DEFAULT_MIN_PRODUCTS) {
  const total = Number(count) || 0;
  if (total <= 0) return 'unavailable';
  if (total < minimum) return 'low_coverage';
  return 'ok';
}

function coverageGate(count, { minimum = DEFAULT_MIN_PRODUCTS, sparse = false } = {}) {
  const effectiveMinimum = sparse ? SPARSE_MIN_PRODUCTS : minimum;
  return { count: Number(count) || 0, minimum: effectiveMinimum, status: coverageStatus(count, effectiveMinimum), auto_selectable: (Number(count) || 0) >= effectiveMinimum };
}

module.exports = { DEFAULT_MIN_PRODUCTS, SPARSE_MIN_PRODUCTS, coverageStatus, coverageGate };
