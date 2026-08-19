import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("trend radar latest snapshot query", () => {
  it("keeps showing the latest completed run while a newer run is still building", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/trends/radar-queries.ts"), "utf8");
    const runQuery = source.match(/from\("trend_radar_runs"\)[\s\S]*?limit\(1\)/)?.[0] ?? "";

    expect(runQuery).toContain('.eq("status", "completed")');
    expect(runQuery.indexOf('.eq("status", "completed")')).toBeLessThan(runQuery.indexOf('.order("generated_at"'));
  });
});
