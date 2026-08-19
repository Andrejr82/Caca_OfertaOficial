import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { supportsTrendApprovalMarketplace } from "@/lib/trends/selection-offer-state";

describe("Mercado Livre Trends approval handoff", () => {
  it("allows human approval for Shopee and Mercado Livre only", () => {
    expect(supportsTrendApprovalMarketplace("Shopee")).toBe(true);
    expect(supportsTrendApprovalMarketplace("Mercado Livre")).toBe(true);
    expect(supportsTrendApprovalMarketplace("Amazon")).toBe(false);
    expect(supportsTrendApprovalMarketplace(null)).toBe(false);
  });

  it("materializes Mercado Livre snapshots through the canonical discovery RPC", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/trends/selection-actions.ts"), "utf8");
    expect(source).toContain("materializeMercadoLivreOfferFromSnapshot");
    expect(source).toContain('p_marketplace: "Mercado Livre"');
    expect(source).toContain('rpc("upsert_discovery_offers_v2"');
    expect(source).toContain('product.marketplace === "Mercado Livre"');
  });

  it("keeps social handoff draft-only", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/trends/selection-social-drafts.ts"), "utf8");
    expect(source).toContain('status: "draft"');
    expect(source).toContain("automaticPublication: false");
  });
});
