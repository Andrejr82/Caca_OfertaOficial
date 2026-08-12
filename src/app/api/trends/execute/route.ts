import { NextResponse } from "next/server";
import { OfficialAIProviderRegistry } from "@/lib/ai/official/create-official-ai-service";
import { classifyTrendSignal, TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { DAILY_TREND_RADAR_STRATEGY_VERSION, buildDailyRadarFromTrendSignals } from "@/core/trends/daily-radar";
import { buildExecutiveRadarRanking } from "@/core/trends/executive-radar-ranking";
import { buildStrongestNiches7d } from "@/core/trends/strongest-niches-7d";
import { buildInternalPerformanceByProduct } from "@/core/trends/internal-performance-score";
import type { TrendSignal, TrendSignalListItem } from "@/core/trends/types";
import { getOperationalMLAccessToken } from "@/lib/platforms/mercadolivre";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchGoogleTrendSignals } from "@/lib/trends/google-trends-adapter";
import { loadInternalClickSignals } from "@/lib/trends/internal-click-performance";
import { fetchMercadoLivreTrendSignals } from "@/lib/trends/mercado-livre-trends-adapter";
import { matchTrendSignalsForUser } from "@/lib/trends/matching";
import { persistTrendSignalClassifications, persistTrendSignals } from "@/lib/trends/persistence";
import { listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";
import {
  buildRadarExecutionWindow,
  buildRadarRefreshExecutionWindow,
  claimTrendRadarExecution,
  createSupabaseRadarExecutionStore,
} from "@/lib/trends/radar-execution";
import { toTrendRadarSnapshotProducts } from "@/lib/trends/radar-ranking-snapshot";
import {
  createSupabaseTrendRadarSnapshotStore,
  persistTrendRadarSnapshot,
} from "@/lib/trends/radar-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_PERFORMANCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type SourceHealthEntry = {
  status: "healthy" | "degraded" | "unavailable";
  collected?: number;
  persisted?: number;
};

function persistenceClient(client: unknown): Parameters<typeof persistTrendSignals>[0] {
  return client as Parameters<typeof persistTrendSignals>[0];
}

function snapshotClient(client: unknown): Parameters<typeof createSupabaseTrendRadarSnapshotStore>[0] {
  return client as Parameters<typeof createSupabaseTrendRadarSnapshotStore>[0];
}

function executionClient(client: unknown): Parameters<typeof createSupabaseRadarExecutionStore>[0] {
  return client as Parameters<typeof createSupabaseRadarExecutionStore>[0];
}

function signalIdentity(sourceName: string, externalId: string | null): string | null {
  return externalId ? `${sourceName}\u0000${externalId}` : null;
}

