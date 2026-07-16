import { describe, expect, it } from "vitest";
import { validateOfficialAIContent } from "@/core/ai";

const content = {
  title: "Oferta",
  description: "Descrição factual",
  shortCopy: "Copy curta",
  longCopy: "Copy longa",
  hashtags: ["#oferta"],
  callToAction: "Ver oferta",
  highlights: ["Fato persistido"],
  explanation: "Usa somente fatos persistidos",
  channelCopies: {
    whatsapp: "🔥 OFERTA SHOPEE\n\nProduto\n\n💰 R$ 10,00\n\n👉 Ver oferta",
    telegram: "🔥 OFERTA SHOPEE\n\nProduto\n\n💰 R$ 10,00\n\n👉 Ver oferta",
    instagram: "🔥 OFERTA SHOPEE\n\nProduto\n\n💰 R$ 10,00\n\n#oferta #shopee\n\n👉 Ver oferta"
  }
};

describe("validateOfficialAIContent", () => {
  it("aceita WhatsApp com hashtags vazias", () => {
    expect(validateOfficialAIContent({ ...content, hashtags: [] }, ["whatsapp"])).not.toBeNull();
  });

  it("aceita Telegram com hashtags vazias", () => {
    expect(validateOfficialAIContent({ ...content, hashtags: [] }, ["telegram"])).not.toBeNull();
  });

  it("rejeita Instagram com hashtags vazias", () => {
    expect(validateOfficialAIContent({ ...content, hashtags: [] }, ["instagram"])).toBeNull();
  });

  it("aceita Instagram com hashtags válidas", () => {
    expect(validateOfficialAIContent(content, ["instagram"])).not.toBeNull();
  });

  it("rejeita URL na copy", () => {
    expect(validateOfficialAIContent({
      ...content,
      channelCopies: { ...content.channelCopies, whatsapp: `${content.channelCopies.whatsapp}\n\nhttps://example.com` }
    }, ["whatsapp"])).toBeNull();
  });

  it("rejeita placeholder [link]", () => {
    expect(validateOfficialAIContent({
      ...content,
      channelCopies: { ...content.channelCopies, telegram: `${content.channelCopies.telegram}\n\n[link]` }
    }, ["telegram"])).toBeNull();
  });
});
