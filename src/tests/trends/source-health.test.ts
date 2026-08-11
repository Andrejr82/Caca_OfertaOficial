import { describe, expect, it } from "vitest";
import { buildTrendSourceHealth, summarizeTrendSourceHealth } from "@/lib/trends/source-health";

describe("Trend source health", () => {
  it("classifica saúde por resultado sem carregar payload sensível", () => {
    expect(buildTrendSourceHealth({
      source: "mercado_livre_best_seller",
      status: "ok",
      received: 20,
      accepted: 8,
      rejected: 12,
      errorCode: null
    }, "2026-08-11T00:30:00.000Z")).toEqual({
      source: "mercado_livre_best_seller",
      health: "degraded",
      collectorStatus: "ok",
      received: 20,
      accepted: 8,
      rejected: 12,
      errorCode: null,
      observedAt: "2026-08-11T00:30:00.000Z"
    });

    expect(buildTrendSourceHealth({
      source: "shopee_product_offer",
      status: "failed",
      received: 0,
      accepted: 0,
      rejected: 0,
      errorCode: "source_unavailable"
    }, "2026-08-11T00:30:00.000Z")).toMatchObject({
      health: "failed",
      errorCode: "source_unavailable"
    });
  });

  it("substitui mensagens livres para impedir segredo em telemetria", () => {
    const health = buildTrendSourceHealth({
      source: "mercado_livre_best_seller",
      status: "failed",
      received: 0,
      accepted: 0,
      rejected: 0,
      errorCode: "HTTP 401 token-secreto"
    }, "2026-08-11T00:30:00.000Z");

    expect(health.errorCode).toBe("collector_error");
    expect(JSON.stringify(health)).not.toContain("token-secreto");
  });

  it("expõe contadores agregados para o futuro Radar Run", () => {
    const health = [
      buildTrendSourceHealth({ source: "google_trends", status: "ok", received: 19, accepted: 19, rejected: 0, errorCode: null }, "2026-08-11T00:30:00.000Z"),
      buildTrendSourceHealth({ source: "mercado_livre_best_seller", status: "ok", received: 20, accepted: 8, rejected: 12, errorCode: null }, "2026-08-11T00:30:00.000Z"),
      buildTrendSourceHealth({ source: "shopee_campaign", status: "empty", received: 0, accepted: 0, rejected: 0, errorCode: null }, "2026-08-11T00:30:00.000Z"),
      buildTrendSourceHealth({ source: "shopee_product_offer", status: "failed", received: 0, accepted: 0, rejected: 0, errorCode: "source_unavailable" }, "2026-08-11T00:30:00.000Z")
    ];

    expect(summarizeTrendSourceHealth(health)).toEqual({
      sources: 4,
      healthy: 1,
      degraded: 1,
      empty: 1,
      failed: 1,
      received: 39,
      accepted: 27,
      rejected: 12
    });
  });
});
