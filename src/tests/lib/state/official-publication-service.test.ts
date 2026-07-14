import { describe, expect, it } from "vitest";
import { MemoryStateAdapter } from "@/core/state/adapters/memory-state-adapter";
import { completeOfficialPublication } from "@/lib/state/official-publication-service";

const clock = { now: () => "2026-07-14T02:00:00.000Z" };
let uuidSequence = 0;
const uuid = { generate: () => `audit-publication-${++uuidSequence}` };

function dependencies(adapter: MemoryStateAdapter) {
  return { repository: adapter, audit: adapter, idempotency: adapter, clock, uuid };
}

describe("completeOfficialPublication", () => {
  it("requires approved offer and draft post, then transitions both through the State Service", async () => {
    const adapter = new MemoryStateAdapter([
      { entityType: "offer", entityId: "offer-1", tenantId: "tenant-1", state: "approved", version: 2 },
      { entityType: "post", entityId: "post-1", tenantId: "tenant-1", state: "draft", version: 0 }
    ]);

    const result = await completeOfficialPublication({
      tenantId: "tenant-1",
      actorId: "nextjs-publication",
      offerId: "offer-1",
      postId: "post-1",
      origin: "publication.telegram",
      requestedAt: "2026-07-14T01:59:00.000Z",
      idempotencyKey: "publication:post-1:telegram-123",
      receiptRef: "receipt:telegram:123"
    }, dependencies(adapter));

    expect(result.post).toMatchObject({ status: "applied", newState: "published" });
    expect(result.offer).toMatchObject({ status: "applied", newState: "posted" });
    expect(adapter.audits).toHaveLength(2);
  });

  it("fails closed before publication when the offer is not approved", async () => {
    const adapter = new MemoryStateAdapter([
      { entityType: "offer", entityId: "offer-2", tenantId: "tenant-1", state: "selected", version: 1 },
      { entityType: "post", entityId: "post-2", tenantId: "tenant-1", state: "draft", version: 0 }
    ]);

    await expect(completeOfficialPublication({
      tenantId: "tenant-1",
      actorId: "nextjs-publication",
      offerId: "offer-2",
      postId: "post-2",
      origin: "publication.whatsapp",
      requestedAt: "2026-07-14T01:59:00.000Z",
      idempotencyKey: "publication:post-2:wa-123",
      receiptRef: "receipt:whatsapp:123"
    }, dependencies(adapter))).rejects.toThrow(/approved/i);
    expect(adapter.casAttempts).toBe(0);
  });
});
