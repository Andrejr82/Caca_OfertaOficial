'use strict';

const GENERIC_TITLE = /^(?:gen[eê]rico|generic|produto\s+gen[eê]rico|generic\s+product|sem\s+nome|unknown|unnamed|produto|item|placeholder)$/iu;
const CODE_ONLY = /^(?:[a-z]{2,6}[-_ ]?)?\d{6,14}$/iu;

// Termos de PRODUTO PRINCIPAL
const MAIN_PRODUCT_TERMS = [
  /\b(?:notebook|laptop|macbook|ultrabook|chromebook)\b/iu,
  /\b(?:smartphone|celular|iphone|galaxy\s+(?:a|m|s|z)\d{1,3}|redmi|poco|xiaomi)\b/iu,
  /\b(?:smart\s*tv|televis[aã]o|tv\s+(?:led|4k|uhd|qled|oled|mini\s*led))\b/iu,
  /\b(?:computador|desktop|mini\s*pc|pc\s*gamer|all\s*in\s*one)\b/iu,
  /\b(?:monitor(?:\s+(?:gamer|led|ips|curvo|144hz|165hz|240hz|24|27|32|34|full\s*hd|4k))?)\b/iu,
  /\b(?:impressora\s*3d|impressora(?:\s+multifuncional|\s+laser|\s+tanque|\s+termica)?|multifuncional)\b/iu,
  /\b(?:air\s*fryer|fritadeira(?:\s+el[eé]trica|\s+sem\s+[oó]leo)?)\b/iu,
  /\b(?:cafeteira(?:\s+el[eé]trica|\s+expresso|\s+capsula|\s+italiana)?)\b/iu,
  /\b(?:liquidificador|batedeira(?:\s+planet[aá]ria)?|mixer(?:\s+vertical)?|sanduicheira|panela\s+de\s+press[aã]o(?:\s+el[eé]trica)?|cooktop|micro[-\s]*ondas|forno\s+el[eé]trico)\b/iu,
  /\b(?:geladeira|refrigerador|m[aá]quina\s+de\s+lavar|lava\s+e\s+seca|lava[-\s]*lou[cç]as|fog[aã]o|ar[-\s]*condicionado)\b/iu,
  /\b(?:aspirador(?:\s+de\s+p[oó])?(?:\s+rob[oô]|\s+vertical|\s+inteligente)?)\b/iu,
  /\b(?:furadeira(?:\s+de\s+impacto)?|parafusadeira|martelete|esmerilhadeira|serra\s+(?:circular|tico[-\s]*tico|m[aá]rmore)|lixadeira|compressor\s+de\s+ar)\b/iu,
  /\b(?:cadeira\s+(?:de\s+escrit[oó]rio|gamer|ergon[oô]mica|presidente))\b/iu,
  /\b(?:console|videogame|playstation\s*(?:4|5)|ps4|ps5|xbox\s*(?:series|one)|nintendo\s+switch)\b/iu,
  /\b(?:roteador|router\s*wi[-]?fi|switch\s+(?:de\s+rede|ethernet|gigabit)|nobreak)\b/iu,
  /\b(?:kit\s+(?:gamer|teclado\s+e\s+mouse|teclado\s+mouse))\b/iu,
  /\b(?:teclado\s+(?:mec[aâ]nico|gamer|sem\s+fio)|mouse\s+(?:gamer|sem\s+fio|ergon[oô]mico)|headset\s+(?:gamer|7\.1|bluetooth)|webcam\s+(?:full\s*hd|4k|1080p))\b/iu,
];

