import { describe, it, expect } from "vitest";
import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";
import { classifyProduct } from "@/core/classification/classifier";
import { isAccessoryOnlyProductTitle, validateProductTitle } from "../../../../scripts/product-title-quality.cjs";
import { classifyCandidate } from "../../../../scripts/classification-coverage.cjs";

describe("Sprint 3 — Produto Principal, Intenção e Classificação", () => {
  it("garante que 'Webcam ... Notebook' continue sendo classificado como webcam", () => {
    const title = "Webcam Logitech C920s Full HD 1080p para Notebook e PC";
    const classification = classifyCandidate({ title }, "Amazon");

    expect(classification.productType).toBe("webcam");
    expect(classification.status).toBe("classified");

    const candidate = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09WEBCAM",
      title,
      classification: { status: classification.status, productType: classification.productType },
      productRole: "main_product",
    });

    expect(candidate.productRole).toBe("main_product");
    expect(candidate.classification.productType).toBe("webcam");
    expect(candidate.classification.status).toBe("classified");
  });

  it("garante que 'Mini PC ... SSD' continue sendo classificado como mini PC", () => {
    const title = "Mini PC Beelink S12 Pro Intel N100 16GB 500GB SSD NVMe";
    const classification = classifyCandidate({ title }, "Amazon");

    expect(classification.productType).toBe("mini_pc");
    expect(classification.status).toBe("classified");

    const candidate = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09MINIPC",
      title,
      classification: { status: classification.status, productType: classification.productType },
      productRole: "main_product",
    });

    expect(candidate.productRole).toBe("main_product");
    expect(candidate.classification.productType).toBe("mini_pc");
  });

  it("rejeita suporte/adaptador/cabo/peça quando a intenção exigir produto principal", () => {
    const accessoryTitles = [
      "Suporte Articulado de Mesa para Monitor 17 a 35",
      "Adaptador USB-C 7 em 1 Hub HDMI para Notebook",
      "Cabo HDMI 2.1 8K para TV e Monitor",
      "Peça de Reposição Cabo de Força Tripolar",
      "Case Gaveta USB para SSD M.2 NVMe",
    ];

    for (const title of accessoryTitles) {
      const isAccessory = isAccessoryOnlyProductTitle(title);
      const quality = validateProductTitle(title);

      expect(isAccessory).toBe(true);
      expect(quality.valid).toBe(false);
      expect(quality.reason).toBe("ACCESSORY_ONLY_PRODUCT");
    }
  });

  it("bloqueia filamento 3D e caneta 3D como impressora", () => {
    const titles = [
      "Filamento PLA 1.75mm 1kg para Impressora 3D Creality Ender",
      "Caneta 3D com Refil de Filamento Colorido",
      "Extrusora Hotend Bico Nozzle 0.4mm para Impressora 3D",
    ];

    for (const title of titles) {
      const quality = validateProductTitle(title);
      expect(quality.valid).toBe(false);
      expect(quality.reason).toBe("ACCESSORY_ONLY_PRODUCT");
    }
  });
});
