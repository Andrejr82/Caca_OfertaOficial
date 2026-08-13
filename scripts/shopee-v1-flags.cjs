'use strict';

function isTrue(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function getShopeeV1Flags(env = process.env) {
  return Object.freeze({
    engine: isTrue(env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED),
    ranking: isTrue(env.SHOPEE_RANKING_V1_ENABLED),
    persistence: isTrue(env.SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED),
  });
}

function isShopeeV1Shadow(argv = process.argv) {
  return argv.includes('--shopee-ranking-v1-shadow');
}

module.exports = { getShopeeV1Flags, isShopeeV1Shadow, isTrue };
