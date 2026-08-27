'use strict';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const SHOPEE_PRODUCTCATIDS_MAP_V1 = Object.freeze({
  'Casa/Cozinha/Organização': Object.freeze({
    'air fryer': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100198']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'liquidificador': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100193']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'panela': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100636', '100717', '101219']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'cafeteira': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100194']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'organizador': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100016', '100097', '100347']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'faqueiro': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100718', '101244']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'jogo de cama': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100710', '101148']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'toalha': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100711', '101164']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'lixeira': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100716', '101207']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'mop': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100716', '101204']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
  }),

  'Beleza': Object.freeze({
    'skincare': Object.freeze({
      decision: 'investigar',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100630', '100664', '100893']),
      rootProductCatId: 100630,
      reason: 'Melhor raiz: 100630 com 50 itens categorizados (baixa).',
    }),
    'perfume': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100630', '100661', '0']),
      rootProductCatId: 100630,
      reason: 'Melhor raiz: 100630 com 50 itens categorizados (alta).',
    }),
    'shampoo': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100630', '100659', '100869']),
      rootProductCatId: 100001,
      reason: 'Melhor raiz: 100001 com 50 itens categorizados (alta).',
    }),
    'secador': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100630', '100663', '100889']),
      rootProductCatId: 100630,
      reason: 'Melhor raiz: 100630 com 50 itens categorizados (alta).',
    }),
    'chapinha': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100630', '100663', '100889']),
      rootProductCatId: 100630,
      reason: 'Melhor raiz: 100630 com 50 itens categorizados (alta).',
    }),
    'escova secadora': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100630', '100663', '100889']),
      rootProductCatId: 100630,
      reason: 'Melhor raiz: 100630 com 50 itens categorizados (alta).',
    }),
    'maquiagem': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100630', '100662', '100881']),
      rootProductCatId: 100001,
      reason: 'Melhor raiz: 100001 com 50 itens categorizados (media).',
    }),
    'máscara capilar': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100630', '100659', '100871']),
      rootProductCatId: 100630,
      reason: 'Melhor raiz: 100630 com 50 itens categorizados (alta).',
    }),
  }),

  'Moda': Object.freeze({
    'camiseta masculina': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100011', '100054', '100244']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (alta).',
    }),
    'camisa polo masculina': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100011', '100054', '100243']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (alta).',
    }),
    'calça jeans masculina': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100011', '100047', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (alta).',
    }),
    'bermuda masculina': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100011', '100053', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (alta).',
    }),
    'tênis casual': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100532', '100557', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (alta).',
    }),
    'sapato masculino': Object.freeze({
      decision: 'investigar',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100012', '100064', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (baixa).',
    }),
    'bolsa feminina': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100016', '100095', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (alta).',
    }),
    'mochila': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100533', '100564', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (media).',
    }),
    'relógio': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100534', '100574', '0']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (media).',
    }),
    'óculos': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100009', '100030', '100151']),
      rootProductCatId: 100009,
      reason: 'Melhor raiz: 100009 com 50 itens categorizados (media).',
    }),
  }),

  'Eletrodomésticos': Object.freeze({
    'geladeira': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100209']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'refrigerador': Object.freeze({
      decision: 'investigar',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100190']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (baixa).',
    }),
    'fogão': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100197']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'cooktop': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100197']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'micro-ondas': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100200']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'máquina de lavar': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100039', '100179']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'lava e seca': Object.freeze({
      decision: 'investigar',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100010', '100039', '100179']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (baixa).',
    }),
    'freezer': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100210']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'lava-louças': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100716', '101213']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'frigobar': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100209']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'coifa': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100211']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (media).',
    }),
    'depurador': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100041', '100211']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
    'ar condicionado': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100010', '100039', '100181']),
      rootProductCatId: 100010,
      reason: 'Melhor raiz: 100010 com 50 itens categorizados (alta).',
    }),
  }),

  'Informática': Object.freeze({
    'notebook': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100013', '100075', '100284']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (media).',
    }),
    'computador': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101932', '101944']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (alta).',
    }),
    'monitor': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100632', '100680', '100984']),
      rootProductCatId: 100644,
      reason: 'Melhor raiz: 100644 com 50 itens categorizados (media).',
    }),
    'teclado': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101941', '101999']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (alta).',
    }),
    'mouse': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101941', '101998']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (alta).',
    }),
    'headset': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100535', '100578', '0']),
      rootProductCatId: 100644,
      reason: 'Melhor raiz: 100644 com 50 itens categorizados (alta).',
    }),
    'ssd': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101935', '101962']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (alta).',
    }),
    'roteador': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101936', '101968']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (alta).',
    }),
    'impressora': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101939', '101985']),
      rootProductCatId: 100013,
      reason: 'Melhor raiz: 100013 com 50 itens categorizados (alta).',
    }),
    'webcam': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100644', '101940', '101988']),
      rootProductCatId: 100644,
      reason: 'Melhor raiz: 100644 com 50 itens categorizados (alta).',
    }),
  }),

  'Ferramentas': Object.freeze({
    'furadeira': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (alta).',
    }),
    'parafusadeira': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (alta).',
    }),
    'alicate': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (alta).',
    }),
    'chave': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (media).',
    }),
    'serra': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (alta).',
    }),
    'trena': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (alta).',
    }),
    'maleta de ferramentas': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (alta).',
    }),
    'kit ferramentas': Object.freeze({
      decision: 'investigar',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100636', '100715', '101191']),
      rootProductCatId: 100636,
      reason: 'Melhor raiz: 100636 com 50 itens categorizados (baixa).',
    }),
  }),

  'Pet': Object.freeze({
    'ração cachorro': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100631', '100667', '100906']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (media).',
    }),
    'ração gato': Object.freeze({
      decision: 'manter',
      confidence: 'media',
      recommendedProductCatIdPath: Object.freeze(['100631', '100667', '100908']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (media).',
    }),
    'tapete higiênico': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100631', '100669', '100926']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (alta).',
    }),
    'cama pet': Object.freeze({
      decision: 'bloquear',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100631', '100669', '100923']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (baixa).',
    }),
    'brinquedo pet': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100631', '100668', '100919']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (alta).',
    }),
    'coleira': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100631', '100668', '100918']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (alta).',
    }),
    'guia cachorro': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100631', '100668', '100918']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (alta).',
    }),
    'bebedouro pet': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100631', '100668', '100916']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (alta).',
    }),
    'shampoo pet': Object.freeze({
      decision: 'investigar',
      confidence: 'baixa',
      recommendedProductCatIdPath: Object.freeze(['100631', '100670', '100929']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (baixa).',
    }),
    'caixa transporte pet': Object.freeze({
      decision: 'promover',
      confidence: 'alta',
      recommendedProductCatIdPath: Object.freeze(['100631', '100668', '100917']),
      rootProductCatId: 100631,
      reason: 'Melhor raiz: 100631 com 50 itens categorizados (alta).',
    }),
  }),
});

