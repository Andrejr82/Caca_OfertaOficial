import { NextResponse } from "next/server";
import { getAppMLAccessToken, getValidMLAccessToken } from "@/lib/platforms/mercadolivre";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchMercadoLivreTrendSignals } from "@/lib/trends/mercado-livre-trends-adapter";
import { persistTrendSignals } from "@/lib/trends/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const accessToken = await getValidMLAccessToken(user.id)
      || process.env.MERCADO_LIVRE_ACCESS_TOKEN
      || await getAppMLAccessToken();
    if (!accessToken) return NextResponse.json({ ok: false, message: "Conecte o Mercado Livre para consultar tendências oficiais." }, { status: 503 });

    const signals = await fetchMercadoLivreTrendSignals(accessToken);
    const persisted = await persistTrendSignals(
      client as unknown as Parameters<typeof persistTrendSignals>[0],
      user.id,
      signals,
    );
    return NextResponse.json({ ok: true, collected: signals.length, persisted, source: "mercado_livre_trends", region: "BR" });
  } catch (error) {
    console.error("[MERCADO-LIVRE-TRENDS] Falha ao coletar sinais:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Não foi possível coletar tendências do Mercado Livre." }, { status: 502 });
  }
}
