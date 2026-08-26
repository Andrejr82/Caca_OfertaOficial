import { describe, expect, it } from "vitest";

import { buildReelsSocialDraftContent } from "@/lib/videos/reels-social-copy";

const staleDraft = {
  content: "🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água\n\nChaleira Elétrica 2L Inox 220V Fervedor\n\nR$ 39,90\n\nSem fio",
  offers: {
    product_name: "Chaleira Elétrica 2L Inox 220V Fervedor de Água",
    platform: "Shopee",
    category: "Eletrodomésticos",
    current_price: 39.9,
    old_price: null,
    shipping_free: null,
    explainability: {},
    marketplace_metrics: {},
  },
};

describe("Reels approved video social copy", () => {
  it("substitui copy antiga por Facebook curto e comercial", () => {
    const content = buildReelsSocialDraftContent(staleDraft, "facebook");

    expect(content).toContain("☕ Café, chá ou água quente sem complicar a rotina.");
    expect(content).toContain("💰 R$ 39,90");
    expect(content).toContain("👉 Veja o preço, condições e disponibilidade no primeiro comentário.");
    expect(content.split("\n\n")).toHaveLength(4);
    expect(content).not.toContain("antes que o preço mude");
    expect(content).not.toContain("🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água");
  });

  it("substitui copy antiga por Instagram curto e próprio", () => {
    const content = buildReelsSocialDraftContent(staleDraft, "instagram");

    expect(content).toContain("☕ Um atalho simples para café, chá e água quente.");
    expect(content).toContain("💰 R$ 39,90");
    expect(content).toContain("👉 Veja o preço, condições e disponibilidade no link da bio.");
    expect(content.split("\n\n")).toHaveLength(4);
    expect(content).not.toContain("antes que o preço mude");
    expect(content).not.toContain("🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água");
  });

  it("mantém conteúdo original se o draft não tiver oferta válida", () => {
    expect(buildReelsSocialDraftContent({ content: "copy original", offers: null }, "facebook")).toBe("copy original");
  });
});
