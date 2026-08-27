'use strict';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1 = Object.freeze([
  'MLB-MINERAL_WATERS',
  'MLB-SOFT_DRINKS',
  'MLB-KEYCHAINS',
  'MLB-WASHING_MACHINE_AND_DRYER_BALLS',
  'MLB-PDA_KEYBOARDS',
  'MLB-DJ_MIXERS',
  'MLB-INDUSTRIAL_SAWS',
  'MLB-TOY_PRETEND_PLAY_BLENDERS',
  'MLB-TOYS',
  'MLB-DRINKS'
]);

const BLOCKED_OR_INVESTIGATE_FAMILIES_V1 = Object.freeze([
  'panela',
  'cafeteira',
  'organizador',
  'toalha',
  'lixeira',
  'mixer',
  'grill',
  'skincare',
  'perfume',
  'tratamento capilar',
  'secador',
  'escova secadora',
  'maquiagem',
  'aparador',
  'camiseta masculina',
  'camisa polo masculina',
  'calça jeans masculina',
  'bermuda masculina',
  'bolsa feminina',
  'mochila',
  'relógio',
  'óculos',
  'geladeira',
  'refrigerador',
  'fogão',
  'lava e seca',
  'lava-louças',
  'coifa',
  'depurador',
  'ar condicionado',
  'aspirador',
  'computador',
  'mini pc',
  'teclado',
  'mouse',
  'headset',
  'ssd',
  'impressora',
  'furadeira',
  'parafusadeira',
  'alicate',
  'chave',
  'serra',
  'maleta de ferramentas',
  'esmerilhadeira',
  'brinquedo pet',
  'coleira',
  'guia cachorro',
  'bebedouro pet',
  'shampoo pet',
  'caixa transporte pet'
]);

const SCENARIO_TO_NICHE_MAP = Object.freeze({
  casa_cozinha_editorial: 'Casa/Cozinha/Organização',
  organizacao_editorial: 'Casa/Cozinha/Organização',
  beleza_editorial: 'Beleza',
  moda_editorial: 'Moda',
  eletrodomesticos_editorial: 'Eletrodomésticos',
  informatica_editorial: 'Informática',
  ferramentas_editorial: 'Ferramentas',
  pet_editorial: 'Pet',
});

function familyEntry(niche, family, confidence, bestRoute, domainIds, categoryIds, positiveTerms, negativeTerms, minPrice) {
  return Object.freeze({
    niche,
    family,
    normalizedFamily: normalize(family),
    confidence,
    safeForAutomaticSearch: true,
    bestExtractionRoute: bestRoute,
    domainIds: Object.freeze([...domainIds]),
    categoryIds: Object.freeze([...categoryIds]),
    positiveTerms: Object.freeze([...positiveTerms]),
    negativeTerms: Object.freeze([...negativeTerms]),
    minPrice: minPrice ?? null,
    maxResultsPerFamily: 30,
    enrichmentRequired: true,
    source: 'mercadolivre-certified-extraction-v1'
  });
}

const COMMON_NEGATIVE_TERMS = Object.freeze([
  'peca de reposicao', 'placa eletrica', 'resistencia', 'motor de reposicao',
  'suporte avulso', 'cabo avulso', 'tampa avulsa', 'filtro avulso'
]);

const MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1 = Object.freeze({
  'Casa/Cozinha/Organização': Object.freeze({
    'air fryer': familyEntry(
      'Casa/Cozinha/Organização', 'air fryer', 'alta', 'domain_discovery_products_search',
      ['MLB-AIR_FRYERS'], ['MLB456045', 'MLB269718'],
      ['air fryer', 'airfryer', 'fritadeira', 'fritadeira sem oleo', 'fritadeira eletrica'],
      [...COMMON_NEGATIVE_TERMS, 'forma para air fryer', 'forma de silicone', 'cesto de silicone', 'cesto para air fryer', 'papel descartavel', 'forma descartavel', 'grelha para air fryer', 'tapete silicone'],
      130
    ),
    'liquidificador': familyEntry(
      'Casa/Cozinha/Organização', 'liquidificador', 'alta', 'domain_discovery_highlights',
      ['MLB-BLENDERS'], ['MLB73055', 'MLB270087', 'MLB40286', 'MLB269718', 'MLB270304'],
      ['liquidificador', 'blender', 'processador', 'jarra liquidificador inox'],
      [...COMMON_NEGATIVE_TERMS, 'copo para liquidificador', 'copo de liquidificador', 'jarra para liquidificador', 'jarra de liquidificador', 'tampa liquidificador', 'lamina liquidificador', 'arraste', 'acoplamento', 'borracha de vedacao', 'filtro liquidificador'],
      40
    ),
    'mop': familyEntry(
      'Casa/Cozinha/Organização', 'mop', 'alta', 'domain_discovery_highlights',
      ['MLB-CLEANING_MOPS'], ['MLB270087'],
      ['mop', 'mop giratorio', 'esfregao', 'mop spray', 'rodo magico', 'mop limpeza pesada', 'mop flat'],
      [...COMMON_NEGATIVE_TERMS, 'refil mop', 'pano refil', 'cabo avulso para mop', 'balde avulso'],
      30
    ),
    'batedeira': familyEntry(
      'Casa/Cozinha/Organização', 'batedeira', 'alta', 'domain_discovery_highlights',
      ['MLB-MIXERS'], ['MLB73055'],
      ['batedeira', 'batedeira planetaria', 'batedeira orbital', 'batedeira de bolo', 'batedeira manual'],
      [...COMMON_NEGATIVE_TERMS, 'tigela para batedeira', 'batedor avulso', 'globo batedeira', 'gancho batedeira', 'pa batedeira', 'engrenagem'],
      50
    ),
    'forno elétrico': familyEntry(
      'Casa/Cozinha/Organização', 'forno elétrico', 'alta', 'domain_discovery_highlights',
      ['MLB-OVENS'], ['MLB9188'],
      ['forno eletrico', 'forno de embutir eletrico', 'forno de bancada', 'forno 44l', 'forno 50l'],
      [...COMMON_NEGATIVE_TERMS, 'resistencia forno', 'grade avulsa forno', 'bandeja avulsa forno', 'termostato forno', 'lampada para forno', 'puxador'],
      150
    ),
    'chaleira elétrica': familyEntry(
      'Casa/Cozinha/Organização', 'chaleira elétrica', 'alta', 'domain_discovery_highlights',
      ['MLB-ELECTRIC_JUGS'], ['MLB270087'],
      ['chaleira eletrica', 'chaleira termica eletrica', 'jarra eletrica', 'chaleira inox eletrica'],
      [...COMMON_NEGATIVE_TERMS, 'base avulsa para chaleira', 'resistencia chaleira', 'termostato chaleira', 'tampa avulsa'],
      35
    ),
  }),

  'Beleza': Object.freeze({
    'protetor solar': familyEntry(
      'Beleza', 'protetor solar', 'alta', 'domain_discovery_highlights',
      ['MLB-SUNSCREENS'], ['MLB439402'],
      ['protetor solar', 'filtro solar', 'bloqueador solar', 'protetor solar facial', 'fps 50', 'fps 60', 'fps 70', 'fps 30', 'protetor solar corporal'],
      [...COMMON_NEGATIVE_TERMS, 'amostra gratis', 'bracadeira solar', 'manga protecao uv', 'chapeu'],
      20
    ),
    'shampoo': familyEntry(
      'Beleza', 'shampoo', 'alta', 'domain_discovery_highlights',
      ['MLB-HAIR_SHAMPOOS_AND_CONDITIONERS'], ['MLB439402'],
      ['shampoo', 'xampu', 'kit shampoo', 'shampoo e condicionador', 'shampoo anticaspa', 'shampoo hidratante', 'shampoo profissional'],
      [...COMMON_NEGATIVE_TERMS, 'shampoo pet', 'shampoo cachorro', 'shampoo automotivo', 'shampoo para carro', 'shampoo de cavalo'],
      15
    ),
    'chapinha': familyEntry(
      'Beleza', 'chapinha', 'alta', 'domain_discovery_highlights',
      ['MLB-HAIR_STRAIGHTENERS'], ['MLB439402'],
      ['chapinha', 'prancha alisadora', 'prancha de cabelo', 'prancha profissional', 'prancha titanio', 'chapinha taiff'],
      [...COMMON_NEGATIVE_TERMS, 'suporte para prancha', 'capa termica', 'placa avulsa', 'cabo prancha'],
      40
    ),
    'máscara capilar': familyEntry(
      'Beleza', 'máscara capilar', 'alta', 'domain_discovery_highlights',
      ['MLB-HAIR_TREATMENTS'], ['MLB439402'],
      ['mascara capilar', 'mascara de hidratacao', 'mascara de nutricao', 'mascara de reconstrucao', 'creme de tratamento capilar', 'banho de creme', 'mascara capilar profissional'],
      [...COMMON_NEGATIVE_TERMS, 'touca termica avulsa', 'pote vazio', 'espatula'],
      18
    ),
  }),

  'Moda': Object.freeze({
    'tênis casual': familyEntry(
      'Moda', 'tênis casual', 'alta', 'domain_discovery_highlights',
      ['MLB-SNEAKERS'], ['MLB188065'],
      ['tenis casual', 'tenis casual masculino', 'tenis casual feminino', 'tenis skate', 'sneaker casual', 'tenis cano baixo', 'tenis slip on'],
      [...COMMON_NEGATIVE_TERMS, 'palmilha avulsa', 'cadarco avulso', 'meia avulsa', 'tenis infantil', 'tenis bebe'],
      45
    ),
    'tênis feminino': familyEntry(
      'Moda', 'tênis feminino', 'media', 'domain_discovery_highlights',
      ['MLB-SNEAKERS'], ['MLB188065'],
      ['tenis feminino', 'tenis casual feminino', 'tenis corrida feminino', 'tenis caminhada feminino', 'tenis academia feminino', 'sneaker feminino', 'tenis slip on feminino'],
      [...COMMON_NEGATIVE_TERMS, 'palmilha avulsa', 'cadarco avulso', 'infantil', 'tenis masculino'],
      45
    ),
    'sapato masculino': familyEntry(
      'Moda', 'sapato masculino', 'alta', 'domain_discovery_highlights',
      ['MLB-LOAFERS_AND_OXFORDS'], ['MLB188065'],
      ['sapato masculino', 'sapato social masculino', 'mocassim masculino', 'sapatenis masculino', 'bota masculina', 'coturno masculino', 'loafer masculino'],
      [...COMMON_NEGATIVE_TERMS, 'palmilha', 'cadarco', 'engraxate', 'infantil', 'sapato feminino'],
      50
    ),
  }),

  'Eletrodomésticos': Object.freeze({
    'cooktop': familyEntry(
      'Eletrodomésticos', 'cooktop', 'alta', 'domain_discovery_highlights',
      ['MLB-COOKTOPS'], ['MLB9188'],
      ['cooktop', 'cooktop 4 bocas', 'cooktop 5 bocas', 'cooktop por inducao', 'cooktop eletrico', 'cooktop a gas', 'cooktop brastemp', 'cooktop fischer'],
      [...COMMON_NEGATIVE_TERMS, 'trempe cooktop', 'queimador cooktop', 'placa avulsa', 'usina cooktop', 'suporte cooktop'],
      200
    ),
    'micro-ondas': familyEntry(
      'Eletrodomésticos', 'micro-ondas', 'alta', 'domain_discovery_highlights',
      ['MLB-MICROWAVES'], ['MLB9188'],
      ['micro ondas', 'microondas', 'forno micro ondas', 'micro-ondas 20l', 'micro-ondas 30l', 'micro-ondas 34l', 'micro-ondas inox'],
      [...COMMON_NEGATIVE_TERMS, 'prato giratorio avulso', 'suporte para microondas', 'painel membrana', 'magnetron', 'trafo', 'fusivel', 'lampada'],
      350
    ),
    'máquina de lavar': familyEntry(
      'Eletrodomésticos', 'máquina de lavar', 'alta', 'domain_discovery_highlights',
      ['MLB-WASHING_MACHINES'], ['MLB9188'],
      ['maquina de lavar', 'lavadora de roupas', 'maquina lavar roupa', 'lavadora automatica', 'lavadora 12kg', 'lavadora 13kg', 'lavadora 15kg', 'lavadora 17kg', 'lavadora brastemp', 'lavadora electrolux'],
      [...COMMON_NEGATIVE_TERMS, 'placa lavadora', 'agitador avulso', 'correia lavadora', 'valvula lavadora', 'mangueira lavadora', 'pes lavadora', 'capa para maquina', 'filtro lavadora'],
      800
    ),
    'freezer': familyEntry(
      'Eletrodomésticos', 'freezer', 'alta', 'domain_discovery_highlights',
      ['MLB-FREEZERS'], ['MLB9188'],
      ['freezer', 'freezer horizontal', 'freezer vertical', 'congelador', 'freezer consul', 'freezer 200l', 'freezer 300l'],
      [...COMMON_NEGATIVE_TERMS, 'cesto avulso', 'motor', 'compressor', 'gas', 'termostato'],
      1000
    ),
    'frigobar': familyEntry(
      'Eletrodomésticos', 'frigobar', 'media', 'domain_discovery_highlights',
      ['MLB-REFRIGERATORS'], ['MLB9188'],
      ['frigobar', 'refrigerador compacto', 'mini geladeira', 'frigobar vintage', 'frigobar 45l', 'frigobar 70l', 'frigobar 120l', 'frigobar midea', 'frigobar consul'],
      [...COMMON_NEGATIVE_TERMS, 'termostato', 'motor', 'compressor', 'prateleira avulsa'],
      400
    ),
  }),

  'Informática': Object.freeze({
    'notebook': familyEntry(
      'Informática', 'notebook', 'alta', 'domain_discovery_highlights',
      ['MLB-NOTEBOOKS'], ['MLB1648'],
      ['notebook', 'laptop', 'macbook', 'chromebook', 'notebook gamer', 'notebook dell', 'notebook lenovo', 'notebook acer', 'notebook asus', 'notebook samsung', 'notebook intel i5', 'notebook intel i7', 'notebook ryzen'],
      [...COMMON_NEGATIVE_TERMS, 'suporte para notebook', 'base para notebook', 'carregador para notebook', 'fonte para notebook', 'adesivo para notebook', 'teclado para notebook', 'tela para notebook', 'bateria de notebook', 'mochila notebook', 'capa para notebook'],
      800
    ),
    'roteador': familyEntry(
      'Informática', 'roteador', 'alta', 'domain_discovery_products_search',
      ['MLB-ROUTERS_AND_WIRELESS_SYSTEMS'], ['MLB1648'],
      ['roteador', 'roteador wifi', 'roteador mesh', 'roteador gigabit', 'roteador dual band', 'roteador wi fi 6', 'router wifi', 'roteador tp link', 'roteador intelbras'],
      [...COMMON_NEGATIVE_TERMS, 'cabo de rede avulso', 'suporte de parede para roteador', 'fonte de roteador', 'antena avulsa'],
      50
    ),
    'webcam': familyEntry(
      'Informática', 'webcam', 'alta', 'domain_discovery_highlights',
      ['MLB-WEBCAMS'], ['MLB1648'],
      ['webcam', 'webcam full hd', 'webcam 1080p', 'webcam 4k', 'camera para pc', 'webcam com microfone', 'webcam logitech'],
      [...COMMON_NEGATIVE_TERMS, 'tripe para webcam', 'suporte para webcam', 'tampa webcam', 'protetor camera webcam', 'kit protetor camera'],
      30
    ),
  }),

  'Ferramentas': Object.freeze({
    'trena': familyEntry(
      'Ferramentas', 'trena', 'alta', 'domain_discovery_highlights',
      ['MLB-TAPE_MEASURES'], ['MLB193680'],
      ['trena', 'trena a laser', 'trena metrica', 'trena 5m', 'trena 8m', 'medidor a laser', 'trena digital', 'trena lufkin'],
      [...COMMON_NEGATIVE_TERMS, 'fitas avulsas', 'capa de trena'],
      15
    ),
    'kit ferramentas': familyEntry(
      'Ferramentas', 'kit ferramentas', 'alta', 'domain_discovery_products_search',
      ['MLB-COMBINED_TOOL_KITS'], ['MLB193680'],
      ['kit ferramentas', 'jogo de ferramentas', 'kit de ferramentas', 'jogo ferramentas', 'kit jogo ferramentas maleta', 'kit ferramentas manuais'],
      [...COMMON_NEGATIVE_TERMS, 'brinquedo', 'kit infantil'],
      35
    ),
    'martelete': familyEntry(
      'Ferramentas', 'martelete', 'alta', 'domain_discovery_highlights',
      ['MLB-HAMMER_DRILLS'], ['MLB193680'],
      ['martelete', 'martelete perfurador', 'martelete rompedor', 'martelete eletropneumatico', 'martelete sds', 'martelete bosch'],
      [...COMMON_NEGATIVE_TERMS, 'ponteiro avulso', 'talhadeira avulsa', 'broca sds avulsa'],
      200
    ),
  }),

  'Pet': Object.freeze({
    'ração cachorro': familyEntry(
      'Pet', 'ração cachorro', 'alta', 'domain_discovery_products_search',
      ['MLB-CAT_AND_DOG_FOODS'], ['MLB1071'],
      ['racao cachorro', 'racao para cachorro', 'racao caes', 'racao para caes', 'racao filhote cao', 'racao adulto cao', 'racao golden', 'racao premier', 'racao pedigree', 'racao royal canin', 'racao 15kg'],
      [...COMMON_NEGATIVE_TERMS, 'racao gato', 'comedouro', 'brinquedo', 'suplemento', 'petisco', 'tapete', 'coleira'],
      25
    ),
    'ração gato': familyEntry(
      'Pet', 'ração gato', 'alta', 'domain_discovery_products_search',
      ['MLB-CAT_AND_DOG_FOODS'], ['MLB1071'],
      ['racao gato', 'racao para gatos', 'racao felina', 'racao filhote gato', 'racao whiskas', 'racao golden gato', 'racao premier gato', 'racao royal canin gato', 'racao castrado gato'],
      [...COMMON_NEGATIVE_TERMS, 'racao cachorro', 'comedouro', 'brinquedo', 'areia gato', 'arranhador'],
      20
    ),
    'tapete higiênico': familyEntry(
      'Pet', 'tapete higiênico', 'alta', 'domain_discovery_products_search',
      ['MLB-DOG_POTTY_PADS'], ['MLB1071'],
      ['tapete higienico', 'tapete higienico pet', 'tapete higienico cachorro', 'tapete higienico canino', 'tapete absorvente pet', 'tapete higienico 60x60', 'tapete higienico 80x60'],
      [...COMMON_NEGATIVE_TERMS, 'suporte de tapete', 'grade para tapete', 'tapete de yoga', 'tapete sala', 'tapete banheiro'],
      25
    ),
    'cama pet': familyEntry(
      'Pet', 'cama pet', 'alta', 'domain_discovery_highlights',
      ['MLB-CAT_AND_DOG_BEDS'], ['MLB1071'],
      ['cama pet', 'caminha pet', 'caminha cachorro', 'cama cachorro', 'cama gato', 'almofada pet', 'colchonete pet', 'cama pet lavavel'],
      [...COMMON_NEGATIVE_TERMS, 'roupa pet', 'lencol', 'cama casal', 'cama solteiro'],
      25
    ),
    'petisco cachorro': familyEntry(
      'Pet', 'petisco cachorro', 'alta', 'domain_discovery_products_search',
      ['MLB-PET_TREATS'], ['MLB1071'],
      ['petisco cachorro', 'petisco para caes', 'bifinho cachorro', 'osso pet', 'biscoito cachorro', 'snack cachorro', 'petisco canino', 'bife pet'],
      [...COMMON_NEGATIVE_TERMS, 'racao gato', 'brinquedo', 'comedouro'],
      10
    ),
    'areia gato': familyEntry(
      'Pet', 'areia gato', 'alta', 'domain_discovery_products_search',
      ['MLB-CATS_LITTER'], ['MLB1071'],
      ['areia gato', 'areia para gatos', 'areia sanitaria gato', 'granulado sanitario gato', 'silica gato', 'areia biodegradavel gato', 'areia pipicat'],
      [...COMMON_NEGATIVE_TERMS, 'pa para areia', 'tapete coletor de areia', 'bandeja vazia', 'saco de lixo'],
      10
    ),
  })
});

