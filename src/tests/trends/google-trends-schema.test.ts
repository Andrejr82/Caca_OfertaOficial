import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260810020000_google_trends_signals.sql", "utf8");

describe("Google Trends signals schema", () => {
  it("persiste campos mínimos e mantém offer_id opcional", () => {
    for (const column of ["source", "region", "term", "observed_at", "trend_strength", "trend_direction", "offer_id"]) expect(sql).toContain(`add column if not exists ${column}`);
    expect(sql).toContain("trend_signals_user_source_external_idx");
    expect(sql).not.toMatch(/insert into public\.(posts|trend_opportunities|trend_recommendations)/i);
  });
});
