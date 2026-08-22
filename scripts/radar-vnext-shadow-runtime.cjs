'use strict';

const VNEXT_SHADOW_ENV = 'TRENDS_RADAR_VNEXT_SHADOW';

function isRadarVNextShadowEnabled(env = process.env) {
  const value = String(env?.[VNEXT_SHADOW_ENV] ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function buildShadowSourceHealth(sourceHealth = {}, comparison = null) {
  const base = { ...(sourceHealth || {}) };
  if (!comparison || typeof comparison !== 'object') return base;
  return {
    ...base,
    vnext_shadow: comparison,
  };
}

async function persistRadarVNextShadowDiagnostics(client, runId, sourceHealth) {
  if (!client || !runId) return false;
  const { error } = await client
    .from('trend_radar_runs')
    .update({
      source_health: sourceHealth,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
  if (error) throw error;
  return true;
}

module.exports = {
  VNEXT_SHADOW_ENV,
  isRadarVNextShadowEnabled,
  buildShadowSourceHealth,
  persistRadarVNextShadowDiagnostics,
};
