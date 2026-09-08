import { describe, it, expect } from "vitest";
import {
  computeIdentityGroups,
  deduplicateCandidatesByGroup,
} from "@/core/offer-selection/identity-groups";
import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";

describe("Sprint 4 — Identidade, Grupos e Deduplicação Cross-Marketplace", () => {
  it("gera exactKey, familyKey e crossMarketplaceKey determinísticos", () => {
    const candidateAmz = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B091234567",
      title: "Monitor Gamer LG UltraGear 24 144Hz 1ms IPS 24GN60R",
      sourceUrl: "https://www.amazon.com.br/dp/B091234567",
      imageUrl: "https://m.media-amazon.com/images/I/monitor.jpg",
      currentPrice: 799.0,
      originalPrice: 999.0,
    });

    const groups = computeIdentityGroups(candidateAmz);

    expect(groups.exactKey).toBe("amazon:asin:b091234567");
    expect(groups.familyKey).toContain("lg");
    expect(groups.familyKey).toContain("ultragear");
    expect(groups.crossMarketplaceKey).toContain("lg:ultragear");
    expect(groups.crossMarketplaceKey).toContain("24");
    expect(groups.confidence).toBeGreaterThanOrEqual(85);
  });

  it("não agrupa produtos parecidos com capacidades ou especificações diferentes", () => {
    const monitor24 = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09MON24",
      title: "Monitor Gamer LG UltraGear 24 144Hz IPS",
      sourceUrl: "https://www.amazon.com.br/dp/B09MON24",
      imageUrl: "https://m.media-amazon.com/images/I/mon24.jpg",
      currentPrice: 799.0,
    });

    const monitor27 = normalizeCandidateToV2({
      marketplace: "Mercado Livre",
      sourceItemId: "MLB99MON27",
      title: "Monitor Gamer LG UltraGear 27 144Hz IPS",
      sourceUrl: "https://www.mercadolivre.com.br/p/MLB99MON27",
      imageUrl: "https://http2.mlstatic.com/mon27.jpg",
      currentPrice: 999.0,
    });

    const group24 = computeIdentityGroups(monitor24);
    const group27 = computeIdentityGroups(monitor27);

    expect(group24.crossMarketplaceKey).not.toBe(group27.crossMarketplaceKey);
    expect(group24.familyKey).not.toBe(group27.familyKey);
  });

  it("deduplica ofertas cross-marketplace idênticas escolhendo a melhor oferta", () => {
    const amzOffer = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09ABC",
      title: "SSD Kingston NV2 1TB M.2 2280 NVMe",
      sourceUrl: "https://www.amazon.com.br/dp/B09ABC",
      imageUrl: "https://m.media-amazon.com/images/I/ssd.jpg",
      currentPrice: 389.9,
    });

    const mlOffer = normalizeCandidateToV2({
      marketplace: "Mercado Livre",
      sourceItemId: "MLB5566",
      title: "SSD Kingston NV2 1TB M.2 2280 NVMe PCIe 4.0",
      sourceUrl: "https://www.mercadolivre.com.br/p/MLB5566",
      imageUrl: "https://http2.mlstatic.com/ssd.jpg",
      currentPrice: 369.9, // Oferta mais barata
    });

    const result = deduplicateCandidatesByGroup([amzOffer, mlOffer]);

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].sourceItemId).toBe("MLB5566");
    expect(result.selected[0].evidence.currentPrice).toBe(369.9);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].candidate.sourceItemId).toBe("B09ABC");
    expect(result.duplicates[0].winnerSourceItemId).toBe("MLB5566");
  });
});
