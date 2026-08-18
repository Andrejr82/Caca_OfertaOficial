import { logger } from "@/lib/utils/logger";
import { hasFacebookEnv } from "@/lib/env";

export interface FacebookPublishResponse {
  success: boolean;
  message: string;
  postId?: string;
  commentStatus?: "published" | "failed" | "not_requested";
  commentId?: string;
  commentError?: string;
  error?: any;
}

function stripAffiliateLinkFromMessage(message: string, affiliateLink?: string | null) {
  const trackedUrl = affiliateLink?.trim();
  if (!trackedUrl || !message.includes(trackedUrl)) return message;

  return message
    .replaceAll(trackedUrl, "")
    .replace(/^[ \t]*👉[ \t]*$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

async function publishFirstComment(postId: string, affiliateLink: string, accessToken: string) {
  const response = await fetch(`https://graph.facebook.com/v19.0/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `🛒 Compre aqui: ${affiliateLink}`,
      access_token: accessToken,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Facebook comment Graph API (${response.status})`;
    return { status: "failed" as const, error: message };
  }

  return { status: "published" as const, id: String(data.id || "") };
}

export async function publishToFacebook(
  message: string,
  imageUrl?: string | null,
  videoUrl?: string | null,
  affiliateLink?: string | null
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
    const pageTokenRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${token}`);
    if (pageTokenRes.ok) {
      const pageTokenData = await pageTokenRes.json();
      if (pageTokenData.access_token) token = pageTokenData.access_token;
    }

    const publicMessage = stripAffiliateLinkFromMessage(message, affiliateLink);
    let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    const payload: any = {
      message: publicMessage,
      access_token: token,
    };

    if (videoUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
      payload.file_url = videoUrl;
      payload.description = publicMessage;
      delete payload.message;
    } else if (imageUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      payload.url = imageUrl;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const graphMessage = data?.error?.message || "Erro na API do Facebook.";
      logger.error("Falha ao publicar no Facebook", { endpoint, status: response.status, data });
      return {
        success: false,
        message: `Facebook Graph API (${response.status}): ${graphMessage}`,
        error: data,
      };
    }

    const postId = String(data.post_id || data.id || "");
    if (!postId) {
      return {
        success: false,
        message: "Facebook não retornou o identificador da publicação.",
        error: data,
      };
    }

    logger.info("Publicação no Facebook concluída", { postId });

    if (!affiliateLink?.trim()) {
      return {
        success: true,
        message: "Publicado com sucesso no Facebook.",
        postId,
        commentStatus: "not_requested",
      };
    }

    const comment = await publishFirstComment(postId, affiliateLink.trim(), String(token || ""));
    if (comment.status === "failed") {
      logger.warn("Publicação concluída, mas o primeiro comentário falhou", { postId, error: comment.error });
      return {
        success: true,
        message: "Publicado no Facebook; comentário automático pendente.",
        postId,
        commentStatus: "failed",
        commentError: comment.error,
      };
    }

    logger.info("Primeiro comentário do Facebook publicado", { postId, commentId: comment.id });
    return {
      success: true,
      message: "Publicado com sucesso no Facebook e comentário adicionado.",
      postId,
      commentStatus: "published",
      commentId: comment.id,
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
