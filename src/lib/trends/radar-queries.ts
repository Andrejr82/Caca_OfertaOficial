import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isTrendOfferApprovalEligible } from "@/lib/trends/selection-offer-state";

export interface TrendExperimentMetricsView {
  clicks: number; orders: number; commissionValue: number; grossValue: number; conversionRate: number;
  windowStart: string | null; windowEnd: string | null;
}

export interface TrendRadarSnapshotProductView {
  id: string; priority: number; productTerm: string; normalizedProductTerm: string;
  category: string | null; marketplace: string | null; evidenceStatus: string; sourceCount: number;
  trendScore: number | null; trending: boolean; nicheId: string | null; nicheLabel: string | null;
  trendReasons: string[]; previousSales: number | null; salesDelta: number | null;
  previousRank: number | null; currentRank: number | null; rankDelta: number | null;
  commercialScore: number | null; confidence: number; directEvidenceSourceUrls: string[];
  scoreBreakdown: Record<string, number>; determiningReasons: string[]; isFocus: boolean; opportunityId: string | null;
  price: number | null; discountPercent: number | null; commissionPercent: number | null; sellerCommissionPercent: number | null;
  sales: number | null; salesVelocity: number | null; velocityStatus: string | null;
  scoreDecision: string | null; scoreStrategyVersion: string | null; recommendedChannel: string | null; recommendedFormat: string | null;
  selectionDecision: string | null; selectionDecidedAt: string | null; selectedOfferId: string | null;
  offerStatus?: string | null; offerAvailable?: boolean;
  executionContext: Record<string, unknown>; experimentMetrics: TrendExperimentMetricsView;
}

export interface TrendRadarSnapshotView {
  id: string; radarDate: string; windowStart: string; windowEnd: string; strategyVersion: string; status: string; generatedAt: string;
  sourceHealth: Record<string, unknown>; executiveSummary: Record<string, unknown>; products: TrendRadarSnapshotProductView[];
}

interface RunRow { id:string; radar_date:string; window_start:string; window_end:string; strategy_version:string; status:string; generated_at:string; source_health:unknown; executive_summary:unknown; }
interface ProductRow {
  id:string; priority:number; product_term:string; normalized_product_term:string; category:string|null; marketplace:string|null;
  evidence_status:string; source_count:number; commercial_score:number|string|null; trend_score:number|string|null; confidence:number|string;
  direct_evidence:unknown; score_breakdown:unknown; determining_reasons:unknown; is_focus:boolean; opportunity_id:string|null;
  recommended_channel:string|null; recommended_format:string|null; selection_decision:string|null; selection_decided_at:string|null;
  selected_offer_id:string|null; execution_context:unknown;
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numericObject(value: unknown): Record<string, number> { return Object.fromEntries(Object.entries(object(value)).flatMap(([k,v]) => { const n=Number(v); return Number.isFinite(n)?[[k,n]]:[]; })); }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((x):x is string => typeof x === "string" && Boolean(x.trim())) : []; }
function finiteNumber(value: unknown): number | null { if (value===null||value===undefined||value==="") return null; const n=Number(value); return Number.isFinite(n)?n:null; }
function directEvidence(value: unknown): Record<string, unknown> { if (!Array.isArray(value)) return {}; const first=value.find((x)=>x&&typeof x==="object"&&!Array.isArray(x)); return first ? first as Record<string,unknown> : {}; }
function marketplaceIdentity(value: unknown): Record<string, unknown> { return object(directEvidence(value).marketplace_identity); }
function identityValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : value == null ? null : String(value); }
function directEvidenceSourceUrls(value: unknown): string[] { if (!Array.isArray(value)) return []; return [...new Set(value.flatMap((x)=>{ if(!x||typeof x!=="object"||Array.isArray(x)) return []; const raw=(x as Record<string,unknown>).source_url; return typeof raw==="string"&&raw.trim()?[raw.trim()]:[]; }))]; }
function emptyMetrics(start:string|null):TrendExperimentMetricsView { const end=start?new Date(new Date(start).getTime()+7*86400000).toISOString():null; return {clicks:0,orders:0,commissionValue:0,grossValue:0,conversionRate:0,windowStart:start,windowEnd:end}; }

