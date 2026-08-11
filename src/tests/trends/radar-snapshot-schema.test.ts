import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810221000_trend_radar_snapshots.sql", "utf8");

describe("Trend Radar snapshot schema", () => {
  it("cria runs e produtos auditáveis com RLS", () => {
    for (const table of ["trend_radar_runs", "trend_radar_products"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toMatch(/user_id uuid not null references auth\.users\(id\) on delete cascade/i);
    expect(sql).toMatch(/radar_run_id uuid not null references public\.trend_radar_runs\(id\) on delete cascade/i);
    expect(sql).toMatch(/opportunity_id uuid references public\.trend_opportunities\(id\) on delete set null/i);
    expect(sql).toMatch(/priority integer not null check \(priority between 1 and 20\)/i);
    expect(sql).toMatch(/confidence numeric\(5,2\) not null check \(confidence >= 0 and confidence <= 100\)/i);
    expect(sql).toMatch(/commercial_score numeric\(5,2\) check \(commercial_score is null or \(commercial_score >= 0 and commercial_score <= 100\)\)/i);
    expect(sql).toMatch(/evidence_status text not null check \(evidence_status in \('verified', 'partial', 'unverified', 'rejected'\)\)/i);
  });

  it("garante idempotência por execução e item do snapshot sem índice redundante", () => {
    expect(sql).toMatch(/unique \(user_id, radar_date, window_start, window_end, strategy_version\)/i);
    expect(sql).toMatch(/unique \(radar_run_id, priority\)/i);
    expect(sql).toMatch(/unique \(radar_run_id, normalized_product_term, marketplace_key\)/i);
    expect(sql).toMatch(/check \(window_end > window_start\)/i);
    expect(sql).not.toMatch(/create index if not exists trend_radar_products_run_priority_idx/i);
  });

  it("não executa Radar, não publica e não insere snapshots na migration", () => {
    expect(sql).not.toMatch(/insert into public\.trend_radar_/i);
    expect(sql).not.toMatch(/insert into public\.posts/i);
    expect(sql).not.toMatch(/create trigger/i);
  });
});
