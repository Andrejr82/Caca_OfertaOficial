import { test, expect, describe } from 'vitest';
import { validateProduct } from '../../../core/scraper/product-validator';

describe('Product Validator (Sprint 2 - Validação Centralizada de Preço)', () => {
  const baseProduct = {
    title: "Produto de Teste Valido",
    category: "Eletrônicos",
    brand: "Marca",
    rating: 4.5,
    image_url: "https://http2.mlstatic.com/D_NQ_NP_123456-O.webp",
    url: "https://www.mercadolivre.com.br/produto",
  };

  test('old_price > current_price deve manter old_price', () => {
    const product = { ...baseProduct, current_price: 100, old_price: 150 };
    const result = validateProduct(product, "MercadoLivre");
    
    console.log("REJECT REASON:", result.rejectReason);
    expect(result.valid).toBe(true);
    expect(product.old_price).toBe(150);
    expect((product as any).discount_percent).toBe(33);
    expect((product as any).explainability?.discount_reason).toBe("VALID");
  });

  test('old_price = current_price deve anular old_price', () => {
    const product = { ...baseProduct, current_price: 100, old_price: 100 };
    const result = validateProduct(product, "Shopee");
    
    console.log("REJECT REASON:", result.rejectReason);
    expect(result.valid).toBe(true);
    expect(product.old_price).toBeNull();
    expect((product as any).explainability?.discount_reason).toBe("OLD_PRICE_EQUAL_CURRENT");
  });

  test('old_price < current_price deve anular old_price', () => {
    const product = { ...baseProduct, url: "https://www.amazon.com.br/produto", current_price: 100, old_price: 90 };
    const result = validateProduct(product, "Amazon");
    
    console.log("REJECT REASON:", result.rejectReason);
    expect(result.valid).toBe(true);
    expect(product.old_price).toBeNull();
    expect((product as any).explainability?.discount_reason).toBe("OLD_PRICE_BELOW_CURRENT");
  });

  test('old_price ausente deve marcar motivo', () => {
    const product = { ...baseProduct, url: "https://www.amazon.com.br/produto", current_price: 100 };
    const result = validateProduct(product, "Amazon");
    
    console.log("REJECT REASON:", result.rejectReason);
    expect(result.valid).toBe(true);
    expect((product as any).old_price).toBeNull();
    expect((product as any).explainability?.discount_reason).toBe("OLD_PRICE_MISSING");
  });

  test('desconto > 80% deve anular old_price por ser suspeito', () => {
    const product = { ...baseProduct, current_price: 10, old_price: 100 }; // 90% de desconto
    const result = validateProduct(product, "Shopee");
    
    console.log("REJECT REASON:", result.rejectReason);
    expect(result.valid).toBe(true);
    expect(product.old_price).toBeNull();
    expect((product as any).explainability?.discount_reason).toBe("DISCOUNT_SUSPICIOUS");
  });

  test('current_price ausente ou invalido deve rejeitar produto', () => {
    const product = { ...baseProduct, current_price: 0, old_price: 100 };
    const result = validateProduct(product, "MercadoLivre");
    
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toBe("PRECO_INVALIDO");
  });

  test('preços com formatação de string devem ser extraídos e validados', () => {
    const product = { ...baseProduct, url: "https://www.amazon.com.br/produto", current_price: "R$ 1.500,50", old_price: "2.000,00" };
    const result = validateProduct(product, "Amazon");
    
    console.log("REJECT REASON:", result.rejectReason);
    expect(result.valid).toBe(true);
    expect(product.old_price).toBe(2000);
    expect((product as any).explainability?.discount_reason).toBe("VALID");
  });
});
