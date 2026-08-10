import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { matchTrendSignalsForUser } from "@/lib/trends/matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    return NextResponse.json({ ok: true, ...(await matchTrendSignalsForUser(client, user.id)) });
  } catch (error) {
    console.error("[TREND-MATCHING] Falha ao fazer matching:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Não foi possível fazer matching." }, { status: 502 });
  }
}
