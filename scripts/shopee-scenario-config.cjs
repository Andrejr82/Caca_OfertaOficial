'use strict';

// Shopee usa exclusivamente a matriz editorial canônica de produção.
const {
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_IDS,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
  assertEditorialScheduleValid,
} = require('./editorial-scenario-config.cjs');
const { buildCommercialScenarioMap } = require('./commercial-niche-scenario-bridge.cjs');

assertEditorialScheduleValid();

// Para os 7 nichos mapeados, termos/categorias/guardrails vêm da configuração
// comercial canônica. Cenários legacy_only permanecem exatamente como antes.
const SCENARIOS = buildCommercialScenarioMap(EDITORIAL_SCENARIOS, 'Shopee');

const SCENARIO_WINDOWS = Object.freeze(EDITORIAL_SCENARIO_IDS.map((id) => ({
  start: SCENARIOS[id].queueHour,
  end: SCENARIOS[id].queueHour + 1,
  scenarioId: id,
  label: SCENARIOS[id].name,
})));

function getCanonicalCycleScenarioId(startHour) {
  return getEditorialScenarioForDiscoveryHour(startHour)?.id || null;
}

function getScenarioWindow(currentHour) {
  const hour = ((Number(currentHour) % 24) + 24) % 24;
  const window = SCENARIO_WINDOWS.find((w) => hour >= w.start && hour < w.end);
  if (window) return window;
  const scenario = getEditorialScenarioForHour(hour);
  if (!scenario) return null;
  return { start: hour, end: hour + 1, scenarioId: scenario.id, label: scenario.name };
}

function getSaoPauloHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));
}

function getActiveScenario(currentHour) {
  const window = getScenarioWindow(currentHour);
  if (!window) return null;
  const scenario = SCENARIOS[window.scenarioId];
  if (!scenario) return null;
  return { ...scenario, name: window.label, schedule: window };
}

function getCycleScenario(startHour, durationHours = 4) {
  const hour = ((Number(startHour) % 24) + 24) % 24;
  const editorialScenario = getEditorialScenarioForDiscoveryHour(hour);
  if (!editorialScenario) return null;
  const scenarioId = editorialScenario.id;
  const scenario = SCENARIOS[scenarioId];
  const window = getScenarioWindow(scenario.queueHour);
  return {
    ...scenario,
    id: scenarioId,
    scenarioId,
    scenarioIds: [scenarioId],
    name: scenario.name || window?.label || scenarioId,
    schedule: window ? [window] : [],
    routingMode: 'editorial_queue',
    discoveryHour: hour,
    publicationHour: scenario.queueHour,
  };
}

function getCycleStartHour(currentHour) {
  const hour = ((Number(currentHour) % 24) + 24) % 24;
  return hour - (hour % 4);
}

function getRandomItems(array, count = 5) {
  if (!array || array.length === 0) return [];
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function normalizeProductTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesScenarioProduct(scenario, title) {
  const normalizedTitle = normalizeProductTitle(title);
  const containsTerm = (term) => {
    const normalizedTerm = normalizeProductTitle(term).replace(/[^a-z0-9]+/g, ' ').trim();
    return normalizedTerm && (` ${normalizedTitle.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${normalizedTerm} `);
  };
  const blocked = (scenario?.blockedProductTerms || []).some(containsTerm);
  if (blocked) return false;
  const allowedTerms = scenario?.allowedProductTerms || [];
  if (allowedTerms.length > 0) return allowedTerms.some(containsTerm);

  const stopwords = new Set(['para', 'com', 'sem', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'kit', 'tipo', 'mais']);
  const keywords = Array.isArray(scenario?.keywords) ? scenario.keywords : [];
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeProductTitle(keyword);
    if (!normalizedKeyword) return false;
    if (containsTerm(normalizedKeyword)) return true;
    const tokens = normalizedKeyword.split(' ').filter((token) => token.length >= 4 && !stopwords.has(token));
    if (!tokens.length) return false;
    const matches = tokens.filter((token) => containsTerm(token)).length;
    return matches >= Math.min(2, tokens.length);
  });
}

function extractProductModelKey(title) {
  const normalized = normalizeProductTitle(title);
  const model = normalized.match(/\b(?:[a-z]{2,}[a-z0-9-]*\d[a-z0-9-]*|[a-z]-\d{2,})\b/u)?.[0];
  return model ? `model:${model}` : null;
}

module.exports = {
  SCENARIOS,
  getSaoPauloHour,
  getActiveScenario,
  getCycleScenario,
  getCanonicalCycleScenarioId,
  getCycleStartHour,
  getScenarioWindow,
  SCENARIO_WINDOWS,
  getRandomItems,
  normalizeProductTitle,
  matchesScenarioProduct,
  extractProductModelKey
};