function findNicheEntry(niche) {
  const normTarget = normalize(niche);
  for (const [key, value] of Object.entries(SHOPEE_PRODUCTCATIDS_MAP_V1)) {
    if (normalize(key) === normTarget) return value;
  }
  return null;
}

function findFamilyEntry(nicheFamilies, family) {
  if (!nicheFamilies) return null;
  const normTarget = normalize(family);
  for (const [key, value] of Object.entries(nicheFamilies)) {
    if (normalize(key) === normTarget) return value;
  }
  return null;
}

/**
 * Retorna o path recomendado de productCatIds para um nicho e família.
 * Ex: ["100010", "100041", "100198"]
 */
function getShopeeFamilyCategoryPath(niche, family) {
  const nicheFamilies = findNicheEntry(niche);
  const entry = findFamilyEntry(nicheFamilies, family);
  return entry?.recommendedProductCatIdPath ? [...entry.recommendedProductCatIdPath] : null;
}

/**
 * Retorna true se a família está aprovada para uso automático (promover ou manter).
 * Retorna false se estiver bloqueada ou em investigação.
 */
function shouldUseShopeeFamily(niche, family) {
  const nicheFamilies = findNicheEntry(niche);
  const entry = findFamilyEntry(nicheFamilies, family);
  if (!entry) return false;
  return entry.decision === 'promover' || entry.decision === 'manter';
}

