import { describe, expect, it, vi } from "vitest";
import { advanceCycleCheckpoint, loadCycleCheckpoint } from "@/lib/ai/official/official-ai-cycle-checkpoint";

function chain(result: unknown) {
  const builder: any = { select: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.insert.mockResolvedValue(result);
  builder.maybeSingle.mockResolvedValue(result);
  builder.update.mockReturnValue(builder);
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return builder;
}

describe("Official AI cycle checkpoint", () => {
  it("cria, avança uma página e persiste o próximo checkpoint", async () => {
    const missing = chain({ data: null, error: null });
    const insert = chain({ data: null, error: null });
    const update = chain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(missing).mockReturnValueOnce(insert).mockReturnValueOnce(update) };
    const ids = Array.from({ length: 120 }, (_, index) => `offer-${index}`);

    const checkpoint = await loadCycleCheckpoint(client, "tenant-1", "cycle-1", ids, 3);
    const advanced = await advanceCycleCheckpoint(client, "tenant-1", checkpoint, {
      status: "drafted", commandId: "page-1", offerId: "CYCLE_PAGE_1", offerState: "pending_manual_review",
      completedAt: "2026-07-15T12:00:00.000Z", batchCompleted: false,
      batch: { pageNumber: 1, totalPages: 3, offerIdsReceived: 50, offersVisited: 50, draftedOffers: 49,
        draftsPersisted: 147, rejectedOffers: 1, idempotentReplays: 0, stalePending: 0, batchCompleted: false }
    });

    expect(advanced).toMatchObject({ nextPage: 2, status: "pending", metrics: { pagesProcessed: 1, offersVisited: 50, draftsPersisted: 147 } });
    expect(update.update).toHaveBeenCalledWith({ value: expect.objectContaining({ nextPage: 2 }) });
  });

  it("retoma o checkpoint existente e rejeita IDs diferentes no mesmo correlationId", async () => {
    const stored = {
      correlationId: "cycle-1", offerIds: ["offer-1"], totalPages: 1, nextPage: 1, status: "pending",
      metrics: { pagesProcessed: 0, offersVisited: 0, draftedOffers: 0, draftsPersisted: 0, rejectedOffers: 0, idempotentReplays: 0, stalePending: 0 },
      pageStatuses: [], updatedAt: "2026-07-15T12:00:00.000Z"
    };
    const read = chain({ data: { value: stored }, error: null });
    const client = { from: vi.fn(() => read) };
    await expect(loadCycleCheckpoint(client, "tenant-1", "cycle-1", ["offer-2"], 1))
      .rejects.toThrow("payload changed");
  });
});
