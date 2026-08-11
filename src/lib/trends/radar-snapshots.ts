import type {
  RadarEvidenceStatus,
  RadarMatchStatus,
  RadarPotential
} from "@/core/trends/daily-radar";

export type TrendRadarRunStatus = "building" | "completed" | "failed";

export interface TrendRadarProductSnapshotInput {
  priority: number;
  productTerm: string;
  normalizedProductTerm: string;
  category: string | null;
  marketplace: string | null;
  evidenceStatus: RadarEvidenceStatus;
  sourceCount: number;
  commercialScore: number | null;
  confidence: number;
  directEvidence: unknown[];
  inferredSignals: unknown[];
  affiliatePotential: RadarPotential;
  visualContentPotential: RadarPotential;
  recommendedChannel: string | null;
  recommendedFormat: string | null;
  matchStatus: RadarMatchStatus;
  opportunityId: string | null;
  scoreBreakdown: Record<string, number>;
  determiningReasons: string[];
  isFocus: boolean;
}

export interface TrendRadarSnapshotInput {
  radarDate: string;
  windowStart: string;
  windowEnd: string;
  strategyVersion: string;
  sourceHealth: Record<string, unknown>;
  executiveSummary: Record<string, unknown>;
  products: TrendRadarProductSnapshotInput[];
}

export interface TrendRadarRunRow extends Record<string, unknown> {
  user_id: string;
  radar_date: string;
  window_start: string;
  window_end: string;
  strategy_version: string;
  status: TrendRadarRunStatus;
  source_health: Record<string, unknown>;
  executive_summary: Record<string, unknown>;
  failure_code: string | null;
}

export interface TrendRadarProductRow extends Record<string, unknown> {
  radar_run_id: string;
  priority: number;
  product_term: string;
  normalized_product_term: string;
  category: string | null;
  marketplace: string | null;
  evidence_status: RadarEvidenceStatus;
  source_count: number;
  commercial_score: number | null;
  confidence: number;
  direct_evidence: unknown[];
  inferred_signals: unknown[];
  affiliate_potential: RadarPotential;
  visual_content_potential: RadarPotential;
  recommended_channel: string | null;
  recommended_format: string | null;
  match_status: RadarMatchStatus;
  opportunity_id: string | null;
  score_breakdown: Record<string, number>;
  determining_reasons: string[];
  is_focus: boolean;
}

export interface TrendRadarSnapshotStore {
  upsertRun(row: TrendRadarRunRow): Promise<{ id: string }>;
  upsertProducts(rows: TrendRadarProductRow[]): Promise<void>;
  updateRunState(runId: string, status: TrendRadarRunStatus, failureCode: string | null): Promise<void>;
}

interface QueryError {
  message: string;
}

interface RadarSnapshotSupabaseTable {
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options: { onConflict: string }
  ): PromiseLike<{ error: QueryError | null }> & {
    select(columns: string): {
      single(): PromiseLike<{ data: { id: string } | null; error: QueryError | null }>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): PromiseLike<{ error: QueryError | null }>;
  };
}

export interface RadarSnapshotSupabaseClient {
  from(table: string): RadarSnapshotSupabaseTable;
}

function text(value: string): string {
  return value.trim();
}

function timestamp(value: string): number | null {
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? null : result;
}

function validateSnapshot(input: TrendRadarSnapshotInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.radarDate)) {
    throw new Error("radarDate inválido.");
  }
  const windowStart = timestamp(input.windowStart);
  const windowEnd = timestamp(input.windowEnd);
  if (windowStart === null || windowEnd === null || windowEnd <= windowStart) {
    throw new Error("janela do Radar inválida.");
  }
  if (!text(input.strategyVersion)) throw new Error("strategyVersion obrigatório.");
  if (input.products.length > 20) throw new Error("Radar aceita no máximo 20 produtos.");

  const priorities = new Set<number>();
  const identities = new Set<string>();
  for (const product of input.products) {
    if (!Number.isInteger(product.priority) || product.priority < 1 || product.priority > 20) {
      throw new Error("prioridade do Radar inválida.");
    }
    if (priorities.has(product.priority)) throw new Error("Radar contém prioridades duplicadas.");
    priorities.add(product.priority);

    if (!text(product.productTerm) || !text(product.normalizedProductTerm)) {
      throw new Error("produto do Radar sem identidade textual.");
    }
    const identity = `${text(product.normalizedProductTerm)}\u0000${text(product.marketplace ?? "")}`;
    if (identities.has(identity)) throw new Error("Radar contém produtos duplicados.");
    identities.add(identity);

    if (!Number.isInteger(product.sourceCount) || product.sourceCount < 0) {
      throw new Error("sourceCount inválido.");
    }
    if (!Number.isFinite(product.confidence) || product.confidence < 0 || product.confidence > 100) {
      throw new Error("confidence inválida.");
    }
    if (product.commercialScore !== null && (!Number.isFinite(product.commercialScore) || product.commercialScore < 0 || product.commercialScore > 100)) {
      throw new Error("commercialScore inválido.");
    }
    if (Object.values(product.scoreBreakdown).some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("scoreBreakdown inválido.");
    }
    if (!Array.isArray(product.determiningReasons) || product.determiningReasons.some((reason) => !text(reason))) {
      throw new Error("determiningReasons inválido.");
    }
  }
}

