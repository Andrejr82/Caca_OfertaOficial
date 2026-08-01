import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAndNormalizeDriveImage } from "@/lib/images/drive-upload";

const DEFAULT_FOLDER_ID = "1tj6S-Gr7hxt5RNRIAd7BkpR8_2tuGaFB";

function isConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "produto.jpg";
}

async function getAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!, grant_type: "refresh_token" }),
    cache: "no-store",
  });
  const data = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error || "Falha ao renovar autorização do Google Drive.");
  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    if (!isConfigured()) return NextResponse.json({ ok: false, message: "Integração Google Drive não configurada." }, { status: 503 });

    const body = await request.json() as { imageUrl?: string; fileName?: string };
    if (!body.imageUrl || !/^https?:\/\//i.test(body.imageUrl)) return NextResponse.json({ ok: false, message: "Imagem inválida." }, { status: 400 });
    const image = await fetchAndNormalizeDriveImage(body.imageUrl);
    const requestedName = safeFilename(body.fileName || "produto.jpg");
    const fileName = requestedName.replace(/\.[a-z0-9]+$/i, "") + image.extension;
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: fileName, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID] })], { type: "application/json" }));
    form.append("file", new Blob([image.buffer], { type: image.contentType }), fileName);
    const upload = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size", { method: "POST", headers: { Authorization: `Bearer ${await getAccessToken()}` }, body: form, cache: "no-store" });
    const data = await upload.json() as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } };
    if (!upload.ok || !data.id) return NextResponse.json({ ok: false, message: data.error?.message || "Google Drive recusou o upload." }, { status: 502 });
    return NextResponse.json({ ok: true, file: { id: data.id, name: data.name, webViewLink: data.webViewLink, mimeType: image.contentType } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao salvar no Google Drive." }, { status: 500 });
  }
}
