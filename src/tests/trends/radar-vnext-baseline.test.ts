import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { radarVNextBaselineFixtures as fixtures } from "./fixtures/radar-vnext-baseline";

const require = createRequire(import.meta.url);
const {
  calculateCommercialOpportunityScoreV4,
} = require("../../core/trends/commercial-opportunity-score-v4.cjs");

describe("Radar VNext baseline — comportamento factual do V4", () => {
  it("documenta que desconto alto pode gerar competitividade máxima sem benchmark real", () => {
    const score = calculateCommercialOpportunityScoreV4(fixtures.soloHighDiscount, {
      peers: [fixtures.soloHighDiscount],
    });

    expect(score.competitiveness.peer_count).toBe(1);
    expect(score.competitiveness.relative_price_position).toBe("solo");
    expect(score.breakdown.offerCompetitiveness).toBe(10);
  });

  it("documenta que comissão absoluta favorece item caro com demanda equivalente", () => {
    const cheap = calculateCommercialOpportunityScoreV4({
      ...fixtures.strongCheapAchadinho,
      currentPrice: 20,
      sales: 1000,
      discountPercent: 20,
      commissionRate: 13,
    });
    const expensive = calculateCommercialOpportunityScoreV4(fixtures.expensiveCatalog);

    expect(cheap.breakdown.economicReturn).toBe(6);
    expect(expensive.breakdown.economicReturn).toBe(20);
    expect(expensive.total).toBeGreaterThan(cheap.total);
  });

  it("documenta que Mercado Livre pode ser promovido a TESTAR mesmo com score bruto baixo", () => {
    const score = calculateCommercialOpportunityScoreV4(fixtures.mercadoLivreWeakFallback, {
      peers: [fixtures.mercadoLivreWeakFallback],
    });

    expect(score.raw_decision).toBe("IGNORAR");
    expect(score.total).toBeLessThan(60);
    expect(score.selection_decision).toBe("TESTAR");
  });
});
