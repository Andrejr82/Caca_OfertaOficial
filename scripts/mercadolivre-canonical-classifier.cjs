'use strict';

const catalog = require('./marketplace-classification-catalog.json');
const { getMercadoLivreCertifiedFamilies } = require('./mercadolivre-domain-category-map-v1.cjs');

const rules = catalog.rules.map(({ type, pattern }) => ({ type, pattern: new RegExp(pattern, 'iu') }));

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function familyType(family) {
  return normalize(family).replace(/\s+/g, '_') || 'unknown';
}

function classifyFromCertifiedMap({ title = '', domainId, categoryId } = {}) {
  const domain = String(domainId || '').trim();
  const category = String(categoryId || '').trim();
  const normalizedTitle = ` ${normalize(title)} `;
  const candidates = getMercadoLivreCertifiedFamilies().filter((config) =>
    (domain && config.domainIds.includes(domain)) || (category && config.categoryIds.includes(category))
  );

  for (const config of candidates) {
    const hasNegative = (config.negativeTerms || []).some((term) => normalizedTitle.includes(` ${normalize(term)} `));
    if (hasNegative) continue;
    const hasPositive = (config.positiveTerms || []).some((term) => normalizedTitle.includes(` ${normalize(term)} `));
    if (!hasPositive && candidates.length > 1) continue;
    return {
      productType: familyType(config.family),
      status: 'classified',
      source: `mercadolivre-certified:${config.family}`,
    };
  }
  return null;
}

function classifyMercadoLivreProduct({ title = '', domainId, categoryId } = {}) {
  const text = String(title || '');
  const certified = classifyFromCertifiedMap({ title: text, domainId, categoryId });
  if (certified) return certified;

  const domainType = domainId ? catalog.domains[String(domainId)] : null;
  if (domainType) return { productType: domainType, status: 'classified', source: `domain:${domainId}` };
  const categoryType = categoryId ? catalog.categories[String(categoryId)] : null;
  if (categoryType) return { productType: categoryType, status: 'classified', source: `category:${categoryId}` };
  const matched = rules.find(({ pattern }) => pattern.test(text));
  if (matched) return { productType: matched.type, status: 'classified', source: categoryId ? `category:${categoryId}` : 'mercadolivre:title' };
  return { productType: 'unknown', status: 'review_required', source: 'type:unknown' };
}

module.exports = { classifyMercadoLivreProduct, classifyFromCertifiedMap };