function findNicheEntry(nicheOrScenario) {
  if (!nicheOrScenario) return null;
  const direct = MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1[nicheOrScenario];
  if (direct) return direct;

  const fromScenario = SCENARIO_TO_NICHE_MAP[nicheOrScenario];
  if (fromScenario && MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1[fromScenario]) {
    return MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1[fromScenario];
  }

  const normTarget = normalize(nicheOrScenario);
  for (const [nicheKey, families] of Object.entries(MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1)) {
    if (normalize(nicheKey) === normTarget) return families;
  }
  return null;
}

function getMercadoLivreFamilyConfig(familyOrNiche, familyName) {
  if (familyName) {
    const nicheEntry = findNicheEntry(familyOrNiche);
    if (!nicheEntry) return null;
    const direct = nicheEntry[familyName];
    if (direct) return direct;

    const normTarget = normalize(familyName);
    for (const [name, config] of Object.entries(nicheEntry)) {
      if (normalize(name) === normTarget) return config;
    }
    return null;
  }

  const normTarget = normalize(familyOrNiche);
  for (const families of Object.values(MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1)) {
    for (const [name, config] of Object.entries(families)) {
      if (normalize(name) === normTarget) return config;
    }
  }
  return null;
}

function getMercadoLivreCertifiedFamilies(nicheOrScenario) {
  if (!nicheOrScenario) {
    const all = [];
    for (const families of Object.values(MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1)) {
      for (const config of Object.values(families)) {
        all.push(config);
      }
    }
    return all;
  }

  const nicheEntry = findNicheEntry(nicheOrScenario);
  if (!nicheEntry) return [];
  return Object.values(nicheEntry);
}

