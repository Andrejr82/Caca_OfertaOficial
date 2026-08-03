'use strict';

function withTimeout(thenable, timeoutMs, stageName) {
  // Converte "thenable" (como objetos do PostgREST) em uma Promise nativa.
  const operation = Promise.resolve(thenable);

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Timeout de ${timeoutMs}ms excedido na etapa: ${stageName}`);
      error.code = 'ORACLE_OPERATION_TIMEOUT';
      error.context = { stage: stageName, timeoutMs };
      
      // NOTA SOBRE CANCELAMENTO:
      // O timeout interrompe a espera do worker no Node, mas não efetua 
      // o cancelamento físico da requisição TCP no Supabase (não utiliza AbortController),
      // pois a API encadeada PostgREST não provê uma interface fácil de signal para
      // todas as chamadas. Portanto, a resposta pode chegar tardiamente na rede, 
      // mas será ignorada pelo worker e coletada pelo GC.
      reject(error);
    }, timeoutMs);

    if (timeoutId && typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }
  });

  return Promise.race([operation, timeoutPromise])
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
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
    },
    info: (stage, startedAt, msg) => {
      const durationMs = Date.now() - startedAt;
      console.log(`[Stage Info] cycle=${cycleId} stage=${stage} durationMs=${durationMs} msg=${msg}`);
    }
  };
}

module.exports = {
  withTimeout,
  runWithWatchdog,
  createStageLogger
};