/**
 * Retorna as famílias bloqueadas para um determinado nicho (ou para todos se nicho for omitido).
 */
function getShopeeBlockedFamilies(niche = null) {
  if (niche) {
    const nicheFamilies = findNicheEntry(niche);
    if (!nicheFamilies) return [];
    return Object.entries(nicheFamilies)
      .filter(([, data]) => data.decision === 'bloquear')
      .map(([name]) => name);
  }

  const allBlocked = [];
  for (const [, families] of Object.entries(SHOPEE_PRODUCTCATIDS_MAP_V1)) {
    for (const [name, data] of Object.entries(families)) {
      if (data.decision === 'bloquear') {
        allBlocked.push(name);
      }
    }
  }
  return allBlocked;
}

const FAMILY_SEMANTIC_DICTIONARY = Object.freeze({
  // Casa / Cozinha / Organização
  'air fryer': Object.freeze({ keyword: 'air fryer', terms: Object.freeze(['air fryer', 'airfryer', 'fritadeira']) }),
  'liquidificador': Object.freeze({ keyword: 'liquidificador', terms: Object.freeze(['liquidificador', 'mixer']) }),
  'panela': Object.freeze({ keyword: 'panela', terms: Object.freeze(['panela', 'cacarola', 'frigideira', 'caldeirao', 'jogo de panelas']) }),
  'cafeteira': Object.freeze({ keyword: 'cafeteira', terms: Object.freeze(['cafeteira', 'maquina de cafe', 'prensa francesa', 'nespresso', 'dolce gusto']) }),
  'organizador': Object.freeze({ keyword: 'organizador', terms: Object.freeze(['organizador', 'caixa organizadora', 'cesto', 'porta ', 'sapateira']) }),
  'faqueiro': Object.freeze({ keyword: 'faqueiro', terms: Object.freeze(['faqueiro', 'talher', 'talheres', 'jogo de facas', 'faca']) }),
  'jogo de cama': Object.freeze({ keyword: 'jogo de cama', terms: Object.freeze(['cama', 'lencol', 'fronha', 'edredom', 'cobre leito', 'colcha']) }),
  'toalha': Object.freeze({ keyword: 'toalha', terms: Object.freeze(['toalha', 'toalhao', 'roupao']) }),
  'lixeira': Object.freeze({ keyword: 'lixeira', terms: Object.freeze(['lixeira', 'lixo']) }),
  'mop': Object.freeze({ keyword: 'mop', terms: Object.freeze(['mop', 'esfregao', 'rodo magico']) }),

  // Beleza
  'skincare': Object.freeze({ keyword: 'skincare', terms: Object.freeze(['skincare', 'skin care', 'serum', 'hidratante', 'protetor solar', 'facial', 'limpeza facial', 'tonico']) }),
  'perfume': Object.freeze({ keyword: 'perfume', terms: Object.freeze(['perfume', 'fragrancia', 'colonia', 'eau de', 'parfum']) }),
  'shampoo': Object.freeze({ keyword: 'shampoo', terms: Object.freeze(['shampoo', 'xampu', 'condicionador', 'cabelo']) }),
  'secador': Object.freeze({ keyword: 'secador', terms: Object.freeze(['secador', 'secador de cabelo']) }),
  'chapinha': Object.freeze({ keyword: 'chapinha', terms: Object.freeze(['chapinha', 'prancha', 'alisadora']) }),
  'escova secadora': Object.freeze({ keyword: 'escova secadora', terms: Object.freeze(['escova secadora', 'escova alisadora', 'escova rotativa']) }),
  'maquiagem': Object.freeze({ keyword: 'maquiagem', terms: Object.freeze(['maquiagem', 'batom', 'base', 'corretivo', 'rimel', 'blush', 'paleta', 'gloss', 'delineador', 'po compacto', 'sombra']) }),
  'máscara capilar': Object.freeze({ keyword: 'máscara capilar', terms: Object.freeze(['mascara capilar', 'mascara', 'cronograma capilar', 'hidratacao capilar', 'reconstrucao', 'nutricao']) }),

  // Moda
  'camiseta masculina': Object.freeze({ keyword: 'camiseta masculina', terms: Object.freeze(['camiseta', 'camisa', 't shirt', 'tshirt', 'regata']) }),
  'camisa polo masculina': Object.freeze({ keyword: 'camisa polo masculina', terms: Object.freeze(['polo', 'camisa polo']) }),
  'calça jeans masculina': Object.freeze({ keyword: 'calça jeans masculina', terms: Object.freeze(['calca', 'jeans', 'calca jeans']) }),
  'bermuda masculina': Object.freeze({ keyword: 'bermuda masculina', terms: Object.freeze(['bermuda', 'short', 'calcao']) }),
  'tênis casual': Object.freeze({ keyword: 'tênis casual', terms: Object.freeze(['tenis', 'sneaker', 'sapatilha', 'calcado']) }),
  'sapato masculino': Object.freeze({ keyword: 'sapato masculino', terms: Object.freeze(['sapato', 'mocassim', 'sapatenis', 'coturno', 'bota', 'social']) }),
  'bolsa feminina': Object.freeze({ keyword: 'bolsa feminina', terms: Object.freeze(['bolsa', 'clutch', 'tote', 'sacola', 'carteira', 'shoulder bag']) }),
  'mochila': Object.freeze({ keyword: 'mochila', terms: Object.freeze(['mochila', 'backpack', 'bagpack']) }),
  'relógio': Object.freeze({ keyword: 'relógio', terms: Object.freeze(['relogio', 'watch', 'smartwatch', 'cronometro', 'pulso']) }),
  'óculos': Object.freeze({ keyword: 'óculos', terms: Object.freeze(['oculos', 'armacao', 'lente', 'solar', 'grau']) }),

  // Eletrodomésticos
  'geladeira': Object.freeze({ keyword: 'geladeira', terms: Object.freeze(['geladeira', 'refrigerador']) }),
  'refrigerador': Object.freeze({ keyword: 'refrigerador', terms: Object.freeze(['refrigerador', 'geladeira']) }),
  'fogão': Object.freeze({ keyword: 'fogão', terms: Object.freeze(['fogao', 'cooktop']) }),
  'cooktop': Object.freeze({ keyword: 'cooktop', terms: Object.freeze(['cooktop', 'fogao de inducao', 'inducao']) }),
  'micro-ondas': Object.freeze({ keyword: 'micro-ondas', terms: Object.freeze(['micro ondas', 'microondas']) }),
  'máquina de lavar': Object.freeze({ keyword: 'máquina de lavar', terms: Object.freeze(['maquina de lavar', 'lavadora', 'tanquinho']) }),
  'lava e seca': Object.freeze({ keyword: 'lava e seca', terms: Object.freeze(['lava e seca', 'lavadora e secadora', 'secadora']) }),
  'freezer': Object.freeze({ keyword: 'freezer', terms: Object.freeze(['freezer', 'congelador']) }),
  'lava-louças': Object.freeze({ keyword: 'lava-louças', terms: Object.freeze(['lava loucas', 'lava louca', 'lavaloucas']) }),
  'frigobar': Object.freeze({ keyword: 'frigobar', terms: Object.freeze(['frigobar', 'refrigerador compacto']) }),
  'coifa': Object.freeze({ keyword: 'coifa', terms: Object.freeze(['coifa', 'exaustor']) }),
  'depurador': Object.freeze({ keyword: 'depurador', terms: Object.freeze(['depurador', 'coifa']) }),
  'ar condicionado': Object.freeze({ keyword: 'ar condicionado', terms: Object.freeze(['ar condicionado', 'split', 'climatizador']) }),

  // Informática
  'notebook': Object.freeze({ keyword: 'notebook', terms: Object.freeze(['notebook', 'laptop', 'macbook', 'chromebook']) }),
  'computador': Object.freeze({ keyword: 'computador', terms: Object.freeze(['computador', 'pc', 'desktop', 'cpu', 'all in one', 'mini pc']) }),
  'monitor': Object.freeze({ keyword: 'monitor', terms: Object.freeze(['monitor', 'display', 'tela', 'gamer']) }),
  'teclado': Object.freeze({ keyword: 'teclado', terms: Object.freeze(['teclado', 'keyboard']) }),
  'mouse': Object.freeze({ keyword: 'mouse', terms: Object.freeze(['mouse']) }),
  'headset': Object.freeze({ keyword: 'headset', terms: Object.freeze(['headset', 'fone', 'headphone', 'auricular']) }),
  'ssd': Object.freeze({ keyword: 'ssd', terms: Object.freeze(['ssd', 'nvme', 'disco solido', 'm2']) }),
  'roteador': Object.freeze({ keyword: 'roteador', terms: Object.freeze(['roteador', 'router', 'mesh', 'repetidor', 'access point', 'wifi']) }),
  'impressora': Object.freeze({ keyword: 'impressora', terms: Object.freeze(['impressora', 'multifuncional', 'toner', 'tanque']) }),
  'webcam': Object.freeze({ keyword: 'webcam', terms: Object.freeze(['webcam', 'camera pc', 'web cam', 'camera']) }),

  // Ferramentas
  'furadeira': Object.freeze({ keyword: 'furadeira', terms: Object.freeze(['furadeira', 'martelete', 'impacto']) }),
  'parafusadeira': Object.freeze({ keyword: 'parafusadeira', terms: Object.freeze(['parafusadeira', 'furadeira parafusadeira']) }),
  'alicate': Object.freeze({ keyword: 'alicate', terms: Object.freeze(['alicate', 'universal', 'pressao', 'corte']) }),
  'chave': Object.freeze({ keyword: 'chave', terms: Object.freeze(['chave', 'jogo de chaves', 'chave de fenda', 'chave philips', 'chave catraca', 'combinada', 'allen', 'torx']) }),
  'serra': Object.freeze({ keyword: 'serra', terms: Object.freeze(['serra', 'serrote', 'serra circular', 'tico tico', 'esmerilhadeira', 'marmore']) }),
  'trena': Object.freeze({ keyword: 'trena', terms: Object.freeze(['trena', 'fita metrica', 'medidor laser', 'nivel']) }),
  'maleta de ferramentas': Object.freeze({ keyword: 'maleta de ferramentas', terms: Object.freeze(['maleta', 'caixa de ferramentas', 'estojo', 'organizador ferramentas']) }),
  'kit ferramentas': Object.freeze({ keyword: 'kit ferramentas', terms: Object.freeze(['kit ferramentas', 'jogo ferramentas', 'jogo de ferramentas', 'kit de ferramentas', 'maleta de ferramentas']) }),

  // Pet
  'ração cachorro': Object.freeze({ keyword: 'ração cachorro', terms: Object.freeze(['racao', 'canina', 'cao', 'caes', 'cachorro', 'petisco', 'filhote', 'adulto']) }),
  'ração gato': Object.freeze({ keyword: 'ração gato', terms: Object.freeze(['racao', 'felina', 'gato', 'gatos', 'gatinho', 'petisco']) }),
  'tapete higiênico': Object.freeze({ keyword: 'tapete higiênico', terms: Object.freeze(['tapete higienico', 'tapete', 'fralda pet', 'sanitario pet']) }),
  'cama pet': Object.freeze({ keyword: 'cama pet', terms: Object.freeze(['cama', 'colchao pet', 'caminha', 'almofada pet', 'toca']) }),
  'brinquedo pet': Object.freeze({ keyword: 'brinquedo pet', terms: Object.freeze(['brinquedo', 'mordedor', 'arranhador', 'bolinha', 'pelucia pet']) }),
  'coleira': Object.freeze({ keyword: 'coleira', terms: Object.freeze(['coleira', 'peitoral', 'enforcador', 'antipulgas']) }),
  'guia cachorro': Object.freeze({ keyword: 'guia cachorro', terms: Object.freeze(['guia', 'peitoral', 'guia retratil', 'corda cachorro']) }),
  'bebedouro pet': Object.freeze({ keyword: 'bebedouro pet', terms: Object.freeze(['bebedouro', 'comedouro', 'fonte pet', 'fonte de agua', 'tigela']) }),
  'shampoo pet': Object.freeze({ keyword: 'shampoo pet', terms: Object.freeze(['shampoo pet', 'shampoo cachorro', 'shampoo gato', 'sabonete pet', 'banho pet', 'condicionador pet']) }),
  'caixa transporte pet': Object.freeze({ keyword: 'caixa transporte pet', terms: Object.freeze(['caixa de transporte', 'transporte pet', 'bolsa transporte', 'caixa transporte', 'mochila pet']) }),
});

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

