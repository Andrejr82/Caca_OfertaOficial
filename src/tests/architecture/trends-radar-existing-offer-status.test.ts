import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  BLOCKING_OFFER_STATUSES,
  fetchExistingOfferIdentityKeys,
} = require("../../../scripts/oracle-trends-radar-freshness.cjs");

describe("Radar existing offer status gate", () => {
  it("blocks only commercially active offer statuses", () => {
    expect(BLOCKING_OFFER_STATUSES).toEqual(["approved", "selected", "posted"]);
    for (const status of ["rejected", "pending_manual_review", "draft", "deferred"]) {
      expect(BLOCKING_OFFER_STATUSES).not.toContain(status);
    }
  });

  it("applies the status filter before loading offer identities", async () => {
    const calls: Array<{ column: string; values: string[] }> = [];
    const rows = [
      { platform: "Shopee", shopee_item_id: "123", item_id: null, product_id: null, status: "approved" },
      { platform: "Mercado Livre", shopee_item_id: null, item_id: "MLB123", product_id: "MLB456", status: "posted" },
    ];

    const client = {
      from(table: string) {
        expect(table).toBe("offers");
        return {
          select() { return this; },
          in(column: string, values: string[]) {
            calls.push({ column, values });
            return this;
          },
          eq() { return this; },
          async range() { return { data: rows, error: null }; },
        };
      },
    };

    const keys = await fetchExistingOfferIdentityKeys(client, "tenant-1");

    expect(calls).toEqual([{ column: "status", values: ["approved", "selected", "posted"] }]);
    expect(keys.has("shopee:native:123")).toBe(true);
    expect(keys.has("mercadolivre:catalog:mlb456")).toBe(true);
  });
});
