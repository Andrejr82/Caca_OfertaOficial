'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  isDedicatedTrendRadarRuntimeEnabled,
  processPendingTrendRadarRuns,
} = require('./oracle-trends-radar-runner-seven-niches-v4.cjs');

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_LOCK_STALE_MS = 30 * 60_000;
const DEFAULT_LOCK_PATH = path.join(os.tmpdir(), 'caca-oferta-trends-radar.lock');

function tryAcquireProcessLock({ fsImpl = fs, lockPath = DEFAULT_LOCK_PATH, staleMs = DEFAULT_LOCK_STALE_MS, now = Date.now() } = {}) {
  const writeLock = () => {
    const fd = fsImpl.openSync(lockPath, 'wx');
    fsImpl.writeFileSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: new Date(now).toISOString() }));
    fsImpl.closeSync(fd);
    return true;
  };
  try { return writeLock(); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  try {
    const stat = fsImpl.statSync(lockPath);
    if (now - stat.mtimeMs <= staleMs) return false;
    fsImpl.unlinkSync(lockPath);
    return writeLock();
  } catch (error) {
    if (error?.code === 'ENOENT') return writeLock();
    throw error;
  }
}

function releaseProcessLock({ fsImpl = fs, lockPath = DEFAULT_LOCK_PATH } = {}) {
  try { fsImpl.unlinkSync(lockPath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function runTrendRadarWorkerOnce({ env = process.env, processRadar = processPendingTrendRadarRuns, fsImpl = fs, lockPath = DEFAULT_LOCK_PATH, staleMs = DEFAULT_LOCK_STALE_MS } = {}) {
  if (!isDedicatedTrendRadarRuntimeEnabled(env)) return { processed:false, reason:'dedicated_runtime_disabled', publishCalls:0, postsWrites:0, offersWrites:0 };
  const locked = tryAcquireProcessLock({ fsImpl, lockPath, staleMs });
  if (!locked) return { processed:false, reason:'worker_locked', publishCalls:0, postsWrites:0, offersWrites:0 };
  try { return await processRadar({ env, dedicatedRuntime:true }); }
  finally { releaseProcessLock({ fsImpl, lockPath }); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startTrendRadarWorker({ env = process.env, processRadar = processPendingTrendRadarRuns, intervalMs = DEFAULT_POLL_INTERVAL_MS, sleepFn = sleep, signal = null } = {}) {
  if (!isDedicatedTrendRadarRuntimeEnabled(env)) throw new Error('TRENDS_RADAR_DEDICATED_RUNTIME precisa estar habilitado para iniciar o worker dedicado.');
  console.log(`[Oracle Trends Radar Worker] iniciado poll=${intervalMs}ms`);
  while (!signal?.aborted) {
    try {
      const result = await runTrendRadarWorkerOnce({ env, processRadar });
      if (result.processed) console.log(`[Oracle Trends Radar Worker] runId=${result.runId || 'n/a'} produtos=${result.productsCount ?? 0} ledger=${result.ledgerObservationsCount ?? 0}`);
    } catch (error) {
      console.error(`[Oracle Trends Radar Worker] ${error.message}`);
    }
    if (!signal?.aborted) await sleepFn(intervalMs);
  }
}

if (require.main === module) {
  startTrendRadarWorker().catch((error) => {
    console.error(`[Oracle Trends Radar Worker] fatal: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_POLL_INTERVAL_MS, DEFAULT_LOCK_STALE_MS, DEFAULT_LOCK_PATH, tryAcquireProcessLock, releaseProcessLock, runTrendRadarWorkerOnce, startTrendRadarWorker };
