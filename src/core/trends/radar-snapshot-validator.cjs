'use strict';

const { decisionFromScore } = require('./commercial-opportunity-score-vnext.cjs');
const { canonicalFunctionalFamily, canonicalMacroFamily } = require('./radar-vnext-selector.cjs');

function validateFinalRadarSnapshot(snapshot = {}) {
  const run = snapshot.run || snapshot;
  const products = Array.isArray(snapshot.products) ? snapshot.products : (Array.isArray(snapshot) ? snapshot : []);
  const health = run.source_health || {};

  const selectedCount = products.length;
  let thresholdViolations = 0;
  let duplicateSelectedIdentities = 0;
  let commissionAnomalies = 0;
  let integrityFailures = 0;
  let diversityViolations = 0;
  let fallbackViolations = 0;

  const seenIdentities = new Set();
  const functionalFamilyCounts = {};
  const macroFamilyCounts = {};

  const fallbackUsed = Boolean(health.diversity_fallback_used || products.some(p => p.is_diversity_fallback || p.isDiversityFallback));

  for (const p of products) {
    const score = Number(p.commercial_score ?? p.score ?? 0);
    const ev = Array.isArray(p.direct_evidence) && p.direct_evidence[0] ? p.direct_evidence[0] : {};
    const comm = ev.commercial_metrics || {};
    const expectedDecision = decisionFromScore(score);

    // 1. Threshold check
    const actualDecision = ev.decision || ev.selection_decision || p.decision;
    if (actualDecision && actualDecision !== expectedDecision) {
      thresholdViolations += 1;
    }

    // 2. Duplicate identities check
    const identityKey = `${p.marketplace}:${ev.marketplace_identity?.shopId || '0'}:${ev.marketplace_identity?.itemId || ev.marketplace_identity?.productId || p.product_term}`;
    if (seenIdentities.has(identityKey)) {
      duplicateSelectedIdentities += 1;
    }
    seenIdentities.add(identityKey);

    // 3. Commission anomalies
    const effCommission = Number(ev.economic_return?.effectiveCommissionPercent ?? comm.commissionRate ?? 0);
    if (effCommission > 35) {
      commissionAnomalies += 1;
    }

    // 4. Integrity failures
    const price = Number(ev.price ?? p.currentPrice ?? 0);
    if (!(price > 0) || !p.marketplace || !p.product_term) {
      integrityFailures += 1;
    }

    // 5. Functional & Macro Family counts
    const candidateObj = {
      productName: p.product_term || p.productName,
      title: p.product_term || p.productName,
      marketplace: p.marketplace,
    };
    const funcFamily = ev.functionalFamily || canonicalFunctionalFamily(candidateObj);
    const macroFamily = ev.macroFamily || canonicalMacroFamily(candidateObj);

    functionalFamilyCounts[funcFamily] = (functionalFamilyCounts[funcFamily] || 0) + 1;
    macroFamilyCounts[macroFamily] = (macroFamilyCounts[macroFamily] || 0) + 1;
  }

  // 6. Diversity Caps Validation
  for (const [fam, count] of Object.entries(functionalFamilyCounts)) {
    if (fam !== 'item_isolado' && count > 2) {
      if (!fallbackUsed) {
        diversityViolations += (count - 2);
      }
    }
  }

  for (const [macro, count] of Object.entries(macroFamilyCounts)) {
    if (macro !== 'geral' && count > 4) {
      if (!fallbackUsed) {
        diversityViolations += (count - 4);
      }
    }
  }

  const validCandidateCount = health.valid_candidate_count || health.candidate_pool_count || selectedCount;
  const isSelectedCountCorrect = validCandidateCount >= 20 ? (selectedCount === 20) : (selectedCount === validCandidateCount);

  const strategyVersion = run.strategy_version || health.official_strategy || health.strategy_version;
  const vnextOfficial = Boolean(health.vnext_official);

  const isOverallPass =
    isSelectedCountCorrect &&
    thresholdViolations === 0 &&
    duplicateSelectedIdentities === 0 &&
    diversityViolations === 0 &&
    fallbackViolations === 0 &&
    commissionAnomalies === 0 &&
    integrityFailures === 0 &&
    strategyVersion === 'commercial-opportunity-vnext/1' &&
    vnextOfficial === true;

  return {
    selected_count: selectedCount,
    isSelectedCountCorrect,
    threshold_violations: thresholdViolations,
    duplicate_selected_identities: duplicateSelectedIdentities,
    functional_family_counts: functionalFamilyCounts,
    macro_family_counts: macroFamilyCounts,
    diversity_violations: diversityViolations,
    fallback_used: fallbackUsed,
    fallback_violations: fallbackViolations,
    commission_anomalies: commissionAnomalies,
    integrity_failures: integrityFailures,
    strategy_version: strategyVersion,
    vnext_official: vnextOfficial,
    overall: isOverallPass ? 'PASS' : 'FAIL',
  };
}

module.exports = {
  validateFinalRadarSnapshot,
};
