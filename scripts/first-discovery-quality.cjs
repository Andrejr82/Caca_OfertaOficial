'use strict';

const { getCommercialNiche } = require('./commercial-niche-config.cjs');

const FIRST_DISCOVERY_QUALITY_VERSION = 'discovery-retrieval-quality/v1';

const FAMILY_TERMS_BY_NICHE = Object.freeze({
  casa_cozinha_organizacao: Object.freeze({
    cozinha_eletroportateis: Object.freeze(['air fryer', 'cafeteira', 'liquidificador', 'panela eletrica', 'batedeira', 'mixer', 'sanduicheira', 'forno eletrico', 'chaleira eletrica', 'grill']),
    cozinha_utilidades: Object.freeze(['jogo de panelas', 'aparelho de jantar', 'faqueiro']),
    cama_banho: Object.freeze(['jogo de cama', 'toalha de banho']),
    organizacao: Object.freeze(['organizador de cozinha', 'organizador de gaveta', 'organizador de armario', 'caixa organizadora', 'cesto organizador']),
    limpeza_lavanderia: Object.freeze(['aspirador vertical', 'mop', 'varal']),
  }),
  beleza: Object.freeze({
    skincare: Object.freeze(['protetor solar', 'hidratante facial', 'serum']),
    cabelo_tratamento: Object.freeze(['shampoo', 'tratamento capilar']),
    fragrancia: Object.freeze(['perfume']),
    maquiagem: Object.freeze(['maquiagem']),
    hair_tools: Object.freeze(['escova secadora', 'secador', 'chapinha', 'modelador', 'escova alisadora']),
    grooming: Object.freeze(['aparador', 'maquina de cortar cabelo', 'depilador']),
  }),
  moda: Object.freeze({
    calcados: Object.freeze(['tenis masculino', 'tenis feminino', 'tenis casual']),
    tops: Object.freeze(['camiseta masculina', 'camisa', 'moletom']),
    feminino: Object.freeze(['vestido']),
    bottoms: Object.freeze(['calca jeans', 'bermuda', 'calca social']),
    outerwear: Object.freeze(['jaqueta']),
    acessorios: Object.freeze(['bolsa', 'mochila', 'relogio', 'oculos']),
  }),
  eletrodomesticos: Object.freeze({
    refrigeracao: Object.freeze(['geladeira', 'freezer', 'frigobar', 'adega climatizada']),
    lavanderia: Object.freeze(['maquina de lavar', 'lava e seca']),
    climatizacao: Object.freeze(['ar condicionado']),
    cozinha_grande: Object.freeze(['micro-ondas', 'fogao', 'cooktop', 'lava-loucas', 'coifa', 'depurador']),
    limpeza: Object.freeze(['aspirador']),
  }),
  informatica: Object.freeze({
    computadores: Object.freeze(['notebook', 'mini pc', 'computador', 'desktop']),
    display: Object.freeze(['monitor']),
    armazenamento: Object.freeze(['ssd', 'hd externo']),
    impressao: Object.freeze(['impressora', 'scanner']),
    rede: Object.freeze(['roteador', 'switch de rede']),
    perifericos: Object.freeze(['teclado', 'mouse', 'webcam']),
    energia: Object.freeze(['nobreak']),
  }),
  ferramentas: Object.freeze({
    perfuracao_fixacao: Object.freeze(['parafusadeira', 'furadeira', 'chave de impacto']),
    corte_desbaste: Object.freeze(['esmerilhadeira', 'serra', 'lixadeira']),
    limpeza_pressao: Object.freeze(['lavadora de alta pressao', 'soprador']),
    solda_compressao: Object.freeze(['maquina de solda', 'compressor']),
    kits_medicao: Object.freeze(['jogo de ferramentas', 'kit de chaves', 'alicate', 'trena', 'nivel laser', 'maleta de ferramentas']),
  }),
  pet: Object.freeze({
    alimentacao: Object.freeze(['racao cachorro', 'racao gato']),
    higiene: Object.freeze(['areia para gato', 'tapete higienico', 'caixa de areia']),
    conforto: Object.freeze(['cama pet']),
    hidratacao_alimentadores: Object.freeze(['fonte pet', 'bebedouro automatico', 'comedouro automatico']),
    transporte: Object.freeze(['caixa de transporte']),
    enriquecimento: Object.freeze(['arranhador', 'brinquedo pet']),
  }),
});

