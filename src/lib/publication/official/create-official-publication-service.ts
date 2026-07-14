import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OfficialPublicationChannel,
  PublicationTransportPort,
  PublicationTransportRegistryPort
} from "@/core/publication";
import { TelegramPublicationTransport } from "@/core/publication/transports/telegram-transport";
import { WhatsAppPublicationTransport } from "@/core/publication/transports/whatsapp-transport";
import { InstagramPublicationTransport } from "@/core/publication/transports/instagram-transport";
import { FacebookPublicationTransport } from "@/core/publication/transports/facebook-transport";
import { telegramCaption } from "@/core/publication/transports/telegram-caption";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/telegram/client";
import { whatsappService } from "@/lib/integrations/whatsapp";
import { resolveConfiguredWhatsAppTargetId } from "@/lib/integrations/whatsapp/target";
import { publishToInstagram } from "@/lib/instagram/client";
import { publishToFacebook } from "@/lib/platforms/facebook";
import { createSupabaseStateDependencies } from "@/lib/state/supabase-state-adapter";
import { OfficialPublicationStateAdapter, SupabaseOfficialPublicationAdapter } from "./supabase-official-publication-adapter";

export class OfficialPublicationTransportRegistry implements PublicationTransportRegistryPort {
  private readonly transports: Map<OfficialPublicationChannel, PublicationTransportPort>;

  constructor(transports: readonly PublicationTransportPort[]) {
    this.transports = new Map(transports.map((transport) => [transport.channel, transport]));
  }

  resolve(channel: OfficialPublicationChannel): PublicationTransportPort {
    const transport = this.transports.get(channel);
    if (!transport) throw new Error(`Official publication transport ${channel} is not configured`);
    return transport;
  }
}

function technicalReceiptDependencies() {
  return {
    clock: { now: () => new Date().toISOString() },
    uuid: { generate: () => randomUUID() },
    evidenceHash: (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`
  };
}

function destinations(): Record<OfficialPublicationChannel, string> {
  return {
    telegram: process.env.TELEGRAM_CHANNEL_ID ?? "",
    whatsapp: resolveConfiguredWhatsAppTargetId() ?? "",
    instagram: process.env.INSTAGRAM_ACCESS_TOKEN
      ? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? "auto-discover"
      : "",
    facebook: process.env.FACEBOOK_PAGE_ID ?? ""
  };
}

function createTransportRegistry() {
  const receiptDependencies = technicalReceiptDependencies();
  return new OfficialPublicationTransportRegistry([
    new TelegramPublicationTransport({
      ...receiptDependencies,
      send: async (input) => {
        const result = input.mediaUrl
          ? await sendTelegramPhoto(telegramCaption(input.text), input.mediaUrl) as { message_id: number; date: number }
          : await sendTelegramMessage(input.text);
        return {
          externalId: String(result.message_id),
          sentAt: new Date(result.date * 1000).toISOString()
        };
      }
    }),
    new WhatsAppPublicationTransport({
      ...receiptDependencies,
      send: async (input) => {
        const result = await whatsappService.sendMedia(input.destination, input.text, input.mediaUrl, 2);
        if (!result.messageId) throw new Error("WhatsApp Engine did not return a final message id");
        return {
          externalId: String(result.messageId),
          sentAt: new Date().toISOString(),
          metadata: { requestId: String(result.requestId ?? input.requestId) }
        };
      }
    }),
    new InstagramPublicationTransport({
      ...receiptDependencies,
      send: async (input) => {
        if (input.metadata.instagramMode !== "synchronous") {
          throw new Error("Instagram asynchronous publication is fail-closed until a final receipt is available");
        }
        if (!input.mediaUrl) throw new Error("Instagram synchronous publication requires persisted media");
        const externalId = await publishToInstagram(input.mediaUrl, input.text);
        return { externalId, sentAt: new Date().toISOString(), final: true };
      }
    }),
    new FacebookPublicationTransport({
      ...receiptDependencies,
      send: async (input) => {
        const result = await publishToFacebook(input.text, input.mediaUrl);
        if (!result.success || !result.postId) throw new Error(result.message || "Facebook did not return a final post id");
        return { externalId: String(result.postId), sentAt: new Date().toISOString() };
      }
    })
  ]);
}

export function createOfficialPublicationServiceDependencies(client: SupabaseClient, tenantId: string) {
  const stateDependencies = createSupabaseStateDependencies(client, tenantId);
  const adapter = new SupabaseOfficialPublicationAdapter(client, tenantId, destinations());
  return {
    repository: adapter,
    transports: createTransportRegistry(),
    receipts: adapter,
    reservations: adapter,
    state: new OfficialPublicationStateAdapter(stateDependencies),
    audit: adapter,
    clock: { now: () => new Date().toISOString() },
    uuid: { generate: () => randomUUID() }
  };
}

export function publicationPayloadReference(postId: string) {
  return `post:${postId}:v0`;
}

export function publicationIdempotencyKey(postId: string, channel: OfficialPublicationChannel) {
  return `publication:${postId}:${channel}`;
}
