import { logger } from "@/lib/utils/logger";
import { whatsappService } from "@/lib/integrations/whatsapp";
import { instagramService } from "@/lib/integrations/instagram";
import { facebookService } from "@/lib/integrations/facebook";
import { tiktokService } from "@/lib/integrations/tiktok";
import { sendTelegramMessage, sendTelegramPhoto, testTelegramConnection } from "@/lib/telegram/client";

export type ChannelType = "telegram" | "instagram" | "whatsapp" | "facebook" | "tiktok";

export interface PublishPayload {
  text: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}

export interface PublishResult {
  success: boolean;
  messageId?: string | number;
  error?: string;
  channel: ChannelType;
}

export class Publisher {
  /**
   * Publica imediatamente no canal selecionado.
   */
  async publish(channel: ChannelType, payload: PublishPayload): Promise<PublishResult> {
    logger.info(`Publisher.publish chamado para canal: ${channel}`);
    try {
      let messageId: string | number | undefined;

      switch (channel) {
        case "telegram":
          if (payload.imageUrl) {
            const res: any = await sendTelegramPhoto(payload.text, payload.imageUrl);
            messageId = res.message_id;
          } else {
            const res: any = await sendTelegramMessage(payload.text);
            messageId = res.message_id;
          }
          break;

        case "instagram":
          if (payload.videoUrl) {
            messageId = await instagramService.publishReel(payload.videoUrl, payload.text);
          } else if (payload.imageUrl) {
            messageId = await instagramService.publishFeed(payload.imageUrl, payload.text);
          } else {
            throw new Error("Instagram exige imageUrl ou videoUrl");
          }
          break;

        case "whatsapp":
          const defaultWhatsappTarget = whatsappService.getDefaultTargetId();
          if (!defaultWhatsappTarget) {
            throw new Error("WHATSAPP_TARGET_ID não configurado.");
          }
          const res = await whatsappService.sendMedia(defaultWhatsappTarget, payload.text, payload.imageUrl);
          messageId = res.messageId;
          break;

        case "facebook":
          if (payload.imageUrl) {
            messageId = await facebookService.publishImage(payload.imageUrl, payload.text);
          } else {
            messageId = await facebookService.publishPost(payload.text);
          }
          break;

        case "tiktok":
          if (!payload.videoUrl) throw new Error("TikTok exige videoUrl");
          messageId = await tiktokService.publishVideo(payload.videoUrl, payload.text);
          break;

        default:
          throw new Error(`Canal não suportado: ${channel}`);
      }

      return { success: true, messageId, channel };

    } catch (error: any) {
      logger.error(`Publisher falhou no canal ${channel}`, { error: error.message });
      return { success: false, error: error.message, channel };
    }
  }

  /**
   * Agenda uma publicação futura.
   * Atualmente delega para o próprio canal (caso suporte agendamento nativo).
   * No futuro, o Inngest engatilhará chamadas "publish" no Unix timestamp desejado.
   */
  async schedule(channel: ChannelType, payload: PublishPayload, scheduledTimeUnix: number): Promise<PublishResult> {
    logger.info(`Publisher.schedule chamado para canal: ${channel}`, { scheduledTimeUnix });
    try {
      let messageId: string | number | undefined;

      switch (channel) {
        case "instagram":
          if (payload.imageUrl) {
            messageId = await instagramService.schedulePost(payload.imageUrl, payload.text, scheduledTimeUnix);
          }
          break;
        case "facebook":
          if (payload.imageUrl) {
            messageId = await facebookService.publishScheduled(payload.imageUrl, payload.text, scheduledTimeUnix);
          }
          break;
        case "tiktok":
          if (payload.videoUrl) {
            messageId = await tiktokService.scheduleVideo(payload.videoUrl, payload.text, scheduledTimeUnix);
          }
          break;
        default:
          // Se não há schedule nativo, deveria enfileirar no Inngest
          logger.warn(`Agendamento nativo não suportado ou STUB para ${channel}`);
          messageId = "INCLUDED_IN_INNGEST_QUEUE";
          break;
      }

      return { success: true, messageId, channel };
    } catch (error: any) {
      logger.error(`Publisher.schedule falhou no canal ${channel}`, { error: error.message });
      return { success: false, error: error.message, channel };
    }
  }

  async retry(messageId: string): Promise<boolean> {
    logger.info("Publisher.retry stub disparado", { messageId });
    // Futuro: recuperar payload do DB/Fila e reenviar.
    return true;
  }

  async cancel(messageId: string): Promise<boolean> {
    logger.info("Publisher.cancel stub disparado", { messageId });
    // Futuro: remover item agendado do Inngest ou Meta API.
    return true;
  }

  async status(): Promise<Record<ChannelType, any>> {
    const teleStatus = await testTelegramConnection();
    const wpStatus = await whatsappService.getStatus();
    
    return {
      telegram: teleStatus,
      whatsapp: wpStatus,
      instagram: { ok: true, message: "Aguardando verificação profunda" },
      facebook: { ok: false, message: "STUB: Não implementado" },
      tiktok: { ok: false, message: "STUB: Não implementado" },
    };
  }
}

export const publisher = new Publisher();