export function mapTrendRadarSnapshotView(run: RunRow, products: ProductRow[]): TrendRadarSnapshotView {
  const mapped = products.map((row) => {
    const evidence=directEvidence(row.direct_evidence); const commercial=object(evidence.commercial_metrics); const temporal=object(evidence.temporal_metrics);
    const evidenceStatus = String(row.evidence_status || "").toLowerCase();
    const hasTrendContract = Object.prototype.hasOwnProperty.call(evidence,"trending_flag");
    const trending = evidenceStatus === "verified" && (hasTrendContract ? evidence.trending_flag === true : true);
    return {
      id:row.id, priority:row.priority, productTerm:row.product_term, normalizedProductTerm:row.normalized_product_term,
      category:row.category, marketplace:row.marketplace, evidenceStatus:row.evidence_status, sourceCount:row.source_count,
      trendScore:finiteNumber(row.trend_score ?? evidence.trend_score), trending,
      nicheId:typeof evidence.niche_id==="string"?evidence.niche_id:null,
      nicheLabel:typeof evidence.niche_label==="string"?evidence.niche_label:row.category,
      trendReasons:strings(evidence.trend_reasons), previousSales:finiteNumber(temporal.previous_sales), salesDelta:finiteNumber(temporal.sales_delta),
      previousRank:finiteNumber(temporal.previous_rank), currentRank:finiteNumber(temporal.current_rank), rankDelta:finiteNumber(temporal.rank_delta),
      commercialScore:row.commercial_score===null?null:Number(row.commercial_score), confidence:Number(row.confidence),
      directEvidenceSourceUrls:directEvidenceSourceUrls(row.direct_evidence), scoreBreakdown:numericObject(row.score_breakdown), determiningReasons:strings(row.determining_reasons),
      isFocus:row.is_focus, opportunityId:row.opportunity_id, price:finiteNumber(evidence.price??commercial.price), discountPercent:finiteNumber(evidence.discount_percent??commercial.priceDiscountRate),
      commissionPercent:finiteNumber(commercial.commissionRate), sellerCommissionPercent:finiteNumber(commercial.sellerCommissionRate), sales:finiteNumber(evidence.sold_quantity??commercial.sales??temporal.current_sales),
      salesVelocity:finiteNumber(temporal.sales_velocity), velocityStatus:typeof temporal.velocity_status==="string"?temporal.velocity_status:null,
      scoreDecision:typeof evidence.decision==="string"?evidence.decision:null, scoreStrategyVersion:typeof evidence.strategy_version==="string"?evidence.strategy_version:null,
      recommendedChannel:row.recommended_channel, recommendedFormat:row.recommended_format, selectionDecision:row.selection_decision, selectionDecidedAt:row.selection_decided_at,
      selectedOfferId:row.selected_offer_id, offerStatus:null, offerAvailable:false, executionContext:object(row.execution_context), experimentMetrics:emptyMetrics(row.selection_decided_at),
    };
  }).filter((item) => item.trending && item.evidenceStatus === "verified").sort((a,b) => (b.trendScore??0)-(a.trendScore??0) || a.priority-b.priority);
  mapped.forEach((item,index)=>{ item.priority=index+1; });
  return { id:run.id, radarDate:run.radar_date, windowStart:run.window_start, windowEnd:run.window_end, strategyVersion:run.strategy_version, status:run.status, generatedAt:run.generated_at, sourceHealth:object(run.source_health), executiveSummary:object(run.executive_summary), products:mapped };
}

type OfferStateRow = { id: string; status: string | null };

async function findExactRadarOffer(supabase: any, product: TrendRadarSnapshotProductView, rawRow: ProductRow): Promise<OfferStateRow | null> {
  if (!product.marketplace) return null;
  if (product.selectedOfferId) {
    const { data } = await supabase.from("offers").select("id,status").eq("id", product.selectedOfferId).maybeSingle();
    if (data) return { id: String(data.id), status: data.status == null ? null : String(data.status) };
  }
  const identity = marketplaceIdentity(rawRow.direct_evidence);
  const stableIds = product.marketplace === "Shopee"
    ? [identityValue(identity.itemId), identityValue(identity.productId)].filter(Boolean)
    : [identityValue(identity.itemId), identityValue(identity.productId)].filter(Boolean);
  if (!stableIds.length) return null;
  const clauses = product.marketplace === "Shopee"
    ? stableIds.flatMap((value) => [`shopee_item_id.eq.${value}`, `item_id.eq.${value}`, `product_id.eq.${value}`])
    : stableIds.flatMap((value) => [`item_id.eq.${value}`, `product_id.eq.${value}`]);
  const { data } = await supabase.from("offers").select("id,status").eq("platform", product.marketplace).or(clauses.join(",")).order("updated_at", { ascending: false }).limit(1);
  const offer = data?.[0];
  return offer ? { id: String(offer.id), status: offer.status == null ? null : String(offer.status) } : null;
}

