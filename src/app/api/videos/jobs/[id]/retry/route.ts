import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "queued", video_url: null, audio_url: null, error_message: null, started_at: null, completed_at: null })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .in("status", ["failed", "ready"])
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job não encontrado ou não está com erro." }, { status: 409 });
  return NextResponse.json({ job: data });
}
