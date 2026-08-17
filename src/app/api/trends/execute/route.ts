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
