'use strict';

function withTimeout(promise, ms, stageName) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout de ${ms}ms excedido na etapa: ${stageName}`));
    }, ms);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
}

async function runWithWatchdog(cycleFn, timeoutMs, onTimeout) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Ciclo excedeu timeout global de ${timeoutMs}ms`);
      err.code = 'DISCOVERY_CYCLE_TIMEOUT';
      if (typeof onTimeout === 'function') {
        Promise.resolve(onTimeout()).finally(() => reject(err));
      } else {
        reject(err);
      }
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      cycleFn(),
      timeoutPromise
    ]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function createStageLogger(cycleId) {
  return {
    start: (stage, items = 0) => {
      console.log(`[Stage Start] cycle=${cycleId} stage=${stage} items=${items}`);
      return Date.now();
    },
    end: (stage, startedAt, result = 0) => {
      const durationMs = Date.now() - startedAt;
      console.log(`[Stage End] cycle=${cycleId} stage=${stage} durationMs=${durationMs} result=${result}`);
    },
    error: (stage, startedAt, errorMsg) => {
      const durationMs = Date.now() - startedAt;
      console.error(`[Stage Error] cycle=${cycleId} stage=${stage} durationMs=${durationMs} error=${errorMsg}`);
    }
  };
}

module.exports = {
  withTimeout,
  runWithWatchdog,
  createStageLogger
};
