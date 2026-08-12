import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAppMLAccessToken, getValidMLAccessToken } from "@/lib/platforms/mercadolivre";
import { searchShopeeOfficialV1Paginated } from "@/lib/trends/shopee-search-adapter";
import { createMercadoLivreOfficialSearchService, searchMercadoLivreForTrendQueries } from "@/lib/trends/mercado-livre-search-adapter";
import { discoverTrendMarketplaceCandidates } from "@/lib/trends/multimarketplace-discovery";
import { persistTrendMarketplaceApprovalCandidates, persistTrendMercadoLivreApprovalCandidates, type MultimarketplaceApprovalProduct } from "@/lib/trends/multimarketplace-approval-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 8 * 1024;

export async function POST(request: Request) {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, message: "Payload excede o limite permitido." }, { status: 413 });
  }
  const payload = (() => {
    try {
      return rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return null;
    }
  })();
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, message: "Payload JSON inválido." }, { status: 400 });
  }
  const runId = String(payload?.runId || "").trim();
  if (!runId) return NextResponse.json({ ok: false, message: "runId do Radar é obrigatório." }, { status: 400 });

  const { data: run, error: runError } = await client.from("trend_radar_runs").select("id,status").eq("id", runId).eq("user_id", user.id).maybeSingle();
  if (runError) return NextResponse.json({ ok: false, message: "Não foi possível validar o Radar." }, { status: 502 });
  if (!run || run.status !== "completed") return NextResponse.json({ ok: false, message: "Radar concluído não encontrado." }, { status: 404 });
  const { data: radarProducts, error: productsError } = await client
    .from("trend_radar_products")
    .select("id,priority,product_term,normalized_product_term,category,evidence_status,commercial_score,confidence")
    .eq("radar_run_id", runId)
    .order("priority", { ascending: true })
    .limit(20);
  if (productsError) return NextResponse.json({ ok: false, message: "Não foi possível carregar o ranking do Radar." }, { status: 502 });

  try {
    const accessToken = await getValidMLAccessToken(user.id) || process.env.MERCADO_LIVRE_ACCESS_TOKEN || await getAppMLAccessToken();
    const mercadoLivre = createMercadoLivreOfficialSearchService();
    const products = (radarProducts || []) as MultimarketplaceApprovalProduct[];
    const discovery = await discoverTrendMarketplaceCandidates({
      runId,
      intents: products.filter((product) => ["verified", "partial"].includes(product.evidence_status)).map((product) => ({
        normalizedProductTerm: product.normalized_product_term || product.product_term,
        productIdentity: product.product_term,
        category: product.category
      })),
      maxConcurrentJobs: 2,
      searchShopee: async (query) => {
        const result = await searchShopeeOfficialV1Paginated(query, { maxPages: 3 });
        return result.candidates.map((candidate) => ({
          ...candidate,
          marketplaceMetrics: { ...candidate.marketplaceMetrics, normalizedProductTerm: query }
        }));
      },
      searchMercadoLivre: accessToken ? (query) => searchMercadoLivreForTrendQueries(mercadoLivre, [query], accessToken, { maxQueries: 1 }) : undefined
    });
    const entries = discovery.candidates.flatMap((candidate) => {
      const term = String(candidate.marketplaceMetrics?.normalizedProductTerm || "").toLocaleLowerCase("pt-BR");
      const product = products.find((item) => (item.normalized_product_term || item.product_term).toLocaleLowerCase("pt-BR") === term)
        || products.find((item) => candidate.productName.toLocaleLowerCase("pt-BR").includes(item.product_term.toLocaleLowerCase("pt-BR")));
      return product ? [{ radarProduct: product, candidate }] : [];
    });
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ ok: false, message: "Persistência server-side não configurada." }, { status: 503 });
    const persisted = await persistTrendMarketplaceApprovalCandidates(admin, user.id, runId, entries);
    const mlPersisted = persistTrendMercadoLivreApprovalCandidates === persistTrendMarketplaceApprovalCandidates;
    return NextResponse.json({
      ok: true,
      runId,
      automaticPublication: false,
      discoveredCandidates: discovery.candidates.length,
      errors: discovery.errors.length,
      counters: discovery.counters,
      persisted,
      socialDraftsCreated: 0,
      persistenceMode: mlPersisted ? "unified_native_identity" : "unified"
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Não foi possível preparar a fila multimarketplace." }, { status: 502 });
  }
}
