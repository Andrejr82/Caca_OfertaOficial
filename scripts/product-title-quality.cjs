'use strict';

const GENERIC_TITLE = /^(?:gen[eê]rico|generic|produto\s+gen[eê]rico|generic\s+product|sem\s+nome|unknown|unnamed|produto|item|placeholder)$/iu;
const CODE_ONLY = /^(?:[a-z]{2,6}[-_ ]?)?\d{6,14}$/iu;

// Acessórios/peças não devem competir com o produto principal dos nichos editoriais.
// A regra é deliberadamente estrutural: rejeita títulos claramente de reposição/manutenção,
// sem bloquear produtos principais que apenas mencionem um cabo/acessório incluído.
const ACCESSORY_ONLY_TITLE = /\b(?:cabo\s+(?:de\s+)?(?:carregamento|usb|dados)|carregador\s+para|adaptador\s+para|suporte\s+para|base\s+para|capa\s+para|case\s+para|pel[ií]cula\s+para|protetor\s+para|refil\s+para|pe[cç]a(?:s)?\s+(?:de\s+)?reposi[cç][aã]o|tampa\s+para|fonte\s+para|bateria\s+para)\b/iu;
const PRINTER_3D_MAINTENANCE = /(?:\b(?:agulha|desentupidor|bico|nozzle|hotend|extrusor|extrusora)\b.*\b(?:impressora\s*3d|ender|creality|bambu\s*lab|mk8)\b|\b(?:impressora\s*3d|ender|creality|bambu\s*lab|mk8)\b.*\b(?:agulha|desentupidor|bico|nozzle|hotend|extrusor|extrusora|limpeza|ferramenta(?:s)?)\b|\bkit\b.*\b(?:limpeza|ferramenta(?:s)?)\b.*\b(?:impressora\s*3d|hotend|extrusor|extrusora|bico|nozzle)\b)/iu;

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
  return ACCESSORY_ONLY_TITLE.test(normalized) || PRINTER_3D_MAINTENANCE.test(normalized);
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
