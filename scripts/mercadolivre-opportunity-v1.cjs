'use strict';

const ML_OPPORTUNITY_STRATEGY_VERSION = 'mercadolivre-opportunity-v1';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreOffer(candidate) {
  const currentPrice = numberOrNull(candidate.currentPrice);
  const oldPrice = numberOrNull(candidate.oldPrice);
  if (!(currentPrice > 0 && oldPrice > currentPrice)) return 0;
  const discount = ((oldPrice - currentPrice) / oldPrice) * 100;
  if (discount >= 40) return 35;
  if (discount >= 30) return 30;
  if (discount >= 20) return 24;
  if (discount >= 10) return 16;
  if (discount > 0) return 8;
  return 0;
}

function scoreOfficialEvidence(candidate) {
  const position = numberOrNull(candidate.sourcePosition);
  if (position === null || position <= 0) return 0;
  if (position === 1) return 20;
  if (position <= 3) return 16;
  if (position <= 5) return 12;
  if (position <= 10) return 6;
  return 2;
}

function scoreDataConfidence(candidate) {
  let score = 0;
  if (candidate.itemId || candidate.productId) score += 5;
  if (/^https:\/\//i.test(String(candidate.imageUrl || ''))) score += 5;
  if (/^https:\/\//i.test(String(candidate.permalink || ''))) score += 5;
  if (candidate.domainId || candidate.categoryId) score += 5;
  return score;
}

function scorePriceAccessibility(candidate) {
  const price = numberOrNull(candidate.currentPrice);
  if (!(price > 0)) return 0;
  if (price <= 100) return 15;
  if (price <= 300) return 10;
  if (price <= 1000) return 5;
  return 0;
}

function scoreDemand(candidate) {
  const sales = numberOrNull(candidate.sales);
  if (!(sales > 0)) return 0;
  if (sales >= 1000) return 10;
  if (sales >= 100) return 7;
  if (sales >= 10) return 4;
  return 2;
}

function normalizeEquivalenceKey(candidate) {
  const sourceIntent = String(candidate.sourceIntent || '').trim().toLowerCase();
  if (sourceIntent) return sourceIntent;
  const category = String(candidate.category || '').trim().toLowerCase();
  if (category) return category;
  return String(candidate.productName || '').trim().toLowerCase();
}

function scoreMercadoLivreOpportunityV1(candidate = {}) {
  const currentPrice = numberOrNull(candidate.currentPrice);
  const offerScore = scoreOffer(candidate);
  const officialEvidenceScore = scoreOfficialEvidence(candidate);
  const dataConfidenceScore = scoreDataConfidence(candidate);
  const priceAccessibilityScore = scorePriceAccessibility(candidate);
  const demandScore = scoreDemand(candidate);
  const sales = numberOrNull(candidate.sales);
  const velocityStatus = candidate?.velocityInfo?.velocity_status || 'insufficient_history';

  const validIdentity = Boolean(candidate.itemId || candidate.productId);
  const validImage = /^https:\/\//i.test(String(candidate.imageUrl || ''));
  const validLink = /^https:\/\//i.test(String(candidate.permalink || ''));
  const passesGate = Boolean(
    currentPrice > 0
    && validIdentity
    && validImage
    && validLink
    && offerScore >= 16
  );

  const finalScore = Math.min(100,
    offerScore
    + officialEvidenceScore
    + dataConfidenceScore
    + priceAccessibilityScore
    + demandScore
  );

  return {
    candidate,
    strategyVersion: ML_OPPORTUNITY_STRATEGY_VERSION,
    offerScore,
    officialEvidenceScore,
    dataConfidenceScore,
    priceAccessibilityScore,
    demandScore,
    finalScore,
    passesGate,
    sales,
    velocityStatus,
    equivalenceKey: normalizeEquivalenceKey(candidate),
  };
}

function selectMercadoLivreOpportunitiesV1(candidates = [], { maxProducts = 20 } = {}) {
  const scored = candidates
    .map(scoreMercadoLivreOpportunityV1)
    .filter((row) => row.passesGate)
    .sort((a, b) => b.finalScore - a.finalScore || b.offerScore - a.offerScore || b.officialEvidenceScore - a.officialEvidenceScore);

  const selected = [];
  const seenNative = new Set();
  const equivalenceCounts = new Map();
  const macroCounts = new Map();

  for (const row of scored) {
    if (selected.length >= maxProducts) break;
    const nativeKey = String(row.candidate.itemId || row.candidate.productId || '').trim();
    if (!nativeKey || seenNative.has(nativeKey)) continue;

    const equivalenceCount = equivalenceCounts.get(row.equivalenceKey) || 0;
    if (equivalenceCount >= 2) continue;

    const macroGroup = String(row.candidate.macroGroup || 'outros');
    const macroCount = macroCounts.get(macroGroup) || 0;
    if (macroCount >= 4) continue;

    selected.push(row);
    seenNative.add(nativeKey);
    equivalenceCounts.set(row.equivalenceKey, equivalenceCount + 1);
    macroCounts.set(macroGroup, macroCount + 1);
  }

  return selected;
}

module.exports = {
  ML_OPPORTUNITY_STRATEGY_VERSION,
  scoreMercadoLivreOpportunityV1,
  selectMercadoLivreOpportunitiesV1,
};
