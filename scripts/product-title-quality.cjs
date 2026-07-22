'use strict';

const GENERIC_TITLE = /^(?:gen[eê]rico|generic|produto\s+gen[eê]rico|generic\s+product|sem\s+nome|unknown|unnamed|produto|item|placeholder)$/iu;
const CODE_ONLY = /^(?:[a-z]{2,6}[-_ ]?)?\d{6,14}$/iu;

function validateProductTitle(title) {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  const words = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((word) => word.length >= 2 && !/^(?:de|da|do|e|para|com|sem|na|no|em)$/.test(word));
  const valid = Boolean(normalized) && !GENERIC_TITLE.test(normalized) && !CODE_ONLY.test(normalized) && words.length >= 2;
  return { valid, normalized, reason: valid ? null : 'INVALID_PRODUCT_TITLE' };
}

module.exports = { validateProductTitle };