function mergeCurrentCollectionSignals(
  persistedSignals: TrendSignalListItem[],
  collectedSignals: TrendSignal[],
): TrendSignalListItem[] {
  const currentByIdentity = new Map<string, TrendSignal>();
  for (const current of collectedSignals) {
    const identity = signalIdentity(current.sourceName, current.externalId);
    if (identity) currentByIdentity.set(identity, current);
  }

  return persistedSignals.flatMap((persisted) => {
    const identity = signalIdentity(persisted.sourceName, persisted.externalId);
    const current = identity ? currentByIdentity.get(identity) : undefined;
    if (!current) return [];
    return [{
      ...persisted,
      sourceType: current.sourceType,
      sourceName: current.sourceName,
      source: current.source,
      region: current.region,
      externalId: current.externalId,
      term: current.term,
      title: current.title,
      evidence: current.evidence,
      observedAt: current.observedAt,
      capturedAt: current.capturedAt,
      trendStrength: current.trendStrength,
      trendDirection: current.trendDirection,
    }];
  });
}

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const refreshRequested = new URL(request.url).searchParams.get("refresh") === "1";
  const window = refreshRequested ? buildRadarRefreshExecutionWindow() : buildRadarExecutionWindow();
  const executionStore = createSupabaseRadarExecutionStore(executionClient(client));
  const claim = await claimTrendRadarExecution(executionStore, {
    userId: user.id,
    strategyVersion: DAILY_TREND_RADAR_STRATEGY_VERSION,
    ...window,
  });

  if (claim.status === "completed") {
    return NextResponse.json({ ok: true, status: "completed", runId: claim.runId, reused: true });
  }
  if (claim.status === "running") {
    return NextResponse.json({ ok: false, status: "running", runId: claim.runId, message: "Radar de hoje já está em execução." }, { status: 409 });
  }

  const sourceHealth: Record<string, SourceHealthEntry> = {};
  const collectedExternalIds = new Set<string>();
  const collectedSignals: TrendSignal[] = [];
  let stage = "collect";

  try {
    try {
      const googleSignals = await fetchGoogleTrendSignals();
      collectedSignals.push(...googleSignals);
      for (const signal of googleSignals) if (signal.externalId) collectedExternalIds.add(signal.externalId);
      const persisted = await persistTrendSignals(persistenceClient(client), user.id, googleSignals);
      sourceHealth.google_trends = { status: "healthy", collected: googleSignals.length, persisted };
    } catch {
      sourceHealth.google_trends = { status: "degraded" };
    }

    const accessToken = await getOperationalMLAccessToken(user.id);

    if (accessToken) {
      try {
        const mlSignals = await fetchMercadoLivreTrendSignals(accessToken);
        collectedSignals.push(...mlSignals);
        for (const signal of mlSignals) if (signal.externalId) collectedExternalIds.add(signal.externalId);
        const persisted = await persistTrendSignals(persistenceClient(client), user.id, mlSignals);
        sourceHealth.mercado_livre_trends = { status: "healthy", collected: mlSignals.length, persisted };
      } catch {
        sourceHealth.mercado_livre_trends = { status: "degraded" };
      }
    } else {
      sourceHealth.mercado_livre_trends = { status: "unavailable" };
    }

    stage = "classify";
    let signals = await listTrendSignals({
      externalIds: refreshRequested ? [...collectedExternalIds] : undefined,
      observedFrom: refreshRequested ? undefined : window.windowStart,
      observedTo: refreshRequested ? undefined : window.windowEnd,
    });
    if (refreshRequested) signals = mergeCurrentCollectionSignals(signals, collectedSignals);
    const pendingClassification = signals.filter((signal) => !signal.classification);
    if (pendingClassification.length > 0) {
      const provider = new OfficialAIProviderRegistry().resolve();
      const classifications = [];
      for (const signal of pendingClassification) {
        classifications.push(await classifyTrendSignal(signal, provider));
      }
      await persistTrendSignalClassifications(
        persistenceClient(client),
        user.id,
        classifications,
      );
    }

    stage = "match";
    const matching = await matchTrendSignalsForUser(client, user.id);

    stage = "rank";
    signals = await listTrendSignals({
      externalIds: refreshRequested ? [...collectedExternalIds] : undefined,
      observedFrom: refreshRequested ? undefined : window.windowStart,
      observedTo: refreshRequested ? undefined : window.windowEnd,
    });
    if (refreshRequested) signals = mergeCurrentCollectionSignals(signals, collectedSignals);
    const opportunities = (await listTrendOpportunities())
      .filter((opportunity) => opportunity.strategyVersion === TREND_COMMERCIAL_STRATEGY_VERSION);
    const radar = buildDailyRadarFromTrendSignals(signals, opportunities);
    const internalWindowEnd = new Date(window.windowEnd);
    const internalWindowStart = new Date(internalWindowEnd.getTime() - INTERNAL_PERFORMANCE_WINDOW_MS);
    const internalClickSignals = await loadInternalClickSignals(
      client,
      internalWindowStart.toISOString(),
      internalWindowEnd.toISOString(),
    );
    const internalPerformanceByProduct = buildInternalPerformanceByProduct(internalClickSignals);
    const ranking = buildExecutiveRadarRanking(radar, {
      asOf: window.windowEnd,
      internalPerformanceByProduct,
    });
    const niches = buildStrongestNiches7d(radar, { asOf: window.windowEnd });

    stage = "persist";
    const snapshotStore = createSupabaseTrendRadarSnapshotStore(snapshotClient(client));
    const snapshot = await persistTrendRadarSnapshot(snapshotStore, user.id, {
      radarDate: window.radarDate,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      strategyVersion: DAILY_TREND_RADAR_STRATEGY_VERSION,
      sourceHealth: {
        ...sourceHealth,
        classification: {
          status: "healthy",
          pendingBeforeExecution: pendingClassification.length,
        },
        matching: {
          status: "healthy",
          mode: "persisted_offers_only",
          eligibleSignals: matching.eligibleSignals,
          matchedSignals: matching.matchedSignals,
          noMatchSignals: matching.noMatchSignals,
          opportunitiesCreated: matching.opportunitiesCreated,
        },
        internal_clicks: {
          status: "healthy",
          productsWithClicks: internalClickSignals.length,
        },
      },
      executiveSummary: {
        top3: ranking.slice(0, 3).map((item) => item.result.product_term),
        top20Count: ranking.length,
        strongestNiches: niches.slice(0, 5).map((niche) => ({
          niche: niche.niche,
          strengthScore: niche.strengthScore,
          confidence: niche.confidence,
        })),
      },
      products: toTrendRadarSnapshotProducts(ranking),
    });

    return NextResponse.json({
      ok: true,
      status: snapshot.status,
      runId: snapshot.runId,
      products: snapshot.productCount,
      top3: ranking.slice(0, 3).map((item) => item.result.product_term),
      sourceHealth,
    });
  } catch {
    try {
      await executionStore.markFailed(claim.runId, `${stage}_failed`);
    } catch {
      // O erro original permanece autoridade; não expomos detalhes internos do banco.
    }
    return NextResponse.json({
      ok: false,
      status: "failed",
      runId: claim.runId,
      stage,
      message: "Não foi possível concluir a execução do Radar.",
    }, { status: 502 });
  }
}
