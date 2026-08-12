import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260811000000_trend_offer_exposure_history.sql", "utf8");

describe("trend offer exposure history schema", () => {
  it("stores user, run, marketplace and native identity with status history", () => {
    expect(sql).toMatch(/create table if not exists public\.trend_offer_exposure_history/i);
    for (const field of ["user_id", "radar_run_id", "marketplace", "native_product_id", "exposure_status", "rejection_reason"]) {
      expect(sql).toMatch(new RegExp(`\\b${field}\\b`, "i"));
    }
    expect(sql).toMatch(/unique \(user_id, radar_run_id, marketplace, native_product_id\)/i);
    expect(sql).toMatch(/exposure_status in \('exposed', 'pending', 'approved', 'rejected', 'published'\)/i);
  });

  it("has temporal indexes, RLS and ownership-safe policies", () => {
    expect(sql).toMatch(/create index if not exists trend_offer_exposure_history_user_market_status_idx/i);
    expect(sql).toMatch(/create index if not exists trend_offer_exposure_history_user_native_idx/i);
    expect(sql).toMatch(/alter table public\.trend_offer_exposure_history enable row level security/i);
    expect(sql).toMatch(/to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/i);
    expect(sql).toMatch(/with check \(\(select auth\.uid\(\)\) = user_id\)/i);
    expect(sql).not.toMatch(/security definer/i);
  });
});
