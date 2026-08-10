import { describe, expect, it, vi } from "vitest";
import { persistTrendSignals } from "@/lib/trends/persistence";

describe("Tendências IA: persistência", () => {
  it("persiste somente sinais Google Trends sem oferta associada", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const result = await persistTrendSignals(client, "user-1", [{
      id: "signal-1", sourceType: "external", sourceName: "google_trends", source: "google_trends", region: "BR", externalId: "air fryer:2026-08-10", term: "air fryer", title: "air fryer", evidence: {}, observedAt: "2026-08-10T12:00:00.000Z", capturedAt: "2026-08-10T12:00:00.000Z", trendStrength: 100000, trendDirection: "rising", offerId: null
    }]);
    expect(result).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ user_id: "user-1", source_name: "google_trends", region: "BR", term: "air fryer", offer_id: null })]), { onConflict: "user_id,source_name,external_id" });
  });

  it("reutiliza a persistência para Mercado Livre Trends sem oferta associada", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const result = await persistTrendSignals(client, "user-1", [{
      id: "ml-signal-1", sourceType: "external", sourceName: "mercado_livre_trends", source: "mercado_livre_trends", region: "BR", externalId: "MLB:air fryer", term: "air fryer", title: "air fryer", evidence: { trendBucket: "fastest_growing" }, observedAt: "2026-08-10T12:00:00.000Z", capturedAt: "2026-08-10T12:00:00.000Z", trendStrength: null, trendDirection: "rising", offerId: null
    }]);
    expect(result).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ source: "mercado_livre_trends", source_name: "mercado_livre_trends", offer_id: null })]), { onConflict: "user_id,source_name,external_id" });
  });

  it("persiste evidência oficial Shopee de produto e campanha", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const base = {
      sourceType: "external" as const,
      region: "BR",
      observedAt: "2026-08-10T23:30:00.000Z",
      capturedAt: "2026-08-10T23:30:00.000Z",
      trendStrength: null,
      trendDirection: null,
      offerId: null
    };
    const result = await persistTrendSignals(client, "user-1", [{
      ...base,
      id: "shopee-product-1",
      sourceName: "shopee_product_offer",
      source: "shopee_product_offer",
      externalId: "shopee:123:456",
      term: "air fryer",
      title: "Air Fryer 5L",
      evidence: { direct_evidence: [{ claim: "Produto observado na Shopee.", source_url: "https://shopee.com.br/product/123/456" }] }
    }, {
      ...base,
      id: "shopee-campaign-1",
      sourceName: "shopee_campaign",
      source: "shopee_campaign",
      externalId: "https://shope.ee/campaign",
      term: "Festival de Ofertas",
      title: "Festival de Ofertas",
      evidence: { campaign_flag: true, direct_evidence: [{ claim: "Campanha oficial da Shopee.", source_url: "https://shope.ee/campaign" }] }
    }]);

    expect(result).toBe(2);
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ source: "shopee_product_offer", external_id: "shopee:123:456" }),
      expect.objectContaining({ source: "shopee_campaign", external_id: "https://shope.ee/campaign" })
    ]), { onConflict: "user_id,source_name,external_id" });
  });

  it("continua descartando fontes externas não homologadas", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const result = await persistTrendSignals(client, "user-1", [{
      id: "unknown-1", sourceType: "external", sourceName: "shopee_trending", source: "shopee_trending", region: "BR", externalId: "x", term: "x", title: "x", evidence: {}, observedAt: "2026-08-10T23:30:00.000Z", capturedAt: "2026-08-10T23:30:00.000Z", trendStrength: null, trendDirection: null, offerId: null
    }]);

    expect(result).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
