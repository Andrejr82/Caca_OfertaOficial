import { describe, expect, it } from "vitest";
import { selectCommercialPortfolio } from "@/core/curation/commercial-portfolio-selector";

const offer = (input: Record<string, unknown>) => ({
  id: String(input.id),
  product_name: String(input.product_name),
  platform: String(input.platform),
  current_price: Number(input.current_price),
  old_price: input.old_price == null ? null : Number(input.old_price),
  category: input.category ? String(input.category) : null,
  status: "approved",
  explainability: { marketplace_metrics: input.marketplace_metrics ?? {} },
});

describe("commercial cross-market portfolio selector", () => {
  it("prefere a melhor economia real entre marketplaces para produtos comparáveis", () => {
    const result = selectCommercialPortfolio([
      offer({ id: "shopee-tapete", product_name: "Tapete Higiênico para Cachorro 60x55 com 30 Unidades", platform: "Shopee", current_price: 29.89, marketplace_metrics: { sales: 1896, rating: 4.8, commissionRate: 15, sourcePosition: 4 } }),
      offer({ id: "amazon-tapete", product_name: "Tapete Higiênico Confort Pads 80x60 com 30 Unidades", platform: "Amazon", current_price: 60.93, marketplace_metrics: { rating: 4.5, coupon: true, sourcePosition: 20 } }),
      offer({ id: "shopee-areia", product_name: "Areia Biodegradável Fina 2 Kg Bionature Sensitive", platform: "Shopee", current_price: 21.88, marketplace_metrics: { sales: 992, rating: 4.9, commissionRate: 12, sourcePosition: 18 } }),
      offer({ id: "ml-areia", product_name: "Areia Higiênica Sílica para Gatos 1.6Kg", platform: "Mercado Livre", current_price: 28.06, old_price: 39.9, marketplace_metrics: { officialStoreId: 5376, discountPercent: 29.67, sourcePosition: 12 } }),
      offer({ id: "amazon-caixa", product_name: "Bandeja Higiênica Furba Cat Caixa de Areia para Gatos", platform: "Amazon", current_price: 29.9, old_price: 49.9, marketplace_metrics: { rating: 4.6, sourcePosition: 7 } }),
      offer({ id: "shopee-caixa", product_name: "Caixa Areia Furbox Bandeja Banheiro Gato Grande Peneira Alta", platform: "Shopee", current_price: 69.98, marketplace_metrics: { sales: 520, rating: 4.8, commissionRate: 23, sourcePosition: 51 } }),
    ], { maxTotal: 6, maxPerType: 2 });

    const score = new Map([...result.selected, ...result.rejected].map((item) => [item.offer.id, item.score]));
    expect(score.get("shopee-tapete")).toBeGreaterThan(score.get("amazon-tapete")!);
    expect(score.get("shopee-areia")).toBeGreaterThan(score.get("ml-areia")!);
    expect(score.get("amazon-caixa")).toBeGreaterThan(score.get("shopee-caixa")!);
  });

  it("remove variantes quase idênticas e limita saturação do mesmo tipo", () => {
    const result = selectCommercialPortfolio([
      offer({ id: "filter-12", product_name: "Pacote com 12 filtros de carvão ativado para caixa de areia oval com capuz Nature's Miracle", platform: "Amazon", current_price: 108.08, marketplace_metrics: { rating: 5 } }),
      offer({ id: "filter-14", product_name: "Pacote com 14 filtros de carvão ativado para caixa de areia oval com capuz Nature's Miracle", platform: "Amazon", current_price: 113.77, marketplace_metrics: { rating: 5 } }),
      offer({ id: "tapete-1", product_name: "Tapete Higiênico Cachorro 30 Unidades", platform: "Shopee", current_price: 29.89, marketplace_metrics: { sales: 1896, rating: 4.8 } }),
      offer({ id: "tapete-2", product_name: "Tapete Higiênico Cachorro Lavável Grande", platform: "Mercado Livre", current_price: 49, marketplace_metrics: { sourcePosition: 2 } }),
      offer({ id: "tapete-3", product_name: "Tapete Higiênico Premium 50 Unidades", platform: "Amazon", current_price: 67.9, marketplace_metrics: { rating: 4.5 } }),
    ], { maxTotal: 5, maxPerType: 2 });

    expect(result.rejected.some((item) => item.offer.id === "filter-14" && item.rejectionReason === "near_duplicate")).toBe(true);
    expect(result.selected.filter((item) => item.commercialType === "tapete-higienico")).toHaveLength(2);
    expect(result.rejected.some((item) => item.commercialType === "tapete-higienico" && item.rejectionReason === "commercial_type_cap")).toBe(true);
  });
});
