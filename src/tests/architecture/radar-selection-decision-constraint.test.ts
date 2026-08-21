import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260821002700_align_trend_radar_selection_decision_constraint.sql",
);

const migration = readFileSync(migrationPath, "utf8");

describe("Radar selection_decision constraint", () => {
  it("preserva decisões históricas e aceita o contrato comercial atual", () => {
    for (const decision of ["IGNORAR", "APROVAR_TESTE", "TESTAR", "PRIORIDADE"]) {
      expect(migration).toContain(`'${decision}'`);
    }
  });

  it("substitui explicitamente a constraint antiga sem reescrever dados", () => {
    expect(migration).toContain("drop constraint if exists trend_radar_products_selection_decision_check");
    expect(migration).toContain("add constraint trend_radar_products_selection_decision_check");
    expect(migration).toContain("selection_decision is null");
    expect(migration).not.toMatch(/update\s+public\.trend_radar_products/iu);
  });
});
