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

    if (videoUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/videos`;
      payload.file_url = videoUrl;
      payload.description = message;
      delete payload.message;
    } else if (imageUrl) {
      // Se houver imagem, publica como Foto
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

    logger.info("Publicação no Facebook concluída", { id: data.id });
    
    // Se existir affiliateLink, publica no primeiro comentário da postagem
    if (affiliateLink) {
      try {
        await fetch(`https://graph.facebook.com/v19.0/${data.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `🛒 Compre aqui: ${affiliateLink}`,
            access_token: token
          })
        });
        logger.info("Comentário com link adicionado no Facebook", { postId: data.id });
      } catch (err: any) {
        logger.error("Falha ao adicionar comentário no Facebook", { error: err.message });
      }
    }
    
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
