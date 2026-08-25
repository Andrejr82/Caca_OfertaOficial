import { buildCanonicalCopyV5ChannelDraft } from "@/core/ai/official-ai-service";
import type { OfficialAIChannel } from "@/core/ai/types";

type ReelsSocialOffer = {
  product_name: string;
  platform: string;
  category?: string | null;
  current_price: number;
  old_price?: number | null;
  shipping_free?: boolean | null;
  explainability?: Record<string, unknown> | null;
  marketplace_metrics?: Record<string, unknown> | null;
};

type ReelsSocialDraftInput = {
  content: string;
  offers?: ReelsSocialOffer | ReelsSocialOffer[] | null;
};

export function buildReelsSocialDraftContent(
  post: ReelsSocialDraftInput,
  channel: Extract<OfficialAIChannel, "facebook" | "instagram">,
): string {
  const offer = Array.isArray(post.offers) ? post.offers[0] : post.offers;
  if (!offer?.product_name || !offer.platform || !(Number(offer.current_price) > 0)) {
    return post.content;
  }

  return buildCanonicalCopyV5ChannelDraft(
    {
      productName: offer.product_name,
      marketplace: offer.platform,
      category: offer.category ?? null,
      currentPrice: Number(offer.current_price),
      originalPrice: offer.old_price == null ? null : Number(offer.old_price),
      freeShipping: offer.shipping_free ?? null,
      evidence: {
        ...(offer.explainability ?? {}),
        marketplace_metrics: {
          ...((offer.explainability?.marketplace_metrics && typeof offer.explainability.marketplace_metrics === "object")
            ? offer.explainability.marketplace_metrics as Record<string, unknown>
            : {}),
          ...(offer.marketplace_metrics ?? {}),
        },
      },
    },
    channel,
  );
}