const QUERY_OVERRIDES_BY_NICHE = Object.freeze({
  casa_cozinha_organizacao: Object.freeze({
    mixer: Object.freeze(['mixer de cozinha', 'mixer 3 em 1 cozinha']),
    varal: Object.freeze(['varal de chao para roupas', 'varal dobravel para roupas']),
    'organizador de cozinha': Object.freeze(['organizador de cozinha bancada', 'organizador de cozinha armario']),
  }),
  beleza: Object.freeze({
    perfume: Object.freeze(['perfume feminino eau de parfum', 'perfume masculino eau de parfum']),
    maquiagem: Object.freeze(['base facial maquiagem', 'batom maquiagem', 'mascara de cilios']),
    modelador: Object.freeze(['modelador de cachos cabelo', 'babyliss modelador de cachos']),
    aparador: Object.freeze(['aparador de pelos', 'aparador barba cabelo']),
    depilador: Object.freeze(['depilador eletrico feminino', 'depilador corporal eletrico']),
  }),
  informatica: Object.freeze({
    teclado: Object.freeze(['teclado mecanico', 'teclado sem fio', 'teclado gamer']),
    mouse: Object.freeze(['mouse sem fio', 'mouse gamer']),
    webcam: Object.freeze(['webcam full hd 1080p']),
    impressora: Object.freeze(['impressora multifuncional', 'impressora ecotank']),
    computador: Object.freeze(['computador desktop completo', 'pc desktop']),
    monitor: Object.freeze(['monitor full hd', 'monitor gamer']),
  }),
  moda: Object.freeze({
    bolsa: Object.freeze(['bolsa feminina transversal', 'bolsa feminina casual']),
    relogio: Object.freeze(['relogio masculino', 'relogio feminino']),
    oculos: Object.freeze(['oculos de sol adulto']),
  }),
  eletrodomesticos: Object.freeze({
    geladeira: Object.freeze(['geladeira frost free']),
    'maquina de lavar': Object.freeze(['maquina de lavar roupas']),
    aspirador: Object.freeze(['aspirador de po']),
  }),
  ferramentas: Object.freeze({
    parafusadeira: Object.freeze(['parafusadeira a bateria']),
    furadeira: Object.freeze(['furadeira de impacto']),
    serra: Object.freeze(['serra circular', 'serra tico tico']),
  }),
  pet: Object.freeze({
    'racao cachorro': Object.freeze(['racao para cachorro']),
    'racao gato': Object.freeze(['racao para gato']),
    'brinquedo pet': Object.freeze(['brinquedo para cachorro', 'brinquedo para gato']),
  }),
});

const NEGATIVE_HINTS_BY_NICHE = Object.freeze({
  casa_cozinha_organizacao: Object.freeze({
    mixer: Object.freeze(['shakeira', 'fitness', 'caneca mixer', 'copo mixer']),
    varal: Object.freeze(['bandeirinha', 'decorativo', 'corda varal', 'mini varal']),
  }),
  beleza: Object.freeze({
    perfume: Object.freeze(['cachorro', 'caes', 'gato', 'pet']),
    shampoo: Object.freeze(['cachorro', 'caes', 'gato', 'pet']),
    modelador: Object.freeze(['donut', 'donuts', 'padaria', 'alimento', 'arroz']),
    aparador: Object.freeze(['livro', 'livros', 'bookend']),
    maquiagem: Object.freeze(['descartavel', 'aplicador descartavel', 'pincel descartavel']),
  }),
  informatica: Object.freeze({
    teclado: Object.freeze(['teclado para notebook', 'teclado notebook', 'teclado coletor', 'teclado pda', 'reposicao', 'replacement', 'interno']),
    impressora: Object.freeze(['capa para impressora', 'caneta 3d', 'caneta 3d impressora']),
    mouse: Object.freeze(['mouse pad', 'mousepad']),
    webcam: Object.freeze(['tampa webcam', 'protetor webcam', 'suporte webcam', 'tampa de protecao']),
  }),
});

