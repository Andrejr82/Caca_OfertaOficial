import { describe, expect, it } from "vitest";
import { parseSheinShareText } from "@/lib/publish/shein-share-text";

const realShare = `Não perca esta oferta grande na SHEIN! Economize muito agora!
💰Preço[R$94,32] -20%
🛒2 peças/Conjunto Roupa Casual Masculina...
🎁Cupom 50% OFF para todo Novo Usuário!
https://onelink.shein.com/46/abc123`;

describe("SHEIN share text parser", () => {
  it("extracts price, discount, title, coupon and exact OneLink", () => {
    expect(parseSheinShareText(realShare)).toEqual({
      marketplace: "shein",
      price: 94.32,
      discountPercent: 20,
      title: "2 peças/Conjunto Roupa Casual Masculina...",
      couponText: "Cupom 50% OFF para todo Novo Usuário!",
      originalUrl: "https://onelink.shein.com/46/abc123",
    });
  });

  it("accepts comma prices without discount or coupon", () => {
    const result = parseSheinShareText("🛒Produto\n💰Preço[R$1.234,56]\nhttps://onelink.shein.com/46/abc123");
    expect(result.price).toBe(1234.56);
    expect(result.discountPercent).toBeUndefined();
    expect(result.couponText).toBeUndefined();
  });

  it("supports multiline title and requires a OneLink", () => {
    const result = parseSheinShareText("🛒Título linha 1\nlinha 2\n💰Preço[R$10,00]\nhttps://onelink.shein.com/46/abc123");
    expect(result.title).toBe("Título linha 1\nlinha 2");
    expect(() => parseSheinShareText("🛒Produto\n💰Preço[R$10,00]")).toThrow("SHEIN_SHARE_URL_REQUIRED");
  });

  it("parses a single-line share without leaking coupon or URL into title", () => {
    const result = parseSheinShareText("💰Preço[R$94,32] -20% 🛒Produto de verão 🎁Cupom 50% OFF https://onelink.shein.com/46/abc123");
    expect(result.title).toBe("Produto de verão");
    expect(result.couponText).toBe("Cupom 50% OFF");
    expect(result.originalUrl).toBe("https://onelink.shein.com/46/abc123");
  });

  it("fails closed for invalid shared text", () => {
    expect(() => parseSheinShareText("oferta SHEIN sem dados")).toThrow("SHEIN_SHARE_INVALID");
    expect(() => parseSheinShareText("🛒Produto\n💰Preço[R$0,00]\nhttps://onelink.shein.com/46/abc123")).toThrow("SHEIN_SHARE_PRICE_INVALID");
  });
});
