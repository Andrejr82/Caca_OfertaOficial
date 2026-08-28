import { describe, expect, it } from "vitest";

import { renderCopyV5ChannelCopy } from "@/core/ai/copy-v5-renderer";
import type { CopyV5Facts, CopyV5Plan } from "@/core/ai/copy-v5-types";

const kettleFacts: CopyV5Facts = {
  productName: "Chaleira Elétrica 2L Inox 220V Fervedor de Água",
  shortName: "Chaleira Elétrica 2L Inox",
  marketplace: "Shopee",
  category: "Eletrodomésticos",
  currentPrice: 39.9,
  originalPrice: null,
  evidence: {},
};

const kettlePlan: CopyV5Plan = {
  shortProductName: "Chaleira Elétrica 2L Inox",
  commercialAngle: "price",
  hook: "🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água",
  selectedAttributes: ["Sem fio"],
  optionalProofAngle: null,
};

describe("Copy V5 — social conversion director", () => {
  it("Facebook usa copy curta de desejo + produto + preço + CTA", () => {
    const rendered = renderCopyV5ChannelCopy(
      kettlePlan,
      kettleFacts,
      "facebook",
      "https://caca-oferta-oficial.vercel.app/go/fb_kettle",
    );

    expect(rendered.feed).toContain(kettlePlan.hook);
    expect(rendered.feed).toContain("Chaleira Elétrica 2L Inox");
    expect(rendered.feed).toContain("Sem fio");
    expect(rendered.feed).toContain("R$ 39,90");
    expect(rendered.feed).toContain("👉 Veja o preço, condições e disponibilidade no primeiro comentário.");
    expect(rendered.feed.split("\n\n")).toHaveLength(5);
    expect(rendered.feed).not.toContain("antes que o preço mude");
    expect(rendered.feed).not.toMatch(/https?:\/\//);
    expect(rendered.firstComment).toBe("👉 Link da oferta: https://caca-oferta-oficial.vercel.app/go/fb_kettle");
  });

  it("Instagram usa copy curta própria e CTA de bio", () => {
    const rendered = renderCopyV5ChannelCopy(
      kettlePlan,
      kettleFacts,
      "instagram",
      "https://caca-oferta-oficial.vercel.app/go/ig_kettle",
    );

    expect(rendered.feed).toContain(kettlePlan.hook);
    expect(rendered.feed).toContain("Chaleira Elétrica 2L Inox");
    expect(rendered.feed).toContain("Sem fio");
    expect(rendered.feed).toContain("R$ 39,90");
    expect(rendered.feed).toContain("👉 Veja o preço, condições e disponibilidade no link da bio.");
    expect(rendered.feed.split("\n\n")).toHaveLength(5);
    expect(rendered.feed).not.toContain("antes que o preço mude");
    expect(rendered.feed).not.toMatch(/https?:\/\//);
  });

  it("limita sinais comerciais extras a dois", () => {
    const facts: CopyV5Facts = {
      ...kettleFacts,
      freeShipping: true,
      evidence: { coupon: "CASA10", is_official_store: true, seller_name: "Loja Teste" },
    };
    const plan: CopyV5Plan = { ...kettlePlan, optionalProofAngle: "⭐ Avaliação 4,8/5" };
    const rendered = renderCopyV5ChannelCopy(plan, facts, "instagram");

    expect(rendered.feed).toContain("🎟️ Cupom: CASA10");
    expect(rendered.feed).toContain("📦 Frete grátis");
    expect(rendered.feed).not.toContain("Loja oficial");
    expect(rendered.feed).not.toContain("Avaliação 4,8/5");
    expect(rendered.feed.split("\n\n")).toHaveLength(7);
  });

  it("mantém WhatsApp no contrato atual nesta etapa", () => {
    const rendered = renderCopyV5ChannelCopy(
      kettlePlan,
      kettleFacts,
      "whatsapp",
      "https://caca-oferta-oficial.vercel.app/go/wp_kettle",
    );

    expect(rendered.feed).toContain("🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água");
    expect(rendered.feed).toContain("Sem fio");
    expect(rendered.feed).toContain("👉 Ver na Shopee:\nhttps://caca-oferta-oficial.vercel.app/go/wp_kettle");
  });
});
