import { describe, expect, it } from "vitest";
import { buildRadarOfferRow } from "@/lib/trends/radar-persistence";

describe("multimarketplace approval queue persistence", () => {
  it("stores the radar run identity required by the approval queue query", () => {
    const row = buildRadarOfferRow(
      "user-1",
      {
        radar_date: "2026-08-12",
        radar_run_id: "run-1",
        product_term: "Notebook",
        normalized_product_term: "notebook",
        evidence_status: "partial",
        strategy_version: "daily-commercial-radar-v1",
        source_urls: [],
        direct_evidence: [],
        observed_at: null,
        source_count: 1,
        confidence: 60,
      },
      {
        id: "S-1",
        marketplace: "Shopee",
        productName: "Notebook Lenovo",
        currentPrice: 100,
        permalink: "https://shopee.com.br/notebook",
        shopeeItemId: "S-1",
        marketplaceMetrics: {
          imageUrl: "https://img.example/notebook.jpg",
          affiliateUrl: "https://shopee.com.br/notebook?aff=1",
        },
      },
    );

    expect(row.explainability).toMatchObject({ provenance: "external_radar", radar_run_id: "run-1" });
  });
});
