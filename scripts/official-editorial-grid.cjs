'use strict';

const OFFICIAL_EDITORIAL_GRID_VERSION = 'official-editorial-grid/v1';
const OFFICIAL_EDITORIAL_TIMEZONE = 'America/Sao_Paulo';
const { EDITORIAL_SCENARIOS, EXPECTED_DISCOVERY_HOURS, getEditorialScenarioForDiscoveryHour } = require('./editorial-scenario-config.cjs');

function slot({ discoveryHour, publicationHour, scenarioId, title, focus, mode = 'api_search', isManualOnly = false, isDiscoveryEnabled = true, isPublicationEnabled = true, telegramIntroEnabled = true }) {
  return Object.freeze({
    discoveryHour,
    publicationHour,
    queueHour: publicationHour,
    scenarioId,
    title,
    focus,
    mode,
    isDiscoveryEnabled,
    isPublicationEnabled,
    isManualOnly,
    telegramIntroEnabled,
    timezone: OFFICIAL_EDITORIAL_TIMEZONE,
  });
}

const OFFICIAL_EDITORIAL_GRID = Object.freeze([
  ...EXPECTED_DISCOVERY_HOURS.map((discoveryHour) => {
    const scenario = getEditorialScenarioForDiscoveryHour(discoveryHour);
    return slot({
      discoveryHour,
      publicationHour: scenario.queueHour,
      scenarioId: scenario.id,
      title: scenario.name,
      focus: scenario.name,
    });
  }),
  slot({
    discoveryHour: 21,
    publicationHour: EDITORIAL_SCENARIOS.cupons_aprovados_editorial.queueHour,
    scenarioId: 'cupons_aprovados_editorial',
    title: EDITORIAL_SCENARIOS.cupons_aprovados_editorial.name,
    focus: EDITORIAL_SCENARIOS.cupons_aprovados_editorial.name,
    mode: 'manual_only',
    isManualOnly: true,
    isDiscoveryEnabled: false,
    telegramIntroEnabled: false,
  }),
]);

function normalizeHour(value) {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return null;
  return ((Math.trunc(hour) % 24) + 24) % 24;
}

function getOfficialGridSlotByDiscoveryHour(hour) {
  const normalized = normalizeHour(hour);
  return OFFICIAL_EDITORIAL_GRID.find((entry) => entry.discoveryHour === normalized) || null;
}

function getOfficialGridSlotByPublicationHour(hour) {
  const normalized = normalizeHour(hour);
  return OFFICIAL_EDITORIAL_GRID.find((entry) => entry.publicationHour === normalized) || null;
}

function getOfficialGridSlotByScenarioId(scenarioId) {
  return OFFICIAL_EDITORIAL_GRID.find((entry) => entry.scenarioId === String(scenarioId || '').trim()) || null;
}

function getOfficialScenarioForDiscoveryHour(hour) {
  return getOfficialGridSlotByDiscoveryHour(hour)?.scenarioId || null;
}

function getOfficialScenarioForPublicationHour(hour) {
  return getOfficialGridSlotByPublicationHour(hour)?.scenarioId || null;
}

function getOfficialDiscoveryHours() {
  return OFFICIAL_EDITORIAL_GRID.map((entry) => entry.discoveryHour);
}

function getOfficialPublicationHours() {
  return OFFICIAL_EDITORIAL_GRID.map((entry) => entry.publicationHour);
}

function validateOfficialGrid(grid = OFFICIAL_EDITORIAL_GRID) {
  const errors = [];
  const discoveryHours = new Set();
  const publicationHours = new Set();
  const scenarioIds = new Set();
  for (const entry of grid) {
    if (discoveryHours.has(entry.discoveryHour)) errors.push(`duplicate discoveryHour=${entry.discoveryHour}`);
    if (publicationHours.has(entry.publicationHour)) errors.push(`duplicate publicationHour=${entry.publicationHour}`);
    if (scenarioIds.has(entry.scenarioId)) errors.push(`duplicate scenarioId=${entry.scenarioId}`);
    discoveryHours.add(entry.discoveryHour);
    publicationHours.add(entry.publicationHour);
    scenarioIds.add(entry.scenarioId);
    if (entry.queueHour !== entry.publicationHour) errors.push(`queueHour mismatch for ${entry.scenarioId}`);
    if (entry.publicationHour !== entry.discoveryHour + 1) errors.push(`one-hour mismatch for ${entry.scenarioId}`);
    if (entry.timezone !== OFFICIAL_EDITORIAL_TIMEZONE) errors.push(`timezone mismatch for ${entry.scenarioId}`);
    if (entry.isManualOnly && entry.isDiscoveryEnabled) errors.push(`manual-only discovery enabled for ${entry.scenarioId}`);
  }
  return { valid: errors.length === 0, errors };
}

function compareRuntimeGridToOfficialGrid(runtimeRows = []) {
  const mismatches = [];
  const observed = Array.isArray(runtimeRows) ? runtimeRows : [];
  for (const expected of OFFICIAL_EDITORIAL_GRID) {
    const actual = observed.find((row) => normalizeHour(row?.discoveryHour) === expected.discoveryHour);
    if (!actual) {
      mismatches.push({ discoveryHour: expected.discoveryHour, expectedScenarioId: expected.scenarioId, reason: 'missing_runtime_row' });
      continue;
    }
    if (actual.resolvedScenarioId !== expected.scenarioId) {
      mismatches.push({ discoveryHour: expected.discoveryHour, expectedScenarioId: expected.scenarioId, actualScenarioId: actual.resolvedScenarioId || null, reason: 'scenario_mismatch' });
    }
    if (Number(actual.queueHour) !== expected.publicationHour) {
      mismatches.push({ discoveryHour: expected.discoveryHour, expectedQueueHour: expected.publicationHour, actualQueueHour: actual.queueHour ?? null, reason: 'queue_hour_mismatch' });
    }
  }
  return { officialGridVersion: OFFICIAL_EDITORIAL_GRID_VERSION, aligned: mismatches.length === 0, mismatches };
}

module.exports = {
  OFFICIAL_EDITORIAL_GRID_VERSION,
  OFFICIAL_EDITORIAL_TIMEZONE,
  OFFICIAL_EDITORIAL_GRID,
  getOfficialGridSlotByDiscoveryHour,
  getOfficialGridSlotByPublicationHour,
  getOfficialGridSlotByScenarioId,
  getOfficialScenarioForDiscoveryHour,
  getOfficialScenarioForPublicationHour,
  getOfficialDiscoveryHours,
  getOfficialPublicationHours,
  validateOfficialGrid,
  compareRuntimeGridToOfficialGrid,
};
