'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS,
  isShopeeOpenApiV1Enabled,
  isShopeeOpenApiV1Scenario,
  getShopeeOpenApiV1Decision,
  runShopeeOpenApiV1ShadowForScenario,
  createShopeeOpenApiV1Dispatcher,
} = require('../shopee-openapi-v1-adapter.cjs');

describe('Shopee OpenAPI V1 adapter', () => {
  it('trata flag ausente, false, vazia e inválida como Shopee V1 desabilitada', () => {
    expect(isShopeeOpenApiV1Enabled({})).toBe(false);
    expect(isShopeeOpenApiV1Enabled({ SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'false' })).toBe(false);
    expect(isShopeeOpenApiV1Enabled({ SHOPEE_OPENAPI_ENGINE_V1_ENABLED: '' })).toBe(false);
    expect(isShopeeOpenApiV1Enabled({ SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'yes' })).toBe(false);
  });

  it('habilita exatamente os 13 cenários aprovados como fonte oficial', () => {
    expect(APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS).toHaveLength(13);
    expect(APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS).not.toContain('grandes_ofertas_editorial');
    for (const scenarioId of APPROVED_SHOPEE_OPENAPI_V1_SCENARIOS) {
      expect(isShopeeOpenApiV1Scenario(scenarioId)).toBe(true);
      expect(getShopeeOpenApiV1Decision(scenarioId, { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' })).toEqual({ enabled: true, mode: 'official', scenarioId });
    }
  });

  it('não seleciona legado quando V1 está desligada, cenário é desconhecido ou Grandes Ofertas', () => {
    expect(getShopeeOpenApiV1Decision('casa_cozinha_editorial', { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'false' })).toEqual({ enabled: false, reason: 'feature_flag_disabled', next: 'disabled' });
    expect(getShopeeOpenApiV1Decision('cenario_inexistente', { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' })).toEqual({ enabled: false, reason: 'scenario_not_allowlisted', next: 'disabled' });
    expect(getShopeeOpenApiV1Decision('grandes_ofertas_editorial', { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' })).toEqual({ enabled: false, reason: 'blocked_v1_scenario', next: 'manual_or_v2' });
  });

  it('não chama o engine quando a decisão não permite V1', async () => {
    let calls = 0;
    const engine = async () => { calls += 1; return {}; };
    await expect(runShopeeOpenApiV1ShadowForScenario('grandes_ofertas_editorial', { env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' }, engine })).resolves.toEqual({ enabled: false, reason: 'blocked_v1_scenario', next: 'manual_or_v2' });
    await expect(runShopeeOpenApiV1ShadowForScenario('casa_cozinha_editorial', { env: {}, engine })).resolves.toEqual({ enabled: false, reason: 'feature_flag_disabled', next: 'disabled' });
    expect(calls).toBe(0);
  });

  it('nunca seleciona callback legado para o fluxo oficial', async () => {
    const calls = [];
    const dispatcher = createShopeeOpenApiV1Dispatcher({
      legacyRunner: async (scenarioId) => { calls.push(`legacy:${scenarioId}`); return { mode: 'legacy' }; },
      shadowRunner: async (scenarioId) => { calls.push(`shadow:${scenarioId}`); return { mode: 'shadow' }; },
    });
    await expect(dispatcher('casa_cozinha_editorial', { env: {} })).resolves.toEqual({ enabled: false, reason: 'feature_flag_disabled', next: 'disabled' });
    await expect(dispatcher('casa_cozinha_editorial', { env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' } })).resolves.toEqual({ mode: 'shadow' });
    await expect(dispatcher('grandes_ofertas_editorial', { env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' } })).resolves.toMatchObject({ reason: 'blocked_v1_scenario' });
    expect(calls).toEqual(['shadow:casa_cozinha_editorial']);
  });

  it('chama o engine somente para cenário aprovado e retorna auditoria sem writes', async () => {
    const calls = [];
    const engine = async (scenarioId, options) => { calls.push({ scenarioId, options }); return { scenarios: { [scenarioId]: { metrics: { final: 3 } } } }; };
    const result = await runShopeeOpenApiV1ShadowForScenario('tv_audio_editorial', { env: { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' }, engine, options: { maxKeywords: 5 } });
    expect(calls).toHaveLength(1);
    expect(calls[0].scenarioId).toBe('tv_audio_editorial');
    expect(result).toMatchObject({ enabled: true, mode: 'official', scenarioId: 'tv_audio_editorial', result: { scenarios: { tv_audio_editorial: { metrics: { final: 3 } } } }, writeAudit: { supabaseWrites: 0, offersWrites: 0, postsWrites: 0, affiliateLinkWrites: 0, publishCalls: 0, oracleCalls: 0 } });
  });

  it('não possui dependência de Supabase, Oracle, publicação ou canais', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'shopee-openapi-v1-adapter.cjs'), 'utf8');
    expect(source).not.toMatch(/createClient|\.from\(|persistDiscovery|notifyWorkPending|processMonetization/i);
  });
});
