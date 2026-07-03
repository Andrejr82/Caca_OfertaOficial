import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { detectWhatsAppTargetKind, resolveConfiguredWhatsAppTargetId } from "@/lib/integrations/whatsapp/target";

const SendMessageSchema = z.object({
  targetId: z.string().min(1, "Target ID é obrigatório"),
  text: z.string().min(1, "Texto é obrigatório"),
  imageUrl: z.string().url("URL de imagem inválida").optional().nullable(),
});

const API_KEY = process.env.WHATSAPP_ENGINE_API_KEY || "local-dev-key";

export class WhatsAppService {
  private engineUrl: string;

  constructor() {
    this.engineUrl = (process.env.WHATSAPP_ENGINE_URL || "http://localhost:3001").replace(/\/+$/, "");
  }

  async getStatus() {
    try {
      const response = await fetch(`${this.engineUrl}/status`, {
        headers: { "x-api-key": API_KEY }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Engine retornou status de erro HTTP ${response.status}`);
      return data || { connected: false };
    } catch (error: any) {
      logger.error("Falha ao checar status do WhatsApp Engine", { error: error.message });
      return { connected: false };
    }
  }

  async getChannelStatus() {
    return this.getStatus();
  }

  async sendMessage(targetId: string, text: string) {
    return this.sendMedia(targetId, text);
  }

  async sendImage(targetId: string, text: string, imageUrl: string) {
    return this.sendMedia(targetId, text, imageUrl);
  }

  async sendMedia(targetId: string, text: string, imageUrl?: string | null, retryCount = 0): Promise<any> {
    try {
      SendMessageSchema.parse({ targetId, text, imageUrl });

      const payload = {
        targetId,
        text,
        imageUrl,
      };

      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 10);
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${hash}`;
      logger.info("Preparando envio para WhatsApp Engine", {
        event: "whatsapp_send_prepare",
        requestId,
        payloadHash: hash,
        targetKind: detectWhatsAppTargetKind(targetId),
        hasImage: Boolean(payload.imageUrl)
      });

      const response = await fetch(`${this.engineUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "x-request-id": requestId,
          "Bypass-Tunnel-Reminder": "true"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorMsg = `Engine falhou com status HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.message) errorMsg = `Engine: ${errData.message}`;
        } catch (parseError) {
          logger.warn("Falha ao ler erro JSON do WhatsApp Engine", {
            event: "whatsapp_engine_error_parse_failed",
            requestId,
            status: response.status,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          });
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data.ok) throw new Error(data.message || "Erro interno do engine");

      logger.info("Publicado no WhatsApp", {
        event: "whatsapp_send_success",
        requestId: data.requestId || requestId,
        messageId: data.messageId,
        jid: data.jid,
        sender: data.sender,
        status: data.status,
        targetKind: detectWhatsAppTargetKind(targetId),
        engineUrl: this.engineUrl
      });
      return {
        success: true,
        messageId: data.messageId,
        provider: "whatsapp",
        requestId: data.requestId || requestId,
        engine: data
      };
      
    } catch (error: any) {
      logger.error("Erro ao publicar no WhatsApp", error, {
        event: "whatsapp_send_failed",
        targetId,
        targetKind: detectWhatsAppTargetKind(targetId),
        retryCount
      });
      
      if (retryCount < 2) {
        const delay = 2000 * Math.pow(2, retryCount);
        logger.warn("Retentando envio para WhatsApp", {
          event: "whatsapp_send_retry",
          targetId,
          delay,
          nextAttempt: retryCount + 1
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.sendMedia(targetId, text, imageUrl, retryCount + 1);
      }

      throw new Error(`Falha definitiva ao enviar WhatsApp: ${error.message}`);
    }
  }

  async sendChannelMessage(channelId: string, text: string) {
    return this.sendMessage(channelId, text);
  }

  async sendChannelImage(channelId: string, text: string, imageUrl: string) {
    return this.sendImage(channelId, text, imageUrl);
  }

  async sendChannelMedia(channelId: string, text: string, imageUrl?: string | null, retryCount = 0): Promise<any> {
    return this.sendMedia(channelId, text, imageUrl, retryCount);
  }

  getDefaultTargetId() {
    return resolveConfiguredWhatsAppTargetId();
  }
}

export const whatsappService = new WhatsAppService();
