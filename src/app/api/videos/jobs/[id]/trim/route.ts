import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const trimStart: number = Number(body.trimStart ?? 0);
  const trimEnd: number = Number(body.trimEnd ?? 0);

  if (trimStart < 0 || trimEnd <= 0 || trimEnd <= trimStart) {
    return NextResponse.json({ error: "Tempos de recorte inválidos." }, { status: 400 });
  }

  const { data: job, error: readError } = await supabase
    .from("video_jobs")
    .select("id, video_url, status, user_id")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  if (!job.video_url) return NextResponse.json({ error: "Sem vídeo no job." }, { status: 400 });

  const oracleUrl = process.env.ORACLE_API_URL;
  const oracleKey = process.env.ORACLE_API_KEY;
  if (!oracleUrl || !oracleKey) {
    return NextResponse.json({ error: "Oracle API não configurada (ORACLE_API_URL / ORACLE_API_KEY)." }, { status: 503 });
  }

  // Delega o corte para o Oracle VPS que tem ffmpeg real instalado
  const storagePath = `${userData.user.id}/${id}.mp4`;
  const oracleRes = await fetch(`${oracleUrl}/api/trim-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: oracleKey, videoUrl: job.video_url, trimStart, trimEnd, storagePath }),
  });

  const oracleData = await oracleRes.json();
  if (!oracleRes.ok) {
    return NextResponse.json({ error: oracleData.error ?? "Erro no Oracle ao recortar." }, { status: 502 });
  }

  const newUrl: string = oracleData.video_url;

  // Atualiza o video_url e metadata no Supabase
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data: currentJob } = await admin.from("video_jobs").select("metadata").eq("id", id).maybeSingle();
    const metadata = { ...(currentJob?.metadata ?? {}), trimStart, trimEnd };
    await admin.from("video_jobs").update({ video_url: newUrl, metadata }).eq("id", id);
  }

  return NextResponse.json({ success: true, video_url: newUrl });
}
