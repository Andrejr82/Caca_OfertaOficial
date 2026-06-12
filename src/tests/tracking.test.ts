import { describe, expect, it } from "vitest";
import { createSubId, createTrackedUrl, slugifyProductName } from "@/lib/tracking/sub-id";

describe("tracking helpers", () => {
  it("creates stable channel sub ids", () => {
    expect(slugifyProductName("Fone Bluetooth Ágil")).toBe("fone_bluetooth_agil");
    expect(createSubId("telegram", "Fone Bluetooth Ágil", "12345678-aaaa-bbbb-cccc-123456789000")).toBe("telegram_fone_bluetooth_agil_12345678");
  });

  it("adds sub_id to URLs", () => {
    expect(createTrackedUrl("https://loja.example/produto?a=1", "telegram_prod_1")).toBe("https://loja.example/produto?a=1&sub_id=telegram_prod_1");
  });
});
