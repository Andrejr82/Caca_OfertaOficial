'use strict';

const {
  calculateCommercialOpportunityScoreVNext,
} = require('./commercial-opportunity-score-vnext.cjs');
const {
  classifyBenchmarkFamily,
} = require('./benchmark-peer-engine.cjs');

const RADAR_VNEXT_SELECTOR_VERSION = 'radar-vnext-selector/3';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nativeKey(candidate = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || 'unknown').trim().toLowerCase();
  const itemId = String(candidate.itemId || candidate.item_id || '').trim();
  const productId = String(candidate.productId || candidate.product_id || '').trim();
  const shopId = String(candidate.shopId || candidate.shop_id || '').trim();

  if (marketplace.includes('shopee') && itemId) {
    return `${marketplace}:shop:${shopId || 'unknown'}:item:${itemId}`;
  }
  if (productId) return `${marketplace}:product:${productId}`;
  if (itemId) return `${marketplace}:item:${itemId}`;

  return `${marketplace}:fallback:${String(candidate.productName || candidate.product_term || '').trim().toLowerCase()}:${candidate.currentPrice ?? candidate.price ?? ''}`;
}

function storeKey(candidate = {}) {
  const marketplace = String(candidate.marketplace || candidate.platform || 'unknown').trim().toLowerCase();
  const shopId = String(candidate.shopId || candidate.shop_id || candidate.sellerId || candidate.seller_id || '').trim();
  return shopId ? `${marketplace}:${shopId}` : null;
}

function classifyMacroFamily(candidate = {}) {
  const title = String(candidate.productName || candidate.product_term || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/camera|seguranca|wifi\s*360|ip66|lampada\s*(camera|espias?)|sirene/i.test(title)) return 'seguranca';
  if (/video\s*game|game\s*stick|console|jogos?\s*retro|r36s/i.test(title)) return 'games';
  if (/fone|headset|earphone|tws|bluetooth|som\s*portatil/i.test(title)) return 'audio';
  if (/ventilador|luminaria|lampada|mixer|triturador|processador|fatiador|ralador|escova\s*(de\s*)?limpeza|mop|aspirador|chaleira|garrafa|seladora|afia|dispenser|cozinha|limpeza|utilidades/i.test(title)) return 'casa_utilidades';
  if (/suporte|organizador|prateleira|porta\s*temperos|saco\s*a\s*vacuo|cabide|divisorias/i.test(title)) return 'organizacao';
  if (/parafusadeira|furadeira|ferramentas?|chave\s*catraca|trena|fita\s*dupla|adaptador|benjamim/i.test(title)) return 'ferramentas';
  if (/camiseta|bermuda|mochila|bolsa|relogio|smartwatch|acessorio/i.test(title)) return 'acessorios_vestuario';
  if (/livro|interativo|educacional|pedagogico|brinquedo/i.test(title)) return 'educacao_infantil';
  if (/protetor\s*solar|skincare|sabonete|clareador|creme|shampoo/i.test(title)) return 'beleza_saude';
  if (/areia|gato|pet|cachorro/i.test(title)) return 'pet';

  return 'geral';
}

function canonicalFunctionalFamily(candidate = {}) {
  const family = classifyBenchmarkFamily(candidate);
  return family.functionalFamily || 'item_isolado';
}

function canonicalMacroFamily(candidate = {}) {
  return classifyMacroFamily(candidate);
}

function diversityFamily(candidate = {}) {
  const functionalFamily = canonicalFunctionalFamily(candidate);
  const macroFamily = canonicalMacroFamily(candidate);
  const unclassified = functionalFamily === 'item_isolado';
  return {
    functionalFamily,
    macroFamily,
    diversityKey: unclassified ? null : functionalFamily,
  };
}

function deterministicSort(a, b) {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;

  const aComp = finite(a.score?.breakdown?.competitiveness) || 0;
  const bComp = finite(b.score?.breakdown?.competitiveness) || 0;
  if (bComp !== aComp) return bComp - aComp;

  const aDemand = finite(a.score?.breakdown?.demandAcceleration) || 0;
  const bDemand = finite(b.score?.breakdown?.demandAcceleration) || 0;
  if (bDemand !== aDemand) return bDemand - aDemand;

  const aPrice = finite(a.candidate.currentPrice ?? a.candidate.price) ?? Number.POSITIVE_INFINITY;
  const bPrice = finite(b.candidate.currentPrice ?? b.candidate.price) ?? Number.POSITIVE_INFINITY;
  if (aPrice !== bPrice) return aPrice - bPrice;

  return a.nativeKey.localeCompare(b.nativeKey);
}

