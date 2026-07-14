export type PublishChannel = "TELEGRAM" | "WHATSAPP" | "INSTAGRAM";

export interface OfferData {
  title: string;
  price: number;
  oldPrice?: number | null;
  imageUrl?: string | null;
  platform: string;
  url: string;
}

const PARALLEL_COMPONENT_DISABLED = "PARALLEL_COMPONENT_DISABLED: channel selection belongs to official persisted posts";

export function routeOffer(offer: OfferData): PublishChannel[] {
  void offer;
  throw new Error(PARALLEL_COMPONENT_DISABLED);
}
