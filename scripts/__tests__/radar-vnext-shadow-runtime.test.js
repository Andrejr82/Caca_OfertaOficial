'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VNEXT_SHADOW_ENV,
  isRadarVNextShadowEnabled,
  buildShadowSourceHealth,
} = require('../radar-vnext-shadow-runtime.cjs');

test('shadow mode só habilita com flag explícita', () => {
  assert.equal(isRadarVNextShadowEnabled({}), false);
  assert.equal(isRadarVNextShadowEnabled({ [VNEXT_SHADOW_ENV]: '0' }), false);
  assert.equal(isRadarVNextShadowEnabled({ [VNEXT_SHADOW_ENV]: 'false' }), false);
  assert.equal(isRadarVNextShadowEnabled({ [VNEXT_SHADOW_ENV]: '1' }), true);
  assert.equal(isRadarVNextShadowEnabled({ [VNEXT_SHADOW_ENV]: 'true' }), true);
});

test('diagnóstico shadow é adicionado sem alterar métricas oficiais existentes', () => {
  const officialHealth = {
    total_products_selected: 20,
    selected_count_by_marketplace: { Shopee: 14, 'Mercado Livre': 6 },
  };
  const comparison = {
    version: 'radar-vnext-shadow/v1',
    mode: 'shadow',
    v4_count: 20,
    vnext_count: 16,
    overlap_count: 7,
  };

  const merged = buildShadowSourceHealth(officialHealth, comparison);

  assert.equal(merged.total_products_selected, 20);
  assert.deepEqual(merged.selected_count_by_marketplace, officialHealth.selected_count_by_marketplace);
  assert.deepEqual(merged.vnext_shadow, comparison);
  assert.equal(officialHealth.vnext_shadow, undefined, 'não deve mutar o objeto original');
});

test('sem comparação válida source_health permanece funcional', () => {
  const officialHealth = { total_products_selected: 12 };
  const merged = buildShadowSourceHealth(officialHealth, null);
  assert.deepEqual(merged, officialHealth);
  assert.notEqual(merged, officialHealth, 'retorna cópia defensiva');
});
