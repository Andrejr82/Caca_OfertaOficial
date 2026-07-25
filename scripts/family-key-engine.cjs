'use strict';

/**
 * FamilyKeyEngine — Sprint V5
 *
 * Computa três chaves de identidade determinísticas para cada produto:
 *
 *   exact_key      → marketplace + ASIN/item_id ou URL canônica
 *   commercial_key → marketplace + marca + código do fabricante/modelo
 *   family_key     → marketplace + marca + tipo + linha base + categoria
 *
 * Regras de projeto:
 * - Chave determinística: mesmos dados → mesma chave, sempre.
 * - Não remover números de modelo, geração, capacidade ou potência.
 * - Tokens de variante (Pro, Max, etc.) somente ignorados em contexto editorial.
 * - Não agrupar por palavras genéricas sem confiança mínima.
 * - family_confidence >= FAMILY_MIN_CONFIDENCE para agrupar como família.
 */

const FAMILY_MIN_CONFIDENCE = 0.60;

// ─── Classificação de números (Ajuste #3) ─────────────────────────────────

const NUMBER_CLASSIFIERS = [
  // Voltagem — remover da family_key (variante secundária)
  { type: 'VOLTAGE',      pattern: /\b(?:110|127|220|bivolt)\s*v?\b/i,         removeFromFamily: true  },
  // Dimensão física — remover da family_key se não for o diferencial principal
  { type: 'DIMENSION',    pattern: /\b\d+\s*(?:cm|mm)\b/i,                      removeFromFamily: true  },
  // Quantidade em kit — remover da family_key (variante de embalagem)
  { type: 'QUANTITY_KIT', pattern: /\b(?:kit|pack|jogo|conjunto)\s+(?:com\s+)?\d+\b/i, removeFromFamily: true },
  // Capacidade em litros — PRESERVAR (Air Fryer 4L ≠ 12L)
  { type: 'CAPACITY_L',   pattern: /\b\d+(?:[,.]\d+)?\s*l(?:itros?)?\b/i,       removeFromFamily: false },
  // Capacidade em ml — PRESERVAR
  { type: 'CAPACITY_ML',  pattern: /\b\d+\s*ml\b/i,                              removeFromFamily: false },
  // Potência em Watts — PRESERVAR (Liquidificador 550W ≠ 1200W)
  { type: 'POWER_W',      pattern: /\b\d+\s*w(?:atts?)?\b/i,                    removeFromFamily: false },
  // Código alfanumérico de modelo (ex: B012345678, RI1854)
  { type: 'MODEL_CODE',   pattern: /\b[A-Z]{1,5}[-\s]?\d{4,}[a-z0-9-]*\b/i,   removeFromFamily: false },
  // Código numérico puro de fabricante (ex: 20051034, 65300022)
  { type: 'MODEL_NUMBER', pattern: /\b\d{6,}\b/,                                removeFromFamily: false },
  // Número de geração — PRESERVAR (Gen 2, Geração 4)
  { type: 'GENERATION',   pattern: /\b(?:gera[cç][aã]o|gen(?:eration)?)\s*\d+\b/i, removeFromFamily: false },
];

// ─── Tokens de variante contextual (Ajuste #4) ────────────────────────────

// Estes sufixos NÃO são removidos automaticamente da family_key.
// São ignorados apenas quando não há número de geração nem marca de tech.
const VARIANT_SUFFIXES = ['pro', 'max', 'plus', 'ultra', 'lite', 'se', 'go'];

// Marcas onde Pro/Max/Ultra indicam LINHA COMERCIAL DISTINTA → sempre preservar
const TECH_BRANDS_WITH_VARIANTS = /\b(apple|iphone|ipad|samsung|galaxy|xiaomi|motorola|google|pixel|echo|fire|kindle|alexa|rtx|geforce|playstation|xbox)\b/i;

function isVariantSuffixMeaningful(token, fullNormalizedTitle) {
  if (!VARIANT_SUFFIXES.includes(token)) return false;
  // Se há marca de tech → Pro/Max/Ultra é modelo distinto, preservar
  if (TECH_BRANDS_WITH_VARIANTS.test(fullNormalizedTitle)) return true;
  // Se há código de modelo (ex: iPhone 15 Pro) → preservar
  if (/\b\d{4,}\b/.test(fullNormalizedTitle)) return true;
  return false; // contexto editorial → pode ignorar
}

// ─── Palavras genéricas que sozinhas NÃO formam família ──────────────────

