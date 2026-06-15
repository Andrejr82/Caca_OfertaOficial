import { logger } from "@/lib/utils/logger";

/**
 * ⚠️ PREPARADO PARA IMPLEMENTAÇÃO
 * 
 * Serviço de Integração com Facebook Graph API.
 * 
 * Atualmente marcado como STUB. 
 * Nenhuma chamada real deve ser feita até a obtenção e validação do:
 * - App ID
 * - App Secret
 * - Access Token
 */
export class FacebookService {
  
  async publishPost(text: string): Promise<string> {
    logger.warn("FacebookService.publishPost disparado (STUB mode). Nenhuma chamada real efetuada.");
    return "FB_STUB_POST_ID";
  }

  async publishImage(imageUrl: string, text: string): Promise<string> {
    logger.warn("FacebookService.publishImage disparado (STUB mode). Nenhuma chamada real efetuada.", { imageUrl });
    return "FB_STUB_IMAGE_ID";
  }

  async publishScheduled(imageUrl: string, text: string, scheduledTimeUnix: number): Promise<string> {
    logger.warn("FacebookService.publishScheduled disparado (STUB mode). Nenhuma chamada real efetuada.", { scheduledTimeUnix });
    return "FB_STUB_SCHEDULED_ID";
  }
}

export const facebookService = new FacebookService();
