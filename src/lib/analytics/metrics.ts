export type ClickEventMetric = {
  affiliate_link_id: string;
  created_at?: string | null;
  source?: string | null;
  device_type?: string | null;
};

export type SaleMetric = {
  status?: string | null;
  offer_id?: string | null;
  affiliate_link_id?: string | null;
  channel?: string | null;
  gross_value?: number | null;
  commission_value?: number | null;
};

export const UNATTRIBUTED_LABEL = "Não atribuída";

export function isUnattributedSale(sale: SaleMetric): boolean {
  return !sale.offer_id && !sale.affiliate_link_id && !sale.channel;
}

export function summarizeSales(sales: SaleMetric[]) {
  const confirmed = sales.filter((sale) => sale.status === "confirmed");
  const addBreakdown = (key: "channel" | "offer_id") => {
    const groups = new Map<string, { sales: number; revenue: number }>();
    for (const sale of confirmed) {
      const value = key === "channel" ? sale.channel : sale.offer_id;
      const label = value || UNATTRIBUTED_LABEL;
      const current = groups.get(label) || { sales: 0, revenue: 0 };
      current.sales += 1;
      current.revenue += Number(sale.commission_value || 0);
      groups.set(label, current);
    }
    return [...groups.entries()].map(([label, values]) => key === "channel"
      ? { channel: label, ...values }
      : { offer: label, ...values });
  };

  const unattributed = confirmed.filter(isUnattributedSale);
  return {
    totalSales: confirmed.length,
    totalRevenue: confirmed.reduce((sum, sale) => sum + Number(sale.commission_value || 0), 0),
    unattributedSales: unattributed.length,
    unattributedRevenue: unattributed.reduce((sum, sale) => sum + Number(sale.commission_value || 0), 0),
    channelBreakdown: addBreakdown("channel"),
    offerBreakdown: addBreakdown("offer_id"),
  };
}

const KNOWN_SOURCES = ["facebook", "telegram", "whatsapp", "instagram"] as const;

export function normalizeTrafficSource(source: string | null | undefined): string {
  const value = String(source || "").trim().toLowerCase();
  if (!value) return "direct/other";

  let host = value;
  try {
    host = new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    // Keep raw value for the fallback substring checks below.
  }

  const normalizedHost = host.replace(/^www\./, "");
  if (normalizedHost === "t.me" || normalizedHost.endsWith(".t.me")) return "telegram";
  if (normalizedHost === "wa.me" || normalizedHost.endsWith(".wa.me")) return "whatsapp";
  if (normalizedHost === "fb.me" || normalizedHost.endsWith(".fb.me")) return "facebook";
  if (normalizedHost === "ig.me" || normalizedHost.endsWith(".ig.me")) return "instagram";

  const knownSource = KNOWN_SOURCES.find((candidate) =>
    normalizedHost === candidate || normalizedHost.endsWith(`.${candidate}.com`)
      || normalizedHost.includes(candidate)
      || value.includes(candidate),
  );

  return knownSource || "direct/other";
}

export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

export function getBrtDayKey(dateInput: string | number | Date): string {
  const date = typeof dateInput === "string" || typeof dateInput === "number" ? new Date(dateInput) : dateInput;
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getBrtCivilWindowStart(days: number, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  const offsetDays = Math.max(0, days - 1);
  const todayUtcMidnight = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), 3, 0, 0, 0);
  const windowStartMs = todayUtcMidnight - offsetDays * 24 * 60 * 60 * 1000;
  return new Date(windowStartMs);
}

export function countClicksByAffiliateLink(events: ClickEventMetric[]): Record<string, number> {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.affiliate_link_id] = (counts[event.affiliate_link_id] || 0) + 1;
    return counts;
  }, {});
}

export function summarizeClickEvents(events: ClickEventMetric[], sales: SaleMetric[] = []) {
  const sourceBreakdown = events.reduce<Record<string, number>>((counts, event) => {
    const source = normalizeTrafficSource(event.source);
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});

  const trafficByDate = events.reduce<Record<string, number>>((counts, event) => {
    if (!event.created_at) return counts;
    const date = getBrtDayKey(event.created_at);
    if (!date) return counts;
    counts[date] = (counts[date] || 0) + 1;
    return counts;
  }, {});

  return {
    totalClicks: events.length,
    totalSales: summarizeSales(sales).totalSales,
    sourceData: Object.entries(sourceBreakdown)
      .sort(([, left], [, right]) => right - left)
      .map(([source, count]) => ({ source, count })),
    trafficTrends: Object.entries(trafficByDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, clicks]) => ({ date, clicks })),
  };
}
