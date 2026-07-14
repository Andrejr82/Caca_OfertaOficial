import { describe, expect, it } from "vitest";
import { MemoryStateAdapter } from "@/core/state/adapters/memory-state-adapter";
import {
  transitionOfficialOfferState,
  transitionOfficialPostState
} from "@/lib/state/official-state-service";

const clock = { now: () => "2026-07-14T01:00:00.000Z" };
let uuidSequence = 0;
const uuid = { generate: () => `audit-${++uuidSequence}` };

function dependencies(adapter: MemoryStateAdapter) {
  return { repository: adapter, audit: adapter, idempotency: adapter, clock, uuid };
}

function context(idempotencyKey: string) {
  return {
    commandId: `${idempotencyKey}:command`,
    idempotencyKey,
    correlationId: `${idempotencyKey}:correlation`,
    causationId: null,
    tenantId: "tenant-1",
    actor: { type: "user" as const, id: "user-1", service: "nextjs-curation" },
    requestedAt: "2026-07-14T00:59:00.000Z"
  };
}

describe("official runtime state service", () => {
  it("creates selected through transitionOfferState and AuditPort", async () => {
    const adapter = new MemoryStateAdapter([
      { entityType: "offer", entityId: "offer-1", tenantId: "tenant-1", state: "pending_manual_review", version: 0 }
    ]);

    const result = await transitionOfficialOfferState({
      ...context("curation:offer-1:select"),
      entityId: "offer-1",
      fromState: "pending_manual_review",
      toState: "selected",
      origin: "offers.action.select",
      reason: { code: "MANUAL_SELECTION" },
      evidenceRefs: ["offer:offer-1"]
    }, dependencies(adapter));

    expect(result).toMatchObject({ status: "applied", newState: "selected" });
    expect(adapter.audits).toHaveLength(1);
    expect(adapter.audits[0]).toMatchObject({ result: "applied", newState: "selected" });
  });

  it("rejects through transitionOfferState", async () => {
    const adapter = new MemoryStateAdapter([
      { entityType: "offer", entityId: "offer-2", tenantId: "tenant-1", state: "selected", version: 1 }
    ]);

    const result = await transitionOfficialOfferState({
      ...context("curation:offer-2:reject"),
      entityId: "offer-2",
      fromState: "selected",
      toState: "rejected",
      origin: "offers.action.reject",
      reason: { code: "MANUAL_REJECTION" },
      evidenceRefs: ["offer:offer-2"]
    }, dependencies(adapter));

    expect(result).toMatchObject({ status: "applied", newState: "rejected" });
  });

  it("approves through transitionOfferState", async () => {
    const adapter = new MemoryStateAdapter([
      { entityType: "offer", entityId: "offer-3", tenantId: "tenant-1", state: "selected", version: 1 }
    ]);

    const result = await transitionOfficialOfferState({
      ...context("approval:offer-3"),
      actor: { type: "service", id: "nextjs-ai", service: "nextjs-ai" },
      entityId: "offer-3",
      fromState: "selected",
      toState: "approved",
      origin: "ai.generate.approval",
      reason: { code: "AI_POSTS_VALIDATED" },
      evidenceRefs: ["posts:draft:offer-3"]
    }, dependencies(adapter));

    expect(result).toMatchObject({ status: "applied", newState: "approved" });
  });

  it("publishes a draft through transitionPostState", async () => {
    const adapter = new MemoryStateAdapter([
      { entityType: "post", entityId: "post-1", tenantId: "tenant-1", state: "draft", version: 0 }
    ]);

    const result = await transitionOfficialPostState({
      ...context("publication:post-1"),
      actor: { type: "service", id: "nextjs-publication", service: "nextjs-publication" },
      entityId: "post-1",
      fromState: "draft",
      toState: "published",
      origin: "publication.telegram",
      reason: { code: "CHANNEL_RECEIPT_CONFIRMED" },
      evidenceRefs: ["receipt:telegram:123"]
    }, dependencies(adapter));

    expect(result).toMatchObject({ status: "applied", newState: "published" });
  });
});
