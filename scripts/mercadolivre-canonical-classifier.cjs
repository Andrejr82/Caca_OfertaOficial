'use strict';

const catalog = require('./marketplace-classification-catalog.json');
const { getMercadoLivreCertifiedFamilies } = require('./mercadolivre-domain-category-map-v1.cjs');
const { COMMERCIAL_NICHES } = require('./commercial-niche-config.cjs');

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

const EDITORIAL_FAMILIES = Object.freeze([...new Set(
  Object.values(COMMERCIAL_NICHES).flatMap((niche) => [
    ...(niche.coreProducts || []),
    ...(niche.expansionProducts || []),
    ...(niche.opportunityProducts || []),
  ])
)].sort((a, b) => normalize(b).length - normalize(a).length));
const EDITORIAL_FAMILY_SET = new Set(EDITORIAL_FAMILIES.map(normalize));

function includesPhrase(normalizedTitle, phrase) {
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase) && (` ${normalizedTitle} `).includes(` ${normalizedPhrase} `);
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

function classifyFromEditorialCatalog({ title = '', intent = null } = {}) {
  const normalizedTitle = normalize(title);
  if (!normalizedTitle) return null;

  const normalizedIntent = normalize(intent);
  if (normalizedIntent && EDITORIAL_FAMILY_SET.has(normalizedIntent) && includesPhrase(normalizedTitle, normalizedIntent)) {
    return {
      productType: familyType(intent),
      status: 'classified',
      source: `editorial-intent:${intent}`,
    };
  }

  const family = EDITORIAL_FAMILIES.find((candidate) => includesPhrase(normalizedTitle, candidate));
  if (!family) return null;
  return {
    productType: familyType(family),
    status: 'classified',
    source: `editorial-family:${family}`,
  };
}

function classifyMercadoLivreProduct({ title = '', domainId, categoryId, intent = null } = {}) {
  const text = String(title || '');
  const certified = classifyFromCertifiedMap({ title: text, domainId, categoryId });
  if (certified) return certified;

  // Regras explícitas de título reconhecem o produto antes de depender de uma
  // categoria nativa eventualmente ampla.
  const matched = rules.find(({ pattern }) => pattern.test(text));
  if (matched) return { productType: matched.type, status: 'classified', source: 'mercadolivre:title' };

  const domainType = domainId ? catalog.domains[String(domainId)] : null;
  if (domainType) return { productType: domainType, status: 'classified', source: `domain:${domainId}` };
  const categoryType = categoryId ? catalog.categories[String(categoryId)] : null;
  if (categoryType) return { productType: categoryType, status: 'classified', source: `category:${categoryId}` };

  const editorial = classifyFromEditorialCatalog({ title: text, intent });
  if (editorial) return editorial;

  return { productType: 'unknown', status: 'review_required', source: 'type:unknown' };
}

module.exports = {
  classifyMercadoLivreProduct,
  classifyFromCertifiedMap,
  classifyFromEditorialCatalog,
  EDITORIAL_FAMILIES,
};