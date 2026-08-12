import { NextResponse } from "next/server";
import { OfficialAIProviderRegistry } from "@/lib/ai/official/create-official-ai-service";
import type { TrendSignal } from "@/core/trends/types";
import { classifyTrendSignal, TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { persistTrendSignalClassifications } from "@/lib/trends/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSignal(row: any): TrendSignal {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    source: row.source,
    region: row.region,
    externalId: row.external_id,
    term: row.term,
    title: row.title,
    evidence: row.evidence || {},
    observedAt: row.observed_at,
    capturedAt: row.captured_at,
    trendStrength: row.trend_strength,
    trendDirection: row.trend_direction,
    offerId: row.offer_id
  };
}

export async function POST() {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const { data: rows, error: signalsError } = await client
      .from("trend_signals")
      .select("id,source_type,source_name,source,region,external_id,term,title,evidence,observed_at,captured_at,trend_strength,trend_direction,offer_id")
      .order("observed_at", { ascending: false });
    if (signalsError) throw new Error(`Falha ao carregar sinais: ${signalsError.message}`);

    const signals = (rows ?? []).map(toSignal).filter((signal) => signal.source === "google_trends");
    if (signals.length === 0) {
      return NextResponse.json({ ok: true, strategyVersion: TREND_COMMERCIAL_STRATEGY_VERSION, signals: 0, classified: 0, skipped: 0, eligible: 0, rejected: 0 });
    }
    const { data: existing, error: existingError } = await client
      .from("trend_signal_classifications")
      .select("trend_signal_id")
      .eq("strategy_version", TREND_COMMERCIAL_STRATEGY_VERSION)
      .in("trend_signal_id", signals.map((signal) => signal.id));
    if (existingError) throw new Error(`Migration de classificação ausente ou inválida: ${existingError.message}`);

    const alreadyClassified = new Set((existing ?? []).map((row: any) => row.trend_signal_id));
    const provider = new OfficialAIProviderRegistry().resolve();
    const classifications = [];
    for (const signal of signals) {
      if (alreadyClassified.has(signal.id)) continue;
      classifications.push(await classifyTrendSignal(signal, provider));
    }
    await persistTrendSignalClassifications(
      client as unknown as Parameters<typeof persistTrendSignalClassifications>[0],
      user.id,
      classifications,
    );
    return NextResponse.json({
      ok: true,
      strategyVersion: TREND_COMMERCIAL_STRATEGY_VERSION,
      signals: signals.length,
      classified: classifications.length,
      skipped: alreadyClassified.size,
      eligible: classifications.filter((item) => item.decision === "eligible").length,
      rejected: classifications.filter((item) => item.decision === "rejected").length
    });
  } catch (error) {
    console.error("[TREND-CLASSIFICATION] Falha ao classificar sinais:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Não foi possível classificar sinais." }, { status: 502 });
  }
}
