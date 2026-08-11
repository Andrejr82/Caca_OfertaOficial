'use strict';

const {
  validateCanonicalUrl,
  validateNativeIdentity,
} = require('./oracle-worker-discovery-only.cjs');

const TREND_SHADOW_COMPARISON_VERSION = 'trend-executive.shadow-comparison/v1';

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validPrice(candidate) {
  const price = finiteNumber(candidate?.currentPrice);
  return price !== null && price > 0;
}

function qualityScore(candidate) {
  const score = finiteNumber(candidate?.curation?.score);
  return score !== null ? score : null;
}

function publicationClicks(candidate) {
  if (candidate?.publication?.approved !== true) return 0;
  const clicks = finiteNumber(candidate?.publication?.clicks);
  return clicks !== null && clicks > 0 ? clicks : 0;
}

function summarizeArm(arm = {}) {
  const candidates = Array.isArray(arm?.candidates) ? arm.candidates.filter(Boolean) : [];
  let validOfferUrl = 0;
  let validIdentity = 0;
  let priceValid = 0;
  let validOffers = 0;
  let monetized = 0;
  let freshObserved = 0;
  let freshAccepted = 0;
  let freshRejected = 0;
  let unmatchedOpportunities = 0;
  let approvedPublicationClicks = 0;
  const qualityScores = [];

  for (const candidate of candidates) {
    const marketplace = candidate?.marketplace || null;
    const urlIsValid = validateCanonicalUrl(candidate?.sourceUrl);
    const identityIsValid = validateNativeIdentity(marketplace, candidate);
    const priceIsValid = validPrice(candidate);

    if (urlIsValid) validOfferUrl += 1;
    if (identityIsValid) validIdentity += 1;
    if (priceIsValid) priceValid += 1;
    if (urlIsValid && identityIsValid && priceIsValid) validOffers += 1;
    if (candidate?.monetization?.valid === true) monetized += 1;

    const freshnessStatus = String(candidate?.freshness?.status || '').trim().toLowerCase();
    if (freshnessStatus) {
      freshObserved += 1;
      if (freshnessStatus === 'accepted') freshAccepted += 1;
      if (freshnessStatus === 'rejected') freshRejected += 1;
    }

    if (String(candidate?.opportunityMatch?.status || '').trim().toLowerCase() === 'no_match') {
      unmatchedOpportunities += 1;
    }

    const score = qualityScore(candidate);
    if (score !== null) qualityScores.push(score);
    approvedPublicationClicks += publicationClicks(candidate);
  }

  const averageQualityScore = qualityScores.length > 0
    ? Number((qualityScores.reduce((total, score) => total + score, 0) / qualityScores.length).toFixed(4))
    : null;

  return Object.freeze({
    totalCandidates: candidates.length,
    validOffers,
    validOfferUrl,
    validIdentity,
    validPrice: priceValid,
    monetized,
    freshObserved,
    freshAccepted,
    freshRejected,
    averageQualityScore,
    qualityObserved: qualityScores.length,
    unmatchedOpportunities,
    approvedPublicationClicks,
  });
}

function numericDelta(radar, legacy) {
  if (radar === null || legacy === null) return null;
  return Number((Number(radar) - Number(legacy)).toFixed(4));
}

function buildDelta(legacy, radar) {
  return Object.freeze({
    totalCandidates: numericDelta(radar.totalCandidates, legacy.totalCandidates),
    validOffers: numericDelta(radar.validOffers, legacy.validOffers),
    validOfferUrl: numericDelta(radar.validOfferUrl, legacy.validOfferUrl),
    validIdentity: numericDelta(radar.validIdentity, legacy.validIdentity),
    validPrice: numericDelta(radar.validPrice, legacy.validPrice),
    monetized: numericDelta(radar.monetized, legacy.monetized),
    freshObserved: numericDelta(radar.freshObserved, legacy.freshObserved),
    freshAccepted: numericDelta(radar.freshAccepted, legacy.freshAccepted),
    freshRejected: numericDelta(radar.freshRejected, legacy.freshRejected),
    averageQualityScore: numericDelta(radar.averageQualityScore, legacy.averageQualityScore),
    qualityObserved: numericDelta(radar.qualityObserved, legacy.qualityObserved),
    unmatchedOpportunities: numericDelta(radar.unmatchedOpportunities, legacy.unmatchedOpportunities),
    approvedPublicationClicks: numericDelta(radar.approvedPublicationClicks, legacy.approvedPublicationClicks),
  });
}

function buildTrendShadowComparison({ radarRunId = null, legacy = {}, radar = {}, generatedAt = new Date().toISOString() } = {}) {
  const legacySummary = summarizeArm(legacy);
  const radarSummary = summarizeArm(radar);
  return Object.freeze({
    contractVersion: TREND_SHADOW_COMPARISON_VERSION,
    radarRunId: radarRunId || null,
    generatedAt,
    authority: 'legacy_scenario',
    persistence: 'none',
    legacy: legacySummary,
    radar: radarSummary,
    delta: buildDelta(legacySummary, radarSummary),
  });
}

module.exports = {
  TREND_SHADOW_COMPARISON_VERSION,
  buildTrendShadowComparison,
  summarizeArm,
};
