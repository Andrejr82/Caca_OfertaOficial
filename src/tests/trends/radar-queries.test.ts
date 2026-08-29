import { describe, expect, it } from "vitest";
import { mapTrendRadarSnapshotView } from "@/lib/trends/radar-queries";

describe("Radar snapshot query mapping", () => {
  it("normaliza números, JSON e ordena produtos por prioridade", () => {
    const view = mapTrendRadarSnapshotView({
      id: "run-1",
      radar_date: "2026-08-10",
      window_start: "2026-08-04T00:00:00.000Z",
      window_end: "2026-08-11T00:00:00.000Z",
      strategy_version: "daily-commercial-radar-v1",
      status: "completed",
      generated_at: "2026-08-10T22:30:00.000Z",
      source_health: { healthy: 3 },
      executive_summary: { focus: "eletrônicos" },
    }, [
      {
        id: "p2",
        priority: 2,
        product_term: "Teclado",
        normalized_product_term: "teclado",
        category: "Eletrônicos",
        marketplace: "Mercado Livre",
        evidence_status: "verified",
        source_count: 2,
        commercial_score: "80.50",
        trend_score: null,
        confidence: "90",
        direct_evidence: [{ source_url: "https://www.mercadolivre.com.br/item" }],
        score_breakdown: { evidenceQuality: 30, recency: 5 },
        determining_reasons: ["Evidência: válida.", "Recomendação: score 80.5/100."],
        is_focus: true,
        opportunity_id: null,
        recommended_channel: null,
        recommended_format: null,
        selection_decision: null,
        selection_decided_at: null,
        selected_offer_id: null,
        execution_context: {},
      },
      {
        id: "p1",
        priority: 1,
        product_term: "Fone",
        normalized_product_term: "fone",
        category: "Eletrônicos",
        marketplace: "Shopee",
        evidence_status: "partial",
        source_count: 1,
        commercial_score: 70,
        trend_score: null,
        confidence: 60,
        direct_evidence: [
          { source_url: "https://shopee.com.br/list/fone" },
          { source_url: "https://shopee.com.br/list/fone" },
          { source_url: null },
        ],
        score_breakdown: { evidenceQuality: 15 },
        determining_reasons: [],
        is_focus: true,
        opportunity_id: "11111111-1111-1111-1111-111111111111",
        recommended_channel: null,
        recommended_format: null,
        selection_decision: null,
        selection_decided_at: null,
        selected_offer_id: null,
        execution_context: {},
      },
    ]);

    expect(view.status).toBe("completed");
    expect(view.sourceHealth).toEqual({ healthy: 3 });
    expect(view.products.map((item) => item.priority)).toEqual([1]);
    expect(view.products[0].directEvidenceSourceUrls).toEqual(["https://www.mercadolivre.com.br/item"]);
    expect(view.products[0].commercialScore).toBe(80.5);
    expect(view.products[0].confidence).toBe(90);
    expect(view.products[0].scoreBreakdown).toEqual({ evidenceQuality: 30, recency: 5 });
  });

  it("não expõe partial mesmo quando o payload antigo sinaliza trending_flag", () => {
    const view = mapTrendRadarSnapshotView({
      id: "run-2", radar_date: "2026-08-10", window_start: "2026-08-04T00:00:00.000Z", window_end: "2026-08-11T00:00:00.000Z",
      strategy_version: "trend-radar-seven-niches-v4", status: "completed", generated_at: "2026-08-10T22:30:00.000Z", source_health: {}, executive_summary: {},
    }, [{
      id: "partial-1", priority: 1, product_term: "Produto sem histórico", normalized_product_term: "produto sem historico", category: "Informática", marketplace: "Amazon",
      evidence_status: "partial", source_count: 1, commercial_score: 60, trend_score: 70, confidence: 40,
      direct_evidence: [{ trending_flag: true, source_url: "https://www.amazon.com.br/dp/B123456789" }], score_breakdown: {}, determining_reasons: ["historico_insuficiente_para_verified"],
      is_focus: false, opportunity_id: null, recommended_channel: null, recommended_format: null, selection_decision: null, selection_decided_at: null, selected_offer_id: null, execution_context: {},
    }]);
    expect(view.products).toEqual([]);
  });
});
