'use strict';

const catalog = require('./marketplace-classification-catalog.json');
const { classifyMercadoLivreProduct } = require('./mercadolivre-canonical-classifier.cjs');

const AMAZON_BROWSE_TYPES = Object.freeze({
  '16243803011': 'smartphone', '16243794011': 'computers', '24035344011': 'audio', '16243809011': 'tv', '16243802011': 'wearable', '16243799011': 'ereader', '16243796011': 'camera',
  '16364751011': 'desktop', '16364749011': 'computer_accessory', '16364756011': 'monitor', '16253313011': 'pc_gamer', '16253332011': 'playstation', '20971488011': 'playstation', '16253372011': 'xbox', '20971505011': 'xbox',
  '17124722011': 'small_appliance', '17124716011': 'coffee_maker', '24417675011': 'cookware', '16745371011': 'stove', '17124786011': 'microwave', '16745366011': 'refrigerator', '16745370011': 'washer', '19821156011': 'dishwasher',
  '17100532011': 'bedding', '17100528011': 'bath', '17100531011': 'decor', '17100533011': 'organizer', '23783015011': 'kitchen_utility', '17406462011': 'lighting',
  '17833921011': 'sports_shoes', '17833929011': 'running', '17833934011': 'gym', '17833917011': 'fitness_equipment', '17716665011': 'outdoor', '23577004011': 'sportswear', '17833924011': 'travel_bag', '17681967011': 'luggage',
  '17540055011': 'baby_feeding', '17540060011': 'baby_hygiene', '17540063011': 'baby_travel', '17681968011': 'baby',
  '19653951011': 'dog', '19653950011': 'cat', '19653948011': 'fish', '19653949011': 'bird',
  '17681970011': 'mens_fashion', '17681969011': 'womens_fashion', '17681966011': 'fashion_accessory', '16754345011': 'skin_care', '16754346011': 'hair_care', '16754347011': 'perfume', '16754350011': 'makeup', '16754349011': 'nails',
  '16209062011': 'electronics', '17100553011': 'kitchen_furniture', '17100552011': 'office_furniture', '17100547011': 'bedroom_furniture', '17100554011': 'living_room_furniture', '17100548011': 'dining_furniture',
});

const rules = catalog.rules.map(({ type, pattern }) => ({
  type,
  pattern: new RegExp(pattern, 'iu'),
}));

function text(value) {
  return String(value || '').trim();
}

