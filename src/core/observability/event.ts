import type { ClockPort, UUIDPort } from "./ports";
import { sanitizeObservabilityValue } from "./sanitization";
import {
  OBSERVABILITY_EVENT_VERSION,
  type ObservabilityContext,
  type ObservabilityEvent,
  type ObservabilityEventDetails,
  type OfficialEventType
} from "./types";

export function createObservabilityEvent(input: {
  eventType: OfficialEventType;
  context: ObservabilityContext;
  clock: ClockPort;
  uuid: UUIDPort;
  details?: ObservabilityEventDetails;
}): ObservabilityEvent {
  if (!input.context.correlationId) throw new Error("correlationId is required");
  const details = input.details ?? {};
  return {
    eventVersion: OBSERVABILITY_EVENT_VERSION,
    eventId: input.uuid.generate(),
    eventType: input.eventType,
    timestamp: input.clock.now(),
    service: input.context.service,
    component: input.context.component,
    environment: input.context.environment,
    commandId: input.context.commandId ?? null,
    idempotencyKey: input.context.idempotencyKey ?? null,
    correlationId: input.context.correlationId,
    causationId: input.context.causationId ?? null,
    executionId: input.context.executionId ?? null,
    tenantId: input.context.tenantId ?? null,
    userId: input.context.userId ?? null,
    entityType: details.entityType ?? null,
    entityId: details.entityId ?? null,
    offerId: details.offerId ?? null,
    postId: details.postId ?? null,
    marketplace: details.marketplace ?? null,
    channel: details.channel ?? null,
    provider: details.provider ?? null,
    model: details.model ?? null,
    transport: details.transport ?? null,
    previousState: details.previousState ?? null,
    desiredState: details.desiredState ?? null,
    finalState: details.finalState ?? null,
    expectedVersion: details.expectedVersion ?? null,
    actualVersion: details.actualVersion ?? null,
    durationMs: details.durationMs ?? null,
    attempt: details.attempt ?? null,
    replay: details.replay ?? false,
    result: details.result ?? "started",
    errorCode: details.errorCode ?? null,
    failureStage: details.failureStage ?? null,
    severity: details.severity ?? "INFO",
    metadata: sanitizeObservabilityValue(details.metadata ?? {})
  };
}

