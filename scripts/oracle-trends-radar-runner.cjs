'use strict';

/**
 * Oracle Trends Radar Runner V2 — Caça Ofertas Oficial
 *
 * Orquestrador principal do Radar com descoberta paginada, refill loop,
 * viabilidade comercial V2, recência de histórico e observabilidade completa.
 */

const { createClient } = require('@supabase/supabase-js');
const engine = require('./oracle-trends-radar-engine.cjs');
const {
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  calculateCommercialViabilityV2,
  isViableForRadar,
} = require('./commercial-viability-v2.cjs');
const {
  DEFAULT_RECENCY_DAYS,
  fetchCompletedRadarIdentityKeys,
  fetchExistingOfferIdentityKeys,
  filterCandidatesWithRecency,
  getMarketplaceIdentityKey,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
} = require('./oracle-trends-radar-freshness.cjs');
const {
  extractSemanticClusterKey,
  deduplicateCatalogAndSemantic,
  applyFamilyDiversityCap,
} = require('./radar-semantic-dedup-v2.cjs');
const { ML_OPPORTUNITY_STRATEGY_VERSION } = require('./mercadolivre-opportunity-v1.cjs');
const { buildShopeePeerScoringPool } = require('./shopee-achadinho-v12.cjs');

function buildMercadoLivreRadarProductsV1({ radarRunId, selectedRows = [] } = {}) {
  return selectedRows.map((row, index) => {
    const candidate = row.candidate || {};
    return {
      radar_run_id: radarRunId,
      priority: index + 1,
      product_term: candidate.productName || '',
      normalized_product_term: String(candidate.productName || '').toLowerCase(),
      category: candidate.category || null,
      marketplace: 'Mercado Livre',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: row.finalScore,
      trend_score: null,
      confidence: row.dataConfidenceScore,
      direct_evidence: [{
        strategy_version: ML_OPPORTUNITY_STRATEGY_VERSION,
        sold_quantity: row.sales ?? null,
        commercial_metrics: { commissionRate: candidate.commissionPercent ?? 0 },
      }],
      score_breakdown: {}, determining_reasons: [], is_focus: index < 3,
      opportunity_id: null, recommended_channel: null, recommended_format: null,
      selection_decision: 'TESTAR', selection_decided_at: null, selected_offer_id: null,
      match_status: 'pending',
      execution_context: {},
    };
  });
}

function combineMarketplaceProductsByScore(shopeeProducts = [], mlProducts = [], maxProducts = 20) {
  return [...shopeeProducts, ...mlProducts]
    .sort((a, b) => Number(b.commercial_score || 0) - Number(a.commercial_score || 0) || String(a.product_term || '').localeCompare(String(b.product_term || '')))
    .slice(0, maxProducts)
    .map((row, index) => ({ ...row, priority: index + 1, is_focus: index === 0, direct_evidence: [{ ...(row.direct_evidence?.[0] || {}), rank_position: index + 1 }] }));
}
const {
  classifyTicket,
  calculateCommercialOpportunityScoreV4,
} = require('../src/core/trends/commercial-opportunity-score-v4.cjs');

const DEDICATED_RUNTIME_ENV = 'TRENDS_RADAR_DEDICATED_RUNTIME';

