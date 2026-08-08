'use strict';

const {
  EDITORIAL_SCHEDULE_TIMEZONE,
  getEditorialScenarioById,
  getScenarioScheduleAudit,
} = require('./editorial-scenario-config.cjs');
const {
  OFFICIAL_EDITORIAL_GRID_VERSION,
  OFFICIAL_EDITORIAL_TIMEZONE,
  getOfficialGridSlotByDiscoveryHour,
  getOfficialGridSlotByScenarioId,
} = require('./official-editorial-grid.cjs');

const DISCOVERY_SCENARIO_RUNTIME_CONTRACT_VERSION = 'pmav5.discovery-scenario-runtime/v1';
const MARKETPLACE_SCENARIO_CONTRACT_VERSION = 'pmav5.marketplace-scenario/v1';
const SCHEDULER_SOURCE = 'oracle-node-cron';
const SHOPEE_BROAD_API_CATEGORIES = Object.freeze([
  100001,
  100009,
  100010,
  100013,
  100636,
  100637,
  100644,
]);
const GENERIC_PROMO_KEYWORDS = Object.freeze([
  'oferta',
  'desconto',
  'promoção',
  'promocao',
  'mais vendido',
  'frete grátis',
  'frete gratis',
  'cupom',
]);

function normalizeHour(value) {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return null;
  return ((Math.trunc(hour) % 24) + 24) % 24;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function uniqueNumbers(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isFinite))];
}

function getScheduleWindow(scheduleAudit, scenarioId, queueHour) {
  const entry = scenarioId ? scheduleAudit.scenarios[scenarioId] : null;
  return entry?.scheduleWindow || {
    start: Number.isFinite(Number(queueHour)) ? Number(queueHour) : null,
    end: Number.isFinite(Number(queueHour)) ? Number(queueHour) + 1 : null,
    scenarioIds: [],
  };
}

function createFallbackPolicy(scenario, marketplace, contract) {
  if (!scenario || !contract) return { mode: 'unknown', broadSearchAllowed: false };
  if (marketplace === 'Mercado Livre') {
    return { mode: 'official-domain-then-catalog', broadSearchAllowed: false };
  }
  if (marketplace === 'Amazon') {
    return {
      mode: contract.browseNodeIds?.length ? 'browse-node-and-keyword' : 'keyword-only',
      broadSearchAllowed: false,
    };
  }
  return {
    mode: contract.apiCategories?.length ? 'native-category-and-keyword' : 'keyword-only',
    broadSearchAllowed: false,
  };
}

function getNativeContractKind(marketplace) {
  if (marketplace === 'Shopee') return 'shopee';
  if (marketplace === 'Amazon') return 'amazon';
  if (marketplace === 'Mercado Livre') return 'mercado_livre';
  return 'unknown';
}

