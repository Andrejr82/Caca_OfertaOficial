import { describe, expect, it } from "vitest";
import { validateCandidateOffer } from "@/core/ai/validation";

describe("Publicação Expressa: isolamento do discovery", () => {
  it("aceita oferta manual sem correlation_id, discoveredAt ou discovery_evidence", () => {
    expect(validateCandidateOffer({
      id: "manual-offer",
      tenantId: "user-1",
      state: "pending_manual_review",
      version: 1,
      marketplace: "Shopee",
      productName: "Cama Box Casal Colchão Molas Ensacadas Pillow Maximus 138x188x62cm Cinza",
      originalUrl: "https://s.shopee.com.br/affiliate",
      imageUrl: "https://img.example.com/bed.jpg",
      currentPrice: 989,
      originalPrice: null,
      category: null,
      explainability: {
        contract_version: "pmav5.candidate/v1",
        candidate_id: "manual-request-1",
        ingestion_id: "quick-publication-request-1",
        manual_source: true,
        marketplace_metrics: { item_id: "22494398493" }
      },
      createdAt: "2026-08-08T12:00:00.000Z",
      affiliateLinks: []
    })).toBeNull();
  });

  it("mantém discovery obrigatório para oferta editorial", () => {
    expect(validateCandidateOffer({
      id: "editorial-offer", tenantId: "user-1", state: "selected", version: 1,
      marketplace: "Shopee", productName: "Produto editorial", originalUrl: "https://shopee.example/product",
      imageUrl: "https://img.example.com/product.jpg", currentPrice: 10, originalPrice: null, category: null,
      explainability: { contract_version: "pmav5.candidate/v1", candidate_id: "c", ingestion_id: "i", correlation_id: "cycle" },
      createdAt: "2026-08-08T12:00:00.000Z", affiliateLinks: []
    })).toBe("Candidate evidence is incomplete");
  });
});
