export interface MetricDefinition {
  name: string;
  type: "counter" | "gauge" | "histogram";
  owner: string;
  labels: readonly string[];
  threshold: string;
  action: string;
}

const counters = [
  "discovery_cycles_total", "discovery_cycles_failed_total", "discovery_candidates_found_total",
  "discovery_candidates_persisted_total", "discovery_candidates_rejected_total", "discovery_duplicates_total",
  "state_transitions_total", "state_transition_conflicts_total", "state_transition_rejections_total",
  "state_transition_replays_total", "curation_selected_total", "curation_rejected_total",
  "ai_requests_total", "ai_failures_total", "ai_replays_total", "ai_posts_created_total",
  "publication_requests_total", "publication_failures_total", "publication_replays_total",
  "publication_receipts_total", "publication_reconciliation_required_total",
  "recovery_replays_total", "recovery_replay_failures_total"
] as const;
const gauges = [
  "curation_pending_age_ms", "ai_selected_age_ms", "publication_draft_age_ms",
  "recovery_items_open", "recovery_oldest_item_age_ms", "worker_heartbeat_age_ms",
  "scheduler_last_run_age_ms", "service_health", "service_readiness"
] as const;
const histograms = [
  "discovery_duration_ms", "state_transition_duration_ms",
  "ai_provider_duration_ms", "publication_duration_ms"
] as const;

function owner(name: string): string {
  if (name.startsWith("discovery") || name.startsWith("worker") || name.startsWith("scheduler")) return "Discovery Operations";
  if (name.startsWith("state")) return "State Service";
  if (name.startsWith("curation")) return "Curation Operations";
  if (name.startsWith("ai")) return "AI Operations";
  if (name.startsWith("publication")) return "Publication Operations";
  if (name.startsWith("recovery")) return "Recovery Operations";
  return "Platform Operations";
}
function labels(name: string): readonly string[] {
  if (name.startsWith("discovery")) return ["marketplace", "result"];
  if (name.startsWith("publication")) return ["channel", "result"];
  if (name.startsWith("ai")) return ["provider", "result"];
  if (name.startsWith("state")) return ["entity_type", "result"];
  return ["service", "result"];
}
function definition(name: string, type: MetricDefinition["type"]): MetricDefinition {
  return {
    name, type, owner: owner(name), labels: labels(name),
    threshold: type === "counter" ? "rate outside documented baseline" : "configured operational SLO",
    action: `inspect correlated events and follow PMAV5-011 runbook for ${name}`
  };
}

export const OFFICIAL_METRICS: readonly MetricDefinition[] = [
  ...counters.map((name) => definition(name, "counter")),
  ...gauges.map((name) => definition(name, "gauge")),
  ...histograms.map((name) => definition(name, "histogram"))
];

export interface AlertDefinition {
  name: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  owner: string;
  metric: string;
  threshold: string;
  window: string;
  action: string;
  runbook: string;
  escalation: string;
  resolution: string;
}
const alerts: readonly [string, AlertDefinition["severity"], string, string][] = [
  ["dual_authority_detected", "CRITICAL", "service_health", "any occurrence"],
  ["direct_writer_detected", "CRITICAL", "service_health", "any occurrence"],
  ["duplicate_publication_confirmed", "CRITICAL", "publication_receipts_total", "duplicate receipt evidence"],
  ["receipt_lost", "CRITICAL", "publication_reconciliation_required_total", "confirmed external effect without stored receipt"],
  ["state_service_unavailable", "CRITICAL", "service_readiness", "0"],
  ["cas_bypass_detected", "CRITICAL", "state_transition_conflicts_total", "any bypass evidence"],
  ["worker_heartbeat_missing", "HIGH", "worker_heartbeat_age_ms", "above worker SLO"],
  ["scheduler_delayed", "HIGH", "scheduler_last_run_age_ms", "above scheduler SLO"],
  ["recovery_queue_growing", "HIGH", "recovery_items_open", "monotonic growth"],
  ["selected_stuck", "HIGH", "ai_selected_age_ms", "above AI SLO"],
  ["approved_stuck", "HIGH", "publication_draft_age_ms", "above publication SLO"],
  ["published_without_posted", "HIGH", "publication_reconciliation_required_total", "any occurrence"],
  ["receipt_without_final_state", "HIGH", "publication_reconciliation_required_total", "any occurrence"],
  ["conflict_rate_increase", "MEDIUM", "state_transition_conflicts_total", "above baseline"],
  ["provider_repeated_failure", "MEDIUM", "ai_failures_total", "three failures"],
  ["channel_repeated_failure", "MEDIUM", "publication_failures_total", "three failures"],
  ["manual_review_backlog", "MEDIUM", "curation_pending_age_ms", "above curation SLO"],
  ["expired_reservations", "MEDIUM", "recovery_items_open", "any expired reservation"],
  ["configuration_warning", "LOW", "service_readiness", "optional dependency missing"],
  ["elevated_latency", "LOW", "publication_duration_ms", "p95 above SLO"]
];
export const OFFICIAL_ALERTS: readonly AlertDefinition[] = alerts.map(([name, severity, metric, threshold]) => ({
  name, severity, metric, threshold, owner: owner(metric), window: severity === "CRITICAL" ? "immediate" : "5 minutes",
  action: "pause unsafe action, preserve evidence and diagnose read-only",
  runbook: "PMAV5/RELATORIOS/PMAV5-011_RUNBOOK_OPERACIONAL.md",
  escalation: severity === "CRITICAL" ? "immediate service owner and incident commander" : "service owner",
  resolution: "correlated evidence shows the invariant restored without direct state mutation"
}));

