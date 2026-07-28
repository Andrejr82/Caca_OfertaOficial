import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Offer Quality V2 flag documentation", () => {
  it("documents false, shadow and active states with rollback", () => {
    const shadow = readFileSync(resolve(process.cwd(), "docs/offer-quality-shadow-mode.md"), "utf8");
    const active = readFileSync(resolve(process.cwd(), "docs/offer-quality-v2-active-mode.md"), "utf8");
    const combined = `${shadow}\n${active}`;

    expect(combined).toContain("OFFER_QUALITY_PIPELINE_V2=false");
    expect(combined).toContain("`shadow`");
    expect(combined).toContain("`active`");
    expect(combined).toContain("fail-closed");
    expect(combined).toContain("Nenhuma migração");
  });
});
