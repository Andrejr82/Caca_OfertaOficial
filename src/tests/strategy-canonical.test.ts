import { describe, expect, it } from "vitest";
import { schedule, commercialPriorityText } from "@/app/(dashboard)/strategy/page";

describe("Strategy Canonical Sync", () => {
  it("A) does not include 'games' in commercial priority text", () => {
    expect(commercialPriorityText.toLowerCase()).not.toContain("games");
    expect(commercialPriorityText.toLowerCase()).not.toContain("automotivo");
    expect(commercialPriorityText).toContain("Casa/Cozinha/Organização, Beleza, Moda, Eletrodomésticos, Informática, Ferramentas e Pet.");
  });

  it("B & C) displays cupons as manual discovery at 22h publication", () => {
    const cuponsItem = schedule.find((item) => item.marketplaces === "cupons_aprovados_editorial");
    expect(cuponsItem).toBeDefined();
    expect(cuponsItem?.discovery).toBe("Manual");
    expect(cuponsItem?.discovery).not.toBe("21h");
    expect(cuponsItem?.time).toBe("22h");
    expect(cuponsItem?.focus).toBe("Apenas cupons cadastrados e aprovados manualmente");
  });

  it("D) contains only the 7 active canonical niches and cupons", () => {
    const activeScenarios = schedule.map((item) => item.marketplaces);
    expect(activeScenarios).toEqual([
      "casa_cozinha_editorial",
      "beleza_editorial",
      "informatica_editorial",
      "moda_editorial",
      "ferramentas_editorial",
      "pet_editorial",
      "eletrodomesticos_editorial",
      "cupons_aprovados_editorial",
    ]);
  });

  it("E) automatic discovery hours are strictly [06, 08, 10, 12, 14, 16, 18]", () => {
    const autoDiscoveryHours = schedule
      .filter((item) => item.discovery !== "Manual")
      .map((item) => parseInt(item.discovery.replace("h", ""), 10));

    expect(autoDiscoveryHours).toEqual([6, 8, 10, 12, 14, 16, 18]);
  });

  it("F) publication hours are the canonical 7 niches + cupons [07, 09, 11, 13, 15, 17, 19, 22]", () => {
    const publicationHours = schedule.map((item) => parseInt(item.time.replace("h", ""), 10));
    expect(publicationHours).toEqual([7, 9, 11, 13, 15, 17, 19, 22]);
    expect(schedule.length).toBe(8);
  });
});
