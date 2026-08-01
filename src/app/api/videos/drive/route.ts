import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listDriveVideos } from "@/lib/videos/google-drive";

export async function GET() {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ files: await listDriveVideos() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível listar o Google Drive." }, { status: 503 });
  }
}
