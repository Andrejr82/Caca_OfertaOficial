type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
};

const DEFAULT_FOLDER_ID = "1tj6S-Gr7hxt5RNRIAd7BkpR8_2tuGaFB";
const REQUIRED_DRIVE_ENV = [
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
] as const;

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
  const metadata = file.videoMediaMetadata;
  const width = Number(metadata?.width ?? 0);
  const height = Number(metadata?.height ?? 0);
  const durationSeconds = Number(metadata?.durationMillis ?? 0) / 1000;
  if (mime !== "video/mp4") return "O vídeo precisa estar em MP4.";
  if (!size || size > 100 * 1024 * 1024) return "O vídeo precisa ter entre 1 e 100 MB.";
  if (!width || !height) return "O Google Drive ainda não forneceu a resolução do vídeo.";
  if (Math.abs(width / height - 9 / 16) > 0.05) return "O vídeo precisa estar no formato vertical 9:16.";
  if (!durationSeconds || durationSeconds < 3 || durationSeconds > 90) return "A duração precisa estar entre 3 e 90 segundos.";
  return null;
}

export type { DriveFile };
