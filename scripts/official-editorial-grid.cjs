'use strict';

const OFFICIAL_EDITORIAL_GRID_VERSION = 'official-editorial-grid/v1';
const OFFICIAL_EDITORIAL_TIMEZONE = 'America/Sao_Paulo';

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
  slot({ discoveryHour: 6, publicationHour: 7, scenarioId: 'casa_cozinha_editorial', title: 'Casa e Cozinha', focus: 'cama, mesa, banho e eletroportáteis' }),
  slot({ discoveryHour: 7, publicationHour: 8, scenarioId: 'organizacao_editorial', title: 'Organização', focus: 'organização doméstica e utilidades' }),
  slot({ discoveryHour: 8, publicationHour: 9, scenarioId: 'ferramentas_editorial', title: 'Ferramentas', focus: 'ferramentas manuais e elétricas' }),
  slot({ discoveryHour: 9, publicationHour: 10, scenarioId: 'informatica_editorial', title: 'Informática', focus: 'computadores, periféricos e conectividade' }),
  slot({ discoveryHour: 10, publicationHour: 11, scenarioId: 'celulares_editorial', title: 'Celulares', focus: 'smartphones e acessórios aderentes' }),
  slot({ discoveryHour: 11, publicationHour: 12, scenarioId: 'beleza_editorial', title: 'Beleza', focus: 'cuidados pessoais, cabelo e cosméticos' }),
  slot({ discoveryHour: 12, publicationHour: 13, scenarioId: 'moda_editorial', title: 'Moda', focus: 'roupas, calçados e acessórios' }),
  slot({ discoveryHour: 13, publicationHour: 14, scenarioId: 'esporte_editorial', title: 'Esporte', focus: 'fitness, treino e equipamentos esportivos' }),
  slot({ discoveryHour: 14, publicationHour: 15, scenarioId: 'pet_editorial', title: 'Pet', focus: 'alimentação, higiene e acessórios pet' }),
  slot({ discoveryHour: 15, publicationHour: 16, scenarioId: 'automotivo_editorial', title: 'Automotivo', focus: 'acessórios, ferramentas, som, manutenção, limpeza e organização automotiva' }),
  slot({ discoveryHour: 16, publicationHour: 17, scenarioId: 'games_editorial', title: 'Games', focus: 'consoles, jogos e periféricos gamers' }),
  slot({ discoveryHour: 17, publicationHour: 18, scenarioId: 'tv_audio_editorial', title: 'TV e Áudio', focus: 'televisores, áudio e entretenimento' }),
  slot({ discoveryHour: 18, publicationHour: 19, scenarioId: 'eletrodomesticos_editorial', title: 'Eletrodomésticos', focus: 'linha branca e eletrodomésticos de grande porte' }),
  slot({ discoveryHour: 19, publicationHour: 20, scenarioId: 'moveis_editorial', title: 'Móveis', focus: 'móveis, quarto, sala e escritório' }),
  slot({ discoveryHour: 20, publicationHour: 21, scenarioId: 'grandes_ofertas_editorial', title: 'Grandes Ofertas', focus: 'descontos e promoções de alto impacto', mode: 'api_search' }),
  slot({ discoveryHour: 21, publicationHour: 22, scenarioId: 'cupons_aprovados_editorial', title: 'Cupons Aprovados', focus: 'cupons aprovados e códigos promocionais', mode: 'manual_only', isManualOnly: true, isDiscoveryEnabled: false, telegramIntroEnabled: false }),
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
