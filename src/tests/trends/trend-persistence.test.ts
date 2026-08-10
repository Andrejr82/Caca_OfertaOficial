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
});
