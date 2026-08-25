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
  it("Facebook deixa de ser catálogo e cria conversa + contexto + preço + CTA", () => {
    const rendered = renderCopyV5ChannelCopy(
      kettlePlan,
      kettleFacts,
      "facebook",
      "https://caca-oferta-oficial.vercel.app/go/fb_kettle",
    );

    expect(rendered.feed).toContain("Quem também usa água quente várias vezes ao dia?");
    expect(rendered.feed).toContain("entra justamente nessa rotina");
    expect(rendered.feed).toMatch(/Hoje aparece por R\$\s39,90\./);
    expect(rendered.feed).toContain("Um detalhe informado na oferta: sem fio.");
    expect(rendered.feed).toContain("primeiro comentário");
    expect(rendered.feed).not.toContain("🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água");
    expect(rendered.feed).not.toMatch(/Chaleira Elétrica 2L Inox 220V Fervedor de Água\n\nChaleira Elétrica/i);
    expect(rendered.feed).not.toMatch(/https?:\/\//);
    expect(rendered.firstComment).toBe("👉 Link da oferta: https://caca-oferta-oficial.vercel.app/go/fb_kettle");
  });

  it("Instagram usa desejo de rotina e CTA de bio sem repetir título", () => {
    const rendered = renderCopyV5ChannelCopy(
      kettlePlan,
      kettleFacts,
      "instagram",
      "https://caca-oferta-oficial.vercel.app/go/ig_kettle",
    );

    expect(rendered.feed).toContain("Água quente no dia a dia sem transformar isso numa tarefa.");
    expect(rendered.feed).toMatch(/Hoje aparece por R\$\s39,90\./);
    expect(rendered.feed).toContain("Quer ver os detalhes e confirmar se o preço continua assim?");
    expect(rendered.feed).toContain("🔎 Link da oferta na bio. 👇");
    expect(rendered.feed).not.toContain("🔥 Chaleira Elétrica 2L Inox 220V Fervedor de Água");
    expect(rendered.feed).not.toMatch(/https?:\/\//);
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