const STOP_WORDS = new Set([
  'de', 'da', 'do', 'com', 'para', 'e', 'em', 'a', 'o', 'as', 'os',
  'um', 'uma', 'por', 'na', 'no', 'se', 'ao', 'dos', 'das',
  'sem', 'mais', 'menos', 'novo', 'nova', 'mini', 'maxi', 'grande', 'pequeno',
]);

// Materiais do produto — diferenciadores de família, PRESERVAR na baseline
// "pote plástico" ≠ "pote de vidro" → materiais distintos → keys diferentes
const MATERIAL_TOKENS = new Set([
  'plastico', 'vidro', 'inox', 'aco', 'aluminio', 'ceramica',
  'ferro', 'madeira', 'bambu', 'borracha', 'silicone', 'polipropileno',
]);

// Cores — remover da family_key
const COLOR_TOKENS = new Set([
  'preto', 'preta', 'branco', 'branca', 'prata', 'cinza', 'azul', 'vermelho',
  'vermelha', 'verde', 'amarelo', 'amarela', 'roxo', 'roxa', 'rosa', 'laranja',
  'bege', 'marrom', 'dourado', 'dourada', 'transparente', 'black', 'white',
  'silver', 'gold', 'blue', 'red', 'green',
]);

// ─── Catálogo de tipos de produto ────────────────────────────────────────

// Mapeamento compacto tipo → slug para a family_key
const PRODUCT_TYPE_SLUGS = [
  ['air-fryer',            /\bair\s*fryer\b/i],
  ['cafeteira',            /\bcafeteira\b/i],
  ['batedeira',            /\bbatedeira\b/i],
  ['liquidificador',       /\bliquidificador\b/i],
  ['mixer',                /\bmixer\b/i],
  ['sanduicheira',         /\b(sanduicheira|waffle)\b/i],
  ['chaleira',             /\bchaleira\b/i],
  ['panela-eletrica',      /\bpanela\s*el[eé]trica\b/i],
  ['processador',          /\bprocessador\b/i],
  ['forno-eletrico',       /\bforno\s*el[eé]trico\b/i],
  ['pipoqueira',           /\bpipoqueira\b/i],
  ['espremedor',           /\bespremedor\b/i],
  ['aspirador',            /\b(aspirador|robo\s*aspirador)\b/i],
  ['maquina-de-lavar',     /\b(m[aá]quina\s*de\s*lavar|lavadora)\b/i],
  ['lava-e-seca',          /\blava[-\s]*e[-\s]*seca\b/i],
  ['geladeira',            /\b(geladeira|refrigerador)\b/i],
  ['lava-loucas',          /\blava[-\s]*lou[cç]as\b/i],
  ['microondas',           /\bmicro[-\s]*ondas\b/i],
  ['ar-condicionado',      /\bar[-\s]*condicionado\b/i],
  ['smart-tv',             /\b(smart\s*tv|televis[aã]o)\b/i],
  ['fogao',                /\bfog[aã]o\b/i],
  ['assadeira',            /\bassadeira\b/i],
  ['frigideira',           /\bfrigideira\b/i],
  ['panela',               /\bpanela\b(?!\s*el[eé]trica)/i],
  ['faqueiro',             /\bfaqueiro\b/i],
  ['tabua',                /\bt[aá]bua\b/i],
  ['escorredor',           /\bescorredor\b/i],
  ['pote',                 /\bpotes?\b/i],
  ['organizador',          /\borganizador\b/i],
  ['kit-marmita',          /\b(marmita|p[oa]rta\s*marmita)\b/i],
  ['tapete-banheiro',      /\btapete\s+(?:de\s+)?banheiro\b/i],
  ['tapete-sala',          /\btapete\s+(?:de\s+)?sala\b/i],
  ['tapete',               /\btapete\b/i],
  ['cinto',                /\bcinto\b/i],
  ['jogo-americano',       /\bjogo\s*americano\b/i],
  ['jogo-copos',           /\bjogo\s*(?:de\s+)?copos?\b/i],
  ['notebook',             /\b(notebook|laptop)\b/i],
  ['smartphone',           /\b(celular|smartphone|iphone|galaxy)\b/i],
  ['tablet',               /\btablet\b/i],
  ['headphones',           /\b(fone|headphone|headset|earbuds?)\b/i],
  ['smartwatch',           /\b(smartwatch|rel[oó]gio\s*inteligente)\b/i],
  ['tenis',                /\bt[eê]nis\b/i],
  ['camiseta',             /\b(camiseta|camisa)\b/i],
  ['calca',                /\b(cal[cç]a|jeans|bermuda|shorts)\b/i],
];

