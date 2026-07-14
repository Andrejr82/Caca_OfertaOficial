import { describe, expect, it, vi } from "vitest";
import {
  InMemoryMetricsAdapter,
  InMemoryRecoveryQueueAdapter,
  OFFICIAL_ALERTS,
  OFFICIAL_METRICS,
  createObservabilityEvent,
  createReconciliationService,
  detectRecoveryItems,
  evaluateHealth,
  sanitizeObservabilityValue,
  type ObservabilityContext,
  type RecoverySnapshot
} from "@/core/observability";

const context: ObservabilityContext = {
  service: "official-publication",
  component: "publication-service",
  environment: "test",
  commandId: "command-1",
  idempotencyKey: "publication:post-1",
  correlationId: "correlation-1",
  causationId: "ai-command-1",
  executionId: "execution-1",
  tenantId: "tenant-1"
};

describe("pmav5 observability envelope", () => {
  it("requires eventVersion, eventId and timestamp", () => {
    const event = createObservabilityEvent({
      eventType: "publication.requested",
      context,
      clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-1" }
    });

    expect(event).toMatchObject({
      eventVersion: "pmav5.observability/v1",
      eventId: "event-1",
      timestamp: "2026-07-14T12:00:00.000Z"
    });
  });

  it("propagates command, correlation and causation ids and uses null for absent fields", () => {
    const event = createObservabilityEvent({
      eventType: "state.transition.requested",
      context,
      clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-2" }
    });

    expect(event).toMatchObject({
      commandId: "command-1",
      correlationId: "correlation-1",
      causationId: "ai-command-1",
      offerId: null,
      postId: null,
      provider: null
    });
  });

  it("sanitizes secrets, tokens, api keys and sensitive payloads recursively", () => {
    expect(sanitizeObservabilityValue({
      apiKey: "secret",
      authorization: "Bearer token",
      nested: { access_token: "secret", password: "secret", safe: "ok" },
      prompt: "full private prompt",
      response: "full provider response"
    })).toEqual({
      apiKey: "[REDACTED]",
      authorization: "[REDACTED]",
      nested: { access_token: "[REDACTED]", password: "[REDACTED]", safe: "ok" },
      prompt: "[REDACTED]",
      response: "[REDACTED]"
    });
  });
});

describe("official metrics", () => {
  it("defines every required metric with controlled labels and operations metadata", () => {
    const required = [
      "discovery_cycles_total", "discovery_cycles_failed_total", "discovery_candidates_found_total",
      "discovery_candidates_persisted_total", "discovery_candidates_rejected_total", "discovery_duplicates_total",
      "discovery_duration_ms", "state_transitions_total", "state_transition_conflicts_total",
      "state_transition_rejections_total", "state_transition_replays_total", "state_transition_duration_ms",
      "curation_selected_total", "curation_rejected_total", "curation_pending_age_ms",
      "ai_requests_total", "ai_failures_total", "ai_replays_total", "ai_provider_duration_ms",
      "ai_posts_created_total", "ai_selected_age_ms", "publication_requests_total",
      "publication_failures_total", "publication_replays_total", "publication_receipts_total",
      "publication_reconciliation_required_total", "publication_duration_ms", "publication_draft_age_ms",
      "recovery_items_open", "recovery_replays_total", "recovery_replay_failures_total",
      "recovery_oldest_item_age_ms", "worker_heartbeat_age_ms", "scheduler_last_run_age_ms",
      "service_health", "service_readiness"
    ];
    expect(OFFICIAL_METRICS.map((metric) => metric.name)).toEqual(expect.arrayContaining(required));
    expect(OFFICIAL_METRICS.every((metric) =>
      metric.owner && metric.action && metric.labels.every((label) => !/id$/i.test(label))
    )).toBe(true);
  });

  it("defines owned alerts with severity, threshold, window, runbook and resolution", () => {
    expect(OFFICIAL_ALERTS.some((alert) => alert.severity === "CRITICAL")).toBe(true);
    expect(OFFICIAL_ALERTS.every((alert) =>
      alert.owner && alert.threshold && alert.window && alert.action &&
      alert.runbook && alert.escalation && alert.resolution
    )).toBe(true);
  });

  it("supports counters, gauges and histograms without entity IDs as labels", () => {
    const metrics = new InMemoryMetricsAdapter();
    metrics.increment("publication_requests_total", 1, { channel: "telegram" });
    metrics.gauge("recovery_items_open", 2, { service: "publication" });
    metrics.observe("publication_duration_ms", 120, { result: "published" });

    expect(metrics.snapshot()).toMatchObject({
      counters: { 'publication_requests_total{channel="telegram"}': 1 },
      gauges: { 'recovery_items_open{service="publication"}': 2 },
      histograms: { 'publication_duration_ms{result="published"}': [120] }
    });
    expect(() => metrics.increment("publication_requests_total", 1, { offerId: "offer-1" }))
      .toThrow(/high-cardinality/i);
  });
});

