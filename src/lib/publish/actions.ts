"use server";

import type { Channel, Offer } from "@/types/domain";

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: use official curation, AI and publication screens";

interface QuickPostResult {
  ok: boolean;
  message: string;
  status?: string;
  offer?: Offer;
  trackedUrl?: string;
  copy?: string;
  copies?: { telegram: string; whatsapp: string; instagram: string };
}

export async function generateQuickPostAction(affiliateUrl: string, channel: Channel): Promise<QuickPostResult> {
  void affiliateUrl;
  void channel;
  return { ok: false, status: "DISABLED", message: PARALLEL_COMPONENT_DISABLED };
}

export async function publishToTelegramAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: PARALLEL_COMPONENT_DISABLED };
}

export async function publishToInstagramAction(caption: string, imageUrl: string, offerId?: string) {
  void caption;
  void imageUrl;
  void offerId;
  return { ok: false, message: PARALLEL_COMPONENT_DISABLED };
}

export async function publishToWhatsAppAction(text: string, imageUrl?: string) {
  void text;
  void imageUrl;
  return { ok: false, message: PARALLEL_COMPONENT_DISABLED };
}
