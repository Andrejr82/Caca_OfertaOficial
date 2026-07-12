import { describe, expect, it } from "vitest";
import {
  assertShopeeSelected,
  assertShopeePublishable,
  nextShopeeManualStatus
} from "@/lib/offers/shopee-manual-curation";

describe("Shopee Discovery V5 - curadoria manual", () => {
  it("marca novos finalistas como pending_manual_review", () => {
    expect(nextShopeeManualStatus("discovered")).toBe("pending_manual_review");
  });

  it("permite seleção e descarte somente enquanto pendente", () => {
    expect(nextShopeeManualStatus("pending_manual_review", "select")).toBe("selected");
    expect(nextShopeeManualStatus("pending_manual_review", "reject")).toBe("rejected");
    expect(() => nextShopeeManualStatus("posted", "select")).toThrow(/transição Shopee V5 inválida/i);
  });

  it("bloqueia IA, link e publicação antes da seleção manual", () => {
    expect(() => assertShopeeSelected({ platform: "Shopee", status: "pending_manual_review" })).toThrow(/seleção manual/i);
    expect(() => assertShopeeSelected({ platform: "Shopee", status: "rejected" })).toThrow(/seleção manual/i);
    expect(() => assertShopeeSelected({ platform: "Shopee", status: "selected" })).not.toThrow();
  });

  it("não altera fluxo de outros marketplaces", () => {
    expect(() => assertShopeeSelected({ platform: "Amazon", status: "draft" })).not.toThrow();
  });

  it("publica somente após seleção e mantém canais seguintes após primeiro post", () => {
    expect(() => assertShopeePublishable({ platform: "Shopee", status: "pending_manual_review" })).toThrow(/seleção manual/i);
    expect(() => assertShopeePublishable({ platform: "Shopee", status: "selected" })).not.toThrow();
    expect(() => assertShopeePublishable({ platform: "Shopee", status: "posted" })).not.toThrow();
  });
});
