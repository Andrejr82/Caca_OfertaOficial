'use strict';

const ADAPTIVE_DISCOVERY_POLICY_VERSION = 'adaptive-catalog-depth/v1';
const ADAPTIVE_DISCOVERY_ROLE = 'fallback_after_first_discovery_quality_exhausted';

const MIN_EXTRACTED_BY_MARKETPLACE = Object.freeze({
  Amazon: 180,
  'Mercado Livre': 120,
  Shopee: 120,
});

const DEFAULTS = Object.freeze({
  targetPortfolioSize: 7,
  minDistinctEditorialTypes: 4,
  minQualifiedCandidates: 18,
  maxExpansionRounds: 2,
  maxPagesPerTerm: 4,
  pageStep: 1,
  candidateGrowthFactor: 1.5,
  maxCandidateLimit: 30,
});

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Fallback de profundidade para quando a descoberta inicial orientada por
 * intenção/cobertura já foi executada e, mesmo assim, esgotou o orçamento sem
 * formar um pool editorial forte.
 *
 * Esta política NÃO deve ser o mecanismo principal de qualidade. O fluxo
 * primário é definido por discovery-retrieval-quality/v1 e deve melhorar a
 * primeira descoberta antes do ranking final.
 */
function assessAdaptiveDiscovery(input = {}, options = {}) {
  const marketplace = String(input.marketplace || 'unknown');
  const config = { ...DEFAULTS, ...options };
  const extracted = Math.max(0, finiteNumber(input.extracted));
  const afterQualityGate = Math.max(0, finiteNumber(input.afterQualityGate));
  const portfolioSelected = Math.max(0, finiteNumber(input.portfolioSelected ?? input.queueSelected));
  const distinctEditorialTypes = Math.max(0, finiteNumber(input.distinctEditorialTypes));
  const expansionRound = Math.max(0, Math.floor(finiteNumber(input.expansionRound)));
  const basePagesPerTerm = Math.max(1, Math.floor(finiteNumber(input.basePagesPerTerm, 1)));
  const baseCandidateLimit = Math.max(1, Math.floor(finiteNumber(input.baseCandidateLimit, 10)));
  const minExtracted = Math.max(0, finiteNumber(
    options.minExtracted ?? MIN_EXTRACTED_BY_MARKETPLACE[marketplace],
    100,
  ));

  const reasons = [];
  if (extracted < minExtracted) reasons.push('catalog_sample_too_small');
  if (afterQualityGate < Number(config.minQualifiedCandidates)) reasons.push('qualified_pool_too_small');
  if (portfolioSelected < Number(config.targetPortfolioSize)) reasons.push('portfolio_below_target');
  if (distinctEditorialTypes < Number(config.minDistinctEditorialTypes)) reasons.push('portfolio_diversity_too_low');

  const canExpand = expansionRound < Number(config.maxExpansionRounds);
  const shouldExpand = canExpand && reasons.length > 0;
  const nextPagesPerTerm = shouldExpand
    ? Math.min(Number(config.maxPagesPerTerm), basePagesPerTerm + Number(config.pageStep))
    : basePagesPerTerm;
  const nextCandidateLimit = shouldExpand
    ? Math.min(Number(config.maxCandidateLimit), Math.max(baseCandidateLimit + 1, Math.ceil(baseCandidateLimit * Number(config.candidateGrowthFactor))))
    : baseCandidateLimit;

  return Object.freeze({
    contractVersion: ADAPTIVE_DISCOVERY_POLICY_VERSION,
    role: ADAPTIVE_DISCOVERY_ROLE,
    marketplace,
    shouldExpand,
    canExpand,
    expansionRound,
    reasons: Object.freeze(reasons),
    evidence: Object.freeze({
      extracted,
      minExtracted,
      afterQualityGate,
      minQualifiedCandidates: Number(config.minQualifiedCandidates),
      portfolioSelected,
      targetPortfolioSize: Number(config.targetPortfolioSize),
      distinctEditorialTypes,
      minDistinctEditorialTypes: Number(config.minDistinctEditorialTypes),
    }),
    next: Object.freeze({
      expansionRound: shouldExpand ? expansionRound + 1 : expansionRound,
      maxPagesPerTerm: nextPagesPerTerm,
      candidateLimit: nextCandidateLimit,
    }),
  });
}

module.exports = {
  ADAPTIVE_DISCOVERY_POLICY_VERSION,
  ADAPTIVE_DISCOVERY_ROLE,
  MIN_EXTRACTED_BY_MARKETPLACE,
  DEFAULTS,
  assessAdaptiveDiscovery,
};
