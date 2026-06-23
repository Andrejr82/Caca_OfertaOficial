import { hasTelegramEnv } from "@/lib/env";
import https from "https";

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

  // Verifica se a imagem vem da Amazon ou Netshoes (que bloqueiam bots do Telegram)
  const isAmazonImage = photoUrl.includes("amazon.com") || photoUrl.includes("media-amazon.com");
  const isNetshoesImage = photoUrl.includes("netshoes.com.br") || photoUrl.includes("zattini.com.br");

  // Se for protegida, passa pelo Proxy Público (wsrv.nl) para que o Telegram consiga acessar
  const finalPhotoUrl = (isAmazonImage || isNetshoesImage) 
    ? `https://wsrv.nl/?url=${encodeURIComponent(photoUrl)}` 
    : photoUrl;

  if (isAmazonImage || isNetshoesImage) {
    console.log(`[Telegram] Imagem protegida. Usando Proxy WSRV.NL via HTTPS IPv4 para máxima velocidade...`);
  }

  // O envio em formato JSON (ao invés de buffer) garante que o payload tenha apenas ~300 bytes,
  // evitando que a conexão caia por Timeout (ETIMEDOUT) em redes com limites de MTU (Upload)
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: process.env.TELEGRAM_CHANNEL_ID,
      photo: finalPhotoUrl,
      caption: text
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      method: 'POST',
      family: 4, // FORÇAR IPv4 - Corrige bug crítico do Node.js (ETIMEDOUT / ENETUNREACH)
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data) as TelegramSendMessageResponse;
          if (!result.ok || !result.result) {
            reject(new Error(result.description || "Falha ao publicar foto."));
          } else {
            resolve(result.result);
          }
        } catch (e) {
          reject(new Error("Resposta inválida da API do Telegram."));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro de Conexão HTTPS com o Telegram: ${e.message}`));
    });

    req.write(payload);
    req.end();
  });
}
