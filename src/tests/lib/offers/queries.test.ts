import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, client, offersQuery, postsQuery } = vi.hoisted(() => {
  const offersQuery: any = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve({
      data: [
        { id: "new-1", platform: "Shopee", status: "pending_manual_review", created_at: "2026-07-15T12:00:00Z" },
        { id: "new-2", platform: "Amazon", status: "pending_manual_review", created_at: "2026-07-15T11:00:00Z" }
      ],
      error: null
    }))
  };
  const postsQuery: any = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve({
      data: [{ offer_id: "new-1" }, { offer_id: "new-1" }, { offer_id: "new-2" }],
      error: null
    }))
  };
  const client = { from: vi.fn((table: string) => table === "offers" ? offersQuery : postsQuery) };
  return { offersQuery, postsQuery, client, createServerSupabaseClient: vi.fn(async () => client) };
});

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { listOffersWithDraftStatus } from "@/lib/offers/queries";

describe("listOffersWithDraftStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("usa a query real das 100 ofertas mais recentes e conta somente posts draft", async () => {
    const result = await listOffersWithDraftStatus();
    expect(client.from).toHaveBeenNthCalledWith(1, "offers");
    expect(offersQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(offersQuery.limit).toHaveBeenCalledWith(100);
    expect(postsQuery.in).toHaveBeenCalledWith("offer_id", ["new-1", "new-2"]);
    expect(postsQuery.eq).toHaveBeenCalledWith("status", "draft");
    expect(result).toEqual([
      expect.objectContaining({ id: "new-1", draft_count: 2 }),
      expect.objectContaining({ id: "new-2", draft_count: 1 })
    ]);
  });
});
