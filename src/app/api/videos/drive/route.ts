import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getGoogleDriveIntegrationStatus,
  GoogleDriveIntegrationError,
  listDriveVideos,
} from "@/lib/videos/google-drive";

export async function GET() {
  const client = await createServerSupabaseClient();
  if (!client) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const integration = getGoogleDriveIntegrationStatus();
  if (!integration.configured) {
    console.warn("[videos/drive] Google Drive não configurado", { missing: integration.missing });
    return NextResponse.json({
      files: [],
      integration: {
        configured: false,
        status: "missing_config",
        missing: integration.missing,
        message: "Integração Google Drive não configurada no ambiente de produção.",
      },
    });
  }

  try {
    const files = await listDriveVideos();
    return NextResponse.json({
      files,
      integration: { configured: true, status: "ready" },
    });
  } catch (error) {
    if (error instanceof GoogleDriveIntegrationError) {
      console.error("[videos/drive] Falha na integração Google Drive", {
        code: error.code,
        status: error.status,
        message: error.message,
      });
      return NextResponse.json({
        error: error.message,
        integration: { configured: true, status: error.code },
      }, { status: 502 });
    }

    console.error("[videos/drive] Falha inesperada ao listar Google Drive", error);
    return NextResponse.json({ error: "Não foi possível listar o Google Drive." }, { status: 502 });
  }
}
