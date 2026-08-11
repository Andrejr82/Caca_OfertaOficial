import { NextResponse } from "next/server";
import { OfficialAIProviderRegistry } from "@/lib/ai/official/create-official-ai-service";
import { classifyTrendSignal, TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { DAILY_TREND_RADAR_STRATEGY_VERSION, buildDailyRadarFromTrendSignals } from "@/core/trends/daily-radar";
import { buildExecutiveRadarRanking } from "@/core/trends/executive-radar-ranking";
import { buildStrongestNiches7d } from "@/core/trends/strongest-niches-7d";
import { getAppMLAccessToken, getValidMLAccessToken } from "@/lib/platforms/mercadolivre";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchGoogleTrendSignals } from "@/lib/trends/google-trends-adapter";
import { fetchMercadoLivreTrendSignals } from "@/lib/trends/mercado-livre-trends-adapter";
import { searchMercadoLivreForTrendQueries, type ExistingMercadoLivreProduct } from "@/lib/trends/mercado-livre-search-adapter";
import { matchTrendSignalsForUser } from "@/lib/trends/matching";
import { persistTrendSignalClassifications, persistTrendSignals } from "@/lib/trends/persistence";
import { listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";
import {
  buildRadarExecutionWindow,
  claimTrendRadarExecution,
  createSupabaseRadarExecutionStore,
} from "@/lib/trends/radar-execution";
import { toTrendRadarSnapshotProducts } from "@/lib/trends/radar-ranking-snapshot";
import {
  createSupabaseTrendRadarSnapshotStore,
  persistTrendRadarSnapshot,
} from "@/lib/trends/radar-snapshots";
import { discoverMarketplaceCandidates } from "@/lib/trends/targeted-marketplace-discovery";
import { searchShopeeOfficialV1 } from "@/lib/trends/shopee-search-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST() {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const window = buildRadarExecutionWindow();
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
  let stage = "collect";

  try {
    try {
      const googleSignals = await fetchGoogleTrendSignals();
      const persisted = await persistTrendSignals(persistenceClient(client), user.id, googleSignals);
      sourceHealth.google_trends = { status: "healthy", collected: googleSignals.length, persisted };
    } catch {
      sourceHealth.google_trends = { status: "degraded" };
    }

    const accessToken = await getValidMLAccessToken(user.id)
      || process.env.MERCADO_LIVRE_ACCESS_TOKEN
      || await getAppMLAccessToken();

    if (accessToken) {
      try {
        const mlSignals = await fetchMercadoLivreTrendSignals(accessToken);
        const persisted = await persistTrendSignals(persistenceClient(client), user.id, mlSignals);
        sourceHealth.mercado_livre_trends = { status: "healthy", collected: mlSignals.length, persisted };
      } catch {
        sourceHealth.mercado_livre_trends = { status: "degraded" };
      }
    } else {
      sourceHealth.mercado_livre_trends = { status: "unavailable" };
    }

    stage = "classify";
    let signals = await listTrendSignals();
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
    const mercadoLivre = require("../../../../../scripts/mercadolivre-official-intents-v5.cjs") as {
      runMercadoLivreOfficialIntentCoverage(input: {
        keywords: string[];
        accessToken: string;
        maxPerIntent: number;
        delayMs: number;
      }): Promise<{ products?: ExistingMercadoLivreProduct[] }>;
    };
    const matching = await matchTrendSignalsForUser(client, user.id, async (classification) => {
      const term = classification.normalizedProductTerm ?? "";
      const [shopee, mercadoLivreResult] = await Promise.all([
        discoverMarketplaceCandidates({
          marketplace: "Shopee",
          normalizedProductTerm: term,
          productIdentity: term,
          searchShopee: searchShopeeOfficialV1,
        }),
        accessToken
          ? discoverMarketplaceCandidates({
              marketplace: "Mercado Livre",
              normalizedProductTerm: term,
              productIdentity: term,
              searchMercadoLivre: (query) => searchMercadoLivreForTrendQueries(mercadoLivre, [query], accessToken),
            })
          : Promise.resolve(null),
      ]);
      return [...shopee.candidates, ...(mercadoLivreResult?.candidates ?? [])];
    });

    stage = "rank";
    signals = await listTrendSignals();
    const opportunities = (await listTrendOpportunities())
      .filter((opportunity) => opportunity.strategyVersion === TREND_COMMERCIAL_STRATEGY_VERSION);
    const radar = buildDailyRadarFromTrendSignals(signals, opportunities);
    const ranking = buildExecutiveRadarRanking(radar, { asOf: window.windowEnd });
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
          eligibleSignals: matching.eligibleSignals,
          matchedSignals: matching.matchedSignals,
          noMatchSignals: matching.noMatchSignals,
          opportunitiesCreated: matching.opportunitiesCreated,
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
