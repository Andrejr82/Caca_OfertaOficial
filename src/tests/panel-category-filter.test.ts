import { describe, expect, it } from "vitest";
import { classifyOfferForPanel, classifyPanelEditorial, UNCLASSIFIED_PANEL_CATEGORY } from "@/lib/offers/panel-category-filter";

describe("classificação de categorias exclusiva do painel", () => {
  it("classifica produtos de telefonia pelo título nativo", () => {
    expect(classifyOfferForPanel({ product_name: "iPhone 15 128GB", category: "Celulares e Telefones" }))
      .toEqual({ category: "Telefonia", subcategory: "iPhone" });
  });

  it("classifica produtos de eletrônicos e informática", () => {
    expect(classifyOfferForPanel({ product_name: "Fone JBL Bluetooth", category: "Eletrônicos" }).category)
      .toBe("Eletrônicos");
    expect(classifyOfferForPanel({ product_name: "SSD NVMe 1TB", category: "Computadores" }).category)
      .toBe("Informática");
  });

  it("classifica a subcategoria usando dados do produto", () => {
    expect(classifyOfferForPanel({ product_name: "Air Fryer 5L", category: "Eletrodomésticos" }))
      .toEqual({ category: "Eletroportáteis", subcategory: "Fritadeira Elétrica" });
  });

  it("mantém itens sem correspondência em Sem classificação", () => {
    expect(classifyOfferForPanel({ product_name: "Produto sem descrição", category: "Categoria desconhecida" }))
      .toEqual({ category: UNCLASSIFIED_PANEL_CATEGORY, subcategory: null });
  });

  it("classifica a oferta para estratégias editoriais sem persistir etiquetas", () => {
    const editorial = classifyPanelEditorial({
      product_name: "Fone JBL Bluetooth",
      category: "Eletrônicos",
      current_price: 79.9,
      old_price: 129.9,
      coupon: "JBL10",
      shipping_free: true,
      rating: 4.8,
    });

    expect(editorial.types).toEqual(expect.arrayContaining(["Alto desconto", "Baixo preço", "Com cupom", "Frete grátis", "Avaliação alta"]));
    expect(editorial.audience).toBe("Tecnologia");
    expect(editorial.profiles).toContain("Oferta agressiva");
  });
});
