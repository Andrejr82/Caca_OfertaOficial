import { describe, expect, it } from "vitest";
import { evaluateQualityGate } from "@/lib/publish/quality-gate";
import type { LinkMetadata } from "@/lib/publish/scraper";

describe("Quality Gate", () => {
  it("rejects valid product link if antibot triggers", () => {
    const metadata: LinkMetadata = {
      title: "Notebook Gamer",
      platform: "Mercado Livre",
      imageUrl: "https://img.com",
      price: 4500,
      finalUrl: "https://produto.mercadolivre.com.br/MLB-123",
      imageSource: "og:image"
    };

    const result = evaluateQualityGate(metadata);
    expect(result.status).toBe("REJECTED");
  });

  it("rejects purely social profile links without products", () => {
    const metadata: LinkMetadata = {
      title: "Instagram",
      platform: "Outro",
      finalUrl: "https://instagram.com/perfil/",
    };

    const result = evaluateQualityGate(metadata);
    expect(result.status).toBe("REJECTED");
    expect(result.classification).toBe("INVALID_PAGE");
  });

  it("approves meli.la affiliate links (social wrapper) if they have products", () => {
    const metadata: LinkMetadata = {
      title: "Ofertas Exclusivas",
      platform: "Mercado Livre",
      imageUrl: "https://img.com/vitrine",
      finalUrl: "https://www.mercadolivre.com.br/social/doandre",
    };

    const result = evaluateQualityGate(metadata);
    expect(result.status).toBe("APPROVED");
    expect(result.classification).toBe("STORE_PAGE");
  });

  it("approves valid product even with /social/ if it has a price and image", () => {
    const metadata: LinkMetadata = {
      title: "Copo Stanley",
      platform: "Mercado Livre",
      imageUrl: "https://img.com/copo",
      price: 150,
      finalUrl: "https://www.mercadolivre.com.br/social/123/p/MLB123",
    };

    const result = evaluateQualityGate(metadata);
    expect(result.status).toBe("APPROVED");
    expect(result.classification).toBe("STORE_PAGE");
  });
});
