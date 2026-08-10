import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unattributed sales migration", () => {
  it("makes attribution nullable and preserves marketplace idempotency", () => {
    const sql = readFileSync("supabase/migrations/20260810000000_allow_unattributed_sales.sql", "utf8");

    expect(sql).toContain("ALTER COLUMN offer_id DROP NOT NULL");
    expect(sql).toContain("ALTER COLUMN affiliate_link_id DROP NOT NULL");
    expect(sql).toContain("ALTER COLUMN channel DROP NOT NULL");
    expect(sql).toContain("numeric(14,4)");
    expect(sql).not.toMatch(/drop table|delete from|truncate table/i);
  });
});
