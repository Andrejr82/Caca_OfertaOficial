import { describe, expect, it } from "vitest";
import { buildCopyV2ChannelCopy, buildOfficialPrompt, buildOfficialRegenerationPrompt } from "@/core/ai";
import type { OfficialAIDraftForRegeneration, OfficialAIOffer } from "@/core/ai";

const offer: OfficialAIOffer = {
  id: "offer-1", tenantId: "tenant-1", state: "selected", version: 1,
  marketplace: "Shopee", productName: "Tênis Casual Feminino",
  originalUrl: "https://shopee.com.br/1", imageUrl: "", currentPrice: 79.9,
  originalPrice: 99.9, category: "Calçados", explainability: {},
  createdAt: "2026-07-15T10:00:00.000Z"
};

describe("Official AI Copy V2 prompts", () => {
  it("define copywriter de ofertas, estilo distinto por canal e proíbe invenções", () => {
    const prompt = buildOfficialPrompt(offer, ["whatsapp", "telegram", "instagram"]);
    const text = `${prompt.system}\n${prompt.user}`;

    expect(text).toContain("copywriter especializado em ofertas");
    expect(text).toContain("WhatsApp");
    expect(text).toContain("Telegram");
    expect(text).toContain("Instagram");
    expect(text).toContain("Nunca invente");
    expect(text).toContain("Você não conversa");
    expect(text).toContain("Olá");
    expect(text).toContain("urgência natural");
    expect(text).toContain("outputContract");
    expect(text).toContain("copy final sem URL e sem placeholder");
  });

  it("prompt de regeneração usa fatos do draft, não reutiliza copy antiga e manda omitir link", () => {
    const draft = {
      postId: "post-1", offerId: "offer-1", affiliateLinkId: "link-1",
      channel: "telegram", status: "draft", createdAt: offer.createdAt,
      currentContent: "copy antiga\n\nhttps://cacaoferta.com.br/go/tg_offer1", trackedUrl: "https://cacaoferta.com.br/go/tg_offer1",
      marketplace: offer.marketplace, productName: offer.productName,
      currentPrice: offer.currentPrice, originalPrice: offer.originalPrice,
      category: offer.category, shippingFree: null, rating: null, coupon: null, evidence: {}
    } satisfies OfficialAIDraftForRegeneration;

    const prompt = buildOfficialRegenerationPrompt(draft);
    expect(prompt.user).toContain('"channel":"telegram"');
    expect(prompt.user).toContain("NÃO inclua URL");
    expect(prompt.user).not.toContain(draft.trackedUrl);
    expect(prompt.user).not.toContain("copy antiga");
    expect(prompt.system).toBe(buildOfficialPrompt(offer, ["telegram"]).system);
  });

  it("omite desconto inexistente e não pede placeholder de link", () => {
    const prompt = buildOfficialPrompt({ ...offer, originalPrice: null }, ["whatsapp"]);
    expect(prompt.user).toContain('"discountPercentage":null');
    expect(prompt.user).not.toContain("[link]");
  });

  it("renderiza formatos factuais distintos para WhatsApp, Telegram e Instagram", () => {
    const whatsapp = buildCopyV2ChannelCopy(offer, "whatsapp");
    const telegram = buildCopyV2ChannelCopy(offer, "telegram");
    const instagram = buildCopyV2ChannelCopy(offer, "instagram");
    expect(whatsapp).toContain("*Tênis Casual Feminino*");
    expect(whatsapp).toContain("🔥 ACHADINHO SHOPEE");
    expect(whatsapp).toContain("🛒 Garanta o seu:");
    expect(telegram).toContain("🔥 OFERTA SHOPEE");
    expect(telegram).toContain("• Marketplace: Shopee");
    expect(instagram).toContain("#oferta #Shopee");
    for (const copy of [whatsapp, telegram, instagram]) {
      expect(copy).not.toMatch(/Olá|\[link\]|https?:\/\//iu);
      expect(copy).toContain("R$ 79,90");
      expect(copy).toContain("20%");
    }
  });

  it("omite código interno de categoria da copy pública", () => {
    expect(buildCopyV2ChannelCopy({ ...offer, category: "cat:100635" }, "telegram")).not.toContain("cat:100635");
  });
});