function resolveLeafCategory(pathArray, rootProductCatId) {
  if (!Array.isArray(pathArray) || pathArray.length === 0) return Number(rootProductCatId);
  const validIds = pathArray.map(Number).filter((id) => id > 0);
  if (validIds.length === 0) return Number(rootProductCatId);
  return validIds[validIds.length - 1];
}

function isProductAdherent(title, familyTerms = []) {
  const normTitle = ` ${normalize(title)} `;
  return familyTerms.some((t) => {
    const normTerm = ` ${normalize(t)} `;
    return normTerm.trim() && normTitle.includes(normTerm);
  });
}

function isExplicitlyBlockedFamily(niche, family) {
  const normNiche = normalize(niche);
  const normFamily = normalize(family);
  if (normNiche === normalize('Casa/Cozinha/Organização') && normFamily === 'organizador') return true;
  if (normNiche === normalize('Pet') && normFamily === 'cama pet') return true;
  return false;
}

/**
 * Retorna apenas as famílias com decision = 'promover' (certificadas),
 * bloqueando explicitamente organizador e cama pet.
 */
function getCertifiedFamiliesForNiche(niche) {
  const nicheFamilies = findNicheEntry(niche);
  if (!nicheFamilies) return [];

  const certified = [];
  for (const [familyName, data] of Object.entries(nicheFamilies)) {
    if (isExplicitlyBlockedFamily(niche, familyName)) continue;
    if (data.decision === 'promover') {
      const semanticConfig = FAMILY_SEMANTIC_DICTIONARY[familyName] || {
        keyword: familyName,
        terms: [familyName],
      };
      certified.push({
        name: familyName,
        keyword: semanticConfig.keyword,
        terms: semanticConfig.terms,
        targetProductCatId: resolveLeafCategory(data.recommendedProductCatIdPath, data.rootProductCatId),
        rootProductCatId: Number(data.rootProductCatId),
        recommendedProductCatIdPath: data.recommendedProductCatIdPath,
      });
    }
  }
  return certified;
}

function getCertifiedFamiliesForScenario(scenarioId) {
  const niche = SCENARIO_TO_NICHE_MAP[scenarioId];
  if (!niche) return [];
  return getCertifiedFamiliesForNiche(niche);
}

module.exports = {
  SHOPEE_PRODUCTCATIDS_MAP_V1,
  FAMILY_SEMANTIC_DICTIONARY,
  SCENARIO_TO_NICHE_MAP,
  getShopeeFamilyCategoryPath,
  shouldUseShopeeFamily,
  getShopeeBlockedFamilies,
  resolveLeafCategory,
  isProductAdherent,
  isExplicitlyBlockedFamily,
  getCertifiedFamiliesForNiche,
  getCertifiedFamiliesForScenario,
};
