import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  ML_RADAR_DISCOVERY_INTENTS,
  ML_RADAR_INTENT_MACRO_GROUPS,
  collectMercadoLivreRadarDiscoveryV1,
  normalizeMercadoLivreDiscoveryProduct,
} = require("../../../scripts/mercadolivre-radar-discovery-v1.cjs");
const { SEARCH_ALIASES } = require("../../../scripts/mercadolivre-official-intents-v5.cjs");

describe("Mercado Livre Radar Discovery V1", () => {
  it("uses a compact official intent set covering at least five macro groups", () => {
    expect(ML_RADAR_DISCOVERY_INTENTS.length).toBeGreaterThanOrEqual(10);
    expect(ML_RADAR_DISCOVERY_INTENTS.length).toBeLessThanOrEqual(12);
    const macroGroups = new Set(ML_RADAR_DISCOVERY_INTENTS.map((intent: string) => ML_RADAR_INTENT_MACRO_GROUPS[intent]));
    expect(macroGroups.size).toBeGreaterThanOrEqual(5);
    for (const intent of ML_RADAR_DISCOVERY_INTENTS) {
      expect(SEARCH_ALIASES[intent]).toBeTruthy();
      expect(ML_RADAR_INTENT_MACRO_GROUPS[intent]).toBeTruthy();
    }
  });

  it("collects through the existing official coverage with bounded per-intent work", async () => {
    const coverageRunner = vi.fn(async () => ({ products: [{ item_id: "MLB-1", product_id: "MLB-P1", product_name: "Mouse sem fio", category_name: "Mouses", current_price: 49.9, old_price: 69.9, discount_percent: 28.61, intent: "mouse sem fio", domain_id: "MLB-COMPUTER_MICE", category_id: "MLB1714", image_url: "https://http2.mlstatic.com/mouse.jpg", product_url: "https://www.mercadolivre.com.br/p/MLB-P1", source_position: 1 }] }));
    const result = await collectMercadoLivreRadarDiscoveryV1({ accessToken: "token", coverageRunner });
    expect(coverageRunner).toHaveBeenCalledTimes(1);
    expect(coverageRunner.mock.calls[0][0].keywords).toEqual(ML_RADAR_DISCOVERY_INTENTS);
    expect(coverageRunner.mock.calls[0][0].maxPerIntent).toBe(4);
    expect(coverageRunner.mock.calls[0][0].delayMs).toBeLessThanOrEqual(200);
    expect(result[0]).toMatchObject({ itemId: "MLB-1", productId: "MLB-P1", sourceIntent: "mouse sem fio", macroGroup: "informatica", domainId: "MLB-COMPUTER_MICE", categoryId: "MLB1714", currentPrice: 49.9, oldPrice: 69.9, commissionPercent: 0 });
  });

  it("keeps OAuth refresh read-only during discovery", async () => {
    const tokenProvider = vi.fn(async () => "token");
    const coverageRunner = vi.fn(async () => ({ products: [] }));
    await collectMercadoLivreRadarDiscoveryV1({ tokenProvider, coverageRunner, env: { TEST: "1" } });
    expect(tokenProvider).toHaveBeenCalledWith({ env: { TEST: "1" }, persist: false });
  });

  it("deduplicates native items and excludes invalid prices without fabricating metrics", async () => {
    const coverageRunner = vi.fn(async () => ({ products: [
      { item_id: "MLB-1", product_name: "Produto válido", current_price: 10, intent: "lixeira inox pedal" },
      { item_id: "MLB-1", product_name: "Duplicado", current_price: 12, intent: "lixeira inox pedal" },
      { item_id: "MLB-2", product_name: "Preço inválido", current_price: 0, intent: "lixeira inox pedal" },
    ] }));
    const result = await collectMercadoLivreRadarDiscoveryV1({ accessToken: "token", coverageRunner });
    expect(result).toHaveLength(1);
    expect(result[0].sales).toBeNull();
    expect(result[0].rating).toBeNull();
  });

  it("preserves official discovery metadata during normalization", () => {
    const result = normalizeMercadoLivreDiscoveryProduct({ item_id: "MLB-9", product_id: "MLB-P9", product_name: "Mala de bordo", category_name: "Malas", current_price: 199, old_price: 249, intent: "mala de bordo 10kg", domain_id: "MLB-SUITCASES", category_id: "MLB417705", source_position: 2 });
    expect(result).toMatchObject({ sourceIntent: "mala de bordo 10kg", macroGroup: "viagem", domainId: "MLB-SUITCASES", categoryId: "MLB417705", sourcePosition: 2, currentPrice: 199, oldPrice: 249 });
  });
});
