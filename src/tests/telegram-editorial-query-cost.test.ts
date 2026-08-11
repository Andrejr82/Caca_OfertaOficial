import { describe, expect, it } from "vitest";
import { loadEditorialTop30TelegramSelection } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

function createQueryClient(responses: unknown[][] = []) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  let queryCount = 0;

  const client = {
    from(table: string) {
      const currentQuery = queryCount++;
      const query: any = {
        select(...args: unknown[]) { calls.push({ table, method: "select", args }); return query; },
        eq(...args: unknown[]) { calls.push({ table, method: "eq", args }); return query; },
        gte(...args: unknown[]) { calls.push({ table, method: "gte", args }); return query; },
        order(...args: unknown[]) { calls.push({ table, method: "order", args }); return query; },
        range(...args: unknown[]) { calls.push({ table, method: "range", args }); return query; },
        in(...args: unknown[]) { calls.push({ table, method: "in", args }); return query; },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: responses[currentQuery] || [], error: null }).then(resolve);
        },
      };
      return query;
    },
  };

  return { client, calls };
}

const currentAmazonDraft = {
  id: "post-current",
  offer_id: "offer-current",
  channel: "telegram",
  status: "draft",
  content: "Oferta editorial",
  created_at: "2026-08-11T10:00:00.000Z",
  posted_at: null,
  external_id: null,
  offers: {
    id: "offer-current",
    user_id: "user-1",
    platform: "Amazon",
    product_name: "Produto atual",
    category: "Casa",
    original_url: "https://amazon.test/current",
    image_url: "https://images.test/current.jpg",
    current_price: 39,
    old_price: 59,
    coupon: null,
    rating: 4.8,
    estimated_commission: null,
    commission_rate: null,
    score: 80,
    status: "pending_manual_review",
    notes: null,
    seasonality: null,
    created_at: "2026-08-11T10:00:00.000Z",
    updated_at: "2026-08-11T10:00:00.000Z",
    marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 },
    explainability: { correlation_id: "cycle-current", discovery_evidence: { discoveredAt: "2026-08-11T10:00:00.000Z" } },
  },
};

describe("Telegram editorial query cost boundary", () => {
  it("limits the expensive offers join to the 24h editorial window", async () => {
    const { client, calls } = createQueryClient();
    const now = new Date("2026-08-11T12:00:00.000Z");

    await loadEditorialTop30TelegramSelection(client, now);

    expect(calls).toContainEqual({ table: "posts", method: "eq", args: ["channel", "telegram"] });
    expect(calls).toContainEqual({ table: "posts", method: "gte", args: ["created_at", "2026-08-10T12:00:00.000Z"] });
  });

  it("keeps historical publication protection without loading historical offers", async () => {
    const historicalEvidence = [{ offer_id: "offer-current", status: "published", posted_at: "2026-08-01T12:00:00.000Z", external_id: "tg-old" }];
    const { client, calls } = createQueryClient([[currentAmazonDraft], historicalEvidence]);

    const selection = await loadEditorialTop30TelegramSelection(client, new Date("2026-08-11T12:00:00.000Z"));

    expect(selection.offerIds).toEqual([]);
    expect(calls).toContainEqual({ table: "posts", method: "in", args: ["offer_id", ["offer-current"]] });
    const selects = calls.filter((call) => call.method === "select");
    expect(selects[0].args[0]).toContain("offers(*)");
    expect(selects[1].args[0]).toBe("offer_id,status,posted_at,external_id");
  });
});
