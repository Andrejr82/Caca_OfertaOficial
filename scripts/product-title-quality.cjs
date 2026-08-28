'use strict';

const GENERIC_TITLE = /^(?:gen[eê]rico|generic|produto\s+gen[eê]rico|generic\s+product|sem\s+nome|unknown|unnamed|produto|item|placeholder)$/iu;
const CODE_ONLY = /^(?:[a-z]{2,6}[-_ ]?)?\d{6,14}$/iu;

// Acessórios, consumíveis e peças não devem competir com o produto principal.
// A regra prioriza títulos cujo objeto vendido é claramente um acessório, sem
// bloquear um produto principal apenas porque ele inclui um cabo/suporte no kit.
const ACCESSORY_LEAD_TITLE = /^(?:(?:kit|pacote)\s+(?:com\s+)?\d*\s*)?(?:\d+\s*(?:pe[cç]as?|pcs?)\s+)?(?:acess[oó]rio|adaptador|cabos?|case|capa|carregador|fonte(?:\s+de\s+energia)?|pel[ií]cula|protetor|refil|reparo|suporte(?:\s+de\s+parede|\s+articulado|\s+magn[eé]tico)?|base\s+para|enrolador(?:a|es)?\s+de\s+cabos?|organizador(?:a)?\s+de\s+cabos?|kit\s+(?:de\s+)?limpeza)\b/iu;
const ACCESSORY_TARGET_TITLE = /\b(?:adaptador|cabos?|carregador|fonte|suporte(?:\s+de\s+parede|\s+articulado|\s+magn[eé]tico)?|base|capa|case|pel[ií]cula|protetor|refil|tampa|bateria)\b.{0,55}\b(?:para|compat[ií]vel\s+com|de)\b.{0,80}\b(?:notebook|laptop|monitor|ssd|hd|roteador|router|modem|switch|mouse|teclado|webcam|impressora|scanner|celular|smartphone|tablet)\b/iu;
const CLEANING_ACCESSORY_TITLE = /\b(?:kit|escova|coletor)\b.{0,45}\b(?:limpeza|limpador|poeira)\b.{0,80}\b(?:teclado|notebook|laptop|eletr[oô]nico|fone|tela|celular|mouse)\b/iu;
const CABLE_OR_MOUNT_FOR_STORAGE = /\b(?:cabo|adaptador|conversor|gabinete|case|suporte|montagem)\b.{0,70}\b(?:ssd|nvme|hd\s+externo|disco\s+r[ií]gido)\b|\b(?:ssd|nvme|hd\s+externo)\b.{0,70}\b(?:cabo|adaptador|conversor|gabinete|case|suporte|montagem)\b/iu;
const PRINTER_3D_NON_MAIN = /(?:\bfilamento\b.{0,90}\b(?:impressora|caneta)\s*3d\b|\bcaneta\s+(?:impressora\s*)?3d\b|\b(?:agulha|desentupidor|bico|nozzle|hotend|extrusor|extrusora)\b.*\b(?:impressora\s*3d|ender|creality|bambu\s*lab|mk8)\b|\b(?:impressora\s*3d|ender|creality|bambu\s*lab|mk8)\b.*\b(?:agulha|desentupidor|bico|nozzle|hotend|extrusor|extrusora|limpeza|ferramenta(?:s)?)\b|\bkit\b.*\b(?:limpeza|ferramenta(?:s)?)\b.*\b(?:impressora\s*3d|hotend|extrusor|extrusora|bico|nozzle)\b)/iu;

function normalizeForRules(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isAccessoryOnlyProductTitle(title) {
  const normalized = normalizeForRules(title);
  if (!normalized) return false;
  return ACCESSORY_LEAD_TITLE.test(normalized)
    || ACCESSORY_TARGET_TITLE.test(normalized)
    || CLEANING_ACCESSORY_TITLE.test(normalized)
    || CABLE_OR_MOUNT_FOR_STORAGE.test(normalized)
    || PRINTER_3D_NON_MAIN.test(normalized);
}

function validateProductTitle(title) {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  const words = normalizeForRules(normalized)
    .split(/[^a-z0-9]+/).filter((word) => word.length >= 2 && !/^(?:de|da|do|e|para|com|sem|na|no|em)$/.test(word));
  const accessoryOnly = isAccessoryOnlyProductTitle(normalized);
  const structurallyValid = Boolean(normalized) && !GENERIC_TITLE.test(normalized) && !CODE_ONLY.test(normalized) && words.length >= 2;
  const valid = structurallyValid && !accessoryOnly;
  const reason = valid ? null : (accessoryOnly ? 'ACCESSORY_ONLY_PRODUCT' : 'INVALID_PRODUCT_TITLE');
  return { valid, normalized, reason };
}

module.exports = { validateProductTitle, isAccessoryOnlyProductTitle };
