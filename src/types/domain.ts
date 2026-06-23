export const platforms = ["Shopee", "Amazon", "Magalu", "Mercado Livre", "Shein", "Netshoes", "Outro"] as const;
export const offerStatuses = ["draft", "approved", "posted", "rejected"] as const;
export const channels = ["telegram", "instagram", "whatsapp", "facebook", "site", "blog"] as const;
export const saleStatuses = ["pending", "confirmed", "cancelled"] as const;

export type Platform = (typeof platforms)[number];
export type OfferStatus = (typeof offerStatuses)[number];
export type Channel = (typeof channels)[number];
export type SaleStatus = (typeof saleStatuses)[number];

export interface Offer {
  id: string;
  user_id: string;
  platform: Platform;
  product_name: string;
  category: string | null;
  original_url: string;
  image_url: string | null;
  current_price: number;
  old_price: number | null;
  coupon: string | null;
  rating: number | null;
  estimated_commission: number | null;
  commission_rate: number | null;
  score: number;
  legacy_score?: number | null;
  new_score?: number | null;
  explainability?: any;
  status: OfferStatus;
  notes: string | null;
  seasonality: number | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateLink {
  id: string;
  user_id: string;
  offer_id: string;
  channel: Channel;
  original_url: string;
  tracked_url: string;
  sub_id: string;
  clicks: number;
  created_at: string;
}

export interface Sale {
  id: string;
  user_id: string;
  offer_id: string;
  affiliate_link_id: string | null;
  channel: Channel;
  gross_value: number;
  commission_value: number;
  status: SaleStatus;
  sold_at: string;
  created_at: string;
}
