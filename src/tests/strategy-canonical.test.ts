import { describe, expect, it } from "vitest";
import { schedule, commercialPriorityText } from "@/app/(dashboard)/strategy/page";

describe("Strategy Canonical Sync", () => {
  it("A) does not include 'games' in commercial priority text", () => {
    expect(commercialPriorityText.toLowerCase()).not.toContain("games");
    expect(commercialPriorityText.toLowerCase()).not.toContain("automotivo");
    expect(commercialPriorityText).toContain("Eletrônicos, telefonia, informática, eletrodomésticos, casa, beleza, moda, esporte, pet e móveis.");
  });

  it("B & C) displays cupons as manual discovery at 22h publication", () => {
    const cuponsItem = schedule.find((item) => item.marketplaces === "cupons_aprovados_editorial");
    expect(cuponsItem).toBeDefined();
    expect(cuponsItem?.discovery).toBe("Manual");
    expect(cuponsItem?.discovery).not.toBe("21h");
    expect(cuponsItem?.time).toBe("22h");
    expect(cuponsItem?.focus).toBe("Apenas cupons cadastrados e aprovados manualmente");
  });

  it("D) does not contain 'qualquer categoria' in Grandes Ofertas focus", () => {
    const grandesOfertasItem = schedule.find((item) => item.marketplaces === "grandes_ofertas_editorial");
    expect(grandesOfertasItem).toBeDefined();
    expect(grandesOfertasItem?.focus.toLowerCase()).not.toContain("qualquer categoria");
    expect(grandesOfertasItem?.time).toBe("21h");
    expect(grandesOfertasItem?.discovery).toBe("20h");
  });

  it("E & F) automatic discovery hours are strictly [06, 07, 08, 09, 10, 11, 12, 13, 14, 17, 18, 19, 20] and exclude 15h, 16h, 21h", () => {
    const autoDiscoveryHours = schedule
      .filter((item) => item.discovery !== "Manual")
      .map((item) => parseInt(item.discovery.replace("h", ""), 10));

    expect(autoDiscoveryHours).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20]);
    expect(autoDiscoveryHours).not.toContain(15);
    expect(autoDiscoveryHours).not.toContain(16);
    expect(autoDiscoveryHours).not.toContain(21);
  });

  it("G) publication hours are the canonical 14 scenarios [07, 08, 09, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22]", () => {
    const publicationHours = schedule.map((item) => parseInt(item.time.replace("h", ""), 10));
    expect(publicationHours).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22]);
    expect(schedule.length).toBe(14);
  });
});
