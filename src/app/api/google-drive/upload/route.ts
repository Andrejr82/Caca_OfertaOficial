import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const DEFAULT_FOLDER_ID = "1tj6S-Gr7hxt5RNRIAd7BkpR8_2tuGaFB";
function configured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  );
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "produto.jpg";
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN!,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
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
    if (!configured()) {
      return NextResponse.json({
        ok: false,
        message: "Integração Google Drive não configurada. Adicione GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET e GOOGLE_DRIVE_REFRESH_TOKEN."
      }, { status: 503 });
    }

    const body = await request.json() as { imageUrl?: string; fileName?: string };
    if (!body.imageUrl || !/^https?:\/\//i.test(body.imageUrl)) return NextResponse.json({ ok: false, message: "Imagem inválida." }, { status: 400 });
    const imageResponse = await fetch(body.imageUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" }
    });
    if (!imageResponse.ok) return NextResponse.json({ ok: false, message: "Não foi possível obter a imagem do produto." }, { status: 502 });
    const image = await imageResponse.arrayBuffer();
    if (image.byteLength > 10 * 1024 * 1024) return NextResponse.json({ ok: false, message: "A imagem excede o limite de 10 MB." }, { status: 413 });

    const token = await accessToken();
    const fileName = safeFilename(body.fileName || "produto.jpg");
    const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const metadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID]
    };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([image], { type: mimeType }), fileName);
    const upload = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      cache: "no-store"
    });
    const data = await upload.json() as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } };
    if (!upload.ok || !data.id) return NextResponse.json({ ok: false, message: data.error?.message || "Google Drive recusou o upload." }, { status: 502 });
    return NextResponse.json({ ok: true, file: { id: data.id, name: data.name, webViewLink: data.webViewLink } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha ao salvar no Google Drive." }, { status: 500 });
  }
}
