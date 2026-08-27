'use strict';

function isTrue(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function getMercadoLivreV1Flags(env = process.env) {
  return Object.freeze({
    domainCategorySearch: isTrue(env.MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED),
  });
}

module.exports = {
  getMercadoLivreV1Flags,
  isTrue
};
