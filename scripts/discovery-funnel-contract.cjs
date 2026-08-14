'use strict';

const DISCOVERY_FUNNEL_CONTRACT_VERSION = 'pmav5.discovery-funnel/v1';
const DISCOVERY_FUNNEL_STATUSES = Object.freeze([
  'completed',
  'partial',
  'empty',
  'blocked',
  'parse_zero',
  'failed',
]);
const DISCOVERY_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'empty',
  'blocked',
  'parse_zero',
  'all_known',
  'all_rejected',
  'partial_success',
  'failed',
]);

const FUNNEL_STAGES = Object.freeze([
  'extracted',
  'afterParse',
  'afterNovelty',
  'afterRelevance',
  'afterIdentityDedup',
  'afterQualityGate',
  'afterClassification',
  'queueSelected',
  'rpcSent',
  'inserted',
  'updated',
  'ignored',
  'failed',
]);

const REJECTION_ALIASES = Object.freeze({
  invalid_source_url: 'invalid_url',
  invalid_canonical_url: 'invalid_url',
  invalid_image_url: 'invalid_image',
  PRECO_INVALIDO: 'invalid_price',
  preco_invalido: 'invalid_price',
  limite_marketplace: 'marketplace_limit',
  limite_categoria: 'category_limit',
  limite_total: 'total_limit',
  FAMILY_STILL_HAS_BETTER_ACTIVE_OFFER: 'family_active',
  SIMILAR_TO_BETTER_SELECTED_OFFER: 'duplicate_queue_group',
});

function emptyCounters() {
  return Object.fromEntries(FUNNEL_STAGES.map((stage) => [stage, 0]));
}

function canonicalRejectionReason(reason) {
  const key = String(reason || 'unknown_rejection');
  return REJECTION_ALIASES[key] || key;
}

