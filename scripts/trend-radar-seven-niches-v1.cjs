'use strict';

const TREND_STRATEGY_VERSION = 'trend-radar-seven-niches-v1';
const TREND_CONFIRMED_STATUS = 'verified';
const TREND_OBSERVED_STATUS = 'partial';
const MAX_SNAPSHOT_ROWS = 20;
const MAX_PER_NICHE = 3;
const MIN_TREND_SCORE = 55;

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NICHE_TERMS = Object.freeze({
  casa_cozinha_organizacao: ['air fryer','airfryer','cafeteira','liquidificador','mixer','batedeira','panela eletrica','jogo de panelas','aspirador vertical','mop','varal','faqueiro','aparelho de jantar','jogo de cama','toalha de banho','organizador','caixa organizadora','cesto organizador','forno eletrico','chaleira eletrica','grill','sanduicheira'],
  beleza: ['protetor solar','hidratante facial','serum','shampoo','condicionador','mascara capilar','tratamento capilar','oleo capilar','perfume','maquiagem','base facial','batom','rimel','escova secadora','secador','chapinha','prancha','modelador de cachos','aparador','maquina de cortar cabelo','escova alisadora','depilador'],
  moda: ['tenis masculino','tenis feminino','tenis casual','tenis corrida','camiseta masculina','camiseta feminina','vestido','calca jeans','jaqueta','bolsa','mochila','camisa','bermuda','moletom','calca social','relogio','oculos de sol'],
  eletrodomesticos: ['geladeira','refrigerador','maquina de lavar','lavadora de roupas','ar condicionado','micro ondas','microondas','fogao','cooktop','lava e seca','aspirador de po','freezer','lava loucas','frigobar','adega climatizada','coifa','depurador'],
  informatica: ['notebook','laptop','monitor','ssd','impressora','multifuncional','roteador','mini pc','computador','desktop','teclado','mouse','webcam','hd externo','scanner','nobreak','switch de rede'],
  ferramentas: ['parafusadeira','furadeira','lavadora de alta pressao','esmerilhadeira','serra circular','serra tico tico','maquina de solda','jogo de ferramentas','kit de ferramentas','kit de chaves','jogo de chaves','alicate','chave de impacto','trena','nivel laser','compressor','maleta de ferramentas','lixadeira','soprador'],
  pet: ['racao cachorro','racao para cachorro','racao caes','racao gato','racao para gato','areia para gato','areia sanitaria','granulado sanitario','tapete higienico','cama pet','caminha pet','fonte pet','bebedouro automatico','comedouro automatico','caixa de transporte','arranhador','caixa de areia','brinquedo pet'],
});

const NICHE_LABELS = Object.freeze({
  casa_cozinha_organizacao: 'Casa, Cozinha e Organização',
  beleza: 'Beleza e Cuidados Pessoais',
  moda: 'Moda e Calçados',
  eletrodomesticos: 'Eletrodomésticos',
  informatica: 'Informática',
  ferramentas: 'Ferramentas',
  pet: 'Pet',
});

