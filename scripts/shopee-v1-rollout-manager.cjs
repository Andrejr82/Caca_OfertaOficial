'use strict';

const crypto = require('node:crypto');

function getShopeeV1RolloutConfig(env = process.env) {
  // Check for shadow mode (legacy or new flags)
  const isShadowFlag = process.argv.includes('--shopee-ranking-v1-shadow');
  const shadow = isShadowFlag || String(env.SHOPEE_RANKING_V1_SHADOW || '').trim().toLowerCase() === 'true';

  // Read rollout config. Hierarchy: SHOPEE_RANKING_V1_ROLLOUT > SHOPEE_RANKING_V1_ENABLED > SHOPEE_OPENAPI_ENGINE_V1_ENABLED
  const raw = env.SHOPEE_RANKING_V1_ROLLOUT 
    || env.SHOPEE_RANKING_V1_ENABLED 
    || env.SHOPEE_OPENAPI_ENGINE_V1_ENABLED 
    || '0';
    
  const val = String(raw).trim().toLowerCase();
  
  if (val === 'true') return { shadow, percent: 100 };
  if (val === 'false') return { shadow, percent: 0 };
  
  const percent = parseInt(val, 10);
  if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
    return { shadow, percent };
  }
  return { shadow, percent: 0 };
}

function evaluateDeterministicRollout(identifier, percent) {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  if (!identifier) return false;
  
  const hash = crypto.createHash('sha256').update(String(identifier)).digest('hex');
  const numericVal = parseInt(hash.slice(0, 8), 16);
  return (numericVal % 100) < percent;
}

function isShopeeV1EnabledFor(identifier, env = process.env) {
  const config = getShopeeV1RolloutConfig(env);
  return evaluateDeterministicRollout(identifier, config.percent);
}

module.exports = {
  getShopeeV1RolloutConfig,
  evaluateDeterministicRollout,
  isShopeeV1EnabledFor
};
