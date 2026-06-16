import { hasTelegramEnv } from "@/lib/env";

interface TelegramSendMessageResponse {
  ok: boolean;
  result?: {
    message_id: number;
    date: number;
  };
  description?: string;
}

export function isTelegramConfigured() {
  return hasTelegramEnv();
}

export async function testTelegramConnection() {
  if (!isTelegramConfigured()) {
    return { ok: false, message: "Telegram Bot Token ou Channel ID não configurado." };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, {
      cache: "no-store"
    });
    const payload = (await response.json()) as { ok: boolean; description?: string };
    return { ok: payload.ok, message: payload.ok ? "Bot conectado." : payload.description || "Falha ao conectar bot." };
  } catch (error: any) {
    console.error("Telegram GetMe Error:", error);
    return { ok: false, message: `Erro de conexão com o Telegram: ${error.message}` };
  }
}

export async function sendTelegramMessage(text: string) {
  if (!isTelegramConfigured()) {
    throw new Error("Telegram não configurado.");
  }

  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHANNEL_ID,
      text,
      disable_web_page_preview: false
    })
  });

  const payload = (await response.json()) as TelegramSendMessageResponse;
  if (!payload.ok || !payload.result) {
    throw new Error(payload.description || "Falha ao publicar no Telegram.");
  }

  return payload.result;
}

export async function sendTelegramPhoto(text: string, photoUrl: string) {
  if (!isTelegramConfigured()) {
    throw new Error("Telegram não configurado.");
  }

  // Verifica se a imagem vem da Amazon (que bloqueia bots do Telegram)
  const isAmazonImage = photoUrl.includes("amazon.com") || photoUrl.includes("media-amazon.com");

  if (isAmazonImage) {
    console.log("[Telegram] Baixando imagem da Amazon localmente via multipart/form-data...");
    const imageRes = await fetch(photoUrl);
    if (!imageRes.ok) {
      throw new Error(`Falha ao baixar imagem da Amazon. HTTP ${imageRes.status}`);
    }
    const imageBlob = await imageRes.blob();
    
    const formData = new FormData();
    formData.append("chat_id", process.env.TELEGRAM_CHANNEL_ID!);
    formData.append("photo", imageBlob, "offer-image.jpg");
    formData.append("caption", text);

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as TelegramSendMessageResponse;
    if (!payload.ok || !payload.result) {
      throw new Error(payload.description || "Falha ao publicar foto no Telegram via FormData.");
    }

    return payload.result;
  }

  // Fluxo normal via URL para Mercado Livre, etc.
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHANNEL_ID,
      photo: photoUrl,
      caption: text
    })
  });

  const payload = (await response.json()) as TelegramSendMessageResponse;
  if (!payload.ok || !payload.result) {
    throw new Error(payload.description || "Falha ao publicar foto no Telegram.");
  }

  return payload.result;
}
