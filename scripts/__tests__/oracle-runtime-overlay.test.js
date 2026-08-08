'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORACLE_RUNTIME_FLAGS,
  parseOverlay,
  mergeEnvText,
  buildRemoteOverlayPlan,
  buildScraperRestartCommand,
} = require('../oracle-runtime-overlay.cjs');

test('accepts exactly the versioned non-secret Oracle flags', () => {
  const overlay = parseOverlay([
    'SHOPEE_OPENAPI_ENGINE_V1_ENABLED=true',
    'SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=true',
    'NO_POSTS=1',
    'NO_PUBLISH=1',
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

test('merges only allowlisted flags and leaves secrets untouched', () => {
  const merged = mergeEnvText(
    'SUPABASE_SERVICE_ROLE_KEY=kept-secret\nNO_POSTS=0\nOTHER_SETTING=preserved\n',
    ORACLE_RUNTIME_FLAGS,
  );

  assert.match(merged, /^SUPABASE_SERVICE_ROLE_KEY=kept-secret$/m);
  assert.match(merged, /^OTHER_SETTING=preserved$/m);
  assert.match(merged, /^NO_POSTS=1$/m);
  assert.match(merged, /^SHOPEE_OPENAPI_ENGINE_V1_PERSIST_ENABLED=true$/m);
});

test('requires a durable backup before applying the overlay', () => {
  const plan = buildRemoteOverlayPlan({
    projectDir: '/home/ubuntu/Caca_OfertaOficial',
    remoteStage: '/tmp/caca-oferta-deploy-test',
    remoteBackup: '/home/ubuntu/Caca_OfertaOficial/.rollout-backups/oracle-runtime-test',
  });

  assert.match(plan, /cp -p '\/home\/ubuntu\/Caca_OfertaOficial\/.env\.local' '\/home\/ubuntu\/Caca_OfertaOficial\/.rollout-backups\/oracle-runtime-test\/env\.local\.before'/);
  assert.match(plan, /mv '\/home\/ubuntu\/Caca_OfertaOficial\/.env\.local\.overlay-/);
});

test('restarts only oracle-scraper with its updated environment', () => {
  const command = buildScraperRestartCommand('oracle-scraper');
  assert.match(command, /pm2 restart 'oracle-scraper' --update-env/);
  assert.doesNotMatch(command, /oracle-api/);
});
