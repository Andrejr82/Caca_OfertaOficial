'use strict';

/**
 * Radar Semantic Deduplication and Family Diversity V2 — Caça Ofertas Oficial
 *
 * Responsabilidades:
 * 1. Deduplicar catálogo Mercado Livre por productId (preservando o melhor representante).
 * 2. Deduplicar variantes semânticas e produtos equivalentes Shopee por family_key.
 * 3. Aplicar limitação de diversidade por família no Top 20 (evitando concentração excessiva).
 * 4. Preservar produtos genuinamente diferentes.
 */

const {
  computeAllKeys,
  extractProductTypeSlug,
  normalizeToken,
  tokenize,
} = require('./family-key-engine.cjs');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCandidateCommercialMetric(candidate) {
  const score = Number(candidate.commercialScore ?? candidate.commercial_score ?? candidate.finalScore ?? 0);
  const sales = Number(candidate.sales ?? candidate.sold_quantity ?? 0);
  const rating = Number(candidate.ratingStar ?? candidate.rating ?? 0);
  const discount = Number(candidate.discountPercent ?? candidate.priceDiscountRate ?? 0);
  return { score, sales, rating, discount };
}

function compareCandidatesQuality(a, b) {
  const metricA = getCandidateCommercialMetric(a);
  const metricB = getCandidateCommercialMetric(b);

  if (metricB.score !== metricA.score) return metricB.score - metricA.score;
  if (metricB.sales !== metricA.sales) return metricB.sales - metricA.sales;
  if (metricB.rating !== metricA.rating) return metricB.rating - metricA.rating;
  if (metricB.discount !== metricA.discount) return metricB.discount - metricA.discount;

  const priceA = Number(a.currentPrice || 0);
  const priceB = Number(b.currentPrice || 0);
  return priceA - priceB;
}

const STOP_TOKENS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'para', 'e', 'em', 'a', 'o', 'as', 'os',
  'um', 'uma', 'kit', 'combo', 'produto', 'novo', 'nova', 'original', 'promocao',
  'oferta', 'barato', 'qualidade', 'super', 'alta', 'mini', 'maxi', 'plus', 'pro'
]);

function extractSemanticClusterKey(candidate) {
  const title = candidate.productName || candidate.product_term || candidate.title || '';
  const category = candidate.category || '';
  const marketplace = String(candidate.marketplace || candidate.platform || '').toLowerCase();

  // 1. Tenta FamilyKeyEngine
  const familyIdentity = computeAllKeys({ title, category, marketplace });
  if (familyIdentity.canGroup && familyIdentity.family_key) {
    return `${marketplace}:family:${familyIdentity.family_key}`;
  }

  // 2. Extração semântica complementar por intersecção de conceitos estruturais
  const normalized = normalizeText(title);
  const tokenSet = new Set(tokenize(title));

  const hasAny = (...words) => words.some(w => tokenSet.has(w) || normalized.includes(w));
  const hasAllGroups = (...groups) => groups.every(group => group.some(w => tokenSet.has(w) || normalized.includes(w)));

  if (hasAllGroups(['bola', 'bolinha', 'brinquedo'], ['gato', 'gatos', 'pet', 'felino', 'felinos'], ['inteligente', 'interativa', 'interativo', 'led', 'automatica', 'automatico'])) {
    return `${marketplace}:semantic:brinquedo-bola-interativa-gato`;
  }

  if (hasAllGroups(['fone', 'fones', 'headphone', 'earbuds'], ['tws', 'bluetooth', 'sem fio'])) {
    return `${marketplace}:semantic:fone-bluetooth-tws`;
  }

  if (hasAllGroups(['suporte'], ['celular', 'smartphone', 'gps'], ['veicular', 'carro', 'magnetico', 'saida ar'])) {
    return `${marketplace}:semantic:suporte-celular-veicular-magnetico`;
  }

  if (hasAllGroups(['suporte'], ['notebook', 'laptop'], ['aluminio', 'articulado', 'ergonomico', 'mesa'])) {
    return `${marketplace}:semantic:suporte-notebook-aluminio`;
  }

  // 3. Se não houver evidência de agrupamento familiar (canGroup === false) nem cluster semântico explícito,
  // os itens permanecem independentes (evita falso agrupamento de produtos distintos)
  const itemId = candidate.itemId || candidate.item_id || candidate.id;
  if (itemId) {
    return `${marketplace}:independent:${normalizeToken(itemId)}`;
  }

  return `${marketplace}:title:${normalizeText(title).slice(0, 60)}`;
}

