import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import path from "path";
import os from "os";
import fs from "fs";

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

  try {
    // 1. Baixa o vídeo original para um arquivo temporário
    const videoRes = await fetch(job.video_url);
    if (!videoRes.ok) throw new Error("Não foi possível baixar o vídeo original.");
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `trim_input_${id}.mp4`);
    const outputPath = path.join(tmpDir, `trim_output_${id}.mp4`);
    fs.writeFileSync(inputPath, videoBuffer);

    // 2. Executa o corte via ffmpeg (dinâmico para Vercel serverless)
    const duration = trimEnd - trimStart;
    await new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffmpeg = require("fluent-ffmpeg");
      ffmpeg(inputPath)
        .setStartTime(trimStart)
        .setDuration(duration)
        .output(outputPath)
        .outputOptions(["-c copy"]) // ultrafast copy — sem re-encode
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    // 3. Faz upload da versão cortada por cima da original no Supabase Storage
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("Admin client indisponível.");

    const trimmedBuffer = fs.readFileSync(outputPath);
    const storagePath = `${userData.user.id}/${id}.mp4`;

    const { error: uploadError } = await admin.storage
      .from("videos")
      .upload(storagePath, trimmedBuffer, { contentType: "video/mp4", upsert: true });

    if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`);

    // 4. Pega a nova URL pública
    const { data: publicData } = admin.storage.from("videos").getPublicUrl(storagePath);
    const newUrl = `${publicData.publicUrl}?t=${Date.now()}`;

    // 5. Atualiza o video_url no banco e salva os tempos no metadata
    const { data: currentJob } = await admin.from("video_jobs").select("metadata").eq("id", id).maybeSingle();
    const metadata = { ...(currentJob?.metadata ?? {}), trimStart, trimEnd };

    await admin.from("video_jobs").update({ video_url: newUrl, metadata }).eq("id", id);

    // 6. Limpa arquivos temporários
    try { fs.unlinkSync(inputPath); } catch { /* noop */ }
    try { fs.unlinkSync(outputPath); } catch { /* noop */ }

    return NextResponse.json({ success: true, video_url: newUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
