import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ selectCalls: [] as string[] }));

const postsQuery = {
  select(query: string) {
    state.selectCalls.push(query);
    return this;
  },
  eq() { return this; },
  neq() { return this; },
  async order() {
    return {
      data: [{
        id: "post-1",
        channel: "telegram",
        content: "Oferta",
        status: "published",
        posted_at: "2026-08-12T12:00:00.000Z",
        created_at: "2026-08-12T12:00:00.000Z",
        external_id: "external-1",
        offers: { id: "offer-1", product_name: "Produto", platform: "Shopee", category: "Casa" },
        affiliate_links: { id: "link-1", tracked_url: "https://example.test/go", clicks: 3 },
      }],
    };
  },
};

const client = {
  from(table: string) {
    if (table === "posts") return postsQuery;
    return { async select() { return { data: [] }; } };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => null }));

import { getPostHistory } from "@/lib/offers/queries";

describe("getPostHistory offer relation", () => {
  beforeEach(() => state.selectCalls.splice(0));

  it("queries the real platform column and preserves the marketplace view field", async () => {
    const [history] = await getPostHistory("telegram");

    expect(state.selectCalls[0]).not.toMatch(/^\s*marketplace\s*,?\s*$/m);
    expect(history).toMatchObject({ platform: "Shopee", marketplace: "Shopee" });
  });
});
