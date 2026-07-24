import { classifyProduct } from '@/core/classification/classifier'
import { buildGroupKeys } from '@/core/classification/grouping'
import { scoreMarketplaceOffer, type MarketplaceOfferSignals } from '@/core/intelligence/marketplace-policy'
import { buildAutomatedCopyQueue, type AutomatedCopyQueueOptions, type DeferredCopyQueueItem } from '@/core/intelligence/copy-v2-automation'
import { curateOffers, type CuratedOffer } from '@/core/intelligence/curation-engine'

export interface RawDiscoveryItem extends MarketplaceOfferSignals {
  externalId: string
  sourceUrl: string
  title: string
  rawPayload: Record<string, unknown>
}

export interface DiscoveryV2Item {
  raw: RawDiscoveryItem
  classification: ReturnType<typeof classifyProduct>
  groupKeys: ReturnType<typeof buildGroupKeys>
  marketplaceScore: ReturnType<typeof scoreMarketplaceOffer>
  curation: CuratedOffer
}

export type DiscoveryV2Options = AutomatedCopyQueueOptions

export function processDiscoveryV2(
  items: RawDiscoveryItem[], 
  options?: DiscoveryV2Options,
  previouslyDeferred: DeferredCopyQueueItem[] = []
) {
  const curationInputs = items.map((item) => ({ ...item, id: item.externalId }))
  const curated = curateOffers(curationInputs)
  const curationById = new Map(curated.map((item) => [item.id, item]))
  const processed: DiscoveryV2Item[] = items.map((raw) => {
    const classification = classifyProduct({ title: raw.title })
    return {
      raw,
      classification,
      groupKeys: buildGroupKeys(classification),
      marketplaceScore: scoreMarketplaceOffer(raw),
      curation: curationById.get(raw.externalId)!,
    }
  })
  return { items: processed, copyQueue: buildAutomatedCopyQueue(curationInputs, options, previouslyDeferred) }
}
