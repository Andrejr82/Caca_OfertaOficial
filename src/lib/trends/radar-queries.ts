import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface TrendExperimentMetricsView {
  clicks: number;
  orders: number;
  commissionValue: number;
  grossValue: number;
  conversionRate: number;
  windowStart: string | null;
  windowEnd: string | null;
}

export interface TrendRadarSnapshotProductView {
  id: string;
  priority: number;
  productTerm: string;
  normalizedProductTerm: string;
  category: string | null;
  marketplace: string | null;
  evidenceStatus: string;
  sourceCount: number;
  commercialScore: number | null;
  confidence: number;
  directEvidenceSourceUrls: string[];
  scoreBreakdown: Record<string, number>;
  determiningReasons: string[];
  isFocus: boolean;
  opportunityId: string | null;
  price: number | null;
  discountPercent: number | null;
  commissionPercent: number | null;
  sellerCommissionPercent: number | null;
  sales: number | null;
  salesVelocity: number | null;
  velocityStatus: string | null;
  scoreDecision: string | null;
  scoreStrategyVersion: string | null;
  recommendedChannel: string | null;
  recommendedFormat: string | null;
  selectionDecision: string | null;
  selectionDecidedAt: string | null;
  selectedOfferId: string | null;
  executionContext: Record<string, unknown>;
  experimentMetrics: TrendExperimentMetricsView;
}

export interface TrendRadarSnapshotView {
  id: string;
  radarDate: string;
  windowStart: string;
  windowEnd: string;
  strategyVersion: string;
  status: string;
  generatedAt: string;
  sourceHealth: Record<string, unknown>;
  executiveSummary: Record<string, unknown>;
  products: TrendRadarSnapshotProductView[];
}

interface RunRow {
  id: string;
  radar_date: string;
  window_start: string;
  window_end: string;
  strategy_version: string;
  status: string;
  generated_at: string;
  source_health: unknown;
  executive_summary: unknown;
}

interface ProductRow {
  id: string;
  priority: number;
  product_term: string;
  normalized_product_term: string;
  category: string | null;
  marketplace: string | null;
  evidence_status: string;
  source_count: number;
  commercial_score: number | string | null;
  confidence: number | string;
  direct_evidence: unknown;
  score_breakdown: unknown;
  determining_reasons: unknown;
  is_focus: boolean;
  opportunity_id: string | null;
  recommended_channel: string | null;
  recommended_format: string | null;
  selection_decision: string | null;
  selection_decided_at: string | null;
  selected_offer_id: string | null;
  execution_context: unknown;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numericObject(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(object(value)).flatMap(([key, raw]) => {
    const number = Number(raw);
    return Number.isFinite(number) ? [[key, number]] : [];
  }));
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function directEvidence(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value)) return {};
  const first = value.find((item) => item && typeof item === "object" && !Array.isArray(item));
  return first ? first as Record<string, unknown> : {};
}

function directEvidenceSourceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const raw = (item as Record<string, unknown>).source_url;
    const url = typeof raw === "string" ? raw.trim() : "";
    return url ? [url] : [];
  });
  return [...new Set(urls)];
}

function emptyMetrics(start: string | null): TrendExperimentMetricsView {
  const end = start ? new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
  return { clicks: 0, orders: 0, commissionValue: 0, grossValue: 0, conversionRate: 0, windowStart: start, windowEnd: end };
}

export function mapTrendRadarSnapshotView(run: RunRow, products: ProductRow[]): TrendRadarSnapshotView {
  return {
    id: run.id,
    radarDate: run.radar_date,
    windowStart: run.window_start,
    windowEnd: run.window_end,
    strategyVersion: run.strategy_version,
    status: run.status,
    generatedAt: run.generated_at,
    sourceHealth: object(run.source_health),
    executiveSummary: object(run.executive_summary),
    products: products.map((row) => {
      const evidence = directEvidence(row.direct_evidence);
      const commercial = object(evidence.commercial_metrics);
      const temporal = object(evidence.temporal_metrics);
      return {
        id: row.id,
        priority: row.priority,
        productTerm: row.product_term,
        normalizedProductTerm: row.normalized_product_term,
        category: row.category,
        marketplace: row.marketplace,
        evidenceStatus: row.evidence_status,
        sourceCount: row.source_count,
        commercialScore: row.commercial_score === null ? null : Number(row.commercial_score),
        confidence: Number(row.confidence),
        directEvidenceSourceUrls: directEvidenceSourceUrls(row.direct_evidence),
        scoreBreakdown: numericObject(row.score_breakdown),
        determiningReasons: strings(row.determining_reasons),
        isFocus: row.is_focus,
        opportunityId: row.opportunity_id,
        price: finiteNumber(evidence.price ?? commercial.price),
        discountPercent: finiteNumber(evidence.discount_percent ?? commercial.priceDiscountRate),
        commissionPercent: finiteNumber(commercial.commissionRate),
        sellerCommissionPercent: finiteNumber(commercial.sellerCommissionRate),
        sales: finiteNumber(evidence.sold_quantity ?? commercial.sales),
        salesVelocity: finiteNumber(temporal.sales_velocity),
        velocityStatus: typeof temporal.velocity_status === "string" ? temporal.velocity_status : null,
        scoreDecision: typeof evidence.decision === "string" ? evidence.decision : null,
        scoreStrategyVersion: typeof evidence.strategy_version === "string" ? evidence.strategy_version : null,
        recommendedChannel: row.recommended_channel,
        recommendedFormat: row.recommended_format,
        selectionDecision: row.selection_decision,
        selectionDecidedAt: row.selection_decided_at,
        selectedOfferId: row.selected_offer_id,
        executionContext: object(row.execution_context),
        experimentMetrics: emptyMetrics(row.selection_decided_at),
      };
    }).sort((a, b) => a.priority - b.priority),
  };
}

