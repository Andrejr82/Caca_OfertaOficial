import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260810223500_trend_radar_ranking_metadata.sql", "utf8");

describe("Trend Radar ranking metadata schema", () => {
  it("adiciona breakdown, razões e flag de foco sem alterar evidência direta", () => {
    expect(sql).toMatch(/add column if not exists score_breakdown jsonb not null default '\{\}'::jsonb/i);
    expect(sql).toMatch(/add column if not exists determining_reasons jsonb not null default '\[\]'::jsonb/i);
    expect(sql).toMatch(/add column if not exists is_focus boolean not null default false/i);
    expect(sql).toMatch(/jsonb_typeof\(score_breakdown\) = 'object'/i);
    expect(sql).toMatch(/jsonb_typeof\(determining_reasons\) = 'array'/i);
  });

  it("é migration somente de schema e não publica nem cria snapshots", () => {
    expect(sql).not.toMatch(/insert into/i);
    expect(sql).not.toMatch(/update public\.trend_radar_products/i);
    expect(sql).not.toMatch(/delete from/i);
    expect(sql).not.toMatch(/create trigger/i);
  });
});
