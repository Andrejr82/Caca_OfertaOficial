'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { tryAcquireProcessLock, releaseProcessLock, runTrendRadarWorkerOnce } = require('../oracle-trends-radar-worker.cjs');

function tempLockPath() { return path.join(os.tmpdir(), `trends-radar-lock-${crypto.randomUUID()}.lock`); }

function writeLock(lockPath, pid, acquiredAt = new Date().toISOString()) {
  fs.writeFileSync(lockPath, JSON.stringify({ pid, acquiredAt }));
}

test('recovers a fresh orphan lock immediately when owner pid is dead', () => {
  const lockPath = tempLockPath();
  try {
    writeLock(lockPath, 99999999);
    const acquired = tryAcquireProcessLock({
      lockPath,
      staleMs: 30 * 60_000,
      processKill: () => { const error = new Error('dead'); error.code = 'ESRCH'; throw error; },
    });
    assert.equal(acquired, true);
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(lock.pid, process.pid);
  } finally { releaseProcessLock({ lockPath }); }
});

test('keeps a fresh lock when owner pid is alive', () => {
  const lockPath = tempLockPath();
  try {
    writeLock(lockPath, 4242);
    const acquired = tryAcquireProcessLock({
      lockPath,
      staleMs: 30 * 60_000,
      processKill: () => undefined,
    });
    assert.equal(acquired, false);
    assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid, 4242);
  } finally { releaseProcessLock({ lockPath }); }
});

test('dead orphan lock no longer blocks worker execution after abrupt restart', async () => {
  const lockPath = tempLockPath();
  try {
    writeLock(lockPath, 77777777);
    let calls = 0;
    const result = await runTrendRadarWorkerOnce({
      env: { TRENDS_RADAR_DEDICATED_RUNTIME: '1' },
      lockPath,
      processKill: () => { const error = new Error('dead'); error.code = 'ESRCH'; throw error; },
      processRadar: async () => {
        calls += 1;
        return { processed:true, runId:'recovered', publishCalls:0, postsWrites:0, offersWrites:0 };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.processed, true);
    assert.equal(result.runId, 'recovered');
    assert.equal(fs.existsSync(lockPath), false);
  } finally { try { fs.unlinkSync(lockPath); } catch {} }
});