const TARGETS_BY_AFFINITY = Object.freeze({
  3: Object.freeze({ minStrongCandidates: 18, targetStrongCandidates: 24, minDistinctFamilies: 4, minCoreFamilies: 3, minQuerySuccessRate: 0.65, minRelevanceYield: 0.20 }),
  2: Object.freeze({ minStrongCandidates: 12, targetStrongCandidates: 18, minDistinctFamilies: 3, minCoreFamilies: 2, minQuerySuccessRate: 0.60, minRelevanceYield: 0.18 }),
  1: Object.freeze({ minStrongCandidates: 8, targetStrongCandidates: 12, minDistinctFamilies: 2, minCoreFamilies: 2, minQuerySuccessRate: 0.55, minRelevanceYield: 0.15 }),
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function findFamily(nicheId, term) {
  const normalizedTerm = normalizeText(term);
  const families = FAMILY_TERMS_BY_NICHE[nicheId] || {};
  for (const [family, terms] of Object.entries(families)) {
    if (terms.some((candidate) => normalizeText(candidate) === normalizedTerm)) return family;
  }
  return 'opportunity';
}

function getQueryOverrides(nicheId, term) {
  const normalizedTerm = normalizeText(term);
  const overrides = QUERY_OVERRIDES_BY_NICHE[nicheId] || {};
  for (const [key, queries] of Object.entries(overrides)) {
    if (normalizeText(key) === normalizedTerm) return [...queries];
  }
  return [term];
}

function getNegativeHints(nicheId, term) {
  const normalizedTerm = normalizeText(term);
  const hints = NEGATIVE_HINTS_BY_NICHE[nicheId] || {};
  for (const [key, patterns] of Object.entries(hints)) {
    if (normalizeText(key) === normalizedTerm) return [...patterns];
  }
  return [];
}

function getTargets(affinity = 2, overrides = {}) {
  const base = TARGETS_BY_AFFINITY[Number(affinity)] || TARGETS_BY_AFFINITY[2];
  return Object.freeze({ ...base, ...overrides });
}

function buildMarketplaceStrategy(marketplace, affinity, rules = {}, contract = {}) {
  const maxPagesPerTerm = Math.max(1, Math.floor(toFiniteNumber(rules.maxPagesPerTerm, affinity === 3 ? 2 : 1)));
  const candidateLimit = Math.max(1, Math.floor(toFiniteNumber(rules.candidateLimit, affinity === 3 ? 10 : 7)));

  if (marketplace === 'Amazon') {
    return Object.freeze({
      mode: 'browse-node-intent-search',
      nativeFirst: true,
      browseNodes: Object.freeze([...(contract.amazonBrowseNodes || [])]),
      initialPagesPerIntent: maxPagesPerTerm,
      initialCandidateBudget: Math.max(20, candidateLimit * 3),
      rankingSignals: Object.freeze(['browse_node_relevance', 'rating', 'review_count', 'real_discount', 'coupon', 'prime', 'source_position']),
    });
  }

  if (marketplace === 'Mercado Livre') {
    return Object.freeze({
      mode: 'official-domain-then-catalog',
      nativeFirst: true,
      requireNativeDomainEvidence: true,
      useBestSellerSignal: true,
      initialPagesPerIntent: maxPagesPerTerm,
      initialCandidateBudget: Math.max(30, candidateLimit * 4),
      rankingSignals: Object.freeze(['native_domain', 'best_seller', 'official_store', 'real_discount', 'shipping_free', 'source_position']),
    });
  }

  if (marketplace === 'Shopee') {
    return Object.freeze({
      mode: 'native-category-plus-strong-intent',
      nativeFirst: true,
      apiCategories: Object.freeze([...(contract.shopeeApiCategories || [])]),
      avoidBroadCategoryOnly: true,
      initialPagesPerIntent: maxPagesPerTerm,
      initialCandidateBudget: Math.max(30, candidateLimit * 4),
      rankingSignals: Object.freeze(['semantic_relevance', 'sales', 'rating', 'real_discount', 'shop_quality', 'commission']),
    });
  }

  return Object.freeze({
    mode: 'intent-search',
    nativeFirst: false,
    initialPagesPerIntent: maxPagesPerTerm,
    initialCandidateBudget: candidateLimit,
    rankingSignals: Object.freeze([]),
  });
}

function buildFirstDiscoveryPlan(nicheId, marketplace, options = {}) {
  const niche = getCommercialNiche(nicheId);
  if (!niche) return null;

  const market = String(marketplace || '').trim();
  const affinity = Number(options.affinity || niche.marketplaceAffinity?.[market] || 2);
  const selectedTerms = Array.isArray(options.terms)
    ? options.terms.filter(Boolean)
    : [...niche.coreProducts, ...niche.expansionProducts];
  const coreTerms = new Set((options.coreTerms || niche.coreProducts || []).map(normalizeText));
  const expansionTerms = new Set((options.expansionTerms || niche.expansionProducts || []).map(normalizeText));

  const intents = selectedTerms.map((term) => {
    const normalizedTerm = normalizeText(term);
    const tier = coreTerms.has(normalizedTerm) ? 'core' : expansionTerms.has(normalizedTerm) ? 'expansion' : 'opportunity';
    return Object.freeze({
      term,
      tier,
      family: findFamily(nicheId, term),
      queries: Object.freeze(getQueryOverrides(nicheId, term)),
      negativeHints: Object.freeze(getNegativeHints(nicheId, term)),
    });
  });

  const families = [...new Set(intents.map((intent) => intent.family))];
  const coreFamilies = [...new Set(intents.filter((intent) => intent.tier === 'core').map((intent) => intent.family))];

  return Object.freeze({
    contractVersion: FIRST_DISCOVERY_QUALITY_VERSION,
    nicheId,
    nicheName: niche.name,
    marketplace: market,
    affinity,
    objective: 'build_strong_editorial_pool_before_final_ranking',
    targets: getTargets(affinity, options.targets),
    families: Object.freeze(families),
    coreFamilies: Object.freeze(coreFamilies),
    intents: Object.freeze(intents),
    strategy: buildMarketplaceStrategy(market, affinity, options.rules, options.contract),
  });
}

function matchesFirstDiscoveryIntent(intent, title) {
  if (!intent || !title) return false;
  const normalizedTitle = normalizeText(title);
  const negativeHints = Array.isArray(intent.negativeHints) ? intent.negativeHints : [];
  if (negativeHints.some((hint) => normalizedTitle.includes(normalizeText(hint)))) return false;

  const term = normalizeText(intent.term);
  const queryTokens = (intent.queries || [])
    .flatMap((query) => normalizeText(query).split(' '))
    .filter((token) => token.length >= 4);
  const termTokens = term.split(' ').filter((token) => token.length >= 4);
  const evidenceTokens = [...new Set([...termTokens, ...queryTokens])];
  return evidenceTokens.some((token) => normalizedTitle.includes(token));
}

function assessFirstDiscoveryReadiness(input = {}, options = {}) {
  const affinity = Number(options.affinity || input.affinity || 2);
  const targets = getTargets(affinity, options.targets);
  const extracted = Math.max(0, toFiniteNumber(input.extracted));
  const afterRelevance = Math.max(0, toFiniteNumber(input.afterRelevance ?? input.afterQualityGate));
  const afterQualityGate = Math.max(0, toFiniteNumber(input.afterQualityGate));
  const strongCandidates = Math.max(0, toFiniteNumber(input.strongCandidates ?? input.qualifiedFinalists ?? input.portfolioSelected ?? input.queueSelected));
  const distinctEditorialFamilies = Math.max(0, toFiniteNumber(input.distinctEditorialFamilies ?? input.distinctEditorialTypes));
  const coreFamiliesCovered = Math.max(0, toFiniteNumber(input.coreFamiliesCovered));
  const queriesAttempted = Math.max(0, toFiniteNumber(input.queriesAttempted));
  const queriesSucceeded = Math.max(0, toFiniteNumber(input.queriesSucceeded));
  const querySuccessRate = queriesAttempted > 0 ? queriesSucceeded / queriesAttempted : 1;
  const relevanceYield = extracted > 0 ? afterRelevance / extracted : 0;
  const qualityYield = extracted > 0 ? afterQualityGate / extracted : 0;

  const reasons = [];
  if (queriesAttempted > 0 && querySuccessRate < targets.minQuerySuccessRate) reasons.push('source_health_degraded');
  if (extracted > 0 && relevanceYield < targets.minRelevanceYield) reasons.push('retrieval_precision_too_low');
  if (strongCandidates < targets.minStrongCandidates) reasons.push('strong_pool_too_small');
  if (distinctEditorialFamilies < targets.minDistinctFamilies) reasons.push('editorial_diversity_too_low');
  if (coreFamiliesCovered < targets.minCoreFamilies) reasons.push('core_coverage_too_low');

  return Object.freeze({
    contractVersion: FIRST_DISCOVERY_QUALITY_VERSION,
    ready: reasons.length === 0,
    reasons: Object.freeze(reasons),
    evidence: Object.freeze({
      extracted,
      afterRelevance,
      afterQualityGate,
      strongCandidates,
      distinctEditorialFamilies,
      coreFamiliesCovered,
      queriesAttempted,
      queriesSucceeded,
      querySuccessRate,
      relevanceYield,
      qualityYield,
    }),
    targets,
  });
}

module.exports = {
  FIRST_DISCOVERY_QUALITY_VERSION,
  FAMILY_TERMS_BY_NICHE,
  QUERY_OVERRIDES_BY_NICHE,
  NEGATIVE_HINTS_BY_NICHE,
  TARGETS_BY_AFFINITY,
  buildFirstDiscoveryPlan,
  matchesFirstDiscoveryIntent,
  assessFirstDiscoveryReadiness,
};
