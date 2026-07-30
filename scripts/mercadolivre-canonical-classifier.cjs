'use strict';

const catalog = require('./marketplace-classification-catalog.json');

const rules = catalog.rules.map(({ type, pattern }) => ({ type, pattern: new RegExp(pattern, 'iu') }));

function classifyMercadoLivreProduct({ title = '', domainId, categoryId } = {}) {
  const text = String(title || '');
  const domainType = domainId ? catalog.domains[String(domainId)] : null;
  if (domainType) return { productType: domainType, status: 'classified', source: `domain:${domainId}` };
  const categoryType = categoryId ? catalog.categories[String(categoryId)] : null;
  if (categoryType) return { productType: categoryType, status: 'classified', source: `category:${categoryId}` };
  const matched = rules.find(({ pattern }) => pattern.test(text));
  if (matched) return { productType: matched.type, status: 'classified', source: categoryId ? `category:${categoryId}` : 'mercadolivre:title' };
  return { productType: 'unknown', status: 'review_required', source: 'type:unknown' };
}

module.exports = { classifyMercadoLivreProduct };
