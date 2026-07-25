/**
 * TDD RED — Testes para validação progressiva e monetização da Publicação Expressa.
 * Esses testes DEVEM FALHAR antes da implementação.
 */
import { describe, expect, it } from "vitest";
import {
  validateExpressProduct,
  type ExpressProductInput,
  type ExpressValidationResult,
} from "@/lib/publish/express-product-validator";

// ─── Validação Progressiva ──────────────────────────────────────────────────

describe("validateExpressProduct — validação progressiva", () => {
  const baseValid: ExpressProductInput = {
    title: "Calça Skinny Preta Masculina Jeans com Elastano Lycra",
    marketplace: "Mercado Livre",
    imageUrl: "https://http2.mlstatic.com/D_NQ_NP_calca.jpg",
    price: 129.90,
    resolvedUrl: "https://www.mercadolivre.com.br/calca/MLB6059303240-_JM",
    itemId: "MLB6059303240",
  };

  it("aprova produto com todos os campos válidos", () => {
    const result: ExpressValidationResult = validateExpressProduct(baseValid);
    expect(result.identityConfirmed).toBe(true);
    expect(result.nameConfirmed).toBe(true);
    expect(result.priceConfirmed).toBe(true);
    expect(result.imageConfirmed).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.errorCode).toBeUndefined();
  });

  it("rejeita com PRODUCT_ID_NOT_FOUND quando itemId ausente", () => {
    const result = validateExpressProduct({ ...baseValid, itemId: undefined });
    expect(result.identityConfirmed).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.errorCode).toBe("PRODUCT_ID_NOT_FOUND");
  });

  it("rejeita com PRODUCT_NAME_MISSING quando título ausente", () => {
    const result = validateExpressProduct({ ...baseValid, title: "" });
    expect(result.nameConfirmed).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.errorCode).toBe("PRODUCT_NAME_MISSING");
  });

  it("rejeita com PRODUCT_NAME_MISSING quando título é código de produto", () => {
    const result = validateExpressProduct({ ...baseValid, title: "MLB6059303240" });
    expect(result.nameConfirmed).toBe(false);
    expect(result.errorCode).toBe("PRODUCT_NAME_MISSING");
  });

  it("rejeita com CURRENT_PRICE_MISSING quando preço é zero", () => {
    const result = validateExpressProduct({ ...baseValid, price: 0 });
    expect(result.priceConfirmed).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.errorCode).toBe("CURRENT_PRICE_MISSING");
  });

  it("rejeita com CURRENT_PRICE_MISSING quando preço é negativo", () => {
    const result = validateExpressProduct({ ...baseValid, price: -1 });
    expect(result.priceConfirmed).toBe(false);
    expect(result.errorCode).toBe("CURRENT_PRICE_MISSING");
  });

  it("rejeita com PRODUCT_IMAGE_MISSING quando imagem ausente", () => {
    const result = validateExpressProduct({ ...baseValid, imageUrl: "" });
    expect(result.imageConfirmed).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.errorCode).toBe("PRODUCT_IMAGE_MISSING");
  });

  it("aceita imagem WebP sem extensão via CDN do Shopee", () => {
    const result = validateExpressProduct({
      ...baseValid,
      imageUrl: "https://down-br.img.susercontent.com/file/br-11134207-7r98o-lyvy",
    });
    expect(result.imageConfirmed).toBe(true);
    expect(result.approved).toBe(true);
  });

  it("aceita imagem mlstatic.com sem extensão", () => {
    const result = validateExpressProduct({
      ...baseValid,
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_123456-MLA_012024",
    });
    expect(result.imageConfirmed).toBe(true);
    expect(result.approved).toBe(true);
  });

  it("aceita imagem com query string", () => {
    const result = validateExpressProduct({
      ...baseValid,
      imageUrl: "https://http2.mlstatic.com/image.jpg?size=500x500&quality=85",
    });
    expect(result.imageConfirmed).toBe(true);
  });

  it("rejeita imagem placeholder", () => {
    const result = validateExpressProduct({
      ...baseValid,
      imageUrl: "https://via.placeholder.com/300x300",
    });
    expect(result.imageConfirmed).toBe(false);
    expect(result.errorCode).toBe("PRODUCT_IMAGE_MISSING");
  });

  it("rejeita imagem com logo no path", () => {
    const result = validateExpressProduct({
      ...baseValid,
      imageUrl: "https://shopee.com.br/assets/logo-main.png",
    });
    expect(result.imageConfirmed).toBe(false);
  });

  it("rejeita imagem SVG", () => {
    const result = validateExpressProduct({
      ...baseValid,
      imageUrl: "https://cdn.example.com/product.svg",
    });
    expect(result.imageConfirmed).toBe(false);
  });

  it("não exige preço anterior, rating ou desconto", () => {
    const result = validateExpressProduct({
      ...baseValid,
      // Nenhum campo opcional fornecido
    });
    expect(result.approved).toBe(true);
  });
});

// ─── Validação Shopee ───────────────────────────────────────────────────────

describe("validateExpressProduct — Shopee", () => {
  it("aprova produto Shopee com shop_id e item_id", () => {
    const result = validateExpressProduct({
      title: "Kit Conjunto Feminino Calça E Blusa Cropped Social",
      marketplace: "Shopee",
      imageUrl: "https://down-br.img.susercontent.com/file/br-11134207-7r98o-lyvyezqs1z9k07",
      price: 95.90,
      resolvedUrl: "https://shopee.com.br/product/123456789/1001234567",
      shopId: "123456789",
      itemId: "1001234567",
    });
    expect(result.approved).toBe(true);
    expect(result.identityConfirmed).toBe(true);
  });
});
