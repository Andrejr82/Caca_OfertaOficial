import { describe, expect, it } from "vitest";
import { getBrazilVideoOfferCutoff } from "@/lib/videos/offer-window";

describe("janela diária de ofertas para vídeos", () => {
  it("começa às 04h de Brasília no dia local", () => {
    expect(getBrazilVideoOfferCutoff(new Date("2026-08-01T16:57:00.000Z")).toISOString()).toBe("2026-08-01T07:00:00.000Z");
  });

  it("mantém o dia local de Brasília antes da meia-noite UTC", () => {
    expect(getBrazilVideoOfferCutoff(new Date("2026-08-01T02:00:00.000Z")).toISOString()).toBe("2026-07-31T07:00:00.000Z");
  });
});