// ─── Normalização ─────────────────────────────────────────────────────────

function normalizeToken(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeToken(text).split(/\s+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

// ─── Extração de atributos ────────────────────────────────────────────────

function extractBrand(product) {
  const title = normalizeToken(product.title || '');
  // Extrair primeira palavra do título como candidata a marca
  const firstWord = tokenize(title)[0] || '';
  // Lista de marcas conhecidas no catálogo
  const KNOWN = /\b(tramontina|philips|walita|mondial|oster|arno|electrolux|britania|samsung|apple|xiaomi|motorola|lg|jbl|lenovo|dell|brastemp|consul|panasonic|midea|esmaltec|nike|adidas|caloi|taiff|sony|bose|multilaser|britânia|britania|fisher|nescafe|dolce|nespresso|irobot|shark|dyson|cadence|mallory|black.decker)\b/i;
  const brandMatch = title.match(KNOWN);
  if (brandMatch) return brandMatch[1].toLowerCase();
  // Fallback: primeira palavra se parece marca (capitalizada no original, >3 chars)
  if (firstWord.length >= 3 && !/^\d+$/.test(firstWord)) return firstWord;
  return null;
}

function extractProductTypeSlug(product) {
  const text = normalizeToken(`${product.title || ''} ${product.category?.name || ''}`);
  for (const [slug, pattern] of PRODUCT_TYPE_SLUGS) {
    if (pattern.test(text)) return slug;
  }
  return null;
}

function extractModelCode(product) {
  // Tenta extrair código de modelo do título
  const asin = product.asin || (product.marketplaceMetrics?.asin) || null;
  if (asin) return asin.toUpperCase();
  const title = normalizeToken(product.title || '');
  // Código alfanumérico tipo modelo de fabricante (ex: RI1854, B012345678)
  const alphanum = title.match(/\b([a-z]{1,5}[\s-]?\d{4,}[a-z0-9-]*)\b/i);
  if (alphanum) return alphanum[1].toLowerCase().replace(/\s+/g, '-');
  // Código numérico puro de fabricante (ex: 20051034) — independente do marketplace
  const numeric = title.match(/\b(\d{6,})\b/);
  if (numeric) return numeric[1];
  return null;
}

function extractBaselineTokens(product) {
  const title = normalizeToken(product.title || '');
  const tokens = tokenize(title);
  const typeSlug = extractProductTypeSlug(product);
  // Remoção de dimensões: remover o token numérico adjacente que forma a dimensão
  // Ex: "22 cm" → remover "22" E "cm". Para isso, aplica a regex no texto completo
  // e coleta os tokens capturados pelo padrão de DIMENSION.
  const dimensionTokensToRemove = new Set();
  for (const classifier of NUMBER_CLASSIFIERS) {
    if (!classifier.removeFromFamily) continue;
    let match;
    const re = new RegExp(classifier.pattern.source, classifier.pattern.flags + 'g');
    while ((match = re.exec(title)) !== null) {
      // Tokenizar o match para pegar todos os tokens que compõem a dimensão
      tokenize(match[0]).forEach((t) => dimensionTokensToRemove.add(t));
    }
  }

  const filtered = tokens.filter((token) => {
    if (COLOR_TOKENS.has(token)) return false;
    if (dimensionTokensToRemove.has(token)) return false;
    // Materiais SÃO diferenciadores — preservar sempre
    if (MATERIAL_TOKENS.has(token)) return true;
    if (isVariantSuffixMeaningful(token, title)) return true; // preservar em contexto tech
    if (VARIANT_SUFFIXES.includes(token)) return false; // ignorar contexto editorial
    return true;
  });
  // Pegar as primeiras palavras relevantes (após marca e tipo)
  const brand = extractBrand(product);
  const typeTokens = typeSlug ? typeSlug.split('-') : [];
  const meaningful = filtered
    .filter((t) => t !== brand && !typeTokens.includes(t))
    .slice(0, 4)
    .join('-');
  return meaningful || null;
}

function extractMfgCode(product) {
  // Código numérico puro de fabricante (ex: 20051034)
  // Diferente do ASIN Amazon que é alfanumérico com prefixo B
  const title = normalizeToken(product.title || '');
  // Código numérico longo (≥6 dígitos) que não seja voltagem/dimensão conhecida
  const match = title.match(/\b(\d{6,})\b/);
  return match ? match[1] : null;
}

// ─── Três chaves de identidade ────────────────────────────────────────────

/**
 * Nível 1 — Duplicata exata
 * marketplace + ASIN/item_id + URL canônica
 */
function computeExactKey(product) {
  const marketplace = normalizeToken(product.marketplace || 'unknown');
  const itemId = (
    product.asin ||
    product.marketplaceMetrics?.asin ||
    product.item_id ||
    product.marketplaceMetrics?.itemId ||
    product.sourceItemId ||
    ''
  ).toUpperCase();
  if (itemId) return `${marketplace}|id|${itemId}`;
  // Fallback: URL canônica
  const url = product.canonical_url || product.sourceUrl || product.original_url || '';
  if (url) return `${marketplace}|url|${url}`;
  return null;
}

/**
 * Nível 2 — Duplicata comercial
 * marketplace + marca + código do fabricante/modelo
 */
function computeCommercialKey(product) {
  const marketplace = normalizeToken(product.marketplace || 'unknown');
  const brand = extractBrand(product);
  if (!brand) return null;
  const mfgCode = extractMfgCode(product) || extractModelCode(product);
  if (!mfgCode) return null;
  return `${marketplace}|${brand}|${mfgCode}`;
}

/**
 * Nível 3 — Família de produto
 * marketplace + marca + tipo + linha base + categoria
 */
function computeFamilyKey(product) {
  const marketplace = normalizeToken(product.marketplace || 'unknown');
  const brand = extractBrand(product);
  const typeSlug = extractProductTypeSlug(product);
  const baseline = extractBaselineTokens(product);
  const category = normalizeToken(product.category?.name || '').replace(/\s+/g, '-').slice(0, 30) || null;

  // Exige ao menos marca + tipo para formar uma família válida
  if (!brand || !typeSlug) return null;

  const parts = [marketplace, brand, typeSlug, baseline, category]
    .filter(Boolean)
    .map((p) => String(p).slice(0, 40));
  return parts.join('|');
}

/**
 * Calcula family_confidence e family_evidence.
 * Confidence abaixo de FAMILY_MIN_CONFIDENCE → não agrupar.
 */
function computeFamilyIdentity(product) {
  const exact_key = computeExactKey(product);
  const commercial_key = computeCommercialKey(product);
  const family_key = computeFamilyKey(product);

  const brand = extractBrand(product);
  const typeSlug = extractProductTypeSlug(product);
  const baseline = extractBaselineTokens(product);
  const mfgCode = extractMfgCode(product) || extractModelCode(product);

  const evidence = [];
  let confidence = 0;

  if (brand)     { evidence.push('same_brand');        confidence += 0.35; }
  if (typeSlug)  { evidence.push('same_product_type'); confidence += 0.30; }
  if (baseline)  { evidence.push('same_base_model');   confidence += 0.25; }
  if (mfgCode)   { evidence.push('manufacturer_code'); confidence += 0.10; }

  // Penalidade se nenhum dado estrutural disponível
  if (!brand && !typeSlug) confidence = 0;

  const rules_applied = [];
  if (COLOR_TOKENS.has(normalizeToken(product.title || '').split(' ').pop()))
    rules_applied.push('color_removed');
  if (NUMBER_CLASSIFIERS.some((c) => c.removeFromFamily && c.pattern.test(product.title || '')))
    rules_applied.push('dimension_or_voltage_removed');

  return {
    exact_key,
    commercial_key,
    family_key,
    family_confidence: Number(Math.min(1, confidence).toFixed(2)),
    family_evidence: evidence,
    family_rules_applied: rules_applied,
    canGroup: confidence >= FAMILY_MIN_CONFIDENCE && family_key !== null,
  };
}

/**
 * Ponto de entrada principal — retorna as três chaves e metadados de confiança.
 */
function computeAllKeys(product) {
  return computeFamilyIdentity(product);
}

module.exports = {
  FAMILY_MIN_CONFIDENCE,
  computeExactKey,
  computeCommercialKey,
  computeFamilyKey,
  computeAllKeys,
  computeFamilyIdentity,
  // Expostos para testes unitários
  extractBrand,
  extractProductTypeSlug,
  extractBaselineTokens,
  normalizeToken,
  tokenize,
};
