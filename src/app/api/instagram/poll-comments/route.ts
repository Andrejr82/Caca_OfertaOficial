import { NextResponse } from "next/server";
import { pollAndReplyComments } from "@/lib/instagram/comment-polling";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // segundos (Vercel free tier permite até 60s)

/**
 * Cron Job: Polling de Comentários do Instagram
 * 
 * Roda a cada 2 minutos via Vercel Cron.
 * Busca comentários novos com gatilhos ("quero", "link", etc.)
 * e envia Private Reply com o link de afiliado.
 * 
 * Configurar no vercel.json:
 * "crons": [{ "path": "/api/instagram/poll-comments", "schedule": "a cada 2 min" }]
 */
export async function GET(request: Request) {
  // Proteção: aceitar apenas chamadas do Vercel Cron ou com token válido
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Se CRON_SECRET estiver definido, validar. Senão, aceitar (dev mode).
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const result = await pollAndReplyComments();

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[Cron] Erro no polling de comentários:", error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
