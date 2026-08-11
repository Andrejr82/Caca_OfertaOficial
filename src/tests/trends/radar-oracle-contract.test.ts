import { describe, expect, it } from "vitest";
import type { TrendRadarSnapshotView } from "@/lib/trends/radar-queries";
import {
  RADAR_ORACLE_CONTRACT_VERSION,
  buildRadarOracleDiscoveryContracts,
} from "@/core/trends/radar-oracle-contract";

function snapshot(): TrendRadarSnapshotView {
  return {
    id: "run-1",
    radarDate: "2026-08-10",
    windowStart: "2026-08-04T00:00:00.000Z",
    windowEnd: "2026-08-11T00:00:00.000Z",
    strategyVersion: "daily-commercial-radar-v1",
    status: "completed",
    generatedAt: "2026-08-10T23:00:00.000Z",
    sourceHealth: {},
    executiveSummary: {},
    products: [
      {
        id: "product-1",
        priority: 1,
        productTerm: "Fone Bluetooth M90 Pro 5.3 TWS",
        normalizedProductTerm: "fone bluetooth m90 pro 5 3 tws",
        category: "Áudio e acessórios",
        marketplace: null,
        evidenceStatus: "partial",
        sourceCount: 2,
        commercialScore: 32,
        confidence: 60,
        directEvidenceSourceUrls: [
          "https://shopee.com.br/list/Fone%20de%20ouvido/Sem%20Fio",
          "https://shopee.com.br/list/Fone%20sem%20Fio",
        ],
        scoreBreakdown: { evidenceQuality: 15, sourceConvergence: 12, recency: 5 },
        determiningReasons: ["Evidência: 2 fontes convergentes."],
        isFocus: true,
        opportunityId: "opportunity-1",
      },
      {
        id: "product-2",
        priority: 2,
        productTerm: "Galaxy S26 FE",
        normalizedProductTerm: "galaxy s26 fe",
        category: "Eletrônicos",
        marketplace: null,
        evidenceStatus: "partial",
        sourceCount: 1,
        commercialScore: 20,
        confidence: 60,
        directEvidenceSourceUrls: ["https://trends.google.com/trending/rss?geo=BR"],
        scoreBreakdown: { evidenceQuality: 15, recency: 5 },
        determiningReasons: [],
        isFocus: true,
        opportunityId: null,
      },
    ],
  };
}

describe("Radar -> Oracle discovery contract", () => {
  it("builds a versioned, product-focused contract for supported marketplaces", () => {
    const result = buildRadarOracleDiscoveryContracts(snapshot());

    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0]).toEqual(expect.objectContaining({
      contractVersion: RADAR_ORACLE_CONTRACT_VERSION,
      radarRunId: "run-1",
      radarProductId: "product-1",
      marketplace: "Shopee",
      normalizedProductTerm: "fone bluetooth m90 pro 5 3 tws",
      category: "Áudio e acessórios",
      searchTerms: ["Fone Bluetooth M90 Pro 5.3 TWS", "fone bluetooth m90 pro 5 3 tws"],
      allowedProductTerms: ["fone bluetooth m90 pro 5 3 tws"],
      blockedProductTerms: [],
      authority: "shadow_only",
    }));
  });

  it("resolves a missing marketplace only from unambiguous direct-evidence provenance", () => {
    const result = buildRadarOracleDiscoveryContracts(snapshot());
    expect(result.contracts[0].marketplace).toBe("Shopee");

    const ambiguous = snapshot();
    ambiguous.products[0] = {
      ...ambiguous.products[0],
      directEvidenceSourceUrls: [
        "https://shopee.com.br/list/fone",
        "https://www.mercadolivre.com.br/ofertas",
      ],
    };
    expect(buildRadarOracleDiscoveryContracts(ambiguous).contracts).toHaveLength(0);
  });

  it("keeps evidence references auditable without copying inferred facts into Oracle intent", () => {
    const [contract] = buildRadarOracleDiscoveryContracts(snapshot()).contracts;

    expect(contract.evidenceRefs).toEqual({
      radarRunId: "run-1",
      radarProductId: "product-1",
      opportunityId: "opportunity-1",
    });
    expect(contract).not.toHaveProperty("price");
    expect(contract).not.toHaveProperty("rankPosition");
    expect(contract).not.toHaveProperty("soldQuantity");
  });

  it("fails closed when marketplace is missing or unsupported", () => {
    const result = buildRadarOracleDiscoveryContracts(snapshot());

    expect(result.rejected).toEqual([
      expect.objectContaining({ radarProductId: "product-2", reason: "unsupported_marketplace" }),
    ]);
  });

  it("requires a completed radar snapshot", () => {
    expect(() => buildRadarOracleDiscoveryContracts({ ...snapshot(), status: "failed" }))
      .toThrow(/completed/i);
  });

  it("orders contracts deterministically by radar priority", () => {
    const base = snapshot();
    base.products = [
      { ...base.products[0], id: "product-3", priority: 3, marketplace: "Mercado Livre", productTerm: "Mouse Gamer", normalizedProductTerm: "mouse gamer", directEvidenceSourceUrls: [] },
      { ...base.products[0], id: "product-1", priority: 1 },
    ];

    expect(buildRadarOracleDiscoveryContracts(base).contracts.map((item) => item.priority)).toEqual([1, 3]);
  });
});
