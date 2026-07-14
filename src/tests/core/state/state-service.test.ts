import { describe, expect, it } from "vitest";

import {
  transitionOfferState,
  transitionPostState,
  type ClockPort,
  type OfferTransitionCommand,
  type StateServiceDependencies,
  type UUIDPort
} from "@/core/state";
import { MemoryStateAdapter } from "@/core/state/adapters/memory-state-adapter";

class FixedClock implements ClockPort {
  now(): string {
    return "2026-07-13T20:00:00.000Z";
  }
}

class SequenceUUID implements UUIDPort {
  private sequence = 0;

  generate(): string {
    this.sequence += 1;
    return `audit-${this.sequence}`;
  }
}

function createHarness() {
  const adapter = new MemoryStateAdapter([
    {
      entityType: "offer",
      entityId: "offer-1",
      tenantId: "tenant-1",
      state: "pending_manual_review",
      version: 1
    },
    {
      entityType: "post",
      entityId: "post-1",
      tenantId: "tenant-1",
      state: "draft",
      version: 3
    }
  ]);
  const dependencies: StateServiceDependencies = {
    repository: adapter,
    audit: adapter,
    clock: new FixedClock(),
    uuid: new SequenceUUID(),
    idempotency: adapter
  };

  return { adapter, dependencies };
}

function offerCommand(overrides: Partial<OfferTransitionCommand> = {}): OfferTransitionCommand {
  return {
    contractVersion: "pmav5.state-transition/v1",
    commandId: "command-1",
    idempotencyKey: "offer-1:select",
    correlationId: "correlation-1",
    causationId: "curation-request-1",
    tenantId: "tenant-1",
    entityType: "offer",
    entityId: "offer-1",
    expectedVersion: 1,
    fromState: "pending_manual_review",
    toState: "selected",
    actor: { type: "user", id: "user-1", service: "curation" },
    origin: "nextjs-curation",
    reason: { code: "MANUAL_SELECTION", detail: "Explicit selection" },
    evidenceRefs: [],
    requestedAt: "2026-07-13T19:59:00.000Z",
    ...overrides
  };
}

