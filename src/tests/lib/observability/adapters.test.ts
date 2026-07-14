import { describe, expect, it, vi } from "vitest";
import { createObservabilityEvent } from "@/core/observability";
import {
  AIObservabilityAuditAdapter,
  IntegrationLogsRecoveryAdapter,
  IntegrationLogsObservabilityAdapter,
  PublicationObservabilityAuditAdapter,
  StateObservabilityAuditAdapter,
  StructuredLogObservabilityAdapter
} from "@/lib/observability";

const event = createObservabilityEvent({
  eventType: "ai.provider.failed",
  context: {
    service: "official-ai", component: "ai-service", environment: "test",
    commandId: "command-1", idempotencyKey: "ai:key", correlationId: "correlation-1",
    causationId: "curation-1", tenantId: "tenant-1"
  },
  clock: { now: () => "2026-07-14T12:00:00.000Z" },
  uuid: { generate: () => "event-1" },
  details: { result: "failed", severity: "ERROR", metadata: { token: "secret", safe: "ok" } }
});

describe("observability adapters", () => {
  it("writes one sanitized JSON line through the injected server-side sink", () => {
    const sink = vi.fn();
    new StructuredLogObservabilityAdapter(sink).emit(event);
    const parsed = JSON.parse(sink.mock.calls[0][0]);
    expect(parsed.metadata).toEqual({ token: "[REDACTED]", safe: "ok" });
    expect(parsed.eventId).toBe("event-1");
  });

  it("maps events to existing integration_logs without leaking payloads", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    await new IntegrationLogsObservabilityAdapter({ insert }).emit(event);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1", service: "official-ai",
      event_type: "ai.provider.failed", correlation_id: "correlation-1"
    }));
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("secret");
  });

  it("bridges State, AI and Publication audit records to official events", async () => {
    const emit = vi.fn();
    const register = vi.fn();
    const dependencies = {
      events: { emit }, clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-bridge" }, environment: "test"
    };
    await new StateObservabilityAuditAdapter({ register }, dependencies).register({
      result: "applied", commandId: "c1", correlationId: "corr", causationId: null,
      timestamp: "2026-07-14T12:00:00.000Z", entity: "offer", entityId: "offer-1",
      previousState: "selected", newState: "approved"
    } as never);
    await new AIObservabilityAuditAdapter({ register }, dependencies).register({
      result: "approved", commandId: "c2", idempotencyKey: "ai:key",
      correlationId: "corr", causationId: "c1", tenantId: "tenant-1", offerId: "offer-1"
    } as never);
    await new PublicationObservabilityAuditAdapter({ register }, dependencies).register({
      result: "published", commandId: "c3", idempotencyKey: "pub:key",
      correlationId: "corr", causationId: "c2", tenantId: "tenant-1",
      offerId: "offer-1", postId: "post-1", channel: "telegram"
    } as never);

    expect(register).toHaveBeenCalledTimes(3);
    expect(emit.mock.calls.map(([value]) => value.eventType)).toEqual([
      "state.transition.completed", "ai.approved", "publication.offer.posted"
    ]);
  });

  it("does not corrupt an official result when observability emission fails", async () => {
    const register = vi.fn();
    const adapter = new StateObservabilityAuditAdapter({ register }, {
      events: { emit: vi.fn().mockRejectedValue(new Error("sink unavailable")) },
      clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-bridge" }, environment: "test"
    });
    await expect(adapter.register({
      result: "applied", commandId: "c1", correlationId: "corr", causationId: null,
      timestamp: "2026-07-14T12:00:00.000Z", entity: "offer", entityId: "offer-1",
      previousState: "selected", newState: "approved"
    } as never)).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledOnce();
  });

  it("stores recovery records in the existing integration log abstraction idempotently", async () => {
    const repository = {
      upsert: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined)
    };
    const adapter = new IntegrationLogsRecoveryAdapter(repository);
    await adapter.enqueue({
      recoveryId: "r1", tenantId: "tenant-1", commandId: "c1", idempotencyKey: "recovery:key",
      correlationId: "corr", causationId: null, service: "ai", failureStage: "selected_stuck",
      entityType: "offer", entityId: "offer-1", offerId: "offer-1", postId: null,
      channel: null, provider: null, errorCode: "SELECTED_STUCK", errorMessage: "stuck",
      attempts: 0, firstFailedAt: "2026-07-14T12:00:00.000Z", lastFailedAt: "2026-07-14T12:00:00.000Z",
      nextAction: "REPLAY_AI", replayAllowed: true, status: "OPEN", resolvedAt: null, resolutionReason: null
    });
    expect(repository.upsert).toHaveBeenCalledWith("recovery:key", expect.objectContaining({
      integration: "pmav5-recovery", user_id: "tenant-1", status: "OPEN"
    }));
  });
});
