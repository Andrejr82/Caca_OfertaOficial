import { describe, expect, it } from "vitest";
import { loadInternalClickSignals } from "@/lib/trends/internal-click-performance";

function client() {
  const tables: Record<string, Record<string, unknown>[]> = {
    click_events: [{ id: "click-1", affiliate_link_id: "link-1", created_at: "2026-08-10T10:00:00.000Z" }],
    affiliate_links: [{ id: "link-1", offer_id: "offer-1", channel: "whatsapp" }],
    offers: [{ id: "offer-1", platform: "Shopee", product_name: "Fone Bluetooth", category: "Áudio" }],
    posts: [{ id: "post-1", affiliate_link_id: "link-1", channel: "whatsapp", status: "published", deleted_at: null }],
  };

  return {
    from(table: string) {
      let selected = tables[table] ?? [];
      const chain: any = {
        select() { return chain; },
        gte(column: string, value: string) {
          selected = selected.filter((row) => String(row[column]) >= value);
          return chain;
        },
        lt(column: string, value: string) {
          selected = selected.filter((row) => String(row[column]) < value);
          return chain;
        },
        order() { return Promise.resolve({ data: selected, error: null }); },
        in(column: string, values: string[]) {
          return Promise.resolve({ data: selected.filter((row) => values.includes(String(row[column]))), error: null });
        },
      };
      return chain;
    },
  };
}

describe("internal click performance query", () => {
  it("mapeia click_events -> affiliate_links -> offers -> posts", async () => {
    const signals = await loadInternalClickSignals(
      client(),
      "2026-08-04T00:00:00.000Z",
      "2026-08-11T00:00:00.000Z",
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      source: "click_events",
      offerId: "offer-1",
      normalizedProductTerm: "fone bluetooth",
      totalClicks: 1,
      clicksByChannel: { whatsapp: 1 },
      clicksByPublication: [{ postId: "post-1", channel: "whatsapp", clicks: 1 }],
    });
  });
});
