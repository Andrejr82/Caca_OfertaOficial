import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const SendMessageSchema = z.object({
  channelId: z.string().min(1, "Channel ID é obrigatório"),
  text: z.string().min(1, "Texto é obrigatório"),
  imageUrl: z.string().url("URL de imagem inválida").optional().nullable(),
});

const API_KEY = process.env.WHATSAPP_ENGINE_API_KEY || "local-dev-key";

export class WhatsAppService {
  private engineUrl: string;

  constructor() {
    this.engineUrl = process.env.WHATSAPP_ENGINE_URL || "http://localhost:3001";
  }

  async getChannelStatus() {
    try {
      const response = await fetch(`${this.engineUrl}/status`, {
        headers: { "x-api-key": API_KEY }
      });
      if (!response.ok) throw new Error("Engine retornou status de erro");
      return await response.json();
    } catch (error: any) {
      logger.error("Falha ao checar status do WhatsApp Engine", { error: error.message });
      return { connected: false };
    }
  }

  async sendChannelMessage(channelId: string, text: string) {
    return this.sendChannelMedia(channelId, text);
  }

  async sendChannelImage(channelId: string, text: string, imageUrl: string) {
    return this.sendChannelMedia(channelId, text, imageUrl);
  }

  async sendChannelMedia(channelId: string, text: string, imageUrl?: string | null, retryCount = 0): Promise<any> {
    try {
      // 1. Validar requisição com Zod
      SendMessageSchema.parse({ channelId, text, imageUrl });

      const payload = {
        number: channelId,
        text,
        imageUrl,
      };

      // 2. Disparar contra o engine local (com retry)
      const response = await fetch(`${this.engineUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Engine falhou com status HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.ok) throw new Error(data.message || "Erro interno do engine");

      logger.info(`✅ Publicado no WhatsApp Canal ${channelId}`, { messageId: data.messageId });
      return { success: true, messageId: data.messageId, provider: "whatsapp" };
      
    } catch (error: any) {
      logger.error(`❌ Erro ao publicar no WhatsApp Canal ${channelId}`, { error: error.message });
      
      // 3. Resiliência: Retry Exponencial (Rate Limiting handling passivo)
      if (retryCount < 2) {
        const delay = 2000 * Math.pow(2, retryCount); // 2s, 4s
        logger.warn(`🔄 Retentando envio para ${channelId} em ${delay}ms... (Tentativa ${retryCount + 1})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendChannelMedia(channelId, text, imageUrl, retryCount + 1);
      }

      throw new Error(`Falha definitiva ao enviar WhatsApp: ${error.message}`);
    }
  }
}

export const whatsappService = new WhatsAppService();
