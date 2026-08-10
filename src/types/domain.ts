export const platforms = ["Shopee", "Amazon", "Magalu", "Mercado Livre", "Shein", "Netshoes", "Outro"] as const;
export const offerStatuses = ["draft", "approved", "pending_manual_review", "selected", "posted", "rejected", "deferred"] as const;
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
  subcategory?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  source_position?: number | null;
  item_id?: string | null;
  product_id?: string | null;
  seller_id?: string | null;
  seller_name?: string | null;
  shipping_free?: boolean | null;
  source_categories?: unknown[];
  original_url: string;
  image_url: string | null;
  current_price: number;
  old_price: number | null;
  coupon: string | null;
  rating: number | null;
  estimated_commission: number | null;
  commission_rate: number | null;
  shopee_item_id?: string | null;
  shopee_shop_id?: string | null;
  shopee_product_cat_id?: string | null;
  native_category_order?: number | null;
  native_category_position?: number | null;
  is_official_shop?: boolean | null;
  shop_type_tags?: number[] | null;
  marketplace_metrics?: {
    sales?: number;
    discount?: number;
    rating?: number;
    seller?: string | null;
    productCatIds?: string[];
    sellerCommissionRate?: number;
    shopeeCommissionRate?: number;
  } | null;
  score: number;
  official_policy?: number | null;
  historical_policy?: number | null;
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
  offer_id: string | null;
  affiliate_link_id: string | null;
  channel: Channel | null;
  gross_value: number;
  commission_value: number;
  status: SaleStatus;
  sold_at: string;
  created_at: string;
  marketplace?: string | null;
  source_event_id?: string | null;
}

export type DeltaLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CommercialComparison {
  officialPolicy: number;
  commercialPolicy: number;
  delta: number;
  deltaLevel: DeltaLevel;
  changed: boolean;
  confidence: string;
  reasons: string[];
  evaluatedAt: string;
}