function selectRadarVNext(candidates = [], options = {}) {
  const pool = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const maxProducts = Math.max(1, Math.min(100, Math.floor(Number(options.maxProducts) || 20)));
  const minScore = Math.max(0, Math.min(100, Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 0));
  const maxPerStore = Math.max(1, Math.floor(Number(options.maxPerStore) || 2));
  const maxPerFamily = Math.max(1, Math.floor(Number(options.maxPerFamily) || 2));
  const maxPerMacro = Math.max(1, Math.floor(Number(options.maxPerMacro) || 4));
  const scoreCandidate = typeof options.scoreCandidate === 'function'
    ? options.scoreCandidate
    : (candidate, context) => calculateCommercialOpportunityScoreVNext(candidate, context);

  const scored = pool.map((candidate) => {
    const extraContext = typeof options.contextForCandidate === 'function'
      ? (options.contextForCandidate(candidate) || {})
      : {};
    const score = scoreCandidate(candidate, { ...extraContext, pool });
    const family = diversityFamily(candidate);
    return {
      candidate,
      score,
      family,
      nativeKey: nativeKey(candidate),
      storeKey: storeKey(candidate),
    };
  }).filter((row) =>
    row.score
    && row.score.gates?.integrity?.passed !== false
    && Number(row.score.total) >= minScore,
  );

  scored.sort(deterministicSort);

  const selected = [];
  const seenNative = new Set();
  const storeCounts = new Map();
  const familyCounts = new Map();
  const macroCounts = new Map();

  const trySelect = (row, maxStore, maxFam, maxMac, fallbackMeta = null) => {
    if (selected.length >= maxProducts) return false;
    if (seenNative.has(row.nativeKey)) return false;

    const storeCount = row.storeKey ? (storeCounts.get(row.storeKey) || 0) : 0;
    if (row.storeKey && storeCount >= maxStore) return false;

    const familyKey = row.family.diversityKey;
    const familyCount = familyKey ? (familyCounts.get(familyKey) || 0) : 0;
    if (familyKey && familyCount >= maxFam) return false;

    const macroKey = row.family.macroFamily;
    const macroCount = macroKey ? (macroCounts.get(macroKey) || 0) : 0;
    if (macroKey && macroCount >= maxMac) return false;

    selected.push({
      ...row,
      selectorVersion: RADAR_VNEXT_SELECTOR_VERSION,
      ...(fallbackMeta || {}),
    });
    seenNative.add(row.nativeKey);
    if (row.storeKey) storeCounts.set(row.storeKey, storeCount + 1);
    if (familyKey) familyCounts.set(familyKey, familyCount + 1);
    if (macroKey) macroCounts.set(macroKey, macroCount + 1);
    return true;
  };

  // PASSO 1: Seleção padrão estrita por score respeitando todos os caps (maxFam=2, maxMac=4, maxStore=2)
  for (const row of scored) {
    if (selected.length >= maxProducts) break;
    trySelect(row, maxPerStore, maxPerFamily, maxPerMacro);
  }

  // PASSO 2: Se ainda faltarem vagas, buscar candidatos de macroFamilies não representadas ou sub-representadas (count < 4), mantendo maxFam=2
  if (selected.length < maxProducts) {
    for (const row of scored) {
      if (selected.length >= maxProducts) break;
      const macroKey = row.family.macroFamily;
      const currentMacroCount = macroKey ? (macroCounts.get(macroKey) || 0) : 0;
      if (currentMacroCount < maxPerMacro) {
        trySelect(row, maxPerStore, maxPerFamily, maxPerMacro, {
          isDiversityExpansion: true,
          expandedMacro: macroKey,
        });
      }
    }
  }

  // PASSO 3: Fallback gradual apenas se faltarem vagas no pool geral
  // 3.1 Permitir +1 na macroFamily (até 5) mantendo maxFam=2
  if (selected.length < maxProducts) {
    for (const row of scored) {
      if (selected.length >= maxProducts) break;
      trySelect(row, maxPerStore, maxPerFamily, maxPerMacro + 1, {
        isDiversityFallback: true,
        fallbackStage: 'macro_plus_1',
        capBroken: 'maxPerMacro:5',
      });
    }
  }

  // 3.2 Permitir +1 na functionalFamily (até 3) se ainda faltar vaga
  if (selected.length < maxProducts) {
    for (const row of scored) {
      if (selected.length >= maxProducts) break;
      trySelect(row, maxPerStore + 1, maxPerFamily + 1, maxPerMacro + 2, {
        isDiversityFallback: true,
        fallbackStage: 'family_plus_1',
        capBroken: 'maxPerFamily:3',
      });
    }
  }

  // 3.3 Fallback final irrestrito para garantir que nunca retorne 0 quando houver candidatos íntegros
  if (selected.length < maxProducts) {
    for (const row of scored) {
      if (selected.length >= maxProducts) break;
      if (!seenNative.has(row.nativeKey)) {
        selected.push({
          ...row,
          selectorVersion: RADAR_VNEXT_SELECTOR_VERSION,
          isDiversityFallback: true,
          fallbackStage: 'unconstrained',
          capBroken: 'full_fallback',
        });
        seenNative.add(row.nativeKey);
      }
    }
  }

  // Re-ordenação determinística final estrita por score
  selected.sort(deterministicSort);

  return selected.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

module.exports = {
  RADAR_VNEXT_SELECTOR_VERSION,
  nativeKey,
  diversityFamily,
  canonicalFunctionalFamily,
  canonicalMacroFamily,
  classifyMacroFamily,
  deterministicSort,
  selectRadarVNext,
};
