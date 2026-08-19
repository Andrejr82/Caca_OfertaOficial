import { NextResponse } from "next/server";
import { DAILY_TREND_RADAR_STRATEGY_VERSION } from "@/core/trends/daily-radar";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildRadarExecutionWindow,
  buildRadarRefreshExecutionWindow,
  claimTrendRadarExecution,
  createSupabaseRadarExecutionStore,
  type RadarExecutionClaimStatus,
} from "@/lib/trends/radar-execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExecuteResponseStatus = "requested" | "running" | "completed";

function executionClient(client: unknown): Parameters<typeof createSupabaseRadarExecutionStore>[0] {
  return client as Parameters<typeof createSupabaseRadarExecutionStore>[0];
}

function responseStatus(status: RadarExecutionClaimStatus): ExecuteResponseStatus {
  if (status === "claimed") return "requested";
  return status;
}

export async function GET(request: Request) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const runId = new URL(request.url).searchParams.get("runId")?.trim();
  if (!runId) return NextResponse.json({ ok: false, message: "runId é obrigatório." }, { status: 400 });

  const { data: run, error } = await client
    .from("trend_radar_runs")
    .select("id,status,generated_at,updated_at,failure_code,source_health")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, message: "Não foi possível consultar a execução do Radar." }, { status: 503 });
  if (!run) return NextResponse.json({ ok: false, message: "Execução do Radar não encontrada." }, { status: 404 });

  const sourceHealth = run.source_health && typeof run.source_health === "object" && !Array.isArray(run.source_health)
    ? run.source_health as Record<string, unknown>
    : {};
  const sourceStatus = typeof sourceHealth.status === "string" ? sourceHealth.status : null;
  const status = run.status === "completed"
    ? "completed"
    : run.status === "failed"
      ? "failed"
      : sourceStatus === "running"
        ? "running"
        : "requested";

  return NextResponse.json({
    ok: true,
    runId: run.id,
    status,
    generatedAt: run.generated_at,
    updatedAt: run.updated_at,
    failureCode: run.failure_code,
    runtime: sourceHealth.runtime ?? "oracle",
  });
}

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const refreshRequested = new URL(request.url).searchParams.get("refresh") === "1";
  const window = refreshRequested ? buildRadarRefreshExecutionWindow() : buildRadarExecutionWindow();
  const requestedAt = new Date().toISOString();

  try {
    const executionStore = createSupabaseRadarExecutionStore(executionClient(client));
    const claim = await claimTrendRadarExecution(executionStore, {
      userId: user.id,
      strategyVersion: DAILY_TREND_RADAR_STRATEGY_VERSION,
      requestReason: refreshRequested ? "manual_refresh" : "manual",
      requestedAt,
      ...window,
    });
    const status = responseStatus(claim.status);

    return NextResponse.json({
      ok: true,
      executionId: claim.runId,
      runId: claim.runId,
      status,
      snapshotId: status === "completed" ? claim.runId : null,
      requestedAt,
      processedAt: null,
      counts: null,
      failureReason: null,
      runtime: "oracle",
      message: status === "requested"
        ? "Execução solicitada. O processamento será realizado pela Oracle."
        : status === "running"
          ? "O Radar já possui uma execução pendente/em processamento na Oracle."
          : "O Radar desta janela já foi concluído.",
    });
  } catch {
    return NextResponse.json({
      ok: false,
      status: "failed",
      executionId: null,
      snapshotId: null,
      requestedAt,
      processedAt: null,
      counts: null,
      failureReason: "request_failed",
      message: "Não foi possível registrar a solicitação do Radar.",
    }, { status: 502 });
  }
}
