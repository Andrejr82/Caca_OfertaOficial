import { curateOffers, type CurationOfferInput, type CuratedOffer } from './curation-engine'
import { DeduplicationEngine } from '../deduplication/deduplication-engine'

export interface AutomatedCopyQueueItem {
  offerId: string
  marketplace: string
  productType?: string
  groupKey?: string
  curationScore: number
  reason: string
}

export interface DeferredCopyQueueItem {
  offerId: string
  marketplace: string
  productType?: string
  title: string
  curationScore: number
  originalPosition: number
  reason: string
  deferredAt: string
  attempts: number
  nextEligibleAt: string
  commercialHash: string
}

export interface AutomatedCopyQueueOptions {
  maxTotal?: number
  maxPerMarketplace?: number
  maxPerCategory?: number
  deferredMaxAttempts?: number
  deferredTtlHours?: number
  clock?: () => Date
}

export interface AutomatedCopyQueueResult {
  queue: AutomatedCopyQueueItem[]
  skipped: Array<{ offerId: string; reason: string }>
  deferred: DeferredCopyQueueItem[]
}

function parseConfigInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const num = parseInt(val, 10);
  if (isNaN(num) || num <= 0) return fallback;
  return num;
}

export function buildAutomatedCopyQueue(
  offers: CurationOfferInput[],
  options: AutomatedCopyQueueOptions = {},
  previouslyDeferred: DeferredCopyQueueItem[] = []
): AutomatedCopyQueueResult {
  const maxTotal = options.maxTotal ?? 30
  const maxPerMarketplace = options.maxPerMarketplace ?? 10
  
  if (process.env.MAX_DAILY_PER_CATEGORY && !process.env.MAX_PER_QUEUE_CATEGORY) {
    console.warn("WARN: MAX_DAILY_PER_CATEGORY is deprecated. Use MAX_PER_QUEUE_CATEGORY instead.");
  }
  const maxPerCategoryEnv = process.env.MAX_PER_QUEUE_CATEGORY || process.env.MAX_DAILY_PER_CATEGORY;
  const maxPerCategory = options.maxPerCategory ?? parseConfigInt(maxPerCategoryEnv, 5);
  
  const deferredMaxAttempts = options.deferredMaxAttempts ?? parseConfigInt(process.env.DEFERRED_CATEGORY_MAX_ATTEMPTS, 3);
  const deferredTtlHours = options.deferredTtlHours ?? parseConfigInt(process.env.DEFERRED_CATEGORY_TTL_HOURS, 24);
  const now = options.clock ? options.clock() : new Date();

  // Deduplicate inputs
  const deduplicatedItems = new Map<string, {
    item: CuratedOffer | DeferredCopyQueueItem;
    hash: string;
    isDeferred: boolean;
    curationScore: number;
  }>();

  const offersById = new Map<string, CurationOfferInput>(offers.map(o => [o.id, o]));

  // 1. Process curated offers
  const curated = curateOffers(offers)
  const skipped: Array<{ offerId: string; reason: string }> = []
  
  for (const candidate of curated) {
    if (candidate.decision === 'exclude') {
      skipped.push({ offerId: candidate.id, reason: 'produto_excluido' })
      continue;
    }
    if (candidate.decision !== 'recommend') {
      // Defer to final iteration for group checks
    }
    
    // Only recommend ones go into the deduplicated items for queuing evaluation
    if (candidate.decision === 'recommend') {
      const originalOffer = offersById.get(candidate.id);
      const identity = DeduplicationEngine.buildCommercialIdentity({
        platform: candidate.marketplaceScore.marketplace,
        title: candidate.title,
        price: originalOffer?.price || 0,
        item_id: candidate.id
      });
      
      const existing = deduplicatedItems.get(identity.commercialHash);
      if (!existing || existing.curationScore < (candidate.curationScore ?? 0)) {
        deduplicatedItems.set(identity.commercialHash, {
          item: candidate,
          hash: identity.commercialHash,
          isDeferred: false,
          curationScore: candidate.curationScore ?? 0
        });
      }
    }
  }

  // 2. Process previously deferred
  for (const deferred of previouslyDeferred) {
    // Check TTL and attempts first
    const deferredAt = new Date(deferred.deferredAt);
    const hoursElapsed = (now.getTime() - deferredAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed >= deferredTtlHours) {
      skipped.push({ offerId: deferred.offerId, reason: 'deferred_ttl_expired' });
      continue;
    }
    if (deferred.attempts >= deferredMaxAttempts) {
      skipped.push({ offerId: deferred.offerId, reason: 'deferred_max_attempts' });
      continue;
    }

    const existing = deduplicatedItems.get(deferred.commercialHash);
    if (!existing || existing.curationScore < deferred.curationScore) {
      deduplicatedItems.set(deferred.commercialHash, {
        item: deferred,
        hash: deferred.commercialHash,
        isDeferred: true,
        curationScore: deferred.curationScore
      });
    }
  }

  const allCandidates = Array.from(deduplicatedItems.values());

  // Sort deterministically
  allCandidates.sort((a, b) => {
    // 1. Highest score
    if (b.curationScore !== a.curationScore) return b.curationScore - a.curationScore;
    
    // 2. Older deferredAt (if both are deferred)
    if (a.isDeferred && b.isDeferred) {
      const timeA = new Date((a.item as DeferredCopyQueueItem).deferredAt).getTime();
      const timeB = new Date((b.item as DeferredCopyQueueItem).deferredAt).getTime();
      if (timeA !== timeB) return timeA - timeB; // Older first
    }

    // 3. Deferred wins over non-deferred in case of exact score match
    if (a.isDeferred && !b.isDeferred) return -1;
    if (!a.isDeferred && b.isDeferred) return 1;

    // 4. Stable identity string comparison
    return a.hash.localeCompare(b.hash);
  });

  const marketplaceCount = new Map<string, number>()
  const categoryCount = new Map<string, number>()
  const seenGroups = new Set<string>()
  const queue: AutomatedCopyQueueItem[] = []
  const deferredOut: DeferredCopyQueueItem[] = []

  for (const entry of allCandidates) {
    const isDeferred = entry.isDeferred;
    
    let offerId: string;
    let marketplace: string;
    let category: string;
    let groupKey: string | undefined;
    let title: string;
    let curationScore: number;
    let commercialHash: string = entry.hash;

    if (isDeferred) {
      const d = entry.item as DeferredCopyQueueItem;
      offerId = d.offerId;
      marketplace = d.marketplace;
      category = d.productType || 'unknown';
      groupKey = undefined;
      title = d.title;
      curationScore = d.curationScore;
    } else {
      const c = entry.item as CuratedOffer;
      offerId = c.id;
      marketplace = c.marketplaceScore.marketplace;
      category = c.productType || 'unknown';
      groupKey = c.groupKeys[0];
      title = c.title;
      curationScore = c.curationScore;
    }

    if (!isDeferred && groupKey && seenGroups.has(groupKey)) {
      skipped.push({ offerId, reason: 'grupo_ja_representado' })
      continue
    }

    if ((marketplaceCount.get(marketplace) || 0) >= maxPerMarketplace) {
      if (isDeferred) {
        const d = entry.item as DeferredCopyQueueItem;
        deferredOut.push({ ...d, attempts: d.attempts + 1 });
      } else {
        skipped.push({ offerId, reason: 'limite_marketplace' })
      }
      continue
    }

    if ((categoryCount.get(category) || 0) >= maxPerCategory) {
      if (isDeferred) {
        const d = entry.item as DeferredCopyQueueItem;
        deferredOut.push({ ...d, attempts: d.attempts + 1 });
      } else {
        deferredOut.push({
          offerId,
          marketplace,
          productType: category,
          title,
          curationScore,
          originalPosition: queue.length + deferredOut.length + skipped.length,
          reason: 'limite_categoria',
          deferredAt: now.toISOString(),
          attempts: 1,
          nextEligibleAt: new Date(now.getTime() + 1000 * 60 * 60).toISOString(),
          commercialHash
        });
      }
      continue
    }

    if (queue.length >= maxTotal) {
      if (isDeferred) {
        const d = entry.item as DeferredCopyQueueItem;
        deferredOut.push({ ...d, attempts: d.attempts + 1 });
      } else {
        skipped.push({ offerId, reason: 'limite_total' })
      }
      continue
    }

    queue.push({ 
      offerId, 
      marketplace, 
      productType: category !== 'unknown' ? category : undefined, 
      groupKey, 
      curationScore, 
      reason: isDeferred ? 'curadoria_recuperada' : 'curadoria_recomendada' 
    })
    
    marketplaceCount.set(marketplace, (marketplaceCount.get(marketplace) || 0) + 1)
    categoryCount.set(category, (categoryCount.get(category) || 0) + 1)
    if (groupKey) seenGroups.add(groupKey)
  }

  // Add non-recommend items from curated to skipped with correct reason, now that seenGroups is populated correctly based on priority
  for (const candidate of curated) {
    if (candidate.decision !== 'recommend' && candidate.decision !== 'exclude') {
      const groupKey = candidate.groupKeys[0]
      skipped.push({ offerId: candidate.id, reason: groupKey && seenGroups.has(groupKey) ? 'grupo_ja_representado' : 'alternativa_nao_priorizada' })
    }
  }

  const finalSkipped = [];
  const handledIds = new Set([...queue.map(q => q.offerId), ...deferredOut.map(d => d.offerId)]);
  
  for (const s of skipped) {
    if (!handledIds.has(s.offerId)) {
      finalSkipped.push(s);
      handledIds.add(s.offerId);
    }
  }

  return { queue, skipped: finalSkipped, deferred: deferredOut }
}
