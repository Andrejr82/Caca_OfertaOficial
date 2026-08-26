import type { OfficialAIChannel } from "./types";

export type CopyV5CommercialAngle =
  | "deep_discount"
  | "high_saving"
  | "saving"
  | "price_threshold"
  | "price"
  | "coupon"
  | "free_shipping"
  | "official_store"
  | "proof"
  | "product"
  | "standard";

export type CopyV5CommercialIntent =
  | "pain"
  | "desire"
  | "routine"
  | "saving"
  | "proof"
  | "product";

export interface CopyV5Facts {
  productName: string;
  shortName?: string | null;
  marketplace: string;
  category: string | null;
  currentPrice: number;
  originalPrice: number | null;
  evidence?: Record<string, unknown>;
  freeShipping?: boolean | null;
}

export interface CopyV5Plan {
  shortProductName: string;
  commercialIntent?: CopyV5CommercialIntent;
  commercialAngle: CopyV5CommercialAngle;
  hook: string;
  benefitLine?: string | null;
  selectedAttributes: string[];
  optionalProofAngle: string | null;
}

export interface CopyV5RenderedResult {
  feed: string;
  firstComment?: string | null;
  trackedUrl?: string | null;
  plan: CopyV5Plan;
}