describe("read-only recovery detection", () => {
  it("detects stuck selected/approved, divergent receipt, expired reservation and missing heartbeat", () => {
    const snapshot: RecoverySnapshot = {
      now: "2026-07-14T12:00:00.000Z",
      thresholdsMs: { pending: 60_000, selected: 60_000, approved: 60_000, draft: 60_000, heartbeat: 60_000, scheduler: 60_000 },
      offers: [
        { id: "offer-selected", tenantId: "tenant-1", state: "selected", updatedAt: "2026-07-14T11:00:00.000Z", hasDraftPosts: false },
        { id: "offer-approved", tenantId: "tenant-1", state: "approved", updatedAt: "2026-07-14T11:00:00.000Z", hasDraftPosts: false }
      ],
      posts: [{ id: "post-1", offerId: "offer-approved", tenantId: "tenant-1", state: "draft", updatedAt: "2026-07-14T11:00:00.000Z", finalReceipt: true }],
      reservations: [{ id: "reservation-1", tenantId: "tenant-1", expiresAt: "2026-07-14T11:30:00.000Z" }],
      heartbeats: [{ component: "oracle-worker", lastSeenAt: "2026-07-14T11:00:00.000Z" }]
    };

    const items = detectRecoveryItems(snapshot);
    expect(items.map((item) => item.failureStage)).toEqual(expect.arrayContaining([
      "selected_stuck", "approved_without_drafts", "receipt_state_divergence",
      "reservation_expired", "worker_heartbeat_missing"
    ]));
    expect(snapshot.offers[0].state).toBe("selected");
  });

  it("creates recovery items idempotently", async () => {
    const queue = new InMemoryRecoveryQueueAdapter();
    const item = {
      recoveryId: "recovery-1", commandId: "command-1", idempotencyKey: "recovery:key",
      correlationId: "correlation-1", causationId: null, service: "ai",
      failureStage: "selected_stuck", entityType: "offer", entityId: "offer-1",
      offerId: "offer-1", postId: null, channel: null, provider: null,
      errorCode: "SELECTED_STUCK", errorMessage: "Selected operation is stuck",
      attempts: 0, firstFailedAt: "2026-07-14T12:00:00.000Z",
      lastFailedAt: "2026-07-14T12:00:00.000Z", nextAction: "REPLAY_AI",
      replayAllowed: true, status: "OPEN" as const, resolvedAt: null, resolutionReason: null,
      tenantId: "tenant-1"
    };
    await queue.enqueue(item);
    await queue.enqueue(item);
    expect(await queue.list("tenant-1")).toHaveLength(1);
  });
});

describe("reconciliation service", () => {
  it("requires authentication, tenant and idempotency", async () => {
    const service = createReconciliationService({
      repository: { find: vi.fn() },
      state: { replay: vi.fn() },
      ai: { replay: vi.fn() },
      publication: { replay: vi.fn() },
      events: { emit: vi.fn() },
      clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-1" }
    });
    await expect(service.replay({ authenticated: false, tenantId: "", recoveryId: "r1", commandId: "c1", idempotencyKey: "" }))
      .rejects.toThrow(/authenticated/i);
  });

  it("delegates AI replay to the official AI service and never writes state", async () => {
    const aiReplay = vi.fn().mockResolvedValue({ status: "approved" });
    const repository = {
      find: vi.fn().mockResolvedValue({
        recoveryId: "r1", tenantId: "tenant-1", service: "ai", status: "OPEN",
        replayAllowed: true, commandId: "c1", idempotencyKey: "key-1",
        correlationId: "corr-1", causationId: null
      }),
      markTechnicalStatus: vi.fn()
    };
    const service = createReconciliationService({
      repository,
      state: { replay: vi.fn() },
      ai: { replay: aiReplay },
      publication: { replay: vi.fn() },
      events: { emit: vi.fn() },
      clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-1" }
    });

    await service.replay({ authenticated: true, tenantId: "tenant-1", recoveryId: "r1", commandId: "c1", idempotencyKey: "key-1" });
    expect(aiReplay).toHaveBeenCalledOnce();
    expect(repository.markTechnicalStatus).toHaveBeenCalledWith("r1", "tenant-1", "RESOLVED", expect.any(String));
  });

  it("does not call publication transport when a final receipt already exists", async () => {
    const publicationReplay = vi.fn();
    const service = createReconciliationService({
      repository: {
        find: vi.fn().mockResolvedValue({
          recoveryId: "r1", tenantId: "tenant-1", service: "publication", status: "OPEN",
          replayAllowed: true, commandId: "c1", idempotencyKey: "key-1",
          correlationId: "corr-1", causationId: null, finalReceipt: true
        }),
        markTechnicalStatus: vi.fn()
      },
      state: { replay: vi.fn() },
      ai: { replay: vi.fn() },
      publication: { replay: publicationReplay },
      events: { emit: vi.fn() },
      clock: { now: () => "2026-07-14T12:00:00.000Z" },
      uuid: { generate: () => "event-1" }
    });
    await expect(service.replay({ authenticated: true, tenantId: "tenant-1", recoveryId: "r1", commandId: "c1", idempotencyKey: "key-1" }))
      .rejects.toThrow(/receipt/i);
    expect(publicationReplay).not.toHaveBeenCalled();
  });
});

describe("health and readiness", () => {
  it("checks dependencies without invoking business flows and sanitizes details", async () => {
    const mutation = vi.fn();
    const result = await evaluateHealth([
      { name: "supabase", required: true, check: async () => ({ healthy: true, detail: { apiKey: "secret", region: "br" } }) },
      { name: "audit-storage", required: true, check: async () => ({ healthy: false, detail: "unavailable" }) }
    ]);

    expect(result.healthy).toBe(false);
    expect(result.ready).toBe(false);
    expect(result.checks[0].detail).toEqual({ apiKey: "[REDACTED]", region: "br" });
    expect(mutation).not.toHaveBeenCalled();
  });
});
