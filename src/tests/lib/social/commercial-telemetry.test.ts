import { describe, expect, it } from "vitest";
import {
  buildSocialCommercialTelemetryBatch,
  buildSocialCommercialTelemetrySnapshot,
} from "@/lib/social/commercial-telemetry";

describe("Task 7 — Telemetria Comercial", () => {
  it("calcula funil completo por oferta x canal sem inventar métricas", () => {
    const snapshot = buildSocialCommercialTelemetrySnapshot({
      offerId: "jiesipote",
      channel: "whatsapp",
      published: true,
      impressions: 1000,
      clicks: 50,
      purchases: 1,
      affiliateEarningsBRL: 4.4,
    });

    expect(snapshot.ctrPct).toBe(5);
    expect(snapshot.conversionRatePct).toBe(2);
    expect(snapshot.epcBRL).toBe(0.088);
    expect(snapshot.noConversionSignal).toBe(false);
    expect(snapshot.funnelStage).toBe("converted");
  });

  it("sinaliza clique sem compra como gargalo de conversão", () => {
    const snapshot = buildSocialCommercialTelemetrySnapshot({
      offerId: "jiesipote",
      channel: "telegram",
      published: true,
      impressions: 500,
      clicks: 25,
      purchases: 0,
      affiliateEarningsBRL: 0,
    });

    expect(snapshot.ctrPct).toBe(5);
    expect(snapshot.conversionRatePct).toBe(0);
    expect(snapshot.epcBRL).toBe(0);
    expect(snapshot.noConversionSignal).toBe(true);
    expect(snapshot.funnelStage).toBe("no_purchase");
  });

  it("não transforma ausência de impressão ou receita em zero falso", () => {
    const snapshot = buildSocialCommercialTelemetrySnapshot({
      offerId: "fone",
      channel: "instagram",
      published: true,
      impressions: null,
      clicks: 3,
      purchases: 0,
      affiliateEarningsBRL: null,
    });

    expect(snapshot.ctrPct).toBeNull();
    expect(snapshot.epcBRL).toBeNull();
    expect(snapshot.conversionRatePct).toBe(0);
    expect(snapshot.noConversionSignal).toBe(true);
  });

  it("distingue publicação sem clique de publicação sem compra", () => {
    const snapshot = buildSocialCommercialTelemetrySnapshot({
      offerId: "produto-sem-clique",
      channel: "facebook",
      published: true,
      impressions: 300,
      clicks: 0,
      purchases: 0,
    });

    expect(snapshot.funnelStage).toBe("no_click");
    expect(snapshot.noConversionSignal).toBe(false);
    expect(snapshot.conversionRatePct).toBeNull();
    expect(snapshot.epcBRL).toBeNull();
  });

  it("falha fechado para contagens inválidas ou compra maior que clique", () => {
    expect(() => buildSocialCommercialTelemetrySnapshot({
      offerId: "x",
      channel: "whatsapp",
      published: true,
      clicks: -1,
    })).toThrow(/non-negative integer/iu);

    expect(() => buildSocialCommercialTelemetrySnapshot({
      offerId: "x",
      channel: "whatsapp",
      published: true,
      clicks: 1,
      purchases: 2,
    })).toThrow(/more purchases than clicks/iu);
  });

  it("rejeita eventos comerciais para conteúdo ainda não publicado", () => {
    expect(() => buildSocialCommercialTelemetrySnapshot({
      offerId: "x",
      channel: "telegram",
      published: false,
      clicks: 1,
    })).toThrow(/Unpublished/iu);
  });

  it("impede duplicidade da mesma oferta e canal no mesmo lote", () => {
    expect(() => buildSocialCommercialTelemetryBatch([
      { offerId: "x", channel: "whatsapp", published: true, clicks: 1 },
      { offerId: "x", channel: "whatsapp", published: true, clicks: 2 },
    ])).toThrow(/Duplicate social telemetry/iu);
  });
});
