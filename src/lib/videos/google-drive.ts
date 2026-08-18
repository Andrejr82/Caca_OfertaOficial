import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
};

export type InspectedVideoMetadata = {
  width: number;
  height: number;
  durationSeconds: number;
  codec: string | null;
  hasAudio: boolean;
  source: "ffmpeg";
};

const DEFAULT_FOLDER_ID = "1tj6S-Gr7hxt5RNRIAd7BkpR8_2tuGaFB";
const REQUIRED_DRIVE_ENV = [
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
] as const;
const execFileAsync = promisify(execFile);

export type GoogleDriveIntegrationStatus = {
  configured: boolean;
  missing: string[];
  folderId: string;
};

export class GoogleDriveIntegrationError extends Error {
  constructor(public readonly code: "missing_config" | "token_failed" | "drive_http", message: string, public readonly status?: number) {
    super(message);
    this.name = "GoogleDriveIntegrationError";
  }
}

export function getGoogleDriveIntegrationStatus(): GoogleDriveIntegrationStatus {
  const missing = REQUIRED_DRIVE_ENV.filter((name) => !process.env[name]?.trim());
  return {
    configured: missing.length === 0,
    missing: [...missing],
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || DEFAULT_FOLDER_ID,
  };
}

function required(name: (typeof REQUIRED_DRIVE_ENV)[number]) {
  const value = process.env[name]?.trim();
  if (!value) throw new GoogleDriveIntegrationError("missing_config", `Configuração do Google Drive ausente: ${name}.`);
  return value;
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: required("GOOGLE_DRIVE_CLIENT_ID"),
    client_secret: required("GOOGLE_DRIVE_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_DRIVE_REFRESH_TOKEN"),
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, cache: "no-store" });
  const data = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    const detail = data.error_description || data.error || String(response.status);
    throw new GoogleDriveIntegrationError("token_failed", `Não foi possível renovar a autorização do Google Drive (${detail}).`, response.status);
  }
  return data.access_token;
}

async function driveFetch(path: string, init?: RequestInit) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init?.headers ?? {}) },
    cache: "no-store"
  });
  if (!response.ok) throw new GoogleDriveIntegrationError("drive_http", `Google Drive respondeu com HTTP ${response.status}.`, response.status);
  return response;
}

export async function listDriveVideos(): Promise<DriveFile[]> {
  const folderId = getGoogleDriveIntegrationStatus().folderId;
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType contains 'video/'`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,webViewLink,videoMediaMetadata(width,height,durationMillis)),nextPageToken");
  const response = await driveFetch(`files?q=${query}&pageSize=100&orderBy=modifiedTime%20desc&fields=${fields}`);
  const data = await response.json() as { files?: DriveFile[] };
  return data.files ?? [];
}

export async function downloadDriveVideo(fileId: string) {
  const response = await driveFetch(`files/${encodeURIComponent(fileId)}?alt=media`);
  const contentType = response.headers.get("content-type") ?? "video/mp4";
  const bytes = await response.arrayBuffer();
  return { bytes: Buffer.from(bytes), contentType };
}

export function validateDriveVideo(file: DriveFile) {
  const mime = file.mimeType.toLowerCase();
  const size = Number(file.size ?? 0);
  if (mime !== "video/mp4") return "O vídeo precisa estar em MP4.";
  if (!size || size > 100 * 1024 * 1024) return "O vídeo precisa ter entre 1 e 100 MB.";
  return null;
}

function parseDurationSeconds(stderr: string) {
  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseVideoStream(stderr: string) {
  const line = stderr.split("\n").find((candidate) => candidate.includes("Video:"));
  if (!line) return { width: 0, height: 0, codec: null as string | null };
  const dimensions = line.match(/(?:^|[,\s])(\d{2,5})x(\d{2,5})(?:[,\s]|$)/);
  const codec = line.match(/Video:\s*([^,\s]+)/)?.[1] ?? null;
  return {
    width: Number(dimensions?.[1] ?? 0),
    height: Number(dimensions?.[2] ?? 0),
    codec,
  };
}

export async function inspectVideoBytes(bytes: Buffer): Promise<InspectedVideoMetadata> {
  if (!ffmpegPath) throw new Error("FFmpeg não está disponível para validar o vídeo.");

  const dir = await mkdtemp(join(tmpdir(), "caca-oferta-video-"));
  const inputPath = join(dir, "input.mp4");
  await writeFile(inputPath, bytes);

  try {
    let stderr = "";
    try {
      const result = await execFileAsync(ffmpegPath, ["-hide_banner", "-i", inputPath, "-frames:v", "1", "-f", "null", "-"], {
        maxBuffer: 8 * 1024 * 1024,
        timeout: 20_000,
      });
      stderr = result.stderr;
    } catch (error) {
      const candidate = error as { stderr?: string | Buffer; message?: string };
      stderr = Buffer.isBuffer(candidate.stderr) ? candidate.stderr.toString("utf8") : candidate.stderr ?? "";
      if (!stderr) throw new Error(candidate.message || "Não foi possível inspecionar o vídeo com FFmpeg.");
    }

    const { width, height, codec } = parseVideoStream(stderr);
    const durationSeconds = parseDurationSeconds(stderr);
    const hasAudio = stderr.split("\n").some((line) => line.includes("Audio:"));

    if (!width || !height || !durationSeconds) {
      throw new Error("Não foi possível identificar resolução e duração no arquivo MP4.");
    }

    return { width, height, durationSeconds, codec, hasAudio, source: "ffmpeg" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function validateInspectedVideo(metadata: Pick<InspectedVideoMetadata, "width" | "height" | "durationSeconds">) {
  if (!metadata.width || !metadata.height) return "Não foi possível identificar a resolução do vídeo.";
  if (Math.abs(metadata.width / metadata.height - 9 / 16) > 0.05) return "O vídeo precisa estar no formato vertical 9:16.";
  if (!metadata.durationSeconds || metadata.durationSeconds < 3 || metadata.durationSeconds > 90) return "A duração precisa estar entre 3 e 90 segundos.";
  return null;
}

export type { DriveFile };
