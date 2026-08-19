import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WEBHOOK_VERIFIED");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.object !== "page") return new NextResponse("Not Found", { status: 404 });

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "feed") continue;
        const value = change.value ?? {};
        if (value.verb !== "add" || !["video", "status", "photo"].includes(value.item)) continue;

        const postId = value.post_id || value.video_id;
        if (postId) {
          await sendTelegramMessage(`[FB Webhook] Publicação confirmada pela Meta: ${postId}.`).catch(() => {});
        }
      }
    }

    // O primeiro comentário pertence ao caminho síncrono de publishToFacebook.
    // O webhook apenas confirma eventos da Meta; não repete o comentário e evita duplicidade.
    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  } catch (error: any) {
    console.error("Erro no Webhook do Facebook:", error);
    await sendTelegramMessage(`[FB Webhook ERRO CRÍTICO] ${error.message}`).catch(() => {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
