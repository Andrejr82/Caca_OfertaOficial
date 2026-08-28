'use strict';

const { calculateDeterministicScore } = require('./amazon-native-top20-v5.cjs');

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function matchingTerms(title, terms = []) {
  const normalizedTitle = normalize(title);
  return [...new Set(terms.filter((term) => normalizedTitle.includes(normalize(term))))];
}

function evaluateAmazonProductDiagnostics(product, scenario, finalQueuePosition) {
  const accessoryTerms = matchingTerms(product.title, scenario.blockedProductTerms || []);
  const classificationTerms = matchingTerms(product.title, scenario.allowedProductTerms || []);
  const reviewCount = product.marketplaceMetrics?.reviewCount ?? null;
  const derivedInitialScore = Number.isFinite(Number(product.initial_score))
    ? Number(product.initial_score)
    : calculateDeterministicScore(product);

  return {
    asin: product.asin || null,
    title: product.title || null,
    intention: product.subcategory || null,
    browse_node_evidence: {
      node_id: product.node_id || null,
      parent_node_id: product.parent_node_id || null,
      source_url: product.source_url || null,
    },
    price: product.price ?? null,
    original_price: product.original_price ?? null,
    discount: product.discount ?? null,
    rating: product.marketplaceMetrics?.rating ?? null,
    review_count: reviewCount,
    review_evidence_status: reviewCount === null ? 'unavailable' : 'available',
    score_initial: derivedInitialScore,
    score_initial_source: Number.isFinite(Number(product.initial_score)) ? 'collector' : 'derived_from_raw_commercial_fields',
    adherence_decision: classificationTerms.length ? 'accepted' : 'unclassified',
    accessory_decision: {
      status: accessoryTerms.length ? 'rejected' : 'accepted',
      matched_terms: accessoryTerms,
    },
    classification: {
      status: classificationTerms.length ? 'classified' : 'unclassified',
      matched_terms: classificationTerms,
    },
    score_final: Number.isFinite(Number(product.score)) ? Number(product.score) : null,
    final_queue_position: Number.isInteger(finalQueuePosition) ? finalQueuePosition : null,
    source_rank: product.rank ?? null,
  };
}

function buildAmazonDiagnostic({ scenario, queries = [], products = [], raw_products = 0, duplicates = 0 } = {}) {
  const sortedProducts = [...products].sort((a, b) => (a.rank || 0) - (b.rank || 0) || String(a.asin).localeCompare(String(b.asin)));
  const diagnostics = sortedProducts.map((product, index) => evaluateAmazonProductDiagnostics(product, scenario, index + 1));
  const byIntention = {};
  for (const query of queries) {
    byIntention[query.keyword || query.browse_node_id || 'unknown'] = {
      collected: query.collected ?? 0,
      valid: query.valid ?? 0,
      discarded: query.discarded ?? 0,
      status: query.status || null,
      http_status: query.http_status ?? null,
      final_products: diagnostics.filter((product) => product.intention === (query.browse_node_id ? `browse_node:${query.browse_node_id}` : query.keyword)).length,
    };
  }
  return {
    generated_at: new Date().toISOString(),
    marketplace: 'Amazon',
    scenario: scenario?.id || scenario?.label || null,
    dry_run: true,
    persistence_performed: false,
    funnel: {
      raw_products: raw_products ?? 0,
      valid_products: products.length,
      discarded_products: queries.reduce((total, query) => total + Number(query.discarded || 0), 0),
      duplicates: duplicates ?? 0,
      final_queue_products: diagnostics.length,
    },
    intentions: byIntention,
    products: diagnostics,
  };
}

module.exports = { buildAmazonDiagnostic, evaluateAmazonProductDiagnostics, matchingTerms };