function categoryLabel(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function attributeText(product) {
  const raw = product?.rawPayload?.attributes || product?.attributes || product?.marketplaceMetrics?.attributes;
  if (!raw) return '';
  return Array.isArray(raw)
    ? raw.map((item) => `${item?.id || ''} ${item?.name || ''} ${item?.value_name || item?.value || ''}`).join(' ')
    : JSON.stringify(raw);
}

function ids(product) {
  const raw = product?.rawPayload || {};
  const metrics = product?.marketplaceMetrics || {};
  return {
    domainId: raw.domain_id || product?.domain_id || metrics.domainId || metrics.domain_id,
    categoryId: raw.category_id || product?.category_id || product?.category?.id || metrics.categoryId || metrics.category_id,
  };
}

function classifyByRules(value, source, confidence) {
  const matches = rules.filter(({ pattern }) => pattern.test(value));
  if (!matches.length) return null;
  const types = [...new Set(matches.map(({ type }) => type))];
  return {
    productType: types[0],
    status: 'classified',
    source,
    confidence,
    evidence: { matchedTypes: types, value: value.slice(0, 240) },
  };
}

function markConflict(primary, product) {
  const values = [attributeText(product), text(product?.title)].filter(Boolean);
  const types = [...new Set(values.flatMap((value) => rules.filter(({ pattern }) => pattern.test(value)).map(({ type }) => type)))];
  const conflicts = types.filter((type) => type !== primary.productType);
  return conflicts.length ? {
    ...primary,
    status: 'conflict',
    evidence: { ...(primary.evidence || {}), conflictingTypes: conflicts },
  } : primary;
}

function classifyCandidate(product, marketplace) {
  const { domainId, categoryId } = ids(product);
  const normalizedMarketplace = text(marketplace || product?.marketplace).toLowerCase();

  if (normalizedMarketplace === 'mercado livre') {
    const canonical = classifyMercadoLivreProduct({ title: product?.title, domainId, categoryId });
    if (canonical.status === 'classified') {
      return {
        ...canonical,
        confidence: canonical.source.startsWith('mercadolivre-certified:') || canonical.source.startsWith('domain:') ? 1 : canonical.source.startsWith('category:') ? 0.95 : 0.8,
        evidence: { source: canonical.source, domainId: domainId || null, categoryId: categoryId || null },
      };
    }
  }

  const domainType = domainId ? catalog.domains[String(domainId)] : null;
  if (domainType) return markConflict({ productType: domainType, status: 'classified', source: `domain:${domainId}`, confidence: 1, evidence: { domainId } }, product);
  const categoryType = categoryId ? catalog.categories[String(categoryId)] : null;
  if (categoryType) return markConflict({ productType: categoryType, status: 'classified', source: `category:${categoryId}`, confidence: 0.95, evidence: { categoryId } }, product);

  // Evidência específica do próprio produto deve vencer browse nodes amplos.
  // Isso impede um notebook/monitor/mouse de herdar um tipo genérico incorreto
  // apenas porque a busca Amazon usou um nó abrangente de Informática.
  const byAttributes = classifyByRules(attributeText(product), 'attributes', 0.9);
  if (byAttributes) return byAttributes;
  const byTitle = classifyByRules(text(product?.title), 'title', 0.9);
  if (byTitle) return byTitle;

  if (normalizedMarketplace === 'amazon') {
    const browseNodeId = String(product?.category?.browseNodeId || product?.marketplaceMetrics?.browseNodeId || product?.rawPayload?.node_id || '');
    const browseType = AMAZON_BROWSE_TYPES[browseNodeId];
    if (browseType) {
      return { productType: browseType, status: 'classified', source: `amazon:browse_node:${browseNodeId}`, confidence: 0.75, evidence: { browseNodeId } };
    }
  }

  const categoryName = categoryLabel(product?.category?.name || product?.category_name);
  if (categoryName) return { productType: categoryName, status: 'classified', source: 'category:label', confidence: 0.7, evidence: { categoryName } };

  return {
    productType: 'unknown',
    status: 'review_required',
    source: 'type:unknown',
    confidence: 0,
    evidence: { title: text(product?.title).slice(0, 240), domainId: domainId || null, categoryId: categoryId || null },
  };
}

function coverageKey(product) {
  return text(product?.intent || product?.scenario || product?.rawPayload?.intent || product?.category?.name || 'sem_intencao') || 'sem_intencao';
}

function buildClassificationCoverage(products, marketplace) {
  const total = products.length;
  const classified = products.filter((product) => product.classification?.status === 'classified');
  const unknown = products.filter((product) => product.classification?.productType === 'unknown');
  const reviewRequired = products.filter((product) => product.classification?.status === 'review_required');
  const conflicts = products.filter((product) => product.classification?.status === 'conflict');
  const byIntent = {};
  for (const product of products) {
    const key = coverageKey(product);
    byIntent[key] ||= { total: 0, classified: 0, unknown: 0, review_required: 0, conflicts: 0, coverage: 0 };
    byIntent[key].total += 1;
    if (product.classification?.status === 'classified') byIntent[key].classified += 1;
    if (product.classification?.productType === 'unknown') byIntent[key].unknown += 1;
    if (product.classification?.status === 'review_required') byIntent[key].review_required += 1;
    if (product.classification?.status === 'conflict') byIntent[key].conflicts += 1;
  }
  for (const value of Object.values(byIntent)) value.coverage = value.total ? Number((value.classified / value.total).toFixed(4)) : 0;
  return {
    marketplace,
    total_extraidos: total,
    total_validos: total,
    total_classificados: classified.length,
    total_unknown: unknown.length,
    total_review_required: reviewRequired.length,
    total_conflitos: conflicts.length,
    cobertura_classificacao: total ? Number((classified.length / total).toFixed(4)) : 0,
    cobertura_por_intencao: byIntent,
    approved_for_publication: total > 0 && classified.length === total && unknown.length === 0 && reviewRequired.length === 0 && conflicts.length === 0,
  };
}

module.exports = { classifyCandidate, buildClassificationCoverage, coverageKey };