describe("State Service", () => {
  it("applies an offer transition with compare-and-set", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(offerCommand(), dependencies);

    expect(result).toMatchObject({
      status: "applied",
      previousState: "pending_manual_review",
      newState: "selected",
      previousVersion: 1,
      newVersion: 2,
      auditId: "audit-1",
      appliedAt: "2026-07-13T20:00:00.000Z"
    });
    expect(adapter.getEntity("offer", "offer-1", "tenant-1")).toMatchObject({
      state: "selected",
      version: 2
    });
    expect(adapter.casAttempts).toBe(1);
  });

  it("applies the only official post transition", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionPostState(
      {
        ...offerCommand(),
        commandId: "command-post-1",
        idempotencyKey: "post-1:publish",
        entityType: "post",
        entityId: "post-1",
        expectedVersion: 3,
        fromState: "draft",
        toState: "published"
      },
      dependencies
    );

    expect(result).toMatchObject({ status: "applied", newState: "published", newVersion: 4 });
    expect(adapter.getEntity("post", "post-1", "tenant-1")).toMatchObject({
      state: "published",
      version: 4
    });
  });

  it("rejects an invalid transition without attempting CAS", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(
      offerCommand({ toState: "approved" }),
      dependencies
    );

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_TRANSITION" });
    expect(adapter.casAttempts).toBe(0);
    expect(adapter.getEntity("offer", "offer-1", "tenant-1")?.state).toBe(
      "pending_manual_review"
    );
  });

  it("rejects an incorrect expected state without attempting CAS", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(
      offerCommand({ fromState: "selected", toState: "approved" }),
      dependencies
    );

    expect(result).toMatchObject({ status: "rejected", code: "STATE_CONFLICT" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("rejects an incorrect expected version without attempting CAS", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(
      offerCommand({ expectedVersion: 0 }),
      dependencies
    );

    expect(result).toMatchObject({ status: "rejected", code: "VERSION_CONFLICT" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("rejects an entity that does not exist", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(
      offerCommand({ entityId: "missing-offer" }),
      dependencies
    );

    expect(result).toMatchObject({ status: "rejected", code: "ENTITY_NOT_FOUND" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("rejects an invalid command before reading state", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(offerCommand({ commandId: "" }), dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_COMMAND" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("rejects a runtime entity type that does not match the public operation", async () => {
    const { adapter, dependencies } = createHarness();
    const invalid = {
      ...offerCommand(),
      entityType: "post",
      entityId: "post-1",
      expectedVersion: 3,
      fromState: "draft",
      toState: "published"
    } as unknown as OfferTransitionCommand;

    const result = await transitionOfferState(invalid, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_COMMAND" });
    expect(adapter.casAttempts).toBe(0);
    expect(adapter.getEntity("post", "post-1", "tenant-1")?.state).toBe("draft");
  });

  it("rejects a runtime command without an actor", async () => {
    const { adapter, dependencies } = createHarness();
    const invalid = { ...offerCommand(), actor: undefined } as unknown as OfferTransitionCommand;

    const result = await transitionOfferState(invalid, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_COMMAND" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("rejects a command with a non-UTC requested timestamp", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(
      offerCommand({ requestedAt: "2026-07-13 19:59:00" }),
      dependencies
    );

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_COMMAND" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("rejects a command with an empty evidence reference", async () => {
    const { adapter, dependencies } = createHarness();

    const result = await transitionOfferState(
      offerCommand({ evidenceRefs: [""] }),
      dependencies
    );

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_COMMAND" });
    expect(adapter.casAttempts).toBe(0);
  });

  it("returns the exact original result when replaying the same command", async () => {
    const { adapter, dependencies } = createHarness();
    const command = offerCommand();

    const original = await transitionOfferState(command, dependencies);
    const replay = await transitionOfferState(command, dependencies);

    expect(replay).toBe(original);
    expect(adapter.casAttempts).toBe(1);
    expect(adapter.audits.map((audit) => audit.result)).toEqual(["applied", "idempotent_replay"]);
  });

  it("rejects the same idempotency key with a different payload", async () => {
    const { adapter, dependencies } = createHarness();
    await transitionOfferState(offerCommand(), dependencies);

    const conflict = await transitionOfferState(
      offerCommand({
        commandId: "command-2",
        reason: { code: "MANUAL_SELECTION", detail: "Changed payload" }
      }),
      dependencies
    );

    expect(conflict).toMatchObject({ status: "rejected", code: "IDEMPOTENCY_CONFLICT" });
    expect(adapter.casAttempts).toBe(1);
  });

  it("registers structured audit data for success", async () => {
    const { adapter, dependencies } = createHarness();

    await transitionOfferState(offerCommand(), dependencies);

    expect(adapter.audits).toEqual([
      expect.objectContaining({
        auditId: "audit-1",
        timestamp: "2026-07-13T20:00:00.000Z",
        actor: { type: "user", id: "user-1", service: "curation" },
        origin: "nextjs-curation",
        reason: { code: "MANUAL_SELECTION", detail: "Explicit selection" },
        entity: "offer",
        entityId: "offer-1",
        previousState: "pending_manual_review",
        newState: "selected",
        commandId: "command-1",
        correlationId: "correlation-1",
        causationId: "curation-request-1",
        result: "applied"
      })
    ]);
  });

  it("registers structured audit data for an error", async () => {
    const { adapter, dependencies } = createHarness();

    await transitionOfferState(offerCommand({ entityId: "missing-offer" }), dependencies);

    expect(adapter.audits).toEqual([
      expect.objectContaining({
        previousState: null,
        newState: "selected",
        result: "rejected",
        errorCode: "ENTITY_NOT_FOUND"
      })
    ]);
  });

  it("allows only one of two concurrent writers to update the same version", async () => {
    const { adapter, dependencies } = createHarness();

    const [selection, rejection] = await Promise.all([
      transitionOfferState(offerCommand(), dependencies),
      transitionOfferState(
        offerCommand({
          commandId: "command-2",
          idempotencyKey: "offer-1:reject",
          toState: "rejected",
          reason: { code: "MANUAL_REJECTION", detail: "Explicit rejection" }
        }),
        dependencies
      )
    ]);

    expect([selection.status, rejection.status].sort()).toEqual(["applied", "rejected"]);
    expect(adapter.getEntity("offer", "offer-1", "tenant-1")?.version).toBe(2);
    expect(adapter.casAttempts).toBe(2);
  });
});