export async function listLatestTrendRadarSnapshot(): Promise<TrendRadarSnapshotView | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data: runs, error: runError } = await supabase.from("trend_radar_runs")
    .select("id,radar_date,window_start,window_end,strategy_version,status,generated_at,source_health,executive_summary")
    .eq("status", "completed")
    .order("generated_at", { ascending: false }).limit(1);
  const run = runs?.[0] as RunRow | undefined;
  if (runError || !run) return null;

  const { data: products, error: productError } = await supabase.from("trend_radar_products")
    .select("id,priority,product_term,normalized_product_term,category,marketplace,evidence_status,source_count,commercial_score,confidence,direct_evidence,score_breakdown,determining_reasons,is_focus,opportunity_id,recommended_channel,recommended_format,selection_decision,selection_decided_at,selected_offer_id,execution_context")
    .eq("radar_run_id", run.id).order("priority", { ascending: true });
  if (productError) return null;

  const snapshot = mapTrendRadarSnapshotView(run, (products ?? []) as ProductRow[]);
  const tracked = snapshot.products.filter((item) => item.selectedOfferId && item.selectionDecidedAt);
  const offerIds = [...new Set(tracked.map((item) => item.selectedOfferId!).filter(Boolean))];
  if (!offerIds.length) return snapshot;

  const { data: links } = await supabase.from("affiliate_links").select("id,offer_id").in("offer_id", offerIds);
  const linkRows = links ?? [];
  const linkIds = linkRows.map((row: any) => String(row.id));
  const [clickResult, salesResult] = await Promise.all([
    linkIds.length ? supabase.from("click_events").select("affiliate_link_id,created_at").in("affiliate_link_id", linkIds) : Promise.resolve({ data: [] }),
    supabase.from("sales").select("offer_id,gross_value,commission_value,status,sold_at").in("offer_id", offerIds),
  ]);
  const clicks = clickResult.data ?? [];
  const sales = salesResult.data ?? [];
  const linksByOffer = new Map<string, Set<string>>();
  for (const link of linkRows as any[]) {
    const set = linksByOffer.get(String(link.offer_id)) ?? new Set<string>();
    set.add(String(link.id));
    linksByOffer.set(String(link.offer_id), set);
  }

  for (const item of tracked) {
    const start = new Date(item.selectionDecidedAt!).getTime();
    const end = start + 7 * 24 * 60 * 60 * 1000;
    const offerId = item.selectedOfferId!;
    const offerLinks = linksByOffer.get(offerId) ?? new Set<string>();
    const clickCount = (clicks as any[]).filter((row) => {
      const at = new Date(row.created_at).getTime();
      return offerLinks.has(String(row.affiliate_link_id)) && at >= start && at <= end;
    }).length;
    const experimentSales = (sales as any[]).filter((row) => {
      const at = new Date(row.sold_at).getTime();
      return String(row.offer_id) === offerId && at >= start && at <= end;
    });
    const orders = experimentSales.length;
    const commissionValue = experimentSales.reduce((sum, row) => sum + Number(row.commission_value ?? 0), 0);
    const grossValue = experimentSales.reduce((sum, row) => sum + Number(row.gross_value ?? 0), 0);
    item.experimentMetrics = {
      clicks: clickCount,
      orders,
      commissionValue: Number(commissionValue.toFixed(2)),
      grossValue: Number(grossValue.toFixed(2)),
      conversionRate: clickCount > 0 ? Number(((orders / clickCount) * 100).toFixed(2)) : 0,
      windowStart: item.selectionDecidedAt,
      windowEnd: new Date(end).toISOString(),
    };
  }

  return snapshot;
}
