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

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({ user_id: userData.user.id, offer_id: parsed.data.offerId, script: parsed.data.script, status: "queued" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job: data }, { status: 201 });
}
