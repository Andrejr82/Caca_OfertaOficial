import { describe, expect, it, vi } from "vitest";

const { createServerSupabaseClient, client } = vi.hoisted(() => {
  const result = (data: unknown) => {
    const q: any = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), in: vi.fn() };
    for (const method of ["select", "eq", "order", "limit", "in"]) q[method].mockReturnValue(q);
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error: null }));
    return q;
  };
  const draftIndex = result([
    { offer_id: "drafted-old", created_at: "2026-07-15T13:00:00Z" },
    { offer_id: "drafted-old", created_at: "2026-07-15T13:00:00Z" }
  ]);
  const draftedOffers = result([{ id: "drafted-old", platform: "Shopee", created_at: "2026-07-01T00:00:00Z" }]);
  const recentOffers = result([{ id: "new-no-draft", platform: "Amazon", created_at: "2026-07-15T12:00:00Z" }]);
  const counts = result([{ offer_id: "drafted-old" }, { offer_id: "drafted-old" }]);
  const client = { from: vi.fn().mockReturnValueOnce(draftIndex).mockReturnValueOnce(draftedOffers).mockReturnValueOnce(recentOffers).mockReturnValueOnce(counts) };
  return { client, createServerSupabaseClient: vi.fn(async () => client) };
});

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
import { listOffersWithDraftStatus } from "@/lib/offers/queries";

describe("listOffersWithDraftStatus", () => {
  it("mantém drafts acionáveis no recorte real de 100 mesmo quando a oferta foi atualizada de ciclo antigo", async () => {
    const result = await listOffersWithDraftStatus();
    expect(client.from).toHaveBeenCalledTimes(4);
    expect(result).toEqual([
      expect.objectContaining({ id: "drafted-old", draft_count: 2 }),
      expect.objectContaining({ id: "new-no-draft", draft_count: 0 })
    ]);
  });
});
