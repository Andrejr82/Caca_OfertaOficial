import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("trend experiment contract migration", () => {
  const sql = readFileSync("supabase/migrations/20260810050000_trend_experiment_contract.sql", "utf8");

  it("persists the approved seven-day experiment contract without creating experiments", () => {
    for (const column of [
      "recommendation_id",
      "offer_id",
      "marketplace",
      "channel",
      "format",
      "hypothesis",
      "started_at",
      "ends_at",
      "decision_reason",
      "metrics"
    ]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}`, "i"));
    }
    expect(sql).toMatch(/ends_at\s*=\s*started_at\s*\+\s*interval\s+'7 days'/i);
    expect(sql).toMatch(/create unique index/i);
    expect(sql).not.toMatch(/insert into public\.trend_experiments/i);
  });
});
