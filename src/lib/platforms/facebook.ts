import { logger } from "@/lib/utils/logger";
import { hasFacebookEnv } from "@/lib/env";

export interface FacebookPublishResponse {
  success: boolean;
  message: string;
  postId?: string;
  error?: any;
}

/**
 * Função para publicar um post no Facebook Page usando a Graph API.
 * Atualmente atua como um skeleton para implementação futura caso a key seja preenchida.
 */
export async function publishToFacebook(
  message: string,
  imageUrl?: string | null
): Promise<FacebookPublishResponse> {
  logger.info("Iniciando publicação no Facebook...");

  if (!hasFacebookEnv()) {
    return {
      success: false,
      message: "Credenciais do Facebook não configuradas (.env.local).",
    };
  }

  const pageId = process.env.FACEBOOK_PAGE_ID;
  let token = process.env.FACEBOOK_ACCESS_TOKEN;

  try {
    // Tentar obter o token da página caso o token fornecido seja um User Token
    const pageTokenRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${token}`);
    if (pageTokenRes.ok) {
      const pageTokenData = await pageTokenRes.json();
      if (pageTokenData.access_token) {
        token = pageTokenData.access_token;
      }
    }

    let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    const payload: any = {
      message,
      access_token: token,
    };

    if (imageUrl) {
      // Se houver imagem, publica como Foto
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      payload.url = imageUrl;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error("Falha ao publicar no Facebook", { data });
      return {
        success: false,
        message: data.error?.message || "Erro na API do Facebook.",
        error: data,
      };
    }

    logger.info("Publicação no Facebook concluída", { id: data.id });
    return {
      success: true,
      message: "Publicado com sucesso no Facebook.",
      postId: data.id,
    };
  } catch (error: any) {
    logger.error("Exceção ao tentar publicar no Facebook", { error: error.message });
    return {
      success: false,
      message: "Exceção interna ao comunicar com o Facebook.",
      error: error.message,
    };
  }
}

export async function publishToFacebookReel(videoUrl: string, description: string, trackedUrl?: string): Promise<FacebookPublishResponse> {
  if (!hasFacebookEnv()) return { success: false, message: "Credenciais do Facebook não configuradas (.env.local)." };
  const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_ACCESS_TOKEN!;
  const version = process.env.FACEBOOK_GRAPH_API_VERSION || "v19.0";
  const graph = `https://graph.facebook.com/${version}`;
  const auth = { Authorization: `Bearer ${pageToken}` };
  try {
    const start = await fetch(`${graph}/me/video_reels?upload_phase=start`, { method: "POST", headers: auth });
    const startData = await start.json();
    if (!start.ok || !startData.video_id || !startData.upload_url) return { success: false, message: metaErrorMessage(startData, "Facebook não iniciou o upload do Reel.") };

    const upload = await fetch(startData.upload_url, { method: "POST", headers: { Authorization: `OAuth ${pageToken}`, file_url: videoUrl } });
    const uploadData = await upload.json();
    if (!upload.ok || uploadData.success !== true) return { success: false, message: metaErrorMessage(uploadData, "Facebook não aceitou o vídeo hospedado.") };

    let ready = false;
    const pollAttempts = positiveInteger(process.env.FACEBOOK_REEL_POLL_ATTEMPTS, 60);
    const pollIntervalMs = positiveInteger(process.env.FACEBOOK_REEL_POLL_INTERVAL_MS, 2_000);
    for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
      const statusResponse = await fetch(`${graph}/${encodeURIComponent(startData.video_id)}?fields=status`, { headers: auth });
      const statusData = await statusResponse.json();
      const videoStatus = statusData.status?.video_status;
      if (videoStatus === "ready" || videoStatus === "published") { ready = true; break; }
      if (videoStatus === "error") return { success: false, message: metaErrorMessage(statusData, "Facebook falhou ao processar o Reel.") };
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    if (!ready) return { success: false, message: "Facebook não concluiu o processamento do Reel." };

    const finalDescription = trackedUrl ? `${description}\n\n${trackedUrl}` : description;
    const finish = await fetch(`${graph}/me/video_reels?upload_phase=finish&video_id=${encodeURIComponent(startData.video_id)}&video_state=PUBLISHED&description=${encodeURIComponent(finalDescription)}`, { method: "POST", headers: auth });
    const finishData = await finish.json();
    if (!finish.ok || finishData.success !== true) return { success: false, message: metaErrorMessage(finishData, "Facebook não confirmou a publicação do Reel.") };
    return { success: true, message: "Publicado com sucesso no Facebook.", postId: String(finishData.post_id || finishData.id || startData.video_id) };
  } catch {
    return { success: false, message: "Exceção interna ao comunicar com o Facebook." };
  }
}

function metaErrorMessage(payload: any, fallback: string) {
  const error = payload?.error;
  if (!error?.message) return fallback;
  const code = error.code ?? "?";
  const subcode = error.error_subcode ?? "?";
  return `${error.message} (Meta ${code}/${subcode})`;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
