import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  discoverTrendShopeeApprovalCandidates,
  persistTrendShopeeApprovalCandidates,
  type TrendRadarApprovalProduct,
} from "@/lib/trends/shopee-approval-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const payload = await request.json().catch(() => ({}));
  const runId = String(payload?.runId || "").trim();
  if (!runId) return NextResponse.json({ ok: false, message: "runId do Radar é obrigatório." }, { status: 400 });

  const { data: run, error: runError } = await client
    .from("trend_radar_runs")
    .select("id,status")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (runError) return NextResponse.json({ ok: false, message: "Não foi possível validar o Radar." }, { status: 502 });
  if (!run || run.status !== "completed") return NextResponse.json({ ok: false, message: "Radar concluído não encontrado." }, { status: 404 });

  const { data: radarProducts, error: productsError } = await client
    .from("trend_radar_products")
    .select("id,priority,product_term,category,evidence_status,commercial_score,confidence")
    .eq("radar_run_id", runId)
    .order("priority", { ascending: true })
    .limit(20);
  if (productsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar o ranking do Radar." }, { status: 502 });

  try {
    const shopeeEnabled = process.env.SHOPEE_RANKING_V1_ENABLED === "true";
    if (!shopeeEnabled) {
      return NextResponse.json({
        ok: true,
        runId,
        searchedIntents: 0,
        candidatesFound: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        readyOfferIds: [],
        message: "Shopee search is disabled (SHOPEE_RANKING_V1_ENABLED != true)",
        rejectedRadarProducts: [],
      });
    }

    const discovery = await discoverTrendShopeeApprovalCandidates((radarProducts || []) as TrendRadarApprovalProduct[]);
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ ok: false, message: "Persistência server-side não configurada." }, { status: 503 });

    const persisted = await persistTrendShopeeApprovalCandidates(admin, user.id, runId, discovery.candidates);
    return NextResponse.json({
      ok: true,
      runId,
      searchedIntents: discovery.searchedIntents,
      discoveredCandidates: discovery.candidates.length,
      rejectedRadarProducts: discovery.rejectedRadarProducts,
      readyCount: persisted.readyOfferIds.length,
      readyOfferIds: persisted.readyOfferIds,
      inserted: persisted.inserted,
      updated: persisted.updated,
      automaticPublication: false,
    });
  } catch (error) {
    console.error("[TREND-APPROVAL-QUEUE] Falha:", error);
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Não foi possível preparar a fila Shopee.",
    }, { status: 502 });
  }
}
