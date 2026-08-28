import { describe, expect, it } from "vitest";
import { buildCommercialQueue, filterCommercialQueue } from "@/lib/offers/commercial-curation-queue";

const offer = (overrides: Record<string, unknown> = {}) => ({
  id: `offer-${Math.random()}`,
  user_id: "u1",
  platform: "Shopee",
  product_name: "Organizador de gaveta",
  category: "Casa",
  original_url: "https://example.test/offer",
  image_url: "https://example.test/image.jpg",
  current_price: 39,
  old_price: 49,
  coupon: null,
  rating: 4.8,
  estimated_commission: null,
  commission_rate: null,
  marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 },
  score: 50,
  status: "pending_manual_review",
  notes: null,
  seasonality: null,
  created_at: "2026-08-07T09:00:00Z",
  updated_at: "2026-08-07T09:00:00Z",
  explainability: null,
  ...overrides,
});

describe("Commercial Curation panel queue", () => {
  it("includes Amazon for manual WhatsApp review and exposes metadata/copy", () => {
    const queue = buildCommercialQueue([offer(), offer({ id: "amazon", platform: "Amazon" })] as any);
    expect(queue).toHaveLength(2);
    expect(queue.some((candidate) => candidate.platform === "Amazon")).toBe(true);
    expect(queue[0]).toMatchObject({ commercialIntent: "casa_organizada_antes_depois" });
    expect(queue[0].commercialMetadata).toMatchObject({ commercialCurationVersion: "commercial-curation/v1", copyVersion: "commercial-copy/v1" });
    expect(queue[0].suggestedCopy).toContain("🔗 Ver oferta");
  });

  it("filters marketplace, score, risk and keeps automatic separate from manual-first", () => {
    const queue = buildCommercialQueue([offer(), offer({ id: "ml", platform: "Mercado Livre", product_name: "Suporte para notebook", category: "Informática", rating: null, marketplace_metrics: {} })] as any);
    expect(filterCommercialQueue(queue, { marketplace: "Mercado Livre" })).toHaveLength(1);
    expect(filterCommercialQueue(queue, { mode: "automatic" }).every((candidate) => candidate.automaticEligible)).toBe(true);
    expect(filterCommercialQueue(queue, { minScore: 0 }).length).toBeGreaterThan(0);
  });

  it("receives one candidate per commercial identity", () => {
    const queue = buildCommercialQueue([
      offer({ id: "old", shopee_item_id: "same", score: 10 }),
      offer({ id: "new", shopee_item_id: "same", score: 20 }),
    ] as any);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("new");
  });

  it("propagates the persisted canonical intent into ranking and metadata", () => {
    const queue = buildCommercialQueue([offer({
      product_name: "Produto sem termo classificável",
      explainability: {
        commercialCuration: {
          commercialIntent: "tech_de_bolso",
          sourceScenarioId: "tech_catalogo_v1",
        },
      },
    })] as any);

    expect(queue[0]).toMatchObject({
      commercialIntent: "tech_de_bolso",
      commercialMetadata: { commercialIntent: "tech_de_bolso", sourceScenarioId: "tech_catalogo_v1" },
    });
  });

  it("ignores an invalid persisted intent and keeps the classifier fallback", () => {
    const queue = buildCommercialQueue([offer({
      explainability: { commercialCuration: { commercialIntent: "intent_invalida" } },
    })] as any);

    expect(queue[0].commercialIntent).toBe("casa_organizada_antes_depois");
  });
});
