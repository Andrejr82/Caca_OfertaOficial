import { channels, saleStatuses, type SaleStatus } from "@/types/domain";

export type SalesChannel = Extract<(typeof channels)[number], "telegram" | "instagram" | "whatsapp">;
export type MarketplaceName = "Shopee" | "Mercado Livre";
export type SaleAttributionMethod = "sub_id" | "affiliate_link_id" | "channel_only" | "unattributed";

export type MarketplaceSaleInput = {
  marketplace: string;
  userId: string;
  sourceEventId: string;
  offerId: string;
  affiliateLinkId?: string | null;
  subId?: string | null;
  channel?: string | null;
  grossValue: number | string;
  commissionValue: number | string;
  status: string;
  soldAt: string;
};

export type AffiliateLinkReference = {
  id: string;
  sub_id: string;
  offer_id: string;
  channel: SalesChannel;
};

export type CanonicalSale = {
  user_id: string;
  offer_id: string | null;
  affiliate_link_id: string | null;
  channel: SalesChannel | null;
  gross_value: number;
  commission_value: number;
  status: SaleStatus;
  sold_at: string;
  marketplace: MarketplaceName;
  source_event_id: string;
  attribution_method: SaleAttributionMethod;
  source_sub_id: string | null;
  link_resolution: "matched" | "missing";
};

type SalesRepository = {
  upsert: (row: CanonicalSale, options: { onConflict: string }) => Promise<{ data?: Array<{ id: string }> | null; error?: { message: string } | null }>;
};

export function createSupabaseSalesRepository(supabase: {
  from: (table: "sales") => {
    upsert: (row: CanonicalSale, options: { onConflict: string }) => {
      select: (columns: string) => Promise<{ data?: Array<{ id: string }> | null; error?: { message: string } | null }>;
    };
  };
}): SalesRepository {
  return {
    upsert: (row, options) => supabase.from("sales").upsert(row, options).select("id"),
  };
}

const STATUS_ALIASES: Record<string, SaleStatus> = {
  pending: "pending",
  pendente: "pending",
  processing: "pending",
  review: "pending",
  approved: "confirmed",
  confirmed: "confirmed",
  paid: "confirmed",
  validated: "confirmed",
  completed: "confirmed",
  cancelled: "cancelled",
  canceled: "cancelled",
  refunded: "cancelled",
  reversed: "cancelled",
  rejected: "cancelled",
};

function normalizeMarketplace(value: string): MarketplaceName {
  const normalized = value.trim().toLowerCase().replace(/[._-]/g, " ");
  if (normalized === "shopee") return "Shopee";
  if (normalized === "mercado livre" || normalized === "mercadolivre" || normalized === "mercadolibre") {
    return "Mercado Livre";
  }
  throw new Error(`Marketplace de venda não suportado: ${value}`);
}

function normalizeStatus(value: string): SaleStatus {
  const status = STATUS_ALIASES[value.trim().toLowerCase()];
  if (!status) throw new Error(`Status de venda não suportado: ${value}`);
  return status;
}

function normalizeMoney(value: number | string, field: string): number {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return Number(value.toFixed(2));
    throw new Error(`${field} inválido`);
  }

  const normalized = value.trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  const parsed = normalized.includes(",")
    ? Number(normalized.replace(/\./g, "").replace(",", "."))
    : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} inválido`);
  return parsed;
}

function normalizeChannel(value: string | null | undefined): SalesChannel | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "telegram" || normalized === "instagram" || normalized === "whatsapp"
    ? normalized
    : null;
}

function resolveLink(input: MarketplaceSaleInput, links: AffiliateLinkReference[]) {
  if (input.affiliateLinkId) {
    const direct = links.find((link) => link.id === input.affiliateLinkId);
    if (direct) return { link: direct, method: "affiliate_link_id" as const };
  }
  if (input.subId) {
    const bySubId = links.find((link) => link.sub_id === input.subId);
    if (bySubId) return { link: bySubId, method: "sub_id" as const };
  }
  return null;
}

export function normalizeMarketplaceSale(
  input: MarketplaceSaleInput,
  links: AffiliateLinkReference[],
): CanonicalSale {
  if (!input.sourceEventId.trim()) throw new Error("sourceEventId é obrigatório para idempotência");
  if (!input.userId.trim()) throw new Error("userId é obrigatório");

  const soldAt = new Date(input.soldAt);
  if (Number.isNaN(soldAt.getTime())) throw new Error("soldAt inválido");

  const resolution = resolveLink(input, links);
  const link = resolution?.link ?? null;
  const channel = link?.channel || normalizeChannel(input.channel);
  const attributionMethod: SaleAttributionMethod = resolution?.method
    ?? (channel ? "channel_only" : "unattributed");

  return {
    user_id: input.userId,
    offer_id: input.offerId.trim() || link?.offer_id || null,
    affiliate_link_id: link?.id || null,
    channel,
    gross_value: normalizeMoney(input.grossValue, "grossValue"),
    commission_value: normalizeMoney(input.commissionValue, "commissionValue"),
    status: normalizeStatus(input.status),
    sold_at: soldAt.toISOString(),
    marketplace: normalizeMarketplace(input.marketplace),
    source_event_id: input.sourceEventId.trim(),
    attribution_method: attributionMethod,
    source_sub_id: input.subId?.trim() || null,
    link_resolution: link ? "matched" : "missing",
  };
}

export async function upsertCanonicalSale(sale: CanonicalSale, repository: SalesRepository) {
  const { data, error } = await repository.upsert(
    sale,
    { onConflict: "user_id,marketplace,source_event_id" },
  );
  if (error) throw new Error(`Falha ao upsertar venda canônica: ${error.message}`);

  return { status: "upserted" as const, id: data?.[0]?.id || null };
}

export function isCanonicalSaleStatus(value: string): value is SaleStatus {
  return (saleStatuses as readonly string[]).includes(value);
}
