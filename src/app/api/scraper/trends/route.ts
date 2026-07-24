import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_MARKETPLACES = new Set(["Amazon", "Mercado Livre", "Shopee"]);

function oracleEndpoint() {
  const configured = process.env.ORACLE_REMOTE_URL || process.env.ORACLE_WORKER_URL || process.env.ORACLE_API_URL;
  if (!configured) return null;
  return `${configured.replace(/\/+$/, "").replace(/\/api\/scrape$/, "")}/api/manual/trends`;
}

export async function POST(request: Request) {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const payload = await request.json().catch(() => ({}));
    const marketplaces = Array.from(new Set(
      (Array.isArray(payload?.sources) ? payload.sources : [])
        .map((source: unknown) => String(source).trim())
        .filter((source: string) => SUPPORTED_MARKETPLACES.has(source))
    ));
    if (marketplaces.length === 0) {
      return NextResponse.json({ ok: false, message: "Selecione Amazon, Mercado Livre ou Shopee." }, { status: 400 });
    }
    const category = String(payload?.category || "Geral").trim() || "Geral";
    const limit = Math.min(Math.max(Number(payload?.limit) || 5, 1), 50);
    const endpoint = oracleEndpoint();
    if (!endpoint || !process.env.ORACLE_API_KEY) {
      return NextResponse.json({
        ok: false,
        code: "ORACLE_MANUAL_DISCOVERY_NOT_CONFIGURED",
        message: "Busca manual indisponível: configure ORACLE_REMOTE_URL/ORACLE_WORKER_URL e ORACLE_API_KEY na aplicação."
      }, { status: 503 });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: process.env.ORACLE_API_KEY, tenantId: user.id, category, marketplaces, limit }),
      signal: AbortSignal.timeout(15 * 60 * 1000),
      cache: "no-store"
    });
    const oracle = await response.json().catch(() => ({}));
    if (!response.ok || !oracle.ok) {
      return NextResponse.json({ ok: false, code: oracle.code || "ORACLE_MANUAL_DISCOVERY_FAILED", message: oracle.message || "A Oracle não concluiu a busca manual." }, { status: response.status || 502 });
    }

    const offerIds = Array.isArray(oracle.result?.offerIds) ? oracle.result.offerIds : [];
    const { data: rows, error } = offerIds.length > 0
      ? await client.from("offers").select("*").in("id", offerIds)
      : { data: [], error: null };
    if (error) console.warn("[MANUAL-TRENDS] Ofertas persistidas, mas não puderam ser carregadas para exibição:", error.message);
    const offers = (rows || []).map((offer: any) => ({
      id: offer.id,
      title: offer.product_name,
      productName: offer.product_name,
      marketplace: offer.platform,
      category: offer.category,
      price: offer.current_price,
      currentPrice: offer.current_price,
      originalPrice: offer.old_price,
      score: offer.score,
      image: offer.image_url,
      imageUrl: offer.image_url,
      url: offer.original_url,
      affiliateLink: offer.original_url,
      badges: []
    }));
    return NextResponse.json({
      ok: true,
      offers,
      result: oracle.result,
      message: oracle.message || `Busca concluída: ${offers.length} oferta(s).`
    });
  } catch (error) {
    console.error("[MANUAL-TRENDS] Falha na busca manual:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Não foi possível concluir a busca manual." }, { status: 502 });
  }
}