function shouldUseMercadoLivreFamily(familyOrScope, familyOrOptions = {}, maybeOptions = {}) {
  let targetFamily = familyOrScope;
  let targetScope = null;
  let options = familyOrOptions;

  if (typeof familyOrOptions === 'string') {
    targetScope = familyOrScope;
    targetFamily = familyOrOptions;
    options = maybeOptions || {};
  } else if (!options || typeof options !== 'object') {
    options = {};
  }

  const normFamily = normalize(targetFamily);
  if (BLOCKED_OR_INVESTIGATE_FAMILIES_V1.some((b) => normalize(b) === normFamily)) {
    return false;
  }

  let config = targetScope
    ? getMercadoLivreFamilyConfig(targetScope, targetFamily)
    : getMercadoLivreFamilyConfig(targetFamily);

  if (!config && targetScope) {
    config = getMercadoLivreFamilyConfig(targetFamily);
  }

  if (!config) return false;
  if (!config.safeForAutomaticSearch) return false;
  if (options.minConfidence === 'alta' && config.confidence !== 'alta') return false;

  return true;
}

function isMercadoLivreDomainAllowedForFamily(family, domainId) {
  if (!domainId) return false;
  const dNorm = String(domainId).trim();
  if (MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1.includes(dNorm)) return false;

  const config = getMercadoLivreFamilyConfig(family);
  if (!config) return false;

  return config.domainIds.includes(dNorm);
}

