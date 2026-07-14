export const OBSERVABILITY_EVENT_VERSION = "pmav5.observability/v1" as const;

export const OFFICIAL_EVENT_TYPES = [
  "discovery.started", "discovery.marketplace.started", "discovery.marketplace.completed",
  "discovery.candidate.rejected", "discovery.completed", "discovery.failed",
  "ingestion.started", "ingestion.persisted", "ingestion.conflict", "ingestion.failed",
  "state.transition.requested", "state.transition.completed", "state.transition.conflict",
  "state.transition.rejected", "state.transition.replayed",
  "curation.selected", "curation.rejected",
  "ai.requested", "ai.provider.started", "ai.provider.completed", "ai.provider.failed",
  "ai.posts.persisted", "ai.approved", "ai.replayed", "ai.failed",
  "publication.requested", "publication.reserved", "publication.transport.started",
  "publication.receipt.received", "publication.post.published", "publication.offer.posted",
  "publication.replayed", "publication.failed", "publication.reconciliation.required",
  "recovery.item.detected", "recovery.replay.requested", "recovery.replay.completed",
  "recovery.replay.failed", "recovery.manual_action.required",
  "service.health", "service.readiness", "scheduler.heartbeat", "worker.heartbeat"
] as const;

export type OfficialEventType = typeof OFFICIAL_EVENT_TYPES[number];
export type ObservabilitySeverity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";
export type ObservabilityResult = "started" | "success" | "conflict" | "rejected" | "failed" | "replayed" | "degraded";

export interface ObservabilityContext {
  service: string;
  component: string;
  environment: string;
  commandId?: string | null;
  idempotencyKey?: string | null;
  correlationId: string;
  causationId?: string | null;
  executionId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}

export interface ObservabilityEvent {
  eventVersion: typeof OBSERVABILITY_EVENT_VERSION;
  eventId: string;
  eventType: OfficialEventType;
  timestamp: string;
  service: string;
  component: string;
  environment: string;
  commandId: string | null;
  idempotencyKey: string | null;
  correlationId: string;
  causationId: string | null;
  executionId: string | null;
  tenantId: string | null;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  offerId: string | null;
  postId: string | null;
  marketplace: string | null;
  channel: string | null;
  provider: string | null;
  model: string | null;
  transport: string | null;
  previousState: string | null;
  desiredState: string | null;
  finalState: string | null;
  expectedVersion: number | null;
  actualVersion: number | null;
  durationMs: number | null;
  attempt: number | null;
  replay: boolean;
  result: ObservabilityResult;
  errorCode: string | null;
  failureStage: string | null;
  severity: ObservabilitySeverity;
  metadata: unknown;
}

export type ObservabilityEventDetails = Partial<Omit<
  ObservabilityEvent,
  "eventVersion" | "eventId" | "eventType" | "timestamp" | "service" |
  "component" | "environment" | "commandId" | "idempotencyKey" |
  "correlationId" | "causationId" | "executionId" | "tenantId" | "userId"
>>;

