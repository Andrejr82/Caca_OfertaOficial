import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260811020000_trend_radar_scores.sql", "utf8");

describe("trend radar scores schema", () => {
  it("persists trend and commercial scores independently with bounds", () => {
    expect(sql).toMatch(/add column if not exists trend_score numeric\(5,2\)/i);
    expect(sql).toMatch(/trend_score is null or \(trend_score >= 0 and trend_score <= 100\)/i);
    expect(sql).toMatch(/trend_radar_products_run_trend_score_idx/i);
  });
});