// Termos de PEÇAS DE REPOSIÇÃO E COMPONENTES AVULSOS -> PART_ONLY_PRODUCT
const PART_PATTERNS = [
  /\b(?:pe[cç]a(?:s)?(?:\s+de)?\s+(?:reposi[cç][aã]o|reparo)|reparo\b|vidro\s+de\s+reparo)\b/iu,
  /\b(?:extrusor(?:a)?\b|bico\s+hotend|hotend\b|nozzle\b|agulha\s+de\s+limpeza(?:\s+para\s+bico)?|bloco\s+aquecedor|heatbreak|garganta\s+(?:all\s*metal|teflon)|eixo\s+z|correia\s+gt2|motor\s+de\s+passo)\b/iu,
  /\b(?:resist[eê]ncia(?:\s+tubular|\s+de\s+aquecimento|\s+para|\s+110v|\s+220v|\s+1500w|\s+127v|\s+bivolt)\b)/iu,
  /\b(?:cesto(?:\s+antiaderente)?\s+(?:de\s+reposi[cç][aã]o|para\s+(?:air\s*fryer|fritadeira)))\b/iu,
  /\b(?:tampa(?:\s+de\s+vidro)?\s+(?:de\s+reposi[cç][aã]o|para\s+(?:panela|fritadeira|air)))\b/iu,
  /\b(?:(?:display|tela|touch\s*screen)\b.{0,45}\b(?:reposi[cç][aã]o|reparo|para\s+(?:smartphone|celular|galaxy|iphone|motorola|xiaomi|notebook|tablet)))\b/iu,
  /\b(?:placa\s+(?:m[aã]e|controladora|l[oó]gica|principal|de\s+pot[eê]ncia)\s+(?:de\s+reposi[cç][aã]o|silenciosa|para))\b/iu,
  /\b(?:junta(?:\s+do\s+cabe[cç]ote)?\s+(?:para|de)\s+compressor)\b/iu,
  /\b(?:bateria\s+(?:interna\s+)?de\s+reposi[cç][aã]o\s+para)\b/iu,
];

// Termos de CONSUMÍVEIS ISOLADOS -> CONSUMABLE_ONLY_PRODUCT
const CONSUMABLE_PATTERNS = [
  /\b(?:filamento\b.{0,40}\b(?:1kg|1\.75mm|3d|impressora|caneta|pla|petg|abs|tpu|resina)\b|\bcaneta\s+(?:impressora\s*)?3d\b)/iu,
  /\b(?:refil\b.{0,40}\b(?:almofada|mop|pano|filtro|hepa|lav[aá]vel)\b.{0,40}\b(?:para|de)\b.{0,40}\b(?:aspirador|rob[oô]|mop)\b|\brefil\s+(?:de\s+)?(?:almofada|mop|pano|filtro|hepa|lav[aá]vel)\b)/iu,
  /\b(?:refil\s+filtro\s+hepa\b)/iu,
  /\b(?:papel\b.{0,40}\b(?:antiaderente|perfurado|manteiga|descart[aá]vel|protetor)\b.{0,30}\b(?:para|de)\b.{0,30}\b(?:air\s*fryer|fritadeira|forno)\b)/iu,
  /\b(?:c[aá]psula(?:s)?\s+(?:de\s+caf[eé]|reutiliz[aá]vel|compat[ií]vel)\s+(?:para|nespresso|dolce|tres))\b/iu,
  /\b(?:saco\s+(?:descart[aá]vel|para\s+aspirador|de\s+p[oó]))\b/iu,
];

