import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  generateVoiceoverAudioFile,
  mixVoiceoverWithVideo,
  isLocalEdgeTtsAvailable,
} from "@/lib/videos/dubbing-service";

export const runtime = "nodejs";

function getOracleConfig() {
  const url =
    process.env.ORACLE_REMOTE_URL ||
    process.env.ORACLE_API_URL ||
    "http://193.122.242.178:3002";
  const key = process.env.ORACLE_API_KEY;
  return { url, key };
}

async function delegateToOracle(payload: {
  action: "preview_audio" | "dub_video";
  script: string;
  videoUrl?: string;
  storagePath?: string;
  voice?: string;
  rate?: string;
}) {
  const { url, key } = getOracleConfig();
  if (!key) {
    throw new Error("ORACLE_API_KEY não configurada no ambiente.");
  }

  return fetch(`${url}/api/dub-neural`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: key, ...payload }),
  });
}

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

    const shouldDelegateToOracle = !isLocalEdgeTtsAvailable() || Boolean(process.env.VERCEL);

    // ─── AÇÃO 1: PRÉVIA DO ÁUDIO ──────────────────────────────────────────────
    if (body.action === "preview_audio") {
      if (shouldDelegateToOracle) {
        const oracleRes = await delegateToOracle({
          action: "preview_audio",
          script: body.script,
          voice: body.voice,
          rate: body.rate,
        });

        if (!oracleRes.ok) {
          const err = await oracleRes.json().catch(() => ({}));
          return NextResponse.json(
            { error: err?.error || "Falha ao gerar locução neural no servidor de IA." },
            { status: oracleRes.status || 502 }
          );
        }

        const audioBuffer = Buffer.from(await oracleRes.arrayBuffer());
        return new NextResponse(audioBuffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(audioBuffer.byteLength),
          },
        });
      }

      // Execução local (quando edge-tts existir no SO)
      const tempDir = os.tmpdir();
      const tempAudioPath = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`);

      try {
        await generateVoiceoverAudioFile(body.script, tempAudioPath, {
          voice: body.voice || "pt-BR-FranciscaNeural",
          rate: body.rate || "+25%",
        });

        const audioBuffer = fs.readFileSync(tempAudioPath);
        return new NextResponse(audioBuffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(audioBuffer.byteLength),
          },
        });
      } catch (localErr: any) {
        if (localErr?.code === "ENOENT" || String(localErr?.message).includes("ENOENT")) {
          // Fallback transparente para o Oracle se o binário local falhar
          const oracleRes = await delegateToOracle({
            action: "preview_audio",
            script: body.script,
            voice: body.voice,
            rate: body.rate,
          });

          if (oracleRes.ok) {
            const audioBuffer = Buffer.from(await oracleRes.arrayBuffer());
            return new NextResponse(audioBuffer, {
              status: 200,
              headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": String(audioBuffer.byteLength),
              },
            });
          }
        }
        throw localErr;
      } finally {
        try { if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath); } catch {}
      }
    }

    // ─── AÇÃO 2: DUBLAR VÍDEO DO JOB ──────────────────────────────────────────
    if (body.action === "dub_video") {
      if (!body.jobId) {
        return NextResponse.json({ error: "jobId obrigatório para dublar o vídeo." }, { status: 400 });
      }

      const admin = createSupabaseAdminClient();
      if (!admin) {
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
        return NextResponse.json({ error: "Vídeo do job não encontrado." }, { status: 404 });
      }

      const timestamp = Date.now();
      const storagePath = `${job.user_id || userData.user.id}/${job.id}_dubbed_${timestamp}.mp4`;

      if (shouldDelegateToOracle) {
        const oracleRes = await delegateToOracle({
          action: "dub_video",
          script: body.script,
          videoUrl: job.video_url,
          storagePath,
          voice: body.voice,
          rate: body.rate,
        });

        const oracleData = await oracleRes.json().catch(() => null);
        if (!oracleRes.ok || !oracleData?.video_url) {
          return NextResponse.json(
            { error: oracleData?.error || "Falha ao processar dublagem de vídeo no servidor de IA." },
            { status: oracleRes.status || 502 }
          );
        }

        const newVideoUrl = oracleData.video_url;

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
      }

      // Execução local (quando disponível)
      const tempDir = os.tmpdir();
      const tempAudioPath = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`);
      const tempVideoInput = path.join(tempDir, `in_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`);
      const tempVideoOutput = path.join(tempDir, `out_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`);

      try {
        await generateVoiceoverAudioFile(body.script, tempAudioPath, {
          voice: body.voice || "pt-BR-FranciscaNeural",
          rate: body.rate || "+25%",
        });

        const videoResponse = await fetch(job.video_url);
        if (!videoResponse.ok) {
          return NextResponse.json({ error: "Não foi possível baixar o vídeo original." }, { status: 502 });
        }

        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        fs.writeFileSync(tempVideoInput, videoBuffer);

        await mixVoiceoverWithVideo(tempVideoInput, tempAudioPath, tempVideoOutput, {
          leadInDelayMs: 250,
          ambientVolume: 0.2,
        });

        const dubbedBytes = fs.readFileSync(tempVideoOutput);

        const upload = await admin.storage.from("videos").upload(storagePath, dubbedBytes, {
          contentType: "video/mp4",
          upsert: true,
        });

        if (upload.error) throw new Error(`Falha ao salvar vídeo dublado: ${upload.error.message}`);

        const { data: publicData } = admin.storage.from("videos").getPublicUrl(storagePath);
        const newVideoUrl = publicData.publicUrl;

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
      } catch (localErr: any) {
        if (localErr?.code === "ENOENT" || String(localErr?.message).includes("ENOENT")) {
          // Fallback transparente para o Oracle se o binário local falhar
          const oracleRes = await delegateToOracle({
            action: "dub_video",
            script: body.script,
            videoUrl: job.video_url,
            storagePath,
            voice: body.voice,
            rate: body.rate,
          });

          const oracleData = await oracleRes.json().catch(() => null);
          if (oracleRes.ok && oracleData?.video_url) {
            await admin.from("video_jobs").update({
              video_url: oracleData.video_url,
              metadata: {
                ...(typeof job.metadata === "object" ? job.metadata : {}),
                dubbed: true,
                voiceoverScript: body.script,
                dubbedAt: new Date().toISOString(),
              },
            }).eq("id", job.id);

            return NextResponse.json({
              ok: true,
              videoUrl: oracleData.video_url,
              message: "Vídeo dublado com sucesso!",
            });
          }
        }
        throw localErr;
      } finally {
        try { if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath); } catch {}
        try { if (fs.existsSync(tempVideoInput)) fs.unlinkSync(tempVideoInput); } catch {}
        try { if (fs.existsSync(tempVideoOutput)) fs.unlinkSync(tempVideoOutput); } catch {}
      }
    }

    return NextResponse.json({ error: "Ação não suportada." }, { status: 400 });
  } catch (error) {
    console.error("[api/videos/dub] Erro ao processar dublagem:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Falha ao processar dublagem.",
    }, { status: 500 });
  }
}
