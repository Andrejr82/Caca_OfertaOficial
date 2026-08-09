export type ClickEventMetric = {
  affiliate_link_id: string;
  created_at?: string | null;
  source?: string | null;
  device_type?: string | null;
};

type SaleMetric = { status?: string | null };

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
  const knownSource = KNOWN_SOURCES.find((candidate) =>
    normalizedHost === candidate || normalizedHost.endsWith(`.${candidate}.com`)
      || normalizedHost.includes(candidate)
      || value.includes(candidate),
  );

  return knownSource || "direct/other";
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
    const date = new Date(event.created_at).toISOString().slice(0, 10);
    counts[date] = (counts[date] || 0) + 1;
    return counts;
  }, {});

  return {
    totalClicks: events.length,
    totalSales: sales.filter((sale) => sale.status === "confirmed").length,
    sourceData: Object.entries(sourceBreakdown)
      .sort(([, left], [, right]) => right - left)
      .map(([source, count]) => ({ source, count })),
    trafficTrends: Object.entries(trafficByDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, clicks]) => ({ date, clicks })),
  };
}
