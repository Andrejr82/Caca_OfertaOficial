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

const LEGACY_PUBLISHER_DISABLED = "LEGACY_PUBLISHER_DISABLED: use publishOfficialPost() through an authenticated official route";

export class Publisher {
  async publish(channel: ChannelType, payload: PublishPayload): Promise<PublishResult> {
    void payload;
    return { success: false, error: LEGACY_PUBLISHER_DISABLED, channel };
  }

  async schedule(channel: ChannelType, payload: PublishPayload, scheduledTimeUnix: number): Promise<PublishResult> {
    void payload;
    void scheduledTimeUnix;
    return { success: false, error: LEGACY_PUBLISHER_DISABLED, channel };
  }

  async retry(messageId: string): Promise<boolean> {
    void messageId;
    return false;
  }

  async cancel(messageId: string): Promise<boolean> {
    void messageId;
    return false;
  }

  async status(): Promise<Record<ChannelType, { ok: false; message: string }>> {
    const disabled = { ok: false as const, message: LEGACY_PUBLISHER_DISABLED };
    return { telegram: disabled, whatsapp: disabled, instagram: disabled, facebook: disabled, tiktok: disabled };
  }
}

export const publisher = new Publisher();
