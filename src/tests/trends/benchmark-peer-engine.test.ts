import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  classifyBenchmarkFamily,
  buildBenchmarkContext,
} = require("../../core/trends/benchmark-peer-engine.cjs");

type Candidate = {
  marketplace?: string;
  itemId?: string;
  shopId?: string;
  productId?: string;
  productName: string;
  currentPrice: number;
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    marketplace: "Shopee",
    itemId: "target",
    shopId: "shop-target",
    productName: "Fone TWS Bluetooth X55 LED",
    currentPrice: 19.9,
    ...overrides,
  };
}

describe("Radar VNext benchmark peer engine", () => {
  it("reuses Achadinho functional families instead of broad category matching", () => {
    expect(classifyBenchmarkFamily(candidate()).peerType).toBe("fones_tws_bluetooth");
    expect(classifyBenchmarkFamily(candidate({ productName: "Suporte TV Articulado Retrátil Parede" })).peerType)
      .toBe("suporte_tv_articulado");
  });

  it("marks two comparable peers as LOW and does not claim authoritative competitiveness", () => {
    const target = candidate({ currentPrice: 10 });
    const pool = [
      target,
      candidate({ itemId: "p1", shopId: "s1", currentPrice: 20 }),
      candidate({ itemId: "p2", shopId: "s2", currentPrice: 22 }),
    ];

    const result = buildBenchmarkContext(target, pool);

    expect(result.peerCount).toBe(2);
    expect(result.peerConfidence).toBe("LOW");
    expect(result.benchmarkStatus).toBe("insufficient_peers");
    expect(result.priceCompetitive).toBe(false);
  });

  it("requires at least three comparable peers for an authoritative benchmark", () => {
    const target = candidate({ currentPrice: 10 });
    const pool = [
      target,
      candidate({ itemId: "p1", shopId: "s1", currentPrice: 20 }),
      candidate({ itemId: "p2", shopId: "s2", currentPrice: 22 }),
      candidate({ itemId: "p3", shopId: "s3", currentPrice: 24 }),
    ];

    const result = buildBenchmarkContext(target, pool);

    expect(result.peerCount).toBe(3);
    expect(result.peerConfidence).toBe("MEDIUM");
    expect(result.benchmarkStatus).toBe("authoritative");
    expect(result.peerPriceMedian).toBe(22);
    expect(result.priceVsMedianPercent).toBeCloseTo(54.5, 1);
    expect(result.priceCompetitive).toBe(true);
  });

  it("classifies five or more comparable peers as HIGH confidence", () => {
    const target = candidate({ currentPrice: 20 });
    const peers = [21, 22, 23, 24, 25].map((price, index) =>
      candidate({ itemId: `p${index}`, shopId: `s${index}`, currentPrice: price }),
    );

    const result = buildBenchmarkContext(target, [target, ...peers]);

    expect(result.peerCount).toBe(5);
    expect(result.peerConfidence).toBe("HIGH");
    expect(result.benchmarkStatus).toBe("authoritative");
  });

  it("does not compare materially different quantity classes", () => {
    const kit = candidate({
      itemId: "kit",
      shopId: "kit-shop",
      productName: "Kit 3 Fone TWS Bluetooth X55 LED 3 unidades",
      currentPrice: 45,
    });
    const singles = [
      candidate({ itemId: "s1", shopId: "1", currentPrice: 16 }),
      candidate({ itemId: "s2", shopId: "2", currentPrice: 17 }),
      candidate({ itemId: "s3", shopId: "3", currentPrice: 18 }),
    ];

    const result = buildBenchmarkContext(kit, [kit, ...singles]);

    expect(result.peerCount).toBe(0);
    expect(result.peerConfidence).toBe("NONE");
    expect(result.benchmarkStatus).toBe("insufficient_peers");
  });

  it("returns NONE for an unclassified isolated family instead of fabricating peers", () => {
    const isolated = candidate({
      productName: "Produto Experimental Zeta 123",
      currentPrice: 29.9,
    });

    const result = buildBenchmarkContext(isolated, [isolated]);

    expect(result.peerCount).toBe(0);
    expect(result.peerConfidence).toBe("NONE");
    expect(result.benchmarkStatus).toBe("unclassified_family");
    expect(result.priceCompetitive).toBe(false);
  });
});
