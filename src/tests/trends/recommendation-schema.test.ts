import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810070000_trend_recommendation_ai_metadata.sql", "utf8");

describe("trend recommendation AI metadata migration", () => {
  it("persists provider metadata and bounds confidence", () => {
    expect(sql).toMatch(/add column if not exists confidence/i);
    expect(sql).toMatch(/add column if not exists strategy_version/i);
    expect(sql).toMatch(/add column if not exists ai_provider/i);
    expect(sql).toMatch(/add column if not exists ai_model/i);
    expect(sql).toMatch(/confidence >= 0 and confidence <= 100/i);
    expect(sql).toMatch(/trend_recommendations_user_opportunity_strategy_idx/i);
    expect(sql).not.toMatch(/insert into public\.(posts|trend_experiments)/i);
  });
});
