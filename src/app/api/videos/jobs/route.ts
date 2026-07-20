import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createJobSchema = z.object({
  offerId: z.string().uuid(),
  script: z.string().trim().min(20).max(500)
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data, error } = await supabase
    .from("video_jobs")
    .select("*, offers(id, product_name, image_url, current_price, old_price, platform)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = createJobSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe uma oferta e um roteiro válido." }, { status: 400 });

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id")
    .eq("id", parsed.data.offerId)
    .maybeSingle();

  if (offerError || !offer) return NextResponse.json({ error: "Oferta não encontrada." }, { status: 404 });

  const dailyLimit = Math.min(3, Math.max(1, Number(process.env.VIDEO_DAILY_LIMIT || 3)));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userData.user.id)
    .gte("created_at", since)
    .not("status", "eq", "cancelled");

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) >= dailyLimit) {
    return NextResponse.json({ error: `Limite de ${dailyLimit} vídeos a cada 24 horas atingido.` }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({ user_id: userData.user.id, offer_id: parsed.data.offerId, script: parsed.data.script, status: "queued" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job: data }, { status: 201 });
}