function mergeMeta(target, source) {
  const merged = { ...(target || {}) };
  for (const [key, value] of Object.entries(source || {})) {
    if (Number.isFinite(Number(value)) && key.endsWith('Rejected')) {
      merged[key] = Number(merged[key] || 0) + Number(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = { ...(merged[key] || {}), ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function attachDiscoveryFunnelMeta(collection, metadata) {
  if (!Array.isArray(collection)) return collection;
  const current = collection.__discoveryFunnelMeta || {};
  Object.defineProperty(collection, '__discoveryFunnelMeta', {
    configurable: true,
    enumerable: false,
    value: mergeMeta(current, metadata),
    writable: false,
  });
  return collection;
}

function readDiscoveryFunnelMeta(collection) {
  return collection?.__discoveryFunnelMeta || {};
}

function deriveMarketplaceStatus({ counters, sourceStatus, fatal = false } = {}) {
  if (fatal) return 'failed';
  if (sourceStatus === 'blocked') return 'blocked';
  if (sourceStatus === 'parse_zero') return 'parse_zero';
  if (Number(counters?.failed || 0) > 0) return 'partial';
  if (sourceStatus === 'empty' || Number(counters?.extracted || 0) === 0) return 'empty';
  return 'completed';
}

function deriveMarketplaceTerminalStatus({ counters = {}, sourceStatus, fatal = false } = {}) {
  if (fatal) return 'failed';
  if (sourceStatus === 'blocked') return 'blocked';
  if (sourceStatus === 'parse_zero') return 'parse_zero';
  if (Number(counters.failed || 0) > 0) return 'partial_success';
  if (Number(counters.extracted || 0) === 0 || sourceStatus === 'empty') return 'empty';
  if (Number(counters.afterNovelty || 0) === 0) return 'all_known';
  if (Number(counters.afterClassification || 0) === 0 && Number(counters.afterIdentityDedup || 0) > 0) return 'all_rejected';
  return 'completed';
}

function normalizeRpcOutcome(result = {}) {
  const failed = Math.max(0, Number(result.failed || 0));
  const state = failed > 0 ? 'partial_success' : String(result.state || 'success');
  return {
    ...result,
    failed,
    rpcState: state,
    partialSuccess: failed > 0,
  };
}

function normalizeFinalByCategory(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([category, count]) => [String(category), Math.max(0, Number(count) || 0)])
    .filter(([, count]) => count > 0));
}

function normalizeQueueSelectionTelemetry(value = {}) {
  const rejectionReasons = {};
  for (const [reason, count] of Object.entries(value.rejectionReasons || {})) {
    const canonical = canonicalRejectionReason(reason);
    rejectionReasons[canonical] = Number(rejectionReasons[canonical] || 0) + Math.max(0, Number(count) || 0);
  }
  return {
    groupKeyVersion: String(value.groupKeyVersion || 'legacy-v1'),
    candidatesReceived: Math.max(0, Number(value.candidatesReceived) || 0),
    candidatesSelected: Math.max(0, Number(value.candidatesSelected) || 0),
    candidatesRejected: Math.max(0, Number(value.candidatesRejected) || 0),
    currentSelectedCount: Math.max(0, Number(value.currentSelectedCount) || 0),
    proposedSelectedCount: Math.max(0, Number(value.proposedSelectedCount) || 0),
    currentRejectedCount: Math.max(0, Number(value.currentRejectedCount) || 0),
    proposedRejectedCount: Math.max(0, Number(value.proposedRejectedCount) || 0),
    rejectionReasons,
    changedRejections: Array.isArray(value.changedRejections)
      ? value.changedRejections.map((item) => ({ ...item }))
      : [],
    items: Array.isArray(value.items) ? value.items.map((item) => ({ ...item })) : [],
  };
}

function createDiscoveryFunnel({ marketplace, scenario = 'unknown', correlationId = null, startedAt = null, finalByCategory = null, scenarioRuntime = null } = {}) {
  const counters = emptyCounters();
  const rejectionReasons = {};
  let categorySummary = normalizeFinalByCategory(finalByCategory);
  let queueSelection = normalizeQueueSelectionTelemetry();
  let status = 'completed';
  let fatal = false;
  let terminalStatus = null;
  let runtime = scenarioRuntime && typeof scenarioRuntime === 'object' ? { ...scenarioRuntime } : null;
  let sourceTelemetry = null;
  let stageTelemetry = null;

  return {
    contractVersion: DISCOVERY_FUNNEL_CONTRACT_VERSION,
    marketplace: String(marketplace || 'unknown'),
    scenario: String(scenario || 'unknown'),
    correlationId,
    startedAt,
    count(stage, amount = 1) {
      if (!FUNNEL_STAGES.includes(stage)) throw new Error(`Etapa de funil inválida: ${stage}`);
      counters[stage] += Math.max(0, Number(amount) || 0);
      return this;
    },
    reject(reason, amount = 1) {
      const original = String(reason || 'unknown_rejection');
      const canonical = canonicalRejectionReason(original);
      rejectionReasons[canonical] = Number(rejectionReasons[canonical] || 0) + Math.max(0, Number(amount) || 0);
      return this;
    },
    setSourceStatus(sourceStatus) {
      if (sourceStatus && !DISCOVERY_FUNNEL_STATUSES.includes(sourceStatus)) throw new Error(`Status de marketplace inválido: ${sourceStatus}`);
      if (sourceStatus) status = sourceStatus;
      return this;
    },
    setFailed() {
      fatal = true;
      status = 'failed';
      terminalStatus = 'failed';
      return this;
    },
    setTerminalStatus(value) {
      const normalized = String(value || '').trim();
      if (!DISCOVERY_TERMINAL_STATUSES.includes(normalized)) throw new Error(`Estado terminal inválido: ${normalized}`);
      terminalStatus = normalized;
      if (runtime) {
        runtime = {
          ...runtime,
          coverageStatus: normalized,
          flags: {
            ...(runtime.flags || {}),
            coverageInsufficient: normalized !== 'completed',
          },
        };
      }
      return this;
    },
    setScenarioRuntime(value) {
      runtime = value && typeof value === 'object' ? { ...value } : null;
      return this;
    },
    setSourceTelemetry(value) {
      sourceTelemetry = value && typeof value === 'object' ? { ...value } : null;
      return this;
    },
    setStageTelemetry(value) {
      stageTelemetry = value && typeof value === 'object' ? { ...value } : null;
      return this;
    },
    setFinalByCategory(value) {
      categorySummary = normalizeFinalByCategory(value);
      return this;
    },
    recordQueueSelection(value) {
      queueSelection = normalizeQueueSelectionTelemetry(value);
      return this;
    },
    mergeRpc(result) {
      const normalized = normalizeRpcOutcome(result);
      this.count('rpcSent', Number(result?.rpcSent || 0));
      this.count('inserted', normalized.inserted);
      this.count('updated', normalized.updated);
      this.count('ignored', normalized.ignored);
      this.count('failed', normalized.failed);
      if (normalized.partialSuccess) status = 'partial';
      return normalized;
    },
    snapshot() {
      const resolvedStatus = status === 'completed'
        ? deriveMarketplaceStatus({ counters, sourceStatus: null, fatal })
        : status;
      return Object.freeze({
        contractVersion: DISCOVERY_FUNNEL_CONTRACT_VERSION,
        marketplace: this.marketplace,
        scenario: this.scenario,
        correlationId: this.correlationId,
        startedAt: this.startedAt,
        status: resolvedStatus,
        terminalStatus: terminalStatus || deriveMarketplaceTerminalStatus({ counters, fatal }),
        sourceTelemetry: sourceTelemetry ? Object.freeze({ ...sourceTelemetry }) : null,
        scenarioRuntime: runtime ? Object.freeze({
          ...runtime,
          flags: Object.freeze({ ...(runtime.flags || {}) }),
          scheduleWindow: runtime.scheduleWindow ? Object.freeze({ ...runtime.scheduleWindow, scenarioIds: Object.freeze([...(runtime.scheduleWindow.scenarioIds || [])]) }) : runtime.scheduleWindow,
        }) : null,
        counters: Object.freeze({ ...counters }),
        rejectionReasons: Object.freeze({ ...rejectionReasons }),
        stageTelemetry: stageTelemetry ? Object.freeze({ ...stageTelemetry }) : null,
        finalByCategory: Object.freeze({ ...categorySummary }),
        queueSelection: Object.freeze({
          ...queueSelection,
          rejectionReasons: Object.freeze({ ...queueSelection.rejectionReasons }),
          changedRejections: Object.freeze(queueSelection.changedRejections.map((item) => Object.freeze({ ...item }))),
          items: Object.freeze(queueSelection.items.map((item) => Object.freeze({ ...item }))),
        }),
      });
    },
  };
}

module.exports = {
  DISCOVERY_FUNNEL_CONTRACT_VERSION,
  DISCOVERY_FUNNEL_STATUSES,
  DISCOVERY_TERMINAL_STATUSES,
  FUNNEL_STAGES,
  attachDiscoveryFunnelMeta,
  canonicalRejectionReason,
  createDiscoveryFunnel,
  deriveMarketplaceStatus,
  deriveMarketplaceTerminalStatus,
  normalizeRpcOutcome,
  normalizeFinalByCategory,
  normalizeQueueSelectionTelemetry,
  readDiscoveryFunnelMeta,
};
