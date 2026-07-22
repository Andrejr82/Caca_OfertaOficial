import { describe, expect, it } from "vitest";
import { validateProductTitle } from "@/core/quality/product-title-quality";
import { ICON_CATALOG_LICENSE, ICON_CATALOG_VERSION, marketplaceLabel, selectOfferIcons } from "@/core/ai/icon-catalog";

describe("quality gate e catálogo de ícones", () => {
  it("bloqueia títulos genéricos e códigos isolados", () => {
    expect(validateProductTitle("Genérico").valid).toBe(false);
    expect(validateProductTitle("B0D1234567").valid).toBe(false);
    expect(validateProductTitle("Air Fryer Mondial 5L").valid).toBe(true);
  });

  it("prioriza o produto para não herdar ícone de categoria conflitante", () => {
    expect(selectOfferIcons("Calçados", "Fone Bluetooth 5.3")[0]?.key).toBe("audio");
  });

  it("normaliza o marketplace por renderer determinístico", () => {
    expect(marketplaceLabel("Amazon").text).toBe("Achado na Amazon");
    expect(marketplaceLabel("Mercado Livre").text).toBe("Achado no Mercado Livre");
  });

  it("mantém licença e versão do catálogo auditáveis", () => {
    expect(ICON_CATALOG_LICENSE).toBe("Apache-2.0");
    expect(ICON_CATALOG_VERSION).toBe("2026-07-v1");
  });
});