function isDedicatedTrendRadarRuntimeEnabled(env = process.env) {
  const value = String(env?.[DEDICATED_RUNTIME_ENV] ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function isEditorialTrendRadarConsumer(options = {}) {
  return Boolean(options?.stageLogger) && options?.dedicatedRuntime !== true;
}

function shouldRunTrendRadarConsumer({ env = process.env, dedicatedRuntime = false, stageLogger = null } = {}) {
  if (stageLogger && !dedicatedRuntime) return false;
  return dedicatedRuntime || !isDedicatedTrendRadarRuntimeEnabled(env);
}

function createRadarAdminClient(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function persistSnapshotImages(client, runId, candidateImages) {
  if (!client || !runId || !(candidateImages instanceof Map) || candidateImages.size === 0) return 0;
  const { data: products, error } = await client
    .from('trend_radar_products')
    .select('id,marketplace,product_term,normalized_product_term,direct_evidence')
    .eq('radar_run_id', runId);
  if (error || !Array.isArray(products)) return 0;

  let updated = 0;
  for (const product of products) {
    const key = getMarketplaceIdentityKey(product);
    const imageUrl = key ? candidateImages.get(key) : null;
    if (!imageUrl) continue;
    const directEvidence = withMarketplaceImageEvidence(product.direct_evidence, imageUrl);
    const { error: updateError } = await client
      .from('trend_radar_products')
      .update({ direct_evidence: directEvidence })
      .eq('id', product.id)
      .eq('radar_run_id', runId);
    if (!updateError) updated += 1;
  }
  return updated;
}

/**
 * Executa o ciclo de processamento de solicitações pendentes do Radar.
 */
async function processPendingTrendRadarRuns(options = {}) {
  if (isEditorialTrendRadarConsumer(options)) {
    return { processed: false, reason: 'editorial_consumer_retired', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  if (!shouldRunTrendRadarConsumer(options)) {
    return { processed: false, reason: 'dedicated_runtime_enabled', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  const env = options.env || process.env;
  const client = options.client || (options.dryRun ? null : createRadarAdminClient(env));
  if (!client && !options.dryRun) {
    return { processed: false, reason: 'supabase_unavailable', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
  }

  let pendingRun = null;
  if (client) {
    pendingRun = await engine.findPendingTrendRadarRun(client);
    if (!pendingRun) {
      return { processed: false, reason: 'no_pending_requests', googleTrendsUsed: false, publishCalls: 0, postsWrites: 0, offersWrites: 0 };
    }
  } else {
    pendingRun = {
      id: 'dry-run-execution',
      radar_date: new Date().toISOString().slice(0, 10),
      user_id: 'dry-run-user',
      source_health: { runtime: 'oracle' },
    };
  }

  const runId = pendingRun.id;
  const radarDate = pendingRun.radar_date;

  if (client && !options.dryRun) {
    await engine.markTrendRadarRunRunning(client, runId, pendingRun.source_health || {});
  }

  try {
    // 1. Carrega histórico na janela de recência e ofertas existentes
    const recencyWindowDays = options.recencyDays || DEFAULT_RECENCY_DAYS;
    const radarHistory = await fetchCompletedRadarIdentityKeys(client, pendingRun.user_id, {
      recencyDays: recencyWindowDays,
      now: options.now || new Date(),
    });
    const existingOfferKeys = await fetchExistingOfferIdentityKeys(client, pendingRun.user_id);
    const previousItemsMap = await engine.fetchRecentSnapshotItemsMap(client, pendingRun.user_id);

    const candidateImages = new Map();

    // 2. Métricas de observabilidade de source_health
    const targetProducts = 20;
    const minimumProducts = 10;
    const maxRefillRounds = Math.max(1, Math.min(5, Number(options.maxRefillRounds) || 3));

    let shopeeCandidatesRaw = 0;
    let shopeeCandidatesUnique = 0;
    let shopeePagesScanned = 0;
    let shopeeInvalidExcluded = 0;
    let shopeeRecentHistoryExcluded = 0;
    let shopeeExistingOfferExcluded = 0;
    let shopeeNativeDuplicatesExcluded = 0;
    let shopeeSemanticDuplicatesExcluded = 0;
    let shopeeLowViabilityExcluded = 0;
    let shopeeInsufficientDataExcluded = 0;
    let shopeeCommercialDecisionIgnoreExcluded = 0;
    let shopeeEligibleCount = 0;

    let mlCandidatesRaw = 0;
    let mlCandidatesUnique = 0;
    let mlInvalidExcluded = 0;
    let mlRecentHistoryExcluded = 0;
    let mlExistingOfferExcluded = 0;
    let mlCatalogDuplicatesExcluded = 0;
    let mlSemanticDuplicatesExcluded = 0;
    let mlLowViabilityExcluded = 0;
    let mlInsufficientDataExcluded = 0;
    let mlCommercialDecisionIgnoreExcluded = 0;
    let mlEligibleCount = 0;

    const candidatesPerRefillRound = [];
    const aggregatedShopeeCandidates = [];
    const aggregatedMlCandidates = [];

    const seenShopeeNativeKeys = new Set();
    const seenMlNativeKeys = new Set();

    const baseShopeeCollector = options.shopeeCollector || engine.collectShopeeMarketplaceCandidates;
    const baseMlCollector = options.mlCollector || engine.collectMercadoLivreMarketplaceCandidates;

    let finalProducts = [];
    let actualRoundsRun = 0;
    // Rastreia se o loop parou porque as fontes realmente retornaram esgotamento
    // (round sem nenhum candidato bruto), vs parada por limite operacional de rounds.
    let stoppedBySourceExhaustion = false;

    // 3. Loop de Refill & Descoberta
    for (let round = 1; round <= maxRefillRounds; round++) {
      actualRoundsRun = round;
      let roundShopeeRaw = 0;
      let roundMlRaw = 0;

      // 3.1 Coleta Shopee
      try {
        const rawShopee = await baseShopeeCollector({ page: round, env });
        shopeePagesScanned += 1;
        roundShopeeRaw = rawShopee.length;
        shopeeCandidatesRaw += rawShopee.length;

        for (const item of rawShopee) {
          const key = getMarketplaceIdentityKey(item);
          const imageUrl = getMarketplaceImageUrl(item);
          if (key && imageUrl) candidateImages.set(key, imageUrl);

          // Validação mínima de preço, identidade e link
          const price = Number(item.currentPrice ?? item.price);
          const hasShopId = Boolean(item.shopId || item.shop_id);
          const hasItemId = Boolean(item.itemId || item.item_id || item.id);
          const link = String(item.permalink || item.productLink || item.offerLink || item.link || item.url || '').trim();
          const hasValidLink = link.length > 0 && /^https?:\/\//i.test(link);

          if (!Number.isFinite(price) || price <= 0 || !hasShopId || !hasItemId || !hasValidLink || !key) {
            shopeeInvalidExcluded += 1;
            continue;
          }

          if (seenShopeeNativeKeys.has(key)) {
            shopeeNativeDuplicatesExcluded += 1;
            continue;
          }
          seenShopeeNativeKeys.add(key);

          const freshnessCheck = filterCandidatesWithRecency([item], radarHistory.recentIdentityKeys, existingOfferKeys);
          if (freshnessCheck.excludedRecentHistory.length) {
            shopeeRecentHistoryExcluded += 1;
            continue;
          }
          if (freshnessCheck.excludedExistingOffers.length) {
            shopeeExistingOfferExcluded += 1;
            continue;
          }

          aggregatedShopeeCandidates.push(item);
        }
        shopeeCandidatesUnique = seenShopeeNativeKeys.size;
      } catch (err) {
        console.error(`[Oracle Radar] Erro Shopee round ${round}: ${err.message}`);
      }

      // 3.2 Coleta Mercado Livre
      try {
        const rawMl = await baseMlCollector({ page: round, env });
        roundMlRaw = rawMl.length;
        mlCandidatesRaw += rawMl.length;

        for (const item of rawMl) {
          const key = getMarketplaceIdentityKey(item);
          const imageUrl = getMarketplaceImageUrl(item);
          if (key && imageUrl) candidateImages.set(key, imageUrl);

          // Validação mínima de preço, identidade e link
          const price = Number(item.currentPrice ?? item.price);
          const hasId = Boolean(item.itemId || item.item_id || item.productId || item.product_id || item.id);
          const link = String(item.permalink || item.product_url || item.productUrl || item.link || item.url || '').trim();
          const hasValidLink = link.length > 0 && /^https?:\/\//i.test(link);

          if (!Number.isFinite(price) || price <= 0 || !hasId || !hasValidLink || !key) {
            mlInvalidExcluded += 1;
            continue;
          }

          if (seenMlNativeKeys.has(key)) {
            continue;
          }
          seenMlNativeKeys.add(key);

          const freshnessCheck = filterCandidatesWithRecency([item], radarHistory.recentIdentityKeys, existingOfferKeys);
          if (freshnessCheck.excludedRecentHistory.length) {
            mlRecentHistoryExcluded += 1;
            continue;
          }
          if (freshnessCheck.excludedExistingOffers.length) {
            mlExistingOfferExcluded += 1;
            continue;
          }

          aggregatedMlCandidates.push(item);
        }
        mlCandidatesUnique = seenMlNativeKeys.size;
      } catch (err) {
        console.error(`[Oracle Radar] Erro Mercado Livre round ${round}: ${err.message}`);
      }

      // 3.3 Carregamento do histórico interno e construção preliminar do Radar com a piscina agregada
      const internalPerformanceMap = await engine.fetchInternalOfferPerformanceMap(client, {
        tenantId: pendingRun.user_id,
        candidates: [...aggregatedShopeeCandidates, ...aggregatedMlCandidates],
        windowDays: 30,
        now: new Date(radarDate),
      });

      finalProducts = engine.buildTrendRadarProductsFromCandidates({
        radarRunId: runId,
        shopeeCandidates: aggregatedShopeeCandidates,
        mlCandidates: aggregatedMlCandidates,
        previousItemsMap,
        internalPerformanceMap,
        maxProducts: targetProducts,
      });

      candidatesPerRefillRound.push({
        round,
        shopee_raw: roundShopeeRaw,
        ml_raw: roundMlRaw,
        shopee_pool: aggregatedShopeeCandidates.length,
        ml_pool: aggregatedMlCandidates.length,
        eligible_after_round: finalProducts.length,
      });

      // Se já atingiu 20 produtos ou não há novos candidatos brutos retornando, encerra o loop
      if (finalProducts.length >= targetProducts || (roundShopeeRaw === 0 && roundMlRaw === 0)) {
        // Registrar esgotamento real de fontes (nenhum candidato bruto neste round)
        if (roundShopeeRaw === 0 && roundMlRaw === 0) {
          stoppedBySourceExhaustion = true;
        }
        break;
      }
    }

    // 4. Contabilidade de deduplicações e descarte de viabilidade
    const dedupAudit = deduplicateCatalogAndSemantic([...aggregatedShopeeCandidates, ...aggregatedMlCandidates]);
    mlCatalogDuplicatesExcluded = dedupAudit.excludedCatalogDuplicates.length;

    for (const excluded of dedupAudit.excludedSemanticDuplicates) {
      if (excluded.marketplace === 'Shopee') shopeeSemanticDuplicatesExcluded += 1;
      else mlSemanticDuplicatesExcluded += 1;
    }

    for (const candidate of dedupAudit.uniqueCandidates) {
      const viability = calculateCommercialViabilityV2(candidate);
      if (viability.classification === 'low') {
        if (candidate.marketplace === 'Shopee') shopeeLowViabilityExcluded += 1;
        else mlLowViabilityExcluded += 1;
      } else if (viability.classification === 'insufficient_data') {
        if (candidate.marketplace === 'Shopee') shopeeInsufficientDataExcluded += 1;
        else mlInsufficientDataExcluded += 1;
      } else if (isViableForRadar(viability)) {
        const scoreV4 = calculateCommercialOpportunityScoreV4(candidate, { peers: dedupAudit.uniqueCandidates });
        const decision = scoreV4.selection_decision || scoreV4.decision;
        if (decision === 'IGNORAR') {
          if (candidate.marketplace === 'Shopee') shopeeCommercialDecisionIgnoreExcluded += 1;
          else mlCommercialDecisionIgnoreExcluded += 1;
        } else {
          // Elegível comercial (TESTAR ou PRIORIDADE)
          if (candidate.marketplace === 'Shopee') shopeeEligibleCount += 1;
          else mlEligibleCount += 1;
        }
      }
    }

    // 5. Determinação da razão de conclusão (completion_reason)
    // Distingue parada por esgotamento real de fontes vs limite operacional de rounds.
    let completionReason = 'target_reached';
    if (finalProducts.length >= targetProducts) {
      completionReason = 'target_reached';
    } else if (finalProducts.length >= minimumProducts) {
      completionReason = 'minimum_reached';
    } else if (stoppedBySourceExhaustion) {
      // Fontes retornaram vazio — não há mais candidatos disponíveis nas APIs.
      completionReason = 'eligible_sources_exhausted';
    } else {
      // Loop encerrou por limite operacional (maxRefillRounds) com fontes ainda ativas.
      completionReason = 'refill_limit_reached';
    }

    // 6. Diversidade de famílias e métricas de ticket / retorno econômico
    const representedFamilies = new Set(
      finalProducts.map((p) => extractSemanticClusterKey({
        productName: p.product_term,
        category: p.category,
        marketplace: p.marketplace,
      }))
    );

    const candidateCountByTicketBeforeSelection = { impulse: 0, core: 0, upper: 0, premium: 0 };
    for (const c of [...aggregatedShopeeCandidates, ...aggregatedMlCandidates]) {
      const t = classifyTicket(c.currentPrice ?? c.price);
      if (t in candidateCountByTicketBeforeSelection) candidateCountByTicketBeforeSelection[t] += 1;
    }

    const eligibleCountByTicket = { impulse: 0, core: 0, upper: 0, premium: 0 };
    for (const c of dedupAudit.uniqueCandidates) {
      const v = calculateCommercialViabilityV2(c);
      if (isViableForRadar(v)) {
        const t = classifyTicket(c.currentPrice ?? c.price);
        if (t in eligibleCountByTicket) eligibleCountByTicket[t] += 1;
      }
    }

    const selectedCountByTicket = { impulse: 0, core: 0, upper: 0, premium: 0 };
    let knownCommissionCount = 0;
    let unknownCommissionCount = 0;
    const commissionAmounts = [];

    for (const p of finalProducts) {
      const direct = p.direct_evidence?.[0] || {};
      const t = direct.ticket_class || classifyTicket(direct.price);
      if (t in selectedCountByTicket) selectedCountByTicket[t] += 1;

      if (direct.commission_status === 'observed' && typeof direct.estimated_commission_per_sale === 'number') {
        knownCommissionCount += 1;
        commissionAmounts.push(direct.estimated_commission_per_sale);
      } else {
        unknownCommissionCount += 1;
      }
    }

    commissionAmounts.sort((a, b) => a - b);
    const avgCommission = commissionAmounts.length > 0
      ? Math.round((commissionAmounts.reduce((a, b) => a + b, 0) / commissionAmounts.length) * 100) / 100
      : null;
    const medianCommission = commissionAmounts.length > 0
      ? commissionAmounts[Math.floor(commissionAmounts.length / 2)]
      : null;

    const finalShopeeCount = finalProducts.filter((p) => p.marketplace === 'Shopee').length;
    const finalMlCount = finalProducts.filter((p) => p.marketplace === 'Mercado Livre').length;

    // Determinação precisa dos marketplaces participantes em cada estágio
    const marketplacesScanned = [];
    if (shopeePagesScanned > 0 || options.shopeeCollector) marketplacesScanned.push('Shopee');
    if (mlCandidatesRaw > 0 || options.mlCollector || actualRoundsRun > 0) marketplacesScanned.push('Mercado Livre');

    const marketplacesWithCandidates = [];
    if (shopeeCandidatesRaw > 0) marketplacesWithCandidates.push('Shopee');
    if (mlCandidatesRaw > 0) marketplacesWithCandidates.push('Mercado Livre');

    const marketplacesWithEligibleProducts = [];
    if (shopeeEligibleCount > 0) marketplacesWithEligibleProducts.push('Shopee');
    if (mlEligibleCount > 0) marketplacesWithEligibleProducts.push('Mercado Livre');

    const marketplacesSelected = [];
    if (finalShopeeCount > 0) marketplacesSelected.push('Shopee');
    if (finalMlCount > 0) marketplacesSelected.push('Mercado Livre');

    // 7. Montagem do source_health consolidado
    const sourceHealth = {
      google_trends_used: false,
      target_products: targetProducts,
      minimum_products: minimumProducts,
      target_reached: finalProducts.length >= targetProducts,
      completion_reason: completionReason,

      // 10 dimensões Shopee
      shopee_candidates_raw: shopeeCandidatesRaw,
      shopee_candidates_unique: shopeeCandidatesUnique,
      shopee_pages_scanned: shopeePagesScanned,
      shopee_invalid_excluded: shopeeInvalidExcluded,
      shopee_recent_history_excluded: shopeeRecentHistoryExcluded,
      shopee_existing_offer_excluded: shopeeExistingOfferExcluded,
      shopee_native_duplicates_excluded: shopeeNativeDuplicatesExcluded,
      shopee_semantic_duplicates_excluded: shopeeSemanticDuplicatesExcluded,
      shopee_low_viability_excluded: shopeeLowViabilityExcluded,
      shopee_insufficient_data_excluded: shopeeInsufficientDataExcluded,
      shopee_commercial_decision_ignore_excluded: shopeeCommercialDecisionIgnoreExcluded,
      shopee_commercial_eligible: shopeeEligibleCount,
      shopee_eligible_count: shopeeEligibleCount,
      shopee_products_selected: finalShopeeCount,
      shopee_selected_count: finalShopeeCount,

      // 10 dimensões Mercado Livre
      mercado_livre_candidates_raw: mlCandidatesRaw,
      mercado_livre_candidates_unique: mlCandidatesUnique,
      mercado_livre_invalid_excluded: mlInvalidExcluded,
      mercado_livre_recent_history_excluded: mlRecentHistoryExcluded,
      mercado_livre_existing_offer_excluded: mlExistingOfferExcluded,
      mercado_livre_catalog_duplicates_excluded: mlCatalogDuplicatesExcluded,
      mercado_livre_semantic_duplicates_excluded: mlSemanticDuplicatesExcluded,
      mercado_livre_low_viability_excluded: mlLowViabilityExcluded,
      mercado_livre_insufficient_data_excluded: mlInsufficientDataExcluded,
      mercado_livre_commercial_decision_ignore_excluded: mlCommercialDecisionIgnoreExcluded,
      mercado_livre_commercial_eligible: mlEligibleCount,
      mercado_livre_eligible_count: mlEligibleCount,
      mercado_livre_products_selected: finalMlCount,
      mercado_livre_selected_count: finalMlCount,

      // Métricas e coleções consolidadas por marketplace
      selected_count_by_marketplace: {
        'Shopee': finalShopeeCount,
        'Mercado Livre': finalMlCount,
      },
      eligible_count_by_marketplace: {
        'Shopee': shopeeEligibleCount,
        'Mercado Livre': mlEligibleCount,
      },
      marketplaces_scanned: marketplacesScanned,
      marketplaces_with_candidates: marketplacesWithCandidates,
      marketplaces_with_eligible_products: marketplacesWithEligibleProducts,
      marketplaces_selected: marketplacesSelected,

      // Métricas gerais
      commercial_decision_ignore_excluded: shopeeCommercialDecisionIgnoreExcluded + mlCommercialDecisionIgnoreExcluded,
      refill_rounds: actualRoundsRun,
      candidates_per_refill_round: candidatesPerRefillRound,
      total_products_selected: finalProducts.length,
      families_selected: representedFamilies.size,
      recency_window_days: recencyWindowDays,
      completed_runs_in_window: radarHistory.runCount,
      candidate_count_by_ticket_before_selection: candidateCountByTicketBeforeSelection,
      eligible_count_by_ticket: eligibleCountByTicket,
      selected_count_by_ticket: selectedCountByTicket,
      impulse_count: selectedCountByTicket.impulse,
      core_count: selectedCountByTicket.core,
      upper_count: selectedCountByTicket.upper,
      premium_count: selectedCountByTicket.premium,
      known_commission_count: knownCommissionCount,
      unknown_commission_count: unknownCommissionCount,
      average_estimated_commission_per_sale: avgCommission,
      median_estimated_commission_per_sale: medianCommission,
    };

    // 8. Persistência do snapshot
    const persistResult = await engine.persistTrendRadarSnapshot({
      client,
      run: pendingRun,
      products: finalProducts,
      sourceHealthOverrides: sourceHealth,
      dryRun: Boolean(options.dryRun || !client),
    });

    if (persistResult.persisted && client) {
      await persistSnapshotImages(client, runId, candidateImages);
    }

    return {
      processed: true,
      runId,
      radarDate,
      productsCount: finalProducts.length,
      shopeeProductsCount: finalShopeeCount,
      mercadoLivreProductsCount: finalMlCount,
      persisted: persistResult.persisted,
      googleTrendsUsed: false,
      publishCalls: 0,
      postsWrites: 0,
      offersWrites: 0,
      sourceHealth,
    };
  } catch (error) {
    if (client && !options.dryRun && runId) {
      try {
        const failureCode = error.code || 'PERSISTENCE_ERROR';
        const failedHealth = {
          ...(pendingRun.source_health || {}),
          runtime: 'oracle',
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_message: error.message,
          google_trends_used: false,
        };
        await client
          .from('trend_radar_runs')
          .update({
            status: 'failed',
            failure_code: failureCode,
            source_health: failedHealth,
            updated_at: new Date().toISOString(),
          })
          .eq('id', runId);
      } catch (updateErr) {
        console.error(`[Oracle Radar Runner] Falha ao marcar run como failed: ${updateErr.message}`);
      }
    }
    throw error;
  }
}

module.exports = {
  ...engine,
  COMMERCIAL_VIABILITY_STRATEGY_VERSION,
  DEDICATED_RUNTIME_ENV,
  isDedicatedTrendRadarRuntimeEnabled,
  isEditorialTrendRadarConsumer,
  shouldRunTrendRadarConsumer,
  createRadarAdminClient,
  persistSnapshotImages,
  processPendingTrendRadarRuns,
  buildMercadoLivreRadarProductsV1,
  combineMarketplaceProductsByScore,
  buildShopeePeerScoringPool,
};
