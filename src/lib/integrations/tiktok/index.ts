import { logger } from "@/lib/utils/logger";

/**
 * ⚠️ PREPARADO PARA IMPLEMENTAÇÃO
 * 
 * Serviço de Integração com TikTok Content Posting API.
 * 
 * Atualmente marcado como STUB. 
 * Nenhuma chamada real deve ser feita até a obtenção e validação do:
 * - App ID
 * - Access Token (OAuth2)
 * - Permissões de publicação aprovadas
 */
export class TikTokService {
  
  async publishVideo(videoUrl: string, caption: string): Promise<string> {
    logger.warn("TikTokService.publishVideo disparado (STUB mode). Nenhuma chamada real efetuada.", { videoUrl });
    return "TIKTOK_STUB_VIDEO_ID";
  }

  async scheduleVideo(videoUrl: string, caption: string, scheduledTimeUnix: number): Promise<string> {
    logger.warn("TikTokService.scheduleVideo disparado (STUB mode). Nenhuma chamada real efetuada.", { videoUrl, scheduledTimeUnix });
    return "TIKTOK_STUB_SCHEDULED_ID";
  }
}

export const tiktokService = new TikTokService();
