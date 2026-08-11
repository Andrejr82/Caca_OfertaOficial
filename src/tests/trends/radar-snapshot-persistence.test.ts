import { describe, expect, it } from "vitest";
import {
  persistTrendRadarSnapshot,
  toTrendRadarProductRows,
  toTrendRadarRunRow,
  type TrendRadarSnapshotInput,
  type TrendRadarSnapshotStore
} from "@/lib/trends/radar-snapshots";

const input: TrendRadarSnapshotInput = {
  radarDate: "2026-08-10",
  windowStart: "2026-08-04T00:00:00.000Z",
  windowEnd: "2026-08-11T00:00:00.000Z",
  strategyVersion: "daily-commercial-radar-v1",
  sourceHealth: { sources: 3, healthy: 2, degraded: 1 },
  executiveSummary: { focus: "cozinha" },
  products: [{
    priority: 1,
    productTerm: "Air Fryer 5L",
    normalizedProductTerm: "air fryer 5l",
    category: "Cozinha",
    marketplace: "Mercado Livre",
    evidenceStatus: "verified",
    sourceCount: 3,
    commercialScore: 88.5,
    confidence: 91,
    directEvidence: [{ claim: "Top seller oficial" }],
    inferredSignals: ["convergência entre fontes"],
    affiliatePotential: "high",
    visualContentPotential: "high",
    recommendedChannel: "instagram",
    recommendedFormat: "reel",
    matchStatus: "pending",
    opportunityId: null
  }]
};

function store(overrides: Partial<TrendRadarSnapshotStore> = {}): TrendRadarSnapshotStore {
  return {
    upsertRun: async () => ({ id: "run-1" }),
    upsertProducts: async () => {},
    updateRunState: async () => {},
    ...overrides
  };
}

describe("Trend Radar snapshot persistence", () => {
  it("mapeia run e produtos para o contrato persistido", () => {
    expect(toTrendRadarRunRow("user-1", input)).toEqual({
      user_id: "user-1",
      radar_date: "2026-08-10",
      window_start: "2026-08-04T00:00:00.000Z",
      window_end: "2026-08-11T00:00:00.000Z",
      strategy_version: "daily-commercial-radar-v1",
      status: "building",
      source_health: input.sourceHealth,
      executive_summary: input.executiveSummary,
      failure_code: null
    });

    expect(toTrendRadarProductRows("run-1", input.products)[0]).toMatchObject({
      radar_run_id: "run-1",
      priority: 1,
      product_term: "Air Fryer 5L",
      normalized_product_term: "air fryer 5l",
      marketplace: "Mercado Livre",
      evidence_status: "verified",
      commercial_score: 88.5,
      confidence: 91,
      match_status: "pending"
    });
  });

  it("marca run como completed após persistir produtos", async () => {
    const states: Array<{ runId: string; status: string; failureCode: string | null }> = [];
    const persistedProducts: Record<string, unknown>[][] = [];

    const result = await persistTrendRadarSnapshot(store({
      upsertProducts: async (rows) => { persistedProducts.push(rows); },
      updateRunState: async (runId, status, failureCode) => { states.push({ runId, status, failureCode }); }
    }), "user-1", input);

    expect(result).toEqual({ runId: "run-1", productCount: 1, status: "completed" });
    expect(persistedProducts).toHaveLength(1);
    expect(states).toEqual([{ runId: "run-1", status: "completed", failureCode: null }]);
  });

  it("não tenta produtos quando o run não pode ser persistido", async () => {
    let productsTouched = false;

    await expect(persistTrendRadarSnapshot(store({
      upsertRun: async () => { throw new Error("database raw detail"); },
      upsertProducts: async () => { productsTouched = true; }
    }), "user-1", input)).rejects.toThrow("database raw detail");

    expect(productsTouched).toBe(false);
  });

  it("marca run como failed se produtos falharem e não expõe erro bruto", async () => {
    const states: Array<{ runId: string; status: string; failureCode: string | null }> = [];

    await expect(persistTrendRadarSnapshot(store({
      upsertProducts: async () => { throw new Error("token-secreto database detail"); },
      updateRunState: async (runId, status, failureCode) => { states.push({ runId, status, failureCode }); }
    }), "user-1", input)).rejects.toThrow("Falha ao persistir produtos do Radar.");

    expect(states).toEqual([{ runId: "run-1", status: "failed", failureCode: "products_persistence_failed" }]);
  });

  it("rejeita Top 20 inválido antes de tocar no banco", async () => {
    let touched = false;
    const invalid = { ...input, products: [...input.products, { ...input.products[0], priority: 1 }] };

    await expect(persistTrendRadarSnapshot(store({
      upsertRun: async () => { touched = true; return { id: "run-1" }; }
    }), "user-1", invalid)).rejects.toThrow("prioridades duplicadas");

    expect(touched).toBe(false);
  });
});
