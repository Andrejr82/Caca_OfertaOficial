import { describe, expect, it } from "vitest";
import { selectCommercialPortfolio } from "@/core/curation/commercial-portfolio-selector";

const offer = (id: string, metrics: Record<string, unknown> = {}, oldPrice: number | null = null) => ({
  id,
  product_name: "Organizador de Cozinha",
  platform: "Mercado Livre",
  current_price: 50,
  old_price: oldPrice,
  category: "Organizador",
  status: "approved",
  explainability: { marketplace_metrics: metrics },
});

describe("commercial portfolio quality floor", () => {
  it("não premia ausência de evidência comercial", () => {
    const result = selectCommercialPortfolio([offer("weak")], { minScore: 35 });
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0]?.rejectionReason).toBe("commercial_score_below_minimum");
  });

  it("mantém oferta forte com demanda, confiança e vantagem", () => {
    const result = selectCommercialPortfolio([
      offer("strong", { sales: 2000, rating: 4.9, commissionRate: 15, sourcePosition: 2, officialStoreId: 1 }, 80),
    ], { minScore: 35 });
    expect(result.selected.map((item) => item.offer.id)).toEqual(["strong"]);
  });
});