function getMercadoLivreExtractionRoute(family) {
  const config = getMercadoLivreFamilyConfig(family);
  return config ? config.bestExtractionRoute : null;
}

function getMercadoLivreBlockedFamilies() {
  return [...BLOCKED_OR_INVESTIGATE_FAMILIES_V1];
}

function getMercadoLivreMapStats() {
  const allFamilies = getMercadoLivreCertifiedFamilies();
  const highConfidence = allFamilies.filter((f) => f.confidence === 'alta').length;
  const mediumConfidence = allFamilies.filter((f) => f.confidence === 'media').length;
  const lowConfidence = allFamilies.filter((f) => f.confidence === 'baixa').length;

  const byRoute = {
    domain_discovery_highlights: allFamilies.filter((f) => f.bestExtractionRoute === 'domain_discovery_highlights').length,
    domain_discovery_products_search: allFamilies.filter((f) => f.bestExtractionRoute === 'domain_discovery_products_search').length
  };

  const byNiche = {};
  for (const f of allFamilies) {
    byNiche[f.niche] = (byNiche[f.niche] || 0) + 1;
  }

  return {
    totalFamilies: allFamilies.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    byRoute,
    byNiche
  };
}

module.exports = {
  MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1,
  MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1,
  BLOCKED_OR_INVESTIGATE_FAMILIES_V1,
  SCENARIO_TO_NICHE_MAP,
  getMercadoLivreCertifiedFamilies,
  getMercadoLivreFamilyConfig,
  shouldUseMercadoLivreFamily,
  isMercadoLivreDomainAllowedForFamily,
  getMercadoLivreExtractionRoute,
  getMercadoLivreBlockedFamilies,
  getMercadoLivreMapStats
};