function createDiscoveryScenarioRuntimeContract({
  discoveryHour,
  timezone = EDITORIAL_SCHEDULE_TIMEZONE,
  schedulerSource = SCHEDULER_SOURCE,
  plannedScenarioId = null,
  resolvedScenarioId = null,
  marketplace,
  marketplaceContract = null,
  effectiveMercadoLivreDomains = [],
  coverageStatus = 'pending',
} = {}) {
  const scheduleAudit = getScenarioScheduleAudit();
  const normalizedHour = normalizeHour(discoveryHour);
  const plannedScenario = getEditorialScenarioById(plannedScenarioId);
  const resolvedScenario = getEditorialScenarioById(resolvedScenarioId) || plannedScenario;
  const contract = marketplaceContract && typeof marketplaceContract === 'object' ? marketplaceContract : null;
  const scenarioId = resolvedScenario?.id || resolvedScenarioId || plannedScenario?.id || plannedScenarioId || null;
  const officialGridSlot = getOfficialGridSlotByScenarioId(scenarioId)
    || getOfficialGridSlotByDiscoveryHour(normalizedHour);
  const publicationHour = officialGridSlot?.publicationHour
    ?? (Number.isFinite(Number(resolvedScenario?.publicationHour)) ? Number(resolvedScenario.publicationHour) : null)
    ?? (Number.isFinite(Number(contract?.publicationHour)) ? Number(contract.publicationHour) : null)
    ?? (Number.isFinite(Number(resolvedScenario?.queueHour)) ? Number(resolvedScenario.queueHour) : null)
    ?? (Number.isFinite(Number(contract?.queueHour)) ? Number(contract.queueHour) : null);
  const queueHour = publicationHour;
  const effectiveKeywords = uniqueStrings(contract?.keywords || contract?.terms || resolvedScenario?.keywords);
  const rawApiCategories = uniqueNumbers(contract?.apiCategories || contract?.categories || resolvedScenario?.apiCategories);
  const rawBrowseNodeIds = uniqueStrings(contract?.browseNodeIds || resolvedScenario?.amazonBrowseNodes);
  const rawDomains = uniqueStrings(
    (Array.isArray(effectiveMercadoLivreDomains) && effectiveMercadoLivreDomains.length > 0)
      ? effectiveMercadoLivreDomains
      : contract?.mercadoLivreDomains,
  );
  const isAmazon = marketplace === 'Amazon';
  const isShopee = marketplace === 'Shopee';
  const isMercadoLivre = marketplace === 'Mercado Livre';
  const effectiveApiCategories = isShopee ? rawApiCategories : [];
  const effectiveBrowseNodeIds = isAmazon ? rawBrowseNodeIds : [];
  const effectiveDomains = isMercadoLivre ? rawDomains : [];
  const hasHourCollision = Boolean(scheduleAudit.scenarios[scenarioId]?.hasHourCollision);
  const isManualOnly = resolvedScenario?.discoveryMode === 'manual_only';
  const isOrphanScenario = Boolean(scheduleAudit.scenarios[scenarioId]?.isOrphanScenario);
  const expectedOfficialSlot = getOfficialGridSlotByDiscoveryHour(normalizedHour);
  const isOfficialGridAligned = Boolean(officialGridSlot && (!expectedOfficialSlot || expectedOfficialSlot.scenarioId === scenarioId));
  const missingAmazonBrowseNodes = isAmazon && effectiveBrowseNodeIds.length === 0;
  const usesGenericPromoKeywords = effectiveKeywords.some((keyword) => GENERIC_PROMO_KEYWORDS.includes(keyword.toLocaleLowerCase('pt-BR')));
  const usesBroadShopeeCategory = isShopee && effectiveApiCategories.some((category) => SHOPEE_BROAD_API_CATEGORIES.includes(Number(category)));
  const contractIncomplete = !scenarioId
    || !contract
    || effectiveKeywords.length === 0
    || (isAmazon && missingAmazonBrowseNodes)
    || (isShopee && effectiveApiCategories.length === 0)
    || (marketplace === 'Mercado Livre' && effectiveKeywords.length === 0);

  return {
    contractVersion: DISCOVERY_SCENARIO_RUNTIME_CONTRACT_VERSION,
    officialGridVersion: OFFICIAL_EDITORIAL_GRID_VERSION,
    discoveryHour: normalizedHour,
    publicationHour,
    timezone: String(timezone || OFFICIAL_EDITORIAL_TIMEZONE || EDITORIAL_SCHEDULE_TIMEZONE),
    schedulerSource: String(schedulerSource || SCHEDULER_SOURCE),
    plannedScenarioId: plannedScenario?.id || plannedScenarioId || null,
    resolvedScenarioId: resolvedScenario?.id || resolvedScenarioId || null,
    scenarioTitle: resolvedScenario?.name || contract?.name || null,
    scenarioMode: resolvedScenario?.discoveryMode || contract?.discoveryMode || null,
    scenarioPriority: resolvedScenario?.priority || contract?.priority || null,
    queueHour,
    isOfficialGridAligned,
    officialGridSlot: officialGridSlot || null,
    gridSource: 'official-editorial-grid',
    scheduleWindow: getScheduleWindow(scheduleAudit, scenarioId, queueHour),
    marketplace: String(marketplace || 'unknown'),
    marketplaceContractVersion: String(contract?.contractVersion || MARKETPLACE_SCENARIO_CONTRACT_VERSION),
    effectiveKeywords,
    effectiveApiCategories,
    effectiveBrowseNodeIds,
    effectiveMercadoLivreDomains: effectiveDomains,
    nativeContract: {
      kind: getNativeContractKind(marketplace),
      shopeeApiCategories: isShopee ? rawApiCategories : [],
      amazonBrowseNodeIds: isAmazon ? rawBrowseNodeIds : [],
      mercadoLivreDomains: isMercadoLivre ? rawDomains : [],
      rawSource: {
        type: contract?.source || null,
        contractVersion: contract?.contractVersion || null,
      },
    },
    priceMax: Number.isFinite(Number(resolvedScenario?.maxPriceThreshold))
      ? Number(resolvedScenario.maxPriceThreshold)
      : (Number.isFinite(Number(contract?.maxPriceThreshold)) ? Number(contract.maxPriceThreshold) : null),
    maxPagesPerKeyword: Number.isFinite(Number(resolvedScenario?.maxPagesPerKeyword))
      ? Number(resolvedScenario.maxPagesPerKeyword)
      : (Number.isFinite(Number(contract?.maxPagesPerKeyword)) ? Number(contract.maxPagesPerKeyword) : null),
    allowedProductTerms: uniqueStrings(contract?.allowedProductTerms || resolvedScenario?.allowedProductTerms),
    blockedProductTerms: uniqueStrings(contract?.blockedProductTerms || resolvedScenario?.blockedProductTerms),
    fallbackPolicy: createFallbackPolicy(resolvedScenario, marketplace, contract),
    coverageStatus: String(coverageStatus || 'pending'),
    flags: {
      hasHourCollision,
      isOrphanScenario,
      isManualOnly,
      missingAmazonBrowseNodes,
      usesGenericPromoKeywords,
      usesBroadShopeeCategory,
      contractIncomplete,
      coverageInsufficient: coverageStatus !== 'completed' && coverageStatus !== 'pending',
    },
  };
}

module.exports = {
  DISCOVERY_SCENARIO_RUNTIME_CONTRACT_VERSION,
  MARKETPLACE_SCENARIO_CONTRACT_VERSION,
  GENERIC_PROMO_KEYWORDS,
  SHOPEE_BROAD_API_CATEGORIES,
  createDiscoveryScenarioRuntimeContract,
};