export function filterTrendProductsWithEligibleOffers(
  products: TrendRadarSnapshotProductView[],
  offerStatusByProductId: ReadonlyMap<string, string | null>,
): TrendRadarSnapshotProductView[] {
  return products.filter((product) => isTrendOfferApprovalEligible(offerStatusByProductId.get(product.id)));
}

export async function listLatestTrendRadarSnapshot(): Promise<TrendRadarSnapshotView | null> {
  const supabase=await createServerSupabaseClient(); if(!supabase) return null;
  const {data:runs,error:runError}=await supabase.from("trend_radar_runs").select("id,radar_date,window_start,window_end,strategy_version,status,generated_at,source_health,executive_summary").eq("status","completed").order("generated_at",{ascending:false}).limit(1);
  const run=runs?.[0] as RunRow|undefined; if(runError||!run) return null;
  const {data:products,error:productError}=await supabase.from("trend_radar_products")
    .select("id,priority,product_term,normalized_product_term,category,marketplace,evidence_status,source_count,commercial_score,trend_score,confidence,direct_evidence,score_breakdown,determining_reasons,is_focus,opportunity_id,recommended_channel,recommended_format,selection_decision,selection_decided_at,selected_offer_id,execution_context")
    .eq("radar_run_id",run.id).order("priority",{ascending:true});
  if(productError) return null;
  const rawProducts=(products??[]) as ProductRow[];
  const snapshot=mapTrendRadarSnapshotView(run,rawProducts);
  const rawById=new Map(rawProducts.map((row)=>[row.id,row]));
  const offerStates=await Promise.all(snapshot.products.map(async (product)=>({ productId:product.id, offer:await findExactRadarOffer(supabase,product,rawById.get(product.id)!) })));
  const offerStatusByProductId=new Map<string,string|null>();
  for(const state of offerStates){ const status=state.offer?.status??null; offerStatusByProductId.set(state.productId,status); const product=snapshot.products.find((item)=>item.id===state.productId); if(product){ product.offerStatus=status; product.offerAvailable=isTrendOfferApprovalEligible(status); } }
  snapshot.products=filterTrendProductsWithEligibleOffers(snapshot.products,offerStatusByProductId);
  const tracked=snapshot.products.filter((item)=>item.selectedOfferId&&item.selectionDecidedAt); const offerIds=[...new Set(tracked.map((x)=>x.selectedOfferId!).filter(Boolean))];
  if(!offerIds.length) return snapshot;
  const {data:links}=await supabase.from("affiliate_links").select("id,offer_id").in("offer_id",offerIds); const linkRows=links??[]; const linkIds=linkRows.map((r:any)=>String(r.id));
  const [clickResult,salesResult]=await Promise.all([
    linkIds.length?supabase.from("click_events").select("affiliate_link_id,created_at").in("affiliate_link_id",linkIds):Promise.resolve({data:[]}),
    supabase.from("sales").select("offer_id,gross_value,commission_value,status,sold_at").in("offer_id",offerIds),
  ]);
  const clicks=clickResult.data??[]; const sales=salesResult.data??[]; const linksByOffer=new Map<string,Set<string>>();
  for(const link of linkRows as any[]){ const set=linksByOffer.get(String(link.offer_id))??new Set<string>(); set.add(String(link.id)); linksByOffer.set(String(link.offer_id),set); }
  for(const item of tracked){ const start=new Date(item.selectionDecidedAt!).getTime(); const end=start+7*86400000; const offerId=item.selectedOfferId!; const offerLinks=linksByOffer.get(offerId)??new Set<string>();
    const clickCount=(clicks as any[]).filter((row)=>{const at=new Date(row.created_at).getTime(); return offerLinks.has(String(row.affiliate_link_id))&&at>=start&&at<=end;}).length;
    const experimentSales=(sales as any[]).filter((row)=>{const at=new Date(row.sold_at).getTime(); return String(row.offer_id)===offerId&&at>=start&&at<=end;});
    const orders=experimentSales.length; const commissionValue=experimentSales.reduce((sum,row)=>sum+Number(row.commission_value??0),0); const grossValue=experimentSales.reduce((sum,row)=>sum+Number(row.gross_value??0),0);
    item.experimentMetrics={clicks:clickCount,orders,commissionValue:Number(commissionValue.toFixed(2)),grossValue:Number(grossValue.toFixed(2)),conversionRate:clickCount>0?Number(((orders/clickCount)*100).toFixed(2)):0,windowStart:item.selectionDecidedAt,windowEnd:new Date(end).toISOString()};
  }
  return snapshot;
}