/**
 * Deduplica catálogo (Mercado Livre productId) e variantes semânticas (Shopee family_key).
 */
function deduplicateCatalogAndSemantic(candidates = [], options = {}) {
  const uniqueCandidates = [];
  const excludedCatalogDuplicates = [];
  const excludedSemanticDuplicates = [];

  // Fase 1: Deduplicação de catálogo Mercado Livre por productId
  const mlCatalogMap = new Map();
  const pass1Candidates = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const marketplace = String(candidate.marketplace || candidate.platform || '').toLowerCase();
    const productId = String(candidate.productId || candidate.product_id || '').trim().toLowerCase();

    if (marketplace === 'mercado livre' && productId) {
      if (!mlCatalogMap.has(productId)) {
        mlCatalogMap.set(productId, candidate);
      } else {
        const existing = mlCatalogMap.get(productId);
        if (compareCandidatesQuality(candidate, existing) < 0) {
          // O novo candidato é superior ao existente
          mlCatalogMap.set(productId, candidate);
          excludedCatalogDuplicates.push(existing);
        } else {
          excludedCatalogDuplicates.push(candidate);
        }
      }
    } else {
      pass1Candidates.push(candidate);
    }
  }

  // Junta os vencedores de catálogo ML com o restante
  pass1Candidates.push(...mlCatalogMap.values());

  // Fase 2: Deduplicação Semântica por Cluster / Família
  const semanticMap = new Map();

  for (const candidate of pass1Candidates) {
    const clusterKey = extractSemanticClusterKey(candidate);

    if (!semanticMap.has(clusterKey)) {
      semanticMap.set(clusterKey, candidate);
    } else {
      const existing = semanticMap.get(clusterKey);
      if (compareCandidatesQuality(candidate, existing) < 0) {
        // Novo candidato é melhor
        semanticMap.set(clusterKey, candidate);
        excludedSemanticDuplicates.push({
          ...existing,
          semantic_duplicate_reason: `Substituído por candidato superior no cluster ${clusterKey}`,
        });
      } else {
        excludedSemanticDuplicates.push({
          ...candidate,
          semantic_duplicate_reason: `Substituído por candidato superior no cluster ${clusterKey}`,
        });
      }
    }
  }

  uniqueCandidates.push(...semanticMap.values());

  return {
    uniqueCandidates,
    excludedCatalogDuplicates,
    excludedSemanticDuplicates,
    familyMap: semanticMap,
  };
}

/**
 * Limita a concentração excessiva de uma mesma família no Top 20.
 */
function applyFamilyDiversityCap(rankedCandidates = [], options = {}) {
  const maxPerFamily = typeof options.maxPerFamily === 'number' ? options.maxPerFamily : 3;
  const targetCount = typeof options.targetCount === 'number' ? options.targetCount : 20;

  const diversifiedProducts = [];
  const excludedByDiversityCap = [];
  const familyDistribution = {};

  for (const candidate of Array.isArray(rankedCandidates) ? rankedCandidates : []) {
    const clusterKey = extractSemanticClusterKey(candidate);
    const count = familyDistribution[clusterKey] || 0;

    if (count < maxPerFamily && diversifiedProducts.length < targetCount) {
      familyDistribution[clusterKey] = count + 1;
      diversifiedProducts.push(candidate);
    } else {
      excludedByDiversityCap.push({
        ...candidate,
        diversity_cap_reason: `Capping de família atingido (${maxPerFamily} itens) para ${clusterKey}`,
      });
    }
  }

  return {
    diversifiedProducts,
    excludedByDiversityCap,
    familyDistribution,
  };
}

module.exports = {
  extractSemanticClusterKey,
  deduplicateCatalogAndSemantic,
  applyFamilyDiversityCap,
};
