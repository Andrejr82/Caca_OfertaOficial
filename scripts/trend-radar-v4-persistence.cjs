'use strict';
const cfg=require('./trend-radar-v4-config.cjs');
const d=require('./trend-radar-v4-domain.cjs');

function toPersistedRow(candidate={},priority=1,radarRunId=null){
  const t=candidate.temporal||{};
  const status=candidate.evidenceStatus||
    (candidate.trending?cfg.TREND_CONFIRMED_STATUS:cfg.TREND_OBSERVED_STATUS);
  const imageUrl=d.candidateImageUrl(candidate);
  const permalink=d.candidatePermalink(candidate);
  const evidence=[{
    claim:`Evidência de tendência em ${candidate.marketplace||'marketplace'}`,
    evidence_type:'marketplace_trend_snapshot',
    provenance:candidate.provenance||null,
    source_url:permalink||null,
    image_url:imageUrl||null,
    observed_at:candidate.observedAt||new Date().toISOString(),
    marketplace_identity:{itemId:candidate.itemId||null,productId:candidate.productId||candidate.asin||null,shopId:candidate.shopId||null},
    commercial_metrics:{sales:candidate.sales??null,ratingStar:candidate.ratingStar??candidate.rating??null,price:candidate.currentPrice??candidate.price??null,priceDiscountRate:candidate.discountPercent??null,commissionRate:candidate.commissionRate??candidate.commissionPercent??null,sellerCommissionRate:candidate.sellerCommissionRate??null},
    temporal_metrics:{previous_sales:t.previousSales??null,current_sales:t.currentSales??candidate.sales??null,sales_delta:t.salesDelta??null,sales_growth_pct:t.growthPct??null,sales_velocity:t.salesVelocity??null,sales_velocity_per_day:t.salesVelocityPerDay??null,dailyized_growth_pct:t.dailyizedGrowthPct??null,previous_rank:t.previousRank??null,current_rank:t.currentRank??candidate.rank??null,rank_delta:t.rankDelta??null,window_hours:t.hours??null,sales_baseline_tier:t.salesBaselineTier??null,rank_baseline_tier:t.rankBaselineTier??null,sales_baseline_observed_at:t.salesBaselineObservedAt??null,rank_baseline_observed_at:t.rankBaselineObservedAt??null,history_observations:t.historyObservations??0,baseline_status:t.baselineStatus??'no_history',velocity_status:t.salesVelocity!==null&&t.salesVelocity!==undefined?'computed':'insufficient_history'},
    best_seller_flag:d.isBestSeller(candidate),
    trending_flag:candidate.trending===true,
    product_specific_evidence:candidate.productSpecificStrong===true,
    native_trend_scope:candidate.scope||null,
    native_trend_source:candidate.marketplaceTrendEvidence?.source||candidate.nativeTrendSource||null,
    native_trend_keyword:candidate.marketplaceTrendEvidence?.keyword||null,
    trend_score:candidate.trendScore,
    trend_reasons:candidate.reasons||[],
    niche_id:candidate.nicheId,
    niche_label:candidate.nicheLabel,
    matched_product_term:candidate.matchedTerm,
    trend_strategy_version:cfg.TREND_STRATEGY_VERSION,
    evidence_status:status,
    rejection_reasons:candidate.rejectionReasons||[],
    commercial_gate:candidate.commercialGate||null,
  }];
  const isVerified=status===cfg.TREND_CONFIRMED_STATUS;
  const isRejected=status===cfg.TREND_REJECTED_STATUS;
  return{
    radar_run_id:radarRunId,
    priority,
    product_term:candidate.productName||candidate.title||'',
    normalized_product_term:d.normalize(candidate.productName||candidate.title),
    category:candidate.nicheLabel||null,
    marketplace:candidate.marketplace||null,
    evidence_status:status,
    source_count:Math.max(1,Number(candidate.crossStrongCount||1)),
    commercial_score:isRejected?0:(candidate.commercialScore||0),
    trend_score:isRejected?0:(candidate.trendScore||0),
    score_breakdown:candidate.commercialBreakdown||{},
    determining_reasons:[...new Set([...(candidate.reasons||[]),...(candidate.rejectionReasons||[])])],
    confidence:isRejected?0:(isVerified?Math.min(99,Math.round(60+candidate.trendScore*.35)):40),
    direct_evidence:evidence,
    inferred_signals:candidate.reasons||[],
    affiliate_potential:candidate.commercialScore>=70?'high':'medium',
    visual_content_potential:isVerified?'high':'medium',
    recommended_channel:null,
    recommended_format:null,
    match_status:'pending',
    opportunity_id:null,
    is_focus:isVerified&&priority<=3,
    selection_decision:null,
  };
}

module.exports={toPersistedRow};