// Termos de ACESSÓRIOS ISOLADOS -> ACCESSORY_ONLY_PRODUCT
const ACCESSORY_LEAD_PATTERNS = [
  /^(?:(?:kit|pacote)\s+(?:com\s+)?\d*\s*)?(?:\d+\s*(?:pe[cç]as?|pcs?)\s+)?(?:acess[oó]rio(?:s)?\s+(?:para|de)|adaptador(?:es)?\s+(?:para|de|usb|hdmi|sata)|cabos?\b|patch\s*cord\b|carregador(?:es)?\b|fonte\s+(?:de\s+energia|de\s+alimenta[cç][aã]o|para)\b|capa(?:s)?\s+(?:para|de|protetora|compat[ií]vel)|case(?:s)?\s+(?:para|de|gaveta|compat[ií]vel)|pel[ií]cula(?:s)?\s+(?:para|de|protetora|3d|de\s+vidro)|protetor(?:es)?\s+(?:para|de)|suporte(?:s)?(?:\s+de\s+parede|\s+de\s+mesa|\s+articulado|\s+magn[eé]tico|\s+flex[ií]vel|\s+universal)?\s+(?:para|de|e\s+teto|e\s+base|com\s+ajuste)\b|bra[cç]o\s+articulado\b|trip[eé](?:\s+suporte)?\b|base\s+(?:para|de|antiderrapante)\b|mousepad\b|conector(?:es)?\b|chaveiro\b|cadar[cç]o\b|organizador\b.{0,20}\bcabos?\b|enrolador\b.{0,20}\bcabos?\b|kit\s+(?:de\s+)?limpeza\b)/iu,
  /\b(?:adaptador|cabos?|carregador|fonte|suporte(?:\s+de\s+parede|\s+articulado|\s+magn[eé]tico)?|base|capa|case|pel[ií]cula|protetor|chaveiro|cadar[cç]o|mousepad|conector)\b.{0,55}\b(?:para|compat[ií]vel\s+com|de|e\s+pe[cç]a\s+para)\b.{0,80}\b(?:notebook|laptop|monitor|ssd|hd|roteador|router|modem|switch|mouse|teclado|webcam|impressora|scanner|celular|smartphone|tablet|smartwatch|fone|caixa\s+de\s+som|camera|c[aâ]mera|aspirador|sanduicheira|air\s*fryer|fritadeira|t[eê]nis|mochila|airtag)\b/iu,
  /\b(?:kit|escova|coletor)\b.{0,45}\b(?:limpeza|limpador|poeira)\b.{0,80}\b(?:teclado|notebook|laptop|eletr[oô]nico|fone|tela|celular|mouse)\b/iu,
  /\b(?:cabo|adaptador|conversor|gabinete|case|suporte|montagem)\b.{0,70}\b(?:ssd|nvme|hd\s+externo|disco\s+r[ií]gido)\b/iu,
];

