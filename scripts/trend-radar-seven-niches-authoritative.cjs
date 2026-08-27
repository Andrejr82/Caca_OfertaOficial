'use strict';

const TREND_STRATEGY_VERSION = 'trend-radar-seven-niches-v2';
const TREND_CONFIRMED_STATUS = 'verified';
const TREND_OBSERVED_STATUS = 'partial';
const MAX_SNAPSHOT_ROWS = 20;
const MAX_VERIFIED_PER_NICHE = 3;
const MIN_TREND_SCORE = 50;

const HEAD_BLOCKERS = Object.freeze([
  'tripe', 'transformador', 'adaptador de voltagem', 'conversor de voltagem',
  'cartao de memoria', 'cabo usb', 'cabo de dados', 'suporte para', 'suporte notebook', 'suporte monitor', 'tripe camera', 'base para',
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function phraseIn(text, phrase) {
  const haystack = ` ${normalize(text)} `;
  const needle = ` ${normalize(phrase)} `;
  return needle.trim().length > 0 && haystack.includes(needle);
}

function getDefaultNiches() {
  return require('./commercial-niche-config.cjs').COMMERCIAL_NICHES;
}

function classifyCanonicalNiche(candidate = {}, niches = null) {
  const registry = niches || getDefaultNiches();
  const title = normalize(candidate.productName || candidate.title || '');
  if (!title) return null;
  const head = title.split(' ').slice(0, 7).join(' ');
  const headBlocked = HEAD_BLOCKERS.find((term) => phraseIn(head, term));

  let best = null;
  for (const [nicheId, niche] of Object.entries(registry || {})) {
    const guardrails = niche?.guardrails || {};
    const blocked = [...(guardrails.blockedProductTerms || [])];
    if (blocked.some((term) => phraseIn(title, term))) continue;
    const allowed = [...(guardrails.allowedProductTerms || [])];
    const matches = allowed.filter((term) => phraseIn(title, term));
    if (!matches.length) continue;

    const strongest = matches
      .map((term) => ({ term, normalized: normalize(term) }))
      .sort((a, b) => b.normalized.split(' ').length - a.normalized.split(' ').length || b.normalized.length - a.normalized.length)[0];
    if (headBlocked) continue;

    const score = strongest.normalized.split(' ').filter(Boolean).length * 100 + strongest.normalized.length;
    if (!best || score > best.score) {
      best = { nicheId, nicheLabel: niche.name || nicheId, matchedTerm: strongest.normalized, score };
    }
  }
  return best;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveIdentity(candidate = {}) {
  const marketplace = String(candidate.marketplace || '').trim();
  const raw = candidate.identityKey || candidate.itemId || candidate.productId || candidate.asin || candidate.productName || candidate.title || '';
  return `${marketplace}:${String(raw).trim()}`;
}

function isAuthoritativeRank(candidate = {}) {
  if (candidate.rankAuthoritative === true) return true;
  const source = normalize(candidate.rankSource || candidate.rankingSource || candidate.provenance || '');
  return /amazon best sellers|sales rank|salesrank|mercado livre highlights/.test(source);
}

function nativeTrendScope(candidate = {}) {
  const source = normalize(candidate.marketplaceTrendEvidence?.source || candidate.nativeTrendSource || '');
  if (source.includes('category')) return 'category';
  if (source.includes('global')) return 'global';
  if (candidate.nativeTrend === true || candidate.marketplaceTrendEvidence) return 'native';
  return null;
}

function calculateTemporal(candidate = {}, previous = null) {
  const currentSales = num(candidate.sales ?? candidate.sold_quantity);
  const previousSales = num(previous?.sales ?? previous?.sold_quantity);
  const currentRank = num(candidate.rank ?? candidate.currentRank ?? candidate.sourcePosition);
  const previousRank = num(previous?.rank ?? previous?.currentRank ?? previous?.sourcePosition);
  const currentAt = candidate.observedAt ? new Date(candidate.observedAt).getTime() : Date.now();
  const previousAt = previous?.observedAt ? new Date(previous.observedAt).getTime() : null;
  const hours = previousAt && currentAt > previousAt ? (currentAt - previousAt) / 3600000 : null;
  const salesDelta = currentSales !== null && previousSales !== null ? currentSales - previousSales : null;
  const growthPct = salesDelta !== null && previousSales && previousSales > 0 ? (salesDelta / previousSales) * 100 : null;
  const salesVelocity = salesDelta !== null && hours && hours > 0 ? salesDelta / hours : null;
  const authoritativeRank = isAuthoritativeRank(candidate);
  const rankDelta = authoritativeRank && currentRank !== null && previousRank !== null ? previousRank - currentRank : null;
  return { currentSales, previousSales, salesDelta, growthPct, salesVelocity, currentRank, previousRank, rankDelta, hours, authoritativeRank };
}

function nativeMatchQuality(candidate = {}) {
  const keyword = normalize(candidate.marketplaceTrendEvidence?.keyword || candidate.nativeTrendKeyword || '');
  const title = normalize(candidate.productName || candidate.title || '');
  if (!keyword || !phraseIn(title, keyword)) return 0;
  return keyword.split(' ').length >= 2 ? 10 : 7;
}

function calculateTrendEvidence(candidate = {}, previous = null) {
  const temporal = calculateTemporal(candidate, previous);
  const scope = nativeTrendScope(candidate);
  const matchQuality = nativeMatchQuality(candidate);
  const bestSeller = candidate.bestSeller === true || candidate.amazonBestSeller === true || candidate.marketplaceDemandEvidence?.type === 'BEST_SELLER';
  const crossStrongCount = Math.max(1, Number(candidate.crossStrongCount || 1));

  let temporalScore = 0;
  const strongSalesAcceleration = temporal.salesDelta !== null && temporal.salesDelta >= 50
    && temporal.growthPct !== null && temporal.growthPct >= 1
    && temporal.hours !== null && temporal.hours > 0 && temporal.hours <= 72;
  if (strongSalesAcceleration) temporalScore = temporal.growthPct >= 3 || temporal.salesDelta >= 1000 ? 40 : 32;
  else if (temporal.salesVelocity !== null && temporal.salesVelocity > 0) temporalScore = Math.min(20, 8 + Math.log10(1 + temporal.salesVelocity) * 6);

  const nativeScore = scope === 'category' ? 35 : scope === 'global' ? 25 : scope === 'native' ? 25 : 0;
  let rankScore = 0;
  if (temporal.authoritativeRank && temporal.currentRank !== null && temporal.currentRank <= 20) rankScore += 10;
  const strongRankRise = temporal.authoritativeRank && temporal.rankDelta !== null && temporal.rankDelta >= 4;
  if (strongRankRise) rankScore += Math.min(30, 24 + temporal.rankDelta);
  else if (temporal.authoritativeRank && temporal.rankDelta !== null && temporal.rankDelta > 0) rankScore += Math.min(15, temporal.rankDelta * 3);

  const crossScore = crossStrongCount >= 2 ? Math.min(10, (crossStrongCount - 1) * 5) : 0;
  const observedAt = candidate.observedAt ? new Date(candidate.observedAt).getTime() : Date.now();
  const ageHours = Math.max(0, (Date.now() - observedAt) / 3600000);
  const freshness = ageHours <= 6 ? 10 : ageHours <= 24 ? 7 : ageHours <= 48 ? 4 : 0;

  const categoryNativeStrong = scope === 'category' && matchQuality > 0;
  const globalNativeStrong = scope === 'global' && matchQuality > 0 && (bestSeller || crossStrongCount >= 2);
  const strongEvidence = categoryNativeStrong || globalNativeStrong || strongSalesAcceleration || strongRankRise || crossStrongCount >= 2;
  const score = Math.round(Math.min(100, temporalScore + nativeScore + matchQuality + rankScore + crossScore + freshness) * 10) / 10;
  const trending = strongEvidence && score >= MIN_TREND_SCORE;

  const reasons = [];
  if (scope) reasons.push(`sinal_nativo_${scope}`);
  if (strongSalesAcceleration) reasons.push(`aceleracao_vendas_${temporal.growthPct.toFixed(2)}pct_${temporal.salesDelta}_unidades`);
  else if (temporal.salesVelocity !== null && temporal.salesVelocity > 0) reasons.push(`vendas_em_alta_${temporal.salesVelocity.toFixed(2)}_por_hora`);
  if (strongRankRise) reasons.push(`subida_ranking_${temporal.previousRank}_para_${temporal.currentRank}`);
  if (bestSeller) reasons.push('best_seller_autoritativo');
  if (crossStrongCount >= 2) reasons.push(`confirmacao_forte_${crossStrongCount}_marketplaces`);

  return { trendScore: score, trending, strongEvidence, strongSalesAcceleration, strongRankRise, reasons, temporal, scope, matchQuality,
    breakdown: { temporal: Math.round(temporalScore * 10) / 10, native: nativeScore, matchQuality, rank: rankScore, cross: crossScore, freshness } };
}

function calculateCommercialScore(candidate = {}, peers = [], scorer = null) {
  if (typeof scorer !== 'function') return { score: num(candidate.commercialScore ?? candidate.commercial_score ?? candidate.score) || 0, breakdown: {} };
  try {
    const result = scorer(candidate, { peers });
    return { score: num(result?.total) || 0, breakdown: result?.breakdown || {}, decision: result?.selection_decision || result?.decision || null };
  } catch (_) {
    return { score: num(candidate.commercialScore ?? candidate.commercial_score ?? candidate.score) || 0, breakdown: {} };
  }
}

function evaluateCandidates(candidates = [], previousByIdentity = new Map(), { niches = null, commercialScorer = null } = {}) {
  const canonical = [];
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const classification = classifyCanonicalNiche(raw, niches);
    if (!classification) continue;
    const identityKey = resolveIdentity(raw);
    const previous = previousByIdentity instanceof Map ? previousByIdentity.get(identityKey) || previousByIdentity.get(String(raw.itemId || raw.productId || raw.asin || '')) : null;
    const base = { ...raw, ...classification, identityKey };
    canonical.push({ ...base, ...calculateTrendEvidence(base, previous) });
  }

  const strongByFamily = new Map();
  for (const item of canonical.filter((x) => x.strongEvidence)) {
    const family = `${item.nicheId}:${item.matchedTerm}`;
    const set = strongByFamily.get(family) || new Set();
    set.add(item.marketplace);
    strongByFamily.set(family, set);
  }

  return canonical.map((item) => {
    const family = `${item.nicheId}:${item.matchedTerm}`;
    const crossStrongCount = strongByFamily.get(family)?.size || 1;
    const previous = previousByIdentity instanceof Map ? previousByIdentity.get(item.identityKey) || previousByIdentity.get(String(item.itemId || item.productId || item.asin || '')) : null;
    const retrended = calculateTrendEvidence({ ...item, crossStrongCount }, previous);
    const commercial = calculateCommercialScore(item, canonical, commercialScorer);
    return { ...item, ...retrended, crossStrongCount, commercialScore: commercial.score, commercialBreakdown: commercial.breakdown, commercialDecision: commercial.decision || null };
  });
}

function selectSnapshot(evaluated = [], { maxRows = MAX_SNAPSHOT_ROWS, maxVerifiedPerNiche = MAX_VERIFIED_PER_NICHE } = {}) {
  const verified = evaluated.filter((x) => x.trending).sort((a,b) => b.trendScore - a.trendScore || b.commercialScore - a.commercialScore);
  const selectedVerified = [];
  const nicheCounts = new Map();
  for (const item of verified) {
    const count = nicheCounts.get(item.nicheId) || 0;
    if (count >= maxVerifiedPerNiche || selectedVerified.length >= maxRows) continue;
    nicheCounts.set(item.nicheId, count + 1);
    selectedVerified.push(item);
  }

  const selectedIds = new Set(selectedVerified.map((x) => x.identityKey));
  const observationsByNiche = new Map();
  for (const item of evaluated.filter((x) => !selectedIds.has(x.identityKey)).sort((a,b) => b.trendScore - a.trendScore || b.commercialScore - a.commercialScore)) {
    const list = observationsByNiche.get(item.nicheId) || [];
    list.push(item);
    observationsByNiche.set(item.nicheId, list);
  }
  const observations = [];
  const nicheIds = [...observationsByNiche.keys()];
  while (selectedVerified.length + observations.length < maxRows && nicheIds.some((id) => (observationsByNiche.get(id) || []).length)) {
    for (const nicheId of nicheIds) {
      if (selectedVerified.length + observations.length >= maxRows) break;
      const next = (observationsByNiche.get(nicheId) || []).shift();
      if (next) observations.push(next);
    }
  }
  return { verified: selectedVerified, observations, persisted: [...selectedVerified, ...observations] };
}

function toPersistedRow(candidate = {}, priority = 1, radarRunId = null) {
  const t = candidate.temporal || {};
  const evidence = [{
    claim: `Evidência de tendência em ${candidate.marketplace || 'marketplace'}`,
    evidence_type: 'marketplace_trend_snapshot', provenance: candidate.provenance || null,
    source_url: candidate.permalink || candidate.sourceUrl || null, image_url: candidate.imageUrl || candidate.image_url || null,
    observed_at: candidate.observedAt || new Date().toISOString(),
    marketplace_identity: { itemId: candidate.itemId || null, productId: candidate.productId || candidate.asin || null, shopId: candidate.shopId || null },
    commercial_metrics: { sales: candidate.sales ?? null, ratingStar: candidate.ratingStar ?? candidate.rating ?? null, price: candidate.currentPrice ?? candidate.price ?? null,
      priceDiscountRate: candidate.discountPercent ?? null, commissionRate: candidate.commissionRate ?? candidate.commissionPercent ?? null, sellerCommissionRate: candidate.sellerCommissionRate ?? null },
    temporal_metrics: { previous_sales: t.previousSales ?? null, current_sales: t.currentSales ?? candidate.sales ?? null, sales_delta: t.salesDelta ?? null,
      sales_growth_pct: t.growthPct ?? null, sales_velocity: t.salesVelocity ?? null, previous_rank: t.previousRank ?? null,
      current_rank: t.currentRank ?? candidate.rank ?? null, rank_delta: t.rankDelta ?? null, window_hours: t.hours ?? null,
      velocity_status: t.salesVelocity !== null && t.salesVelocity !== undefined ? 'computed' : 'insufficient_history' },
    best_seller_flag: candidate.bestSeller === true || candidate.amazonBestSeller === true || candidate.marketplaceDemandEvidence?.type === 'BEST_SELLER',
    trending_flag: candidate.trending === true, native_trend_scope: candidate.scope || null,
    native_trend_keyword: candidate.marketplaceTrendEvidence?.keyword || null, trend_score: candidate.trendScore,
    trend_reasons: candidate.reasons || [], niche_id: candidate.nicheId, niche_label: candidate.nicheLabel,
    matched_product_term: candidate.matchedTerm, trend_strategy_version: TREND_STRATEGY_VERSION,
  }];
  return {
    radar_run_id: radarRunId, priority, product_term: candidate.productName || candidate.title || '', normalized_product_term: normalize(candidate.productName || candidate.title),
    category: candidate.nicheLabel || null, marketplace: candidate.marketplace || null,
    evidence_status: candidate.trending ? TREND_CONFIRMED_STATUS : TREND_OBSERVED_STATUS,
    source_count: Math.max(1, Number(candidate.crossStrongCount || 1)), commercial_score: candidate.commercialScore || 0, trend_score: candidate.trendScore || 0,
    score_breakdown: candidate.commercialBreakdown || {}, determining_reasons: [...new Set(candidate.reasons || [])],
    confidence: candidate.trending ? Math.min(99, Math.round(60 + candidate.trendScore * 0.35)) : 40,
    direct_evidence: evidence, inferred_signals: candidate.reasons || [], affiliate_potential: candidate.commercialScore >= 70 ? 'high' : 'medium',
    visual_content_potential: candidate.trending ? 'high' : 'medium', recommended_channel: null, recommended_format: null,
    match_status: 'pending', opportunity_id: null, is_focus: candidate.trending && priority <= 3, selection_decision: null,
  };
}

module.exports = {
  TREND_STRATEGY_VERSION, TREND_CONFIRMED_STATUS, TREND_OBSERVED_STATUS, MAX_SNAPSHOT_ROWS, MAX_VERIFIED_PER_NICHE, MIN_TREND_SCORE,
  HEAD_BLOCKERS, normalize, phraseIn, classifyCanonicalNiche, resolveIdentity, isAuthoritativeRank, nativeTrendScope,
  calculateTemporal, calculateTrendEvidence, evaluateCandidates, selectSnapshot, toPersistedRow,
};