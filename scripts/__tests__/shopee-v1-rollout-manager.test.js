'use strict';


const { getShopeeV1RolloutConfig, isShopeeV1EnabledFor } = require('../shopee-v1-rollout-manager.cjs');

describe('Shopee V1 Rollout Manager (T53)', () => {
  it('flag desligada (0%)', () => {
    const env = { SHOPEE_RANKING_V1_ROLLOUT: '0' };
    expect(getShopeeV1RolloutConfig(env).percent).toBe(0);
    expect(isShopeeV1EnabledFor('user-1', env)).toBe(false);
  });

  it('100% ativado (legacy "true" ou "100")', () => {
    expect(getShopeeV1RolloutConfig({ SHOPEE_RANKING_V1_ENABLED: 'true' }).percent).toBe(100);
    expect(isShopeeV1EnabledFor('user-1', { SHOPEE_RANKING_V1_ENABLED: 'true' })).toBe(true);
    
    expect(getShopeeV1RolloutConfig({ SHOPEE_RANKING_V1_ROLLOUT: '100' }).percent).toBe(100);
    expect(isShopeeV1EnabledFor('user-x', { SHOPEE_RANKING_V1_ROLLOUT: '100' })).toBe(true);
  });

  it('10% rollout determinístico', () => {
    const env = { SHOPEE_RANKING_V1_ROLLOUT: '10' };
    let enabledCount = 0;
    const total = 1000;
    
    for (let i = 0; i < total; i++) {
      if (isShopeeV1EnabledFor(`user-${i}`, env)) {
        enabledCount++;
      }
    }
    
    // Expect around 10% (100) due to uniform hashing
    expect(enabledCount).toBeGreaterThan(80);
    expect(enabledCount).toBeLessThan(120);
    
    // Determinism test
    const user = 'test-deterministic-user-123';
    const firstResult = isShopeeV1EnabledFor(user, env);
    for (let i = 0; i < 50; i++) {
      expect(isShopeeV1EnabledFor(user, env)).toBe(firstResult);
    }
  });

  it('50% rollout', () => {
    const env = { SHOPEE_RANKING_V1_ROLLOUT: '50' };
    let enabledCount = 0;
    const total = 1000;
    
    for (let i = 0; i < total; i++) {
      if (isShopeeV1EnabledFor(`user-${i}`, env)) {
        enabledCount++;
      }
    }
    
    // Expect around 50% (500)
    expect(enabledCount).toBeGreaterThan(450);
    expect(enabledCount).toBeLessThan(550);
  });

  it('fallback seguro (configuração inválida)', () => {
    const env1 = { SHOPEE_RANKING_V1_ROLLOUT: 'invalid' };
    expect(getShopeeV1RolloutConfig(env1).percent).toBe(0);
    expect(isShopeeV1EnabledFor('user-1', env1)).toBe(false);

    const env2 = {};
    expect(getShopeeV1RolloutConfig(env2).percent).toBe(0);
    expect(isShopeeV1EnabledFor('user-1', env2)).toBe(false);
  });

  it('flags legadas continuam aposentadas', () => {
    const env = { SHOPEE_OPENAPI_ENGINE_V1_ENABLED: 'true' };
    expect(getShopeeV1RolloutConfig(env).percent).toBe(100);
    // Legacy flag still works but unified.
  });
});
