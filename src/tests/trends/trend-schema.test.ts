import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260810010000_trend_intelligence_foundation.sql", "utf8");

describe("Tendências IA: schema foundation", () => {
  it("cria entidades isoladas com vínculo explícito e RLS", () => {
    for (const table of ["trend_signals", "trend_opportunities", "trend_recommendations", "trend_experiments"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("offer_id uuid not null references public.offers(id)");
    expect(sql).toContain("window_days integer not null default 7 check (window_days = 7)");
    expect(sql).toContain("strategy_version text not null");
    expect(sql).toContain("final_decision text");
  });

  it("não adiciona publicação, fonte externa ou executor de experimento", () => {
    expect(sql).not.toMatch(/insert into public\.(posts|trend_experiments)/i);
    expect(sql).not.toMatch(/google|tiktok|youtube|scrap/i);
  });
});
