'use strict';

const FIRST_DISCOVERY_QUALITY_MODES = Object.freeze(['off', 'shadow', 'active']);

function getFirstDiscoveryQualityMode(env = process.env) {
  const mode = String(env.FIRST_DISCOVERY_QUALITY_V1_MODE || 'off').toLowerCase().trim();
  return FIRST_DISCOVERY_QUALITY_MODES.includes(mode) ? mode : 'off';
}

function isFirstDiscoveryQualityActive(env = process.env) {
  return getFirstDiscoveryQualityMode(env) === 'active';
}

function isFirstDiscoveryQualityShadow(env = process.env) {
  return getFirstDiscoveryQualityMode(env) === 'shadow';
}

module.exports = {
  FIRST_DISCOVERY_QUALITY_MODES,
  getFirstDiscoveryQualityMode,
  isFirstDiscoveryQualityActive,
  isFirstDiscoveryQualityShadow,
};
