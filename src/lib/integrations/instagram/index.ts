import { logger } from "@/lib/utils/logger";
import { discoverInstagramBusinessId } from "@/lib/instagram/client"; // Mantendo compatibilidade com o módulo de auth base

const FACEBOOK_GRAPH_API_VERSION = "v19.0";
const BASE_GRAPH_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_API_VERSION}`;

export class InstagramService {
  
  /**
   * Publica imagem única no feed
   */
  async publishFeed(imageUrl: string, caption: string): Promise<string> {
    logger.info("Iniciando publishFeed via InstagramService");
    return this.createAndPublishMedia({ image_url: imageUrl, caption });
  }

  /**
   * Publica um Story 
   */
  async publishStory(imageUrl: string): Promise<string> {
    logger.info("Iniciando publishStory via InstagramService");
    return this.createAndPublishMedia({ image_url: imageUrl, media_type: "STORIES" });
  }

  /**
   * Publica um Reel 
   */
  async publishReel(videoUrl: string, caption: string): Promise<string> {
    logger.info("Iniciando publishReel via InstagramService");
    return this.createAndPublishMedia({ video_url: videoUrl, caption, media_type: "REELS" });
  }

  /**
   * Agenda um post (Feed) a ser acionado posteriormente.
   * O motor de agendamento real ficará a cargo do Inngest (que engatilhará o publishFeed), 
   * mas esta função serve como adaptador se a plataforma Meta for realizar o scheduling interno no futuro.
   */
  async schedulePost(imageUrl: string, caption: string, scheduledTimeUnix: number): Promise<string> {
    logger.info("Iniciando schedulePost (Feed) via InstagramService", { scheduledTimeUnix });
    return this.createAndPublishMedia({ image_url: imageUrl, caption });
  }

  private async createAndPublishMedia(mediaPayload: any): Promise<string> {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN não configurado.");

    const businessAccountId = await discoverInstagramBusinessId();
    
    // Etapa 1: Criar Container
    const mediaUrl = `${BASE_GRAPH_URL}/${businessAccountId}/media`;
    const containerPayload = { ...mediaPayload, access_token: token };
    
    const mediaRes = await fetch(mediaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerPayload),
    });

    const mediaData = await mediaRes.json();
    if (!mediaRes.ok || mediaData.error) {
      throw new Error(`Falha ao criar container: ${mediaData.error?.message || JSON.stringify(mediaData)}`);
    }

    const creationId = mediaData.id;

    // Etapa 2: Polling
    const maxAttempts = 15; // 45s timeout max
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`${BASE_GRAPH_URL}/${creationId}?fields=status_code,status&access_token=${token}`);
      const statusData = await statusRes.json();
      
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        throw new Error(`Erro no processamento Meta: ${statusData.status}`);
      }
      if (attempt === maxAttempts) throw new Error("Timeout aguardando container da Meta ficar pronto.");
    }

    // Etapa 3: Publicar
    const publishPayload: any = { creation_id: creationId, access_token: token };
    
    const publishRes = await fetch(`${BASE_GRAPH_URL}/${businessAccountId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publishPayload),
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok || publishData.error) {
      throw new Error(`Falha ao publicar container: ${publishData.error?.message}`);
    }

    return publishData.id;
  }
}

export const instagramService = new InstagramService();
