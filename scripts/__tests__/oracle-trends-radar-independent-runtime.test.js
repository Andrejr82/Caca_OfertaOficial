'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  isDedicatedTrendRadarRuntimeEnabled,
  shouldRunTrendRadarConsumer,
  processPendingTrendRadarRuns,
} = require('../oracle-trends-radar-runner.cjs');
const {
  runTrendRadarWorkerOnce,
} = require('../oracle-trends-radar-worker.cjs');

function tempLockPath() {
  return path.join(os.tmpdir(), `trends-radar-${crypto.randomUUID()}.lock`);
}

test('dedicated runtime flag stays fail-closed while manual consumer remains available outside editorial cycle', () => {
  assert.equal(isDedicatedTrendRadarRuntimeEnabled({}), false);
  assert.equal(shouldRunTrendRadarConsumer({ env: {} }), true);
  assert.equal(shouldRunTrendRadarConsumer({ env: {}, stageLogger: {} }), false);
  assert.equal(isDedicatedTrendRadarRuntimeEnabled({ TRENDS_RADAR_DEDICATED_RUNTIME: '1' }), true);
  assert.equal(shouldRunTrendRadarConsumer({ env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' } }), false);
  assert.equal(shouldRunTrendRadarConsumer({ env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' }, dedicatedRuntime: true }), true);
});

test('editorial oracle-scraper consumer is permanently retired even when dedicated flag is disabled', async () => {
  const result = await processPendingTrendRadarRuns({
    env: {},
    stageLogger: {},
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'editorial_consumer_retired');
  assert.equal(result.publishCalls, 0);
  assert.equal(result.postsWrites, 0);
  assert.equal(result.offersWrites, 0);
});

test('legacy compatibility consumer is skipped when dedicated runtime is enabled', async () => {
  const result = await processPendingTrendRadarRuns({
    env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'dedicated_runtime_enabled');
  assert.equal(result.publishCalls, 0);
  assert.equal(result.postsWrites, 0);
  assert.equal(result.offersWrites, 0);
});

test('dedicated worker refuses execution while flag is disabled', async () => {
  let calls = 0;
  const result = await runTrendRadarWorkerOnce({
    env: {},
    processRadar: async () => {
      calls += 1;
      return { processed: true };
    },
    lockPath: tempLockPath(),
  });

  assert.equal(calls, 0);
  assert.equal(result.processed, false);
  assert.equal(result.reason, 'dedicated_runtime_disabled');
});

test('dedicated worker invokes existing runner with dedicatedRuntime=true and keeps zero-publish contract', async () => {
  const lockPath = tempLockPath();
  let received = null;
  try {
    const result = await runTrendRadarWorkerOnce({
      env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
      lockPath,
      processRadar: async (options) => {
        received = options;
        return {
          processed: true,
          runId: 'run-123',
          productsCount: 12,
          publishCalls: 0,
          postsWrites: 0,
          offersWrites: 0,
        };
      },
    });

    assert.equal(received.dedicatedRuntime, true);
    assert.equal(result.processed, true);
    assert.equal(result.runId, 'run-123');
    assert.equal(result.publishCalls, 0);
    assert.equal(result.postsWrites, 0);
    assert.equal(result.offersWrites, 0);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    try { fs.unlinkSync(lockPath); } catch {}
  }
});

test('process lock prevents two dedicated workers from executing the same window concurrently', async () => {
  const lockPath = tempLockPath();
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let unblock;
  const blocker = new Promise((resolve) => {
    unblock = resolve;
  });

  try {
    const first = runTrendRadarWorkerOnce({
      env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
      lockPath,
      processRadar: async () => {
        releaseFirst();
        await blocker;
        return { processed: true, runId: 'run-first', publishCalls: 0, postsWrites: 0, offersWrites: 0 };
      },
    });

    await firstStarted;

    const second = await runTrendRadarWorkerOnce({
      env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
      lockPath,
      processRadar: async () => ({ processed: true, runId: 'run-second' }),
    });

    assert.equal(second.processed, false);
    assert.equal(second.reason, 'worker_locked');

    unblock();
    const firstResult = await first;
    assert.equal(firstResult.processed, true);
    assert.equal(firstResult.runId, 'run-first');
  } finally {
    unblock?.();
    try { fs.unlinkSync(lockPath); } catch {}
  }
});