function classifyNiche(candidate = {}) {
  const text = normalize([candidate.productName, candidate.title, candidate.category, candidate.categoryName].filter(Boolean).join(' '));
  if (!text) return null;
  let best = null;
  for (const [nicheId, terms] of Object.entries(NICHE_TERMS)) {
    const matches = terms.filter((term) => text.includes(normalize(term)));
    if (!matches.length) continue;
    const score = Math.max(...matches.map((term) => normalize(term).split(' ').length * 10 + normalize(term).length));
    if (!best || score > best.score) best = { nicheId, score };
  }
  return best?.nicheId || null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isAuthoritativeRank(candidate = {}) {
  const source = normalize(candidate.rankSource || candidate.rankingSource || candidate.provenance);
  if (candidate.marketplace === 'Amazon') return /best sellers|bestseller|sales rank|salesrank/.test(source) || candidate.amazonBestSeller === true;
  return candidate.rankAuthoritative !== false;
}

function calculateTemporal(candidate = {}, previous = null) {
  const currentSales = num(candidate.sales ?? candidate.sold_quantity);
  const previousSales = num(previous?.sales ?? previous?.sold_quantity);
  const currentRank = num(candidate.rank ?? candidate.currentRank ?? candidate.sourcePosition);
  const previousRank = num(previous?.rank ?? previous?.currentRank ?? previous?.sourcePosition);
  const observedAt = candidate.observedAt ? new Date(candidate.observedAt).getTime() : Date.now();
  const previousAt = previous?.observedAt ? new Date(previous.observedAt).getTime() : null;
  const hours = previousAt && observedAt > previousAt ? (observedAt - previousAt) / 3600000 : null;
  const salesDelta = currentSales !== null && previousSales !== null ? currentSales - previousSales : null;
  const salesVelocity = salesDelta !== null && hours && hours > 0 ? salesDelta / hours : null;
  const rankDelta = currentRank !== null && previousRank !== null && isAuthoritativeRank(candidate) ? previousRank - currentRank : null;
  return { currentSales, previousSales, salesDelta, salesVelocity, currentRank, previousRank, rankDelta, hours };
}

function calculateTrendScore(candidate = {}, previous = null) {
  const temporal = calculateTemporal(candidate, previous);
  if (temporal.salesVelocity === null && num(candidate.salesVelocity) !== null) temporal.salesVelocity = num(candidate.salesVelocity);
  if (temporal.salesDelta === null && num(candidate.salesDelta) !== null) temporal.salesDelta = num(candidate.salesDelta);
  const nativeTrend = candidate.nativeTrend === true || candidate.trending === true || candidate.marketplaceTrend === true;
  const bestSeller = candidate.bestSeller === true || candidate.isBestSeller === true || candidate.amazonBestSeller === true;
  const crossMarketplace = Math.max(1, Number(candidate.crossMarketplaceStrongEvidenceCount || 1));
  const observedAt = candidate.observedAt ? new Date(candidate.observedAt).getTime() : Date.now();
  const ageHours = Math.max(0, (Date.now() - observedAt) / 3600000);
  const freshness = ageHours <= 6 ? 10 : ageHours <= 24 ? 7 : ageHours <= 48 ? 4 : 0;

  let acceleration = 0;
  if (temporal.salesVelocity !== null && temporal.salesVelocity > 0) {
    acceleration = temporal.salesDelta !== null && temporal.salesDelta >= 100
      ? 30
      : Math.min(30, 10 + Math.log10(1 + temporal.salesVelocity) * 12);
  }
  if (temporal.rankDelta !== null && temporal.rankDelta > 0) acceleration = Math.max(acceleration, Math.min(30, 12 + temporal.rankDelta * 1.5));

  const native = nativeTrend ? 25 : 0;
  const ranking = bestSeller ? 15 : (temporal.currentRank !== null && isAuthoritativeRank(candidate) && temporal.currentRank <= 20 ? 10 : 0);
  const movement = temporal.rankDelta !== null && temporal.rankDelta > 0 ? Math.min(10, temporal.rankDelta) : 0;
  const cross = crossMarketplace >= 2 ? Math.min(10, (crossMarketplace - 1) * 5) : 0;
  const convergence = nativeTrend && bestSeller ? 10 : 0;
  const total = Math.round(Math.min(100, acceleration + native + ranking + movement + cross + convergence + freshness) * 10) / 10;
  const strongEvidence = nativeTrend || (temporal.salesVelocity !== null && temporal.salesVelocity > 0) || (temporal.rankDelta !== null && temporal.rankDelta >= 4);
  const trending = strongEvidence && total >= MIN_TREND_SCORE;

  const reasons = [];
  if (nativeTrend) reasons.push('sinal_nativo_tendencia');
  if (temporal.salesVelocity !== null && temporal.salesVelocity > 0) reasons.push(`velocidade_vendas_${temporal.salesVelocity.toFixed(2)}_por_hora`);
  if (temporal.rankDelta !== null && temporal.rankDelta > 0) reasons.push(`subida_ranking_${temporal.previousRank}_para_${temporal.currentRank}`);
  if (bestSeller) reasons.push('best_seller_confirmado');
  if (crossMarketplace >= 2) reasons.push(`confirmacao_${crossMarketplace}_marketplaces`);

  return {
    trendScore: total,
    trending,
    strongEvidence,
    reasons,
    temporal,
    breakdown: { acceleration: Math.round(acceleration * 10) / 10, native, ranking, movement, cross, convergence, freshness },
  };
}

function commercialScoreOf(candidate = {}) {
  const n = num(candidate.commercialScore ?? candidate.commercial_score ?? candidate.score);
  return n === null ? 0 : n;
}

function evaluateCandidate(candidate = {}, previous = null) {
  const nicheId = candidate.nicheId || classifyNiche(candidate);
  if (!nicheId) return { accepted: false, reason: 'outside_seven_niches' };
  const trend = calculateTrendScore(candidate, previous);
  return {
    accepted: trend.trending,
    nicheId,
    nicheLabel: NICHE_LABELS[nicheId],
    commercialScore: commercialScoreOf(candidate),
    ...trend,
  };
}

function buildTrendRadarSelection(candidates = [], previousByIdentity = new Map(), options = {}) {
  const maxRows = Math.min(MAX_SNAPSHOT_ROWS, Math.max(1, Number(options.maxRows || MAX_SNAPSHOT_ROWS)));
  const maxPerNiche = Math.max(1, Number(options.maxPerNiche || MAX_PER_NICHE));
  const evaluated = [];
  const observations = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const identity = String(candidate.identityKey || candidate.itemId || candidate.productId || candidate.asin || candidate.productName || candidate.title || '');
    const previous = previousByIdentity instanceof Map ? previousByIdentity.get(identity) : null;
    const result = evaluateCandidate(candidate, previous);
    if (!result.nicheId) continue;
    const merged = { ...candidate, ...result, identityKey: identity };
    observations.push(merged);
    if (result.accepted) evaluated.push(merged);
  }
  evaluated.sort((a, b) => b.trendScore - a.trendScore || b.commercialScore - a.commercialScore);
  const counts = new Map();
  const selected = [];
  for (const item of evaluated) {
    if (selected.length >= maxRows) break;
    const count = counts.get(item.nicheId) || 0;
    if (count >= maxPerNiche) continue;
    counts.set(item.nicheId, count + 1);
    selected.push(item);
  }
  return { selected, observations, countsByNiche: Object.fromEntries(counts) };
}

