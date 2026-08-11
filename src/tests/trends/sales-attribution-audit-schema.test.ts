import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260810232500_sales_attribution_audit.sql",
);

describe("sales attribution audit schema", () => {
  it("persiste proveniência sem inferir atribuição histórica", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/add column if not exists attribution_method text/i);
    expect(sql).toMatch(/add column if not exists source_sub_id text/i);
    expect(sql).toMatch(/add column if not exists link_resolution text/i);
    expect(sql).toMatch(/unattributed/i);
    expect(sql).toMatch(/sub_id/i);
    expect(sql).toMatch(/affiliate_link_id/i);
    expect(sql).not.toMatch(/update\s+public\.sales\s+set\s+attribution_method\s*=\s*'sub_id'/i);
  });
});
