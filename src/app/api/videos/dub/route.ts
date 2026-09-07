import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateVoiceoverAudioFile, mixVoiceoverWithVideo } from "@/lib/videos/dubbing-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = await request.json() as {
      action?: "preview_audio" | "dub_video";
      script?: string;
      jobId?: string;
      voice?: string;
      rate?: string;
    };

    if (!body.script?.trim()) {
      return NextResponse.json({ error: "Roteiro de locução obrigatório." }, { status: 400 });
    }

    const tempDir = os.tmpdir();
    const tempAudioPath = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`);

    // Geração do áudio TTS
    await generateVoiceoverAudioFile(body.script, tempAudioPath, {
      voice: body.voice || "pt-BR-FranciscaNeural",
      rate: body.rate || "+25%",
    });

    if (body.action === "preview_audio") {
      const audioBuffer = fs.readFileSync(tempAudioPath);
      try { fs.unlinkSync(tempAudioPath); } catch {}
      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audioBuffer.byteLength),
        },
      });
    }

    // Ação: Dublar vídeo de um job existente
    if (body.action === "dub_video") {
      if (!body.jobId) {
        try { fs.unlinkSync(tempAudioPath); } catch {}
        return NextResponse.json({ error: "jobId obrigatório para dublar o vídeo." }, { status: 400 });
      }

      const admin = createSupabaseAdminClient();
      if (!admin) {
        try { fs.unlinkSync(tempAudioPath); } catch {}
        return NextResponse.json({ error: "Supabase Admin não disponível." }, { status: 503 });
      }

      let { data: job, error: jobError } = await admin
        .from("video_jobs")
        .select("*")
        .eq("id", body.jobId)
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (!job) {
        const fallback = await admin
          .from("video_jobs")
          .select("*")
          .eq("id", body.jobId)
          .maybeSingle();
        if (fallback.data) {
          job = fallback.data;
          jobError = null;
        }
      }

      if (jobError || !job?.video_url) {
        try { fs.unlinkSync(tempAudioPath); } catch {}
        return NextResponse.json({ error: "Vídeo do job não encontrado." }, { status: 404 });
      }

      // Baixa o vídeo original
      const videoResponse = await fetch(job.video_url);
      if (!videoResponse.ok) {
        try { fs.unlinkSync(tempAudioPath); } catch {}
        return NextResponse.json({ error: "Não foi possível baixar o vídeo original." }, { status: 502 });
      }

      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      const tempVideoInput = path.join(tempDir, `in_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`);
      const tempVideoOutput = path.join(tempDir, `out_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`);

      fs.writeFileSync(tempVideoInput, videoBuffer);

      try {
        await mixVoiceoverWithVideo(tempVideoInput, tempAudioPath, tempVideoOutput, {
          leadInDelayMs: 250,
          ambientVolume: 0.2,
        });

        const dubbedBytes = fs.readFileSync(tempVideoOutput);
        const timestamp = Date.now();
        const storagePath = `${job.user_id || userData.user.id}/${job.id}_dubbed_${timestamp}.mp4`;

        const upload = await admin.storage.from("videos").upload(storagePath, dubbedBytes, {
          contentType: "video/mp4",
          upsert: true,
        });

        if (upload.error) throw new Error(`Falha ao salvar vídeo dublado: ${upload.error.message}`);

        const { data: publicData } = admin.storage.from("videos").getPublicUrl(storagePath);
        const newVideoUrl = publicData.publicUrl;

        // Atualiza o job no Supabase com o novo vídeo dublado
        await admin.from("video_jobs").update({
          video_url: newVideoUrl,
          metadata: {
            ...(typeof job.metadata === "object" ? job.metadata : {}),
            dubbed: true,
            voiceoverScript: body.script,
            dubbedAt: new Date().toISOString(),
          },
        }).eq("id", job.id);

        return NextResponse.json({
          ok: true,
          videoUrl: newVideoUrl,
          message: "Vídeo dublado com sucesso!",
        });
      } finally {
        try { fs.unlinkSync(tempAudioPath); } catch {}
        try { fs.unlinkSync(tempVideoInput); } catch {}
        try { fs.unlinkSync(tempVideoOutput); } catch {}
      }
    }

    try { fs.unlinkSync(tempAudioPath); } catch {}
    return NextResponse.json({ error: "Ação não suportada." }, { status: 400 });
  } catch (error) {
    console.error("[api/videos/dub] Erro ao processar dublagem:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Falha ao processar dublagem.",
    }, { status: 500 });
  }
}