function toPersistedRow(candidate, priority, radarRunId) {
  const trendScore = num(candidate.trendScore) ?? 0;
  const trending = candidate.trending === true;
  const directEvidence = Array.isArray(candidate.direct_evidence) ? [...candidate.direct_evidence] : [];
  const first = directEvidence[0] && typeof directEvidence[0] === 'object' ? directEvidence[0] : {};
  directEvidence[0] = {
    ...first,
    trending_flag: trending,
    trend_score: trendScore,
    trend_strategy_version: TREND_STRATEGY_VERSION,
    trend_reasons: candidate.reasons || [],
    niche_id: candidate.nicheId,
    niche_label: candidate.nicheLabel,
    temporal_metrics: {
      ...(first.temporal_metrics || {}),
      previous_sales: candidate.temporal?.previousSales ?? null,
      current_sales: candidate.temporal?.currentSales ?? null,
      sales_delta: candidate.temporal?.salesDelta ?? null,
      sales_velocity: candidate.temporal?.salesVelocity ?? null,
      previous_rank: candidate.temporal?.previousRank ?? null,
      current_rank: candidate.temporal?.currentRank ?? null,
      rank_delta: candidate.temporal?.rankDelta ?? null,
      velocity_status: candidate.temporal?.salesVelocity === null ? 'insufficient_history' : 'computed',
    },
  };
  return {
    radar_run_id: radarRunId,
    priority,
    product_term: candidate.productName || candidate.title,
    normalized_product_term: normalize(candidate.productName || candidate.title),
    category: candidate.nicheLabel,
    marketplace: candidate.marketplace || null,
    evidence_status: trending ? TREND_CONFIRMED_STATUS : TREND_OBSERVED_STATUS,
    source_count: Math.max(1, Number(candidate.crossMarketplaceCount || candidate.sourceCount || 1)),
    commercial_score: commercialScoreOf(candidate),
    trend_score: trendScore,
    confidence: Math.max(0, Math.min(100, Math.round(trendScore))),
    direct_evidence: directEvidence,
    score_breakdown: candidate.breakdown || {},
    determining_reasons: candidate.reasons || [],
    inferred_signals: [],
    affiliate_potential: 'unassessed',
    visual_content_potential: 'unassessed',
    recommended_channel: null,
    recommended_format: null,
    match_status: 'pending',
    opportunity_id: null,
    is_focus: priority <= 3,
  };
}

module.exports = {
  TREND_STRATEGY_VERSION,
  TREND_CONFIRMED_STATUS,
  TREND_OBSERVED_STATUS,
  MAX_SNAPSHOT_ROWS,
  MAX_PER_NICHE,
  MIN_TREND_SCORE,
  NICHE_TERMS,
  NICHE_LABELS,
  normalize,
  classifyNiche,
  calculateTemporal,
  calculateTrendScore,
  evaluateCandidate,
  buildTrendRadarSelection,
  toPersistedRow,
};
