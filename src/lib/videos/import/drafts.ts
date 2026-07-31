import { generateFacebookMessage, generateInstagramMessage } from "@/lib/messages/generate";

export type ImportedDraftChannel = "instagram" | "facebook";
export type ImportedDraft = { channel: ImportedDraftChannel; content: string; trackedUrl: string };

type OfferWithLinks = {
  affiliate_links?: Array<{ channel: string; tracked_url?: string | null }>;
  [key: string]: unknown;
};

function trackedUrlFor(offer: OfferWithLinks, channel: ImportedDraftChannel) {
  const url = offer.affiliate_links?.find((link) => link.channel === channel)?.tracked_url?.trim();
  if (!url || !/^https:\/\//i.test(url)) throw new Error("NO_MONETIZED_LINK");
  return url;
}

function contentFor(offer: OfferWithLinks, channel: ImportedDraftChannel, trackedUrl: string) {
  const link = { tracked_url: trackedUrl };
  if (channel === "instagram") {
    const generated = generateInstagramMessage(offer as any, link);
    return typeof generated === "string" ? generated : generated.feed;
  }
  return generateFacebookMessage(offer as any, link);
}

export function buildImportedDrafts(offer: OfferWithLinks, channels: ImportedDraftChannel[]): ImportedDraft[] {
  return channels.map((channel) => {
    const trackedUrl = trackedUrlFor(offer, channel);
    return { channel, trackedUrl, content: contentFor(offer, channel, trackedUrl) };
  });
}
