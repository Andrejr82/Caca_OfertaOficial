/**
 * SERVIÇO DE DUBLAGEM AUTOMÁTICA
 *
 * Gera o áudio neural a partir do roteiro de locução e mescla com o vídeo MP4 via FFmpeg.
 * Aplica os parâmetros validados:
 * - Atraso inicial de 250ms para impacto visual prévio
 * - Áudio ambiente original ducked para 20% como atmosfera de fundo
 * - Filtro loudnorm com pico a -1.5 dB para transmissão broadcast em Reels/Shorts
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

// Caminhos validados para o executável do edge-tts
const WINDOWS_EDGE_TTS_BIN = "C:\\Users\\André\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\edge-tts.exe";
const ORACLE_EDGE_TTS_BIN = "/home/ubuntu/.local/bin/edge-tts";

// Caminhos locais do WinGet para fallback
const WINGET_FFMPEG = "C:\\Users\\André\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe";
const WINGET_FFPROBE = "C:\\Users\\André\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffprobe.exe";

export function getEdgeTtsBinaryPath(): string {
  if (process.env.EDGE_TTS_BIN) return process.env.EDGE_TTS_BIN;
  if (process.platform === "win32" && fs.existsSync(WINDOWS_EDGE_TTS_BIN)) {
    return WINDOWS_EDGE_TTS_BIN;
  }
  if (process.platform === "linux" && fs.existsSync(ORACLE_EDGE_TTS_BIN)) {
    return ORACLE_EDGE_TTS_BIN;
  }
  return "edge-tts";
}

export function getFfmpegBinaryPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (ffmpegStatic && typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  if (fs.existsSync(WINGET_FFMPEG)) {
    return WINGET_FFMPEG;
  }
  return "ffmpeg";
}

export function getFfprobeBinaryPath(): string {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }
  if (fs.existsSync(WINGET_FFPROBE)) {
    return WINGET_FFPROBE;
  }
  return "ffprobe";
}

export type DubbingOptions = {
  voice?: string;
  rate?: string;
  leadInDelayMs?: number;
  ambientVolume?: number;
};

const DEFAULT_VOICE = "pt-BR-FranciscaNeural";
const DEFAULT_RATE = "+25%";
const DEFAULT_DELAY_MS = 250;
const DEFAULT_AMBIENT_VOL = 0.2;

/**
 * Gera o arquivo de áudio MP3 da locução neural via edge-tts
 */
export async function generateVoiceoverAudioFile(
  text: string,
  outputPath: string,
  options: Pick<DubbingOptions, "voice" | "rate"> = {},
): Promise<string> {
  const edgeTtsBin = getEdgeTtsBinaryPath();
  const voice = options.voice || DEFAULT_VOICE;
  const rate = options.rate || DEFAULT_RATE;

  const args = [
    "--voice", voice,
    "--rate", rate,
    "--text", text,
    "--write-media", outputPath,
  ];

  await execFileAsync(edgeTtsBin, args);

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Falha ao gerar áudio de locução: arquivo não encontrado em ${outputPath}`);
  }

  return outputPath;
}

/**
 * Verifica se o arquivo de vídeo possui stream de áudio via ffprobe
 */
export async function videoHasAudioStream(videoPath: string): Promise<boolean> {
  try {
    const ffprobeBin = getFfprobeBinaryPath();
    const { stdout } = await execFileAsync(ffprobeBin, [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      videoPath,
    ]);
    return stdout.trim().toLowerCase().includes("audio");
  } catch {
    return false;
  }
}

/**
 * Mescla o áudio de locução com o vídeo original usando FFmpeg
 */
export async function mixVoiceoverWithVideo(
  videoInputPath: string,
  voiceoverAudioPath: string,
  outputPath: string,
  options: Pick<DubbingOptions, "leadInDelayMs" | "ambientVolume"> = {},
): Promise<string> {
  const delay = options.leadInDelayMs ?? DEFAULT_DELAY_MS;
  const ambientVol = options.ambientVolume ?? DEFAULT_AMBIENT_VOL;

  const hasAudio = await videoHasAudioStream(videoInputPath);

  let filter: string;
  if (hasAudio) {
    // Vídeo com som original: ducking para 20% + delay na locução + loudnorm broadcast
    filter = `[0:a]volume=${ambientVol}[bg];[1:a]adelay=${delay}|${delay},volume=1.0[voice];[bg][voice]amix=inputs=2:duration=first:dropout_transition=1,loudnorm=I=-14:TP=-1.5:LRA=7[aout]`;
  } else {
    // Vídeo mudo (Gemini, Kling, etc): aplica diretamente a locução com delay e loudnorm broadcast
    filter = `[1:a]adelay=${delay}|${delay},loudnorm=I=-14:TP=-1.5:LRA=7[aout]`;
  }

  const args = [
    "-y",
    "-i", videoInputPath,
    "-i", voiceoverAudioPath,
    "-filter_complex", filter,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    outputPath,
  ];

  const ffmpegBin = getFfmpegBinaryPath();

  try {
    await execFileAsync(ffmpegBin, args);
  } catch (primaryError) {
    if (hasAudio) {
      console.warn("[dubbing-service] Mixagem combinada falhou, tentando fallback somente com áudio de locução:", primaryError);
      const fallbackFilter = `[1:a]adelay=${delay}|${delay},loudnorm=I=-14:TP=-1.5:LRA=7[aout]`;
      const fallbackArgs = [
        "-y",
        "-i", videoInputPath,
        "-i", voiceoverAudioPath,
        "-filter_complex", fallbackFilter,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        outputPath,
      ];
      await execFileAsync(ffmpegBin, fallbackArgs);
    } else {
      throw primaryError;
    }
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Falha ao mixar vídeo dublado: arquivo não gerado em ${outputPath}`);
  }

  return outputPath;
}

/**
 * Pipeline completo de dublagem para qualquer vídeo
 */
export async function dubVideoAutomatically(
  videoInputPath: string,
  script: string,
  outputPath: string,
  options: DubbingOptions = {},
): Promise<{ outputPath: string; audioPath: string }> {
  const tempDir = os.tmpdir();
  const tempAudioPath = path.join(tempDir, `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`);

  try {
    await generateVoiceoverAudioFile(script, tempAudioPath, options);
    await mixVoiceoverWithVideo(videoInputPath, tempAudioPath, outputPath, options);
    return { outputPath, audioPath: tempAudioPath };
  } catch (error) {
    if (fs.existsSync(tempAudioPath)) {
      try { fs.unlinkSync(tempAudioPath); } catch {}
    }
    throw error;
  }
}