export function toTrendRadarRunRow(userId: string, input: TrendRadarSnapshotInput): TrendRadarRunRow {
  return {
    user_id: userId,
    radar_date: input.radarDate,
    window_start: new Date(input.windowStart).toISOString(),
    window_end: new Date(input.windowEnd).toISOString(),
    strategy_version: text(input.strategyVersion),
    status: "building",
    source_health: input.sourceHealth,
    executive_summary: input.executiveSummary,
    failure_code: null
  };
}

export function toTrendRadarProductRows(
  runId: string,
  products: TrendRadarProductSnapshotInput[]
): TrendRadarProductRow[] {
  return products.map((product) => ({
    radar_run_id: runId,
    priority: product.priority,
    product_term: text(product.productTerm),
    normalized_product_term: text(product.normalizedProductTerm),
    category: product.category ? text(product.category) : null,
    marketplace: product.marketplace ? text(product.marketplace) : null,
    evidence_status: product.evidenceStatus,
    source_count: product.sourceCount,
    commercial_score: product.commercialScore,
    confidence: product.confidence,
    direct_evidence: product.directEvidence,
    inferred_signals: product.inferredSignals,
    affiliate_potential: product.affiliatePotential,
    visual_content_potential: product.visualContentPotential,
    recommended_channel: product.recommendedChannel ? text(product.recommendedChannel) : null,
    recommended_format: product.recommendedFormat ? text(product.recommendedFormat) : null,
    match_status: product.matchStatus,
    opportunity_id: product.opportunityId,
    score_breakdown: product.scoreBreakdown,
    determining_reasons: product.determiningReasons,
    is_focus: product.isFocus
  }));
}

export function createSupabaseTrendRadarSnapshotStore(
  client: RadarSnapshotSupabaseClient
): TrendRadarSnapshotStore {
  return {
    async upsertRun(row) {
      const { data, error } = await client
        .from("trend_radar_runs")
        .upsert(row, { onConflict: "user_id,radar_date,window_start,window_end,strategy_version" })
        .select("id")
        .single();
      if (error || !data?.id) throw new Error("Falha ao persistir execução do Radar.");
      return { id: data.id };
    },
    async upsertProducts(rows) {
      if (rows.length === 0) return;
      const { error } = await client
        .from("trend_radar_products")
        .upsert(rows, { onConflict: "radar_run_id,priority" });
      if (error) throw new Error("Falha ao persistir produtos do Radar.");
    },
    async updateRunState(runId, status, failureCode) {
      const { error } = await client
        .from("trend_radar_runs")
        .update({ status, failure_code: failureCode, updated_at: new Date().toISOString() })
        .eq("id", runId);
      if (error) throw new Error("Falha ao atualizar estado da execução do Radar.");
    }
  };
}

export async function persistTrendRadarSnapshot(
  store: TrendRadarSnapshotStore,
  userId: string,
  input: TrendRadarSnapshotInput
): Promise<{ runId: string; productCount: number; status: "completed" }> {
  validateSnapshot(input);

  let run: { id: string };
  try {
    run = await store.upsertRun(toTrendRadarRunRow(userId, input));
  } catch {
    throw new Error("Falha ao persistir execução do Radar.");
  }

  const products = toTrendRadarProductRows(run.id, input.products);
  try {
    await store.upsertProducts(products);
  } catch {
    try {
      await store.updateRunState(run.id, "failed", "products_persistence_failed");
    } catch {
      // A falha original continua sendo a autoridade; não expomos detalhes internos do store.
    }
    throw new Error("Falha ao persistir produtos do Radar.");
  }

  try {
    await store.updateRunState(run.id, "completed", null);
  } catch {
    throw new Error("Falha ao concluir execução do Radar.");
  }
  return { runId: run.id, productCount: products.length, status: "completed" };
}
