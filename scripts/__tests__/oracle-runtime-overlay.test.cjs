'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORACLE_RUNTIME_FLAGS,
  parseOverlay,
  mergeEnvText,
  buildRemoteOverlayPlan,
  buildScraperRestartCommand,
  buildOracleApiRestartCommand,
} = require('../oracle-runtime-overlay.cjs');

test('accepts exactly the versioned non-secret Oracle flags', () => {
  const overlay = parseOverlay([
    '# Non-secret controls only',
    'SHOPEE_OPENAPI_ENGINE_V1_ENABLED=true',
    'SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=false',
    'NO_POSTS=1',
    'NO_PUBLISH=1',
    'NO_DB_WRITE=1',
    'DRY_RUN=1',
    'TREND_EXECUTIVE_MODE=off',
  ].join('\n'));

  assert.deepEqual(overlay, ORACLE_RUNTIME_FLAGS);
});

test('fails closed for a non-allowlisted key', () => {
  assert.throws(
    () => parseOverlay('SHOPEE_OPENAPI_ENGINE_V1_ENABLED=true\nSUPABASE_SERVICE_ROLE_KEY=leak'),
    /not allowlisted/i,
  );
});

test('rejects secret-shaped keys even when their value is empty', () => {
  assert.throws(
    () => parseOverlay('SHOPEE_OPENAPI_ENGINE_V1_ENABLED=true\nAPI_SECRET='),
    /not allowlisted/i,
  );
});

test('keeps Trend Executive production activation disabled in the deploy overlay', () => {
  const base = [
    'SHOPEE_OPENAPI_ENGINE_V1_ENABLED=true',
    'SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=false',
    'NO_POSTS=1',
    'NO_PUBLISH=1',
    'NO_DB_WRITE=1',
    'DRY_RUN=1',
  ];
  assert.throws(() => parseOverlay([...base, 'TREND_EXECUTIVE_MODE=shadow'].join('\n')), /invalid.*TREND_EXECUTIVE_MODE/i);
  assert.throws(() => parseOverlay([...base, 'TREND_EXECUTIVE_MODE=active'].join('\n')), /invalid.*TREND_EXECUTIVE_MODE/i);
});

test('merges only allowlisted flags and leaves secrets untouched', () => {
  const merged = mergeEnvText(
    'SUPABASE_SERVICE_ROLE_KEY=kept-secret\nNO_POSTS=0\nTREND_EXECUTIVE_MODE=shadow\nOTHER_SETTING=preserved\n',
    ORACLE_RUNTIME_FLAGS,
  );

  assert.match(merged, /^SUPABASE_SERVICE_ROLE_KEY=kept-secret$/m);
  assert.match(merged, /^OTHER_SETTING=preserved$/m);
  assert.match(merged, /^NO_POSTS=1$/m);
  assert.match(merged, /^NO_DB_WRITE=1$/m);
  assert.match(merged, /^DRY_RUN=1$/m);
  assert.match(merged, /^SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=false$/m);
  assert.match(merged, /^TREND_EXECUTIVE_MODE=off$/m);
  assert.doesNotMatch(merged, /^TREND_EXECUTIVE_MODE=shadow$/m);
});

test('requires a durable backup before applying the overlay', () => {
  const plan = buildRemoteOverlayPlan({
    projectDir: '/home/ubuntu/Caca_OfertaOficial',
    remoteStage: '/tmp/caca-oferta-deploy-test',
    remoteBackup: '/home/ubuntu/Caca_OfertaOficial/.rollout-backups/oracle-runtime-test',
  });

  assert.match(plan, /cp -p '\/home\/ubuntu\/Caca_OfertaOficial\/.env\.local' '\/home\/ubuntu\/Caca_OfertaOficial\/.rollout-backups\/oracle-runtime-test\/env\.local\.before'/);
  assert.match(plan, /mv '\/home\/ubuntu\/Caca_OfertaOficial\/.env\.local\.overlay-/);
  assert.match(plan, /TREND_EXECUTIVE_MODE=off/);
  assert.match(plan, /#\.\*/);
});

test('restarts only oracle-scraper with its updated environment', () => {
  const command = buildScraperRestartCommand('oracle-scraper');
  assert.match(command, /TREND_EXECUTIVE_MODE=off/);
  assert.match(command, /pm2 restart 'oracle-scraper' --update-env/);
  assert.doesNotMatch(command, /oracle-api/);
});

test('restarts oracle-api too because it owns the legacy publisher worker', () => {
  const command = buildOracleApiRestartCommand('oracle-api');
  assert.match(command, /TREND_EXECUTIVE_MODE=off/);
  assert.match(command, /pm2 restart 'oracle-api' --update-env/);
  assert.doesNotMatch(command, /whatsapp-bot|shopee-feed-sync/);
});
