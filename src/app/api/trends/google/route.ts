import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchGoogleTrendSignals } from "@/lib/trends/google-trends-adapter";
import { persistTrendSignals } from "@/lib/trends/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });

    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const signals = await fetchGoogleTrendSignals();
    const persisted = await persistTrendSignals(client, user.id, signals);
    return NextResponse.json({ ok: true, collected: signals.length, persisted, source: "google_trends", region: "BR" });
  } catch (error) {
    console.error("[GOOGLE-TRENDS] Falha ao coletar sinais:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Não foi possível coletar Google Trends." }, { status: 502 });
  }
}
