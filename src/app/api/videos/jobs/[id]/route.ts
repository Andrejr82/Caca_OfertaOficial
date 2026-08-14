import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const { data: job, error: readError } = await supabase
    .from("video_jobs")
    .select("id")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase service role não configurada." }, { status: 503 });

  const storagePaths = [
    `${userData.user.id}/${id}.mp4`,
    `${userData.user.id}/${id}.mp3`,
    `jobs/${id}/video.mp4`,
    `jobs/${id}/audio.mp3`,
  ];
  const { error: storageError } = await admin.storage.from("videos").remove(storagePaths);
  if (storageError) return NextResponse.json({ error: storageError.message }, { status: 502 });

  const { error: deleteError } = await admin
    .from("video_jobs")
    .delete()
    .eq("id", id)
    .eq("user_id", userData.user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ success: true, id });
}