function normalizeForRules(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Encontra a primeira ocorrência de produto principal no título
 * e verifica se ele lidera a oferta antes de modificadores como "para" ou "de reposição".
 */
function inspectMainProductPosition(normalized) {
  let earliestIndex = -1;
  let matchedTerm = null;

  for (const pattern of MAIN_PRODUCT_TERMS) {
    const match = pattern.exec(normalized);
    if (match) {
      if (earliestIndex === -1 || match.index < earliestIndex) {
        earliestIndex = match.index;
        matchedTerm = match[0];
      }
    }
  }

  return { index: earliestIndex, term: matchedTerm };
}

/**
 * Identifica se uma palavra de acessório/peça/consumível antecede o produto principal.
 */
function hasLeadAccessoryOrPartBeforeMain(normalized, mainIndex) {
  if (mainIndex <= 0) return false;
  const prefix = normalized.slice(0, mainIndex).trim();

  // Se o prefixo contiver termos de peça, acessório ou consumível seguido de "para", "de", etc., o item principal é apenas o alvo compatível
  return /\b(?:capa|case|pelicula|protetor|suporte|adaptador|cabo|carregador|fonte|bico|hotend|nozzle|agulha|resistencia|cesto|tampa|display|tela|touch|placa|junta|bateria|filamento|refil|papel|chaveiro|cadarzo|mousepad|organizador|enrolador|limpeza)\b/iu.test(prefix);
}

/**
 * Classifica contextualmente o produto entre BLOCK, REVIEW e ALLOW.
 * 
 * @param {object|string} productOrTitle 
 * @param {object} options 
 * @returns {{ action: 'BLOCK'|'REVIEW'|'ALLOW', reason: string|null, valid: boolean, productClass: string, isBundle: boolean }}
 */
function classifyProductContext(productOrTitle, options = {}) {
  const title = typeof productOrTitle === 'string'
    ? productOrTitle
    : productOrTitle?.title || productOrTitle?.productName || '';
  const normalized = normalizeForRules(title);

  if (!normalized || GENERIC_TITLE.test(normalized) || CODE_ONLY.test(normalized)) {
    return {
      action: 'BLOCK',
      reason: 'INVALID_PRODUCT_TITLE',
      valid: false,
      productClass: 'invalid',
      isBundle: false,
    };
  }

  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length >= 2 && !/^(?:de|da|do|e|para|com|sem|na|no|em)$/.test(word));
  if (words.length < 2) {
    return {
      action: 'BLOCK',
      reason: 'INVALID_PRODUCT_TITLE',
      valid: false,
      productClass: 'invalid',
      isBundle: false,
    };
  }

  const mainInspection = inspectMainProductPosition(normalized);
  const mainIsPresent = mainInspection.index !== -1;
  const leadIsAccessoryOrPart = mainIsPresent && hasLeadAccessoryOrPartBeforeMain(normalized, mainInspection.index);

  // 1. PEÇAS DE REPOSIÇÃO / COMPONENTES ISOLADOS -> PART_ONLY_PRODUCT
  const isPart = PART_PATTERNS.some((pattern) => pattern.test(normalized));
  if (isPart) {
    if (!mainIsPresent || leadIsAccessoryOrPart || mainInspection.index > 25) {
      return {
        action: 'BLOCK',
        reason: 'PART_ONLY_PRODUCT',
        valid: false,
        productClass: 'part',
        isBundle: false,
      };
    }
  }

  // 2. CONSUMÍVEIS ISOLADOS -> CONSUMABLE_ONLY_PRODUCT
  const isConsumable = CONSUMABLE_PATTERNS.some((pattern) => pattern.test(normalized));
  if (isConsumable) {
    if (!mainIsPresent || leadIsAccessoryOrPart || mainInspection.index > 25) {
      return {
        action: 'BLOCK',
        reason: 'CONSUMABLE_ONLY_PRODUCT',
        valid: false,
        productClass: 'consumable',
        isBundle: false,
      };
    }
  }

  // 3. ACESSÓRIOS ISOLADOS -> ACCESSORY_ONLY_PRODUCT
  const isAccessory = ACCESSORY_LEAD_PATTERNS.some((pattern) => pattern.test(normalized));
  if (isAccessory) {
    if (!mainIsPresent || leadIsAccessoryOrPart || mainInspection.index > 25) {
      return {
        action: 'BLOCK',
        reason: 'ACCESSORY_ONLY_PRODUCT',
        valid: false,
        productClass: 'accessory',
        isBundle: false,
      };
    }
  }

  // 4. PRODUTO PRINCIPAL OU BUNDLE VÁLIDO -> ALLOW
  if (mainIsPresent && !leadIsAccessoryOrPart) {
    const isBundle = /\s+(?:\+|\bcom\b|\bincluso\b|\bacompanha\b)\s+/iu.test(normalized) || /^kit\s+/iu.test(normalized);
    return {
      action: 'ALLOW',
      reason: null,
      valid: true,
      productClass: isBundle ? 'bundle' : 'main_product',
      isBundle,
    };
  }

  // 5. Casos de títulos genéricos de kits ou periféricos ambíguos -> REVIEW
  if (/^(?:kit|conjunto|combo|pacote)\s+(?:acess[oó]rios?|perif[eé]ricos?|multiuso)\b/iu.test(normalized)) {
    return {
      action: 'REVIEW',
      reason: 'AMBIGUOUS_PRODUCT_CLASS',
      valid: options.allowReview === true,
      productClass: 'ambiguous',
      isBundle: true,
    };
  }

  // Se não foi identificado como acessório/peça/consumível isolado, trata como produto válido
  return {
    action: 'ALLOW',
    reason: null,
    valid: true,
    productClass: 'main_product',
    isBundle: false,
  };
}

function isAccessoryOnlyProductTitle(title) {
  const result = classifyProductContext(title);
  return result.action === 'BLOCK' && ['ACCESSORY_ONLY_PRODUCT', 'PART_ONLY_PRODUCT', 'CONSUMABLE_ONLY_PRODUCT'].includes(result.reason);
}

function validateProductTitle(title) {
  const result = classifyProductContext(title);
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  return {
    valid: result.valid,
    normalized,
    reason: result.reason,
    productClass: result.productClass,
    action: result.action,
  };
}

module.exports = {
  classifyProductContext,
  validateProductTitle,
  isAccessoryOnlyProductTitle,
};
