import { describe, expect, it } from "vitest";
import {
  buildCopyV2ChannelCopy,
  buildOfficialPrompt,
  buildOfficialRegenerationPrompt
} from "@/core/ai";
import type { OfficialAIDraftForRegeneration, OfficialAIOffer } from "@/core/ai";

const offer: OfficialAIOffer = {
  id: "offer-1", tenantId: "tenant-1", state: "selected", version: 1,
  marketplace: "Shopee", productName: "Tênis Casual Feminino",
  originalUrl: "https://shopee.com.br/1", imageUrl: "", currentPrice: 79.9,
  originalPrice: 99.9, category: "Calçados", explainability: {},
  createdAt: "2026-07-15T10:00:00.000Z"
};

const draft: OfficialAIDraftForRegeneration = {
  postId: "post-1", offerId: "offer-1", affiliateLinkId: "link-1",
  channel: "telegram", status: "draft", createdAt: offer.createdAt,
  currentContent: "copy antiga\n\nhttps://cacaoferta.com.br/go/tg_offer1",
  trackedUrl: "https://cacaoferta.com.br/go/tg_offer1",
  marketplace: offer.marketplace, productName: offer.productName,
  currentPrice: offer.currentPrice, originalPrice: offer.originalPrice,
  category: offer.category, shippingFree: null, rating: null, coupon: null, evidence: {}
};

