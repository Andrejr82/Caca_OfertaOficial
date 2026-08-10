import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

describe("Tendências IA: leitura", () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it("retorna estado vazio quando Supabase não está configurado", async () => {
    createServerSupabaseClient.mockResolvedValue(null);
    const { listTrendOpportunities } = await import("@/lib/trends/queries");

    await expect(listTrendOpportunities()).resolves.toEqual([]);
  });
});
