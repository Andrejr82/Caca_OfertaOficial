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
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .eq("status", "ready")
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "O vídeo precisa estar pronto para aprovação." }, { status: 409 });
  return NextResponse.json({ job: data });
}