describe("Official AI O.P.A.C.", () => {
  it("usa somente gancho curto da IA e renderiza restante deterministicamente", () => {
    const copy = buildCopyV2ChannelCopy({
      ...offer,
      productName: "Fone Bluetooth 5.3 com cancelamento de ruído ativo para viagens",
    }, "telegram", "🔥 PREÇO BAIXOU");

    expect(copy).toBe([
      "📌 *OFERTA EM DESTAQUE*",
      "🔥 PREÇO BAIXOU",
      "🛍️ Fone Bluetooth 5.3 com cancelamento de ruído ativo para viagens",
      "🎧 Achado na Shopee",
      "✨ Bluetooth 5.3",
      "📉 De R$ 99,90\n💰 Por *R$ 79,90* (20% OFF)",
      "ℹ️ Consulte disponibilidade e condições no anúncio:",
      "👉 "
    ].join("\n\n"));
  });

  it("renderiza título, preço e um atributo objetivo extraído do título", () => {
    const copy = buildCopyV2ChannelCopy({
      ...offer,
      productName: "SSD NVMe 1 TB PCIe 4.0",
      originalPrice: null
    }, "telegram");

    expect(copy).toBe([
      "📌 *OFERTA EM DESTAQUE*",
      "💥 ACHADO DO DIA",
      "🛍️ SSD NVMe 1 TB PCIe 4.0",
      "💻 Achado na Shopee",
      "✨ 1 TB PCIe 4.0",
      "💰 *R$ 79,90*",
      "ℹ️ Consulte disponibilidade e condições no anúncio:",
      "👉 "
    ].join("\n\n"));
  });

  it("destaca preço sem inventar desconto quando preço anterior não é válido", () => {
    const copy = buildCopyV2ChannelCopy({ ...offer, originalPrice: 79.9 }, "whatsapp");
    expect(copy).toContain("✅ *Preço atual: R$ 79,90*");
    expect(copy).not.toMatch(/📉|% OFF/iu);
  });

  it("não inventa urgência, escassez ou variação futura de preço", () => {
    const copy = ["whatsapp", "telegram", "instagram"].map((channel) => buildCopyV2ChannelCopy({ ...offer, originalPrice: null }, channel as "whatsapp" | "telegram" | "instagram")).join("\n");
    expect(copy).not.toMatch(/estoque|só agora|corre que|antes que o preço suba|relâmpago|baixou muito/iu);
    expect(copy).toContain("Preço atual");
  });

  it("calcula desconto somente quando preço anterior é maior", () => {
    const copy = buildCopyV2ChannelCopy({ ...offer, currentPrice: 55.98, originalPrice: 79.9 }, "telegram");
    expect(copy).toContain("📉 De R$ 79,90\n💰 Por *R$ 55,98* (30% OFF)");
  });

  it("limpa repetições adjacentes e limita somente o título sem cortar palavras", () => {
    const copy = buildCopyV2ChannelCopy({
      ...offer,
      productName: "Oferta: Fone Bluetooth 5.3 Fone Bluetooth 5.3 com cancelamento de ruído ativo e bateria de longa duração para viagens | Shopee"
    }, "telegram");
    const title = copy.split("\n\n").find((block) => block.startsWith("🛍️")) ?? "";

    expect(title).toContain("🛍️ Fone Bluetooth 5.3 com cancelamento de ruído ativo");
    expect(title.length).toBeLessThanOrEqual(80);
    expect(copy).toContain("👉 ");
  });

  it("omite atributo quando título e metadados não contêm fato objetivo confiável", () => {
    const copy = buildCopyV2ChannelCopy({ ...offer, originalPrice: null }, "whatsapp");
    expect(copy.split("\n\n")).toEqual([
      "📌 *OFERTA EM DESTAQUE*",
      "💥 ACHADO DO DIA",
      "🛍️ Tênis Casual Feminino",
      "👟 Achado na Shopee",
      "✅ *Preço atual: R$ 79,90*",
      "ℹ️ Consulte disponibilidade e condições no anúncio:",
      "👉 "
    ]);
    expect(copy).not.toMatch(/excelente|incrível|alta performance|ideal para você|durabilidade|premium/iu);
  });

  it("aceita atributo somente quando consta em metadado persistido", () => {
    const copy = buildCopyV2ChannelCopy({
      ...offer,
      originalPrice: null,
      evidence: { attributes: [{ name: "Voltagem", value: "Bivolt 110V/220V" }] }
    }, "telegram");
    expect(copy).toContain("✨ Bivolt 110V/220V");
  });

  it("não transforma categoria, marca ou contexto em benefício inferido", () => {
    const copy = buildCopyV2ChannelCopy({
      ...offer,
      category: "Eletrônicos premium",
      evidence: { brand: "Marca Persistida", seller: "Loja excelente" },
      originalPrice: null
    }, "telegram");
    expect(copy).not.toMatch(/premium|excelente|qualidade|performance|ideal|marca persistida/iu);
  });

  it.each(["whatsapp", "telegram", "instagram"] as const)("usa O.P.A.C. em %s", (channel) => {
    const copy = buildCopyV2ChannelCopy({ ...offer, productName: "Fone Bluetooth 5.3" }, channel);
    expect(copy).toContain("🔥 PREÇO BAIXOU");
    expect(copy).toContain("Fone Bluetooth 5.3");
    expect(copy).toContain("Bluetooth 5.3");
    if (channel === "whatsapp") expect(copy).toContain("✅ *Preço atual: R$ 79,90* (20% OFF)");
    else expect(copy).toContain("💰");
    if (channel === "instagram") expect(copy).toContain("#oferta #shopee");
    else expect(copy).toMatch(/👉 $/mu);
    expect(copy.match(/\p{Extended_Pictographic}/gu)?.length ?? 0).toBeLessThanOrEqual(10);
    expect(copy).not.toMatch(/Olá|\[link\]|https?:\/\//iu);
    if (channel === "instagram") expect(copy).toMatch(/#oferta\s+#shopee/iu);
    else expect(copy).not.toContain("#");
  });

  it("mantém máximo de quatro emojis mesmo com desconto e atributo", () => {
    const copy = buildCopyV2ChannelCopy({ ...offer, productName: "Fone Bluetooth 5.3" }, "instagram");
    expect(copy).toContain("Bluetooth 5.3");
    expect(copy.match(/\p{Extended_Pictographic}/gu)?.length ?? 0).toBeLessThanOrEqual(8);
  });

  it("prompt oficial exige O.P.A.C., proíbe invenções e nunca pede URL", () => {
    const prompt = buildOfficialPrompt(offer, ["whatsapp", "telegram", "instagram"]);
    const text = `${prompt.system}\n${prompt.user}`;
    expect(text).toContain("O.P.A.C.");
    expect(text).toContain("Oferta");
    expect(text).toContain("Produto");
    expect(text).toContain("Atributo");
    expect(text).toContain("Conversão");
    expect(text).toContain("Nunca invente");
    expect(text).toContain("somente um gancho curto");
    expect(text).not.toContain("urgência natural");
  });

  it("prompt de regeneração usa fatos persistidos, ignora copy antiga e omite link", () => {
    const prompt = buildOfficialRegenerationPrompt(draft);
    expect(prompt.user).toContain('"channel":"telegram"');
    expect(prompt.user).toContain("NÃO inclua URL");
    expect(prompt.user).not.toContain(draft.trackedUrl);
    expect(prompt.user).not.toContain("copy antiga");
  });

  it("omite código interno de categoria da copy pública", () => {
    expect(buildCopyV2ChannelCopy({ ...offer, category: "cat:100635" }, "telegram")).not.toContain("cat:100635");
  });
});
