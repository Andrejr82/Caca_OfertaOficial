import type { TrendRadarRunRow } from "@/lib/trends/radar-snapshots";

export type RadarExecutionClaimStatus = "claimed" | "running" | "completed";

export interface RadarExecutionWindow {
  radarDate: string;
  windowStart: string;
  windowEnd: string;
}

export interface RadarExecutionIdentity extends RadarExecutionWindow {
  userId: string;
  strategyVersion: string;
}

export interface RadarExecutionClaim {
  status: RadarExecutionClaimStatus;
  runId: string;
}

interface ExistingRadarRun {
  id: string;
  status: "building" | "completed" | "failed";
}

export interface RadarExecutionStore {
  createRun(row: TrendRadarRunRow): Promise<{ id: string } | null>;
  findRun(identity: RadarExecutionIdentity): Promise<ExistingRadarRun | null>;
  restartFailedRun(runId: string): Promise<boolean>;
  markFailed(runId: string, failureCode: string): Promise<void>;
}

interface QueryError {
  code?: string;
  message: string;
}

interface RadarExecutionSupabaseClient {
  from(table: string): any;
}

function localDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function buildRadarExecutionWindow(now: Date = new Date()): RadarExecutionWindow {
  if (Number.isNaN(now.getTime())) throw new Error("Data de execução inválida.");
  const radarDate = localDate(now);
  const dayStart = new Date(`${radarDate}T00:00:00.000Z`);
  const windowEnd = new Date(dayStart.getTime() + 86_400_000);
  const windowStart = new Date(windowEnd.getTime() - (7 * 86_400_000));
  return {
    radarDate,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

export function buildRadarRefreshExecutionWindow(now: Date = new Date()): RadarExecutionWindow {
  if (Number.isNaN(now.getTime())) throw new Error("Data de execução inválida.");
  const radarDate = localDate(now);
  const windowEnd = new Date(now);
  const windowStart = new Date(windowEnd.getTime() - (7 * 86_400_000));
  return {
    radarDate,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

function runRow(identity: RadarExecutionIdentity): TrendRadarRunRow {
  return {
    user_id: identity.userId,
    radar_date: identity.radarDate,
    window_start: identity.windowStart,
    window_end: identity.windowEnd,
    strategy_version: identity.strategyVersion,
    status: "building",
    source_health: { status: "building" },
    executive_summary: {},
    failure_code: null,
  };
}

export async function claimTrendRadarExecution(
  store: RadarExecutionStore,
  identity: RadarExecutionIdentity,
): Promise<RadarExecutionClaim> {
  const created = await store.createRun(runRow(identity));
  if (created) return { status: "claimed", runId: created.id };

  const existing = await store.findRun(identity);
  if (!existing) throw new Error("Falha ao resolver execução concorrente do Radar.");
  if (existing.status === "completed") return { status: "completed", runId: existing.id };
  if (existing.status === "building") return { status: "running", runId: existing.id };

  const restarted = await store.restartFailedRun(existing.id);
  return restarted
    ? { status: "claimed", runId: existing.id }
    : { status: "running", runId: existing.id };
}

export function createSupabaseRadarExecutionStore(
  client: RadarExecutionSupabaseClient,
): RadarExecutionStore {
  return {
    async createRun(row) {
      const { data, error } = await client
        .from("trend_radar_runs")
        .insert(row)
        .select("id")
        .single() as { data: { id: string } | null; error: QueryError | null };
      if (!error && data?.id) return { id: data.id };
      if (error?.code === "23505") return null;
      throw new Error("Falha ao iniciar execução do Radar.");
    },
    async findRun(identity) {
      const { data, error } = await client
        .from("trend_radar_runs")
        .select("id,status")
        .eq("user_id", identity.userId)
        .eq("radar_date", identity.radarDate)
        .eq("window_start", identity.windowStart)
        .eq("window_end", identity.windowEnd)
        .eq("strategy_version", identity.strategyVersion)
        .maybeSingle() as { data: ExistingRadarRun | null; error: QueryError | null };
      if (error) throw new Error("Falha ao consultar execução do Radar.");
      return data;
    },
    async restartFailedRun(runId) {
      const { data, error } = await client
        .from("trend_radar_runs")
        .update({ status: "building", failure_code: null, updated_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "failed")
        .select("id")
        .maybeSingle() as { data: { id: string } | null; error: QueryError | null };
      if (error) throw new Error("Falha ao retomar execução do Radar.");
      return Boolean(data?.id);
    },
    async markFailed(runId, failureCode) {
      const { error } = await client
        .from("trend_radar_runs")
        .update({ status: "failed", failure_code: failureCode, updated_at: new Date().toISOString() })
        .eq("id", runId) as { error: QueryError | null };
      if (error) throw new Error("Falha ao marcar execução do Radar como failed.");
    },
  };
}
