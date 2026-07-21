import { curateOffers, type CurationOfferInput } from './curation-engine'

export interface AutomatedCopyQueueItem {
  offerId: string
  marketplace: string
  productType?: string
  groupKey?: string
  curationScore: number
  reason: string
}

export interface AutomatedCopyQueueOptions {
  maxTotal?: number
  maxPerMarketplace?: number
  maxPerCategory?: number
}

export function buildAutomatedCopyQueue(
  offers: CurationOfferInput[],
  options: AutomatedCopyQueueOptions = {}
) {
  const maxTotal = options.maxTotal ?? 20
  const maxPerMarketplace = options.maxPerMarketplace ?? 5
  const maxPerCategory = options.maxPerCategory ?? 3
  const curated = curateOffers(offers).sort((a, b) => b.curationScore - a.curationScore)
  const marketplaceCount = new Map<string, number>()
  const categoryCount = new Map<string, number>()
  const seenGroups = new Set<string>()
  const queue: AutomatedCopyQueueItem[] = []
  const skipped: Array<{ offerId: string; reason: string }> = []

  for (const candidate of curated) {
    if (candidate.decision === 'exclude') {
      skipped.push({ offerId: candidate.id, reason: 'produto_excluido' })
      continue
    }
    const marketplace = candidate.marketplaceScore.marketplace
    const category = candidate.productType || 'unknown'
    const groupKey = candidate.groupKeys[0]
    if (candidate.decision !== 'recommend') {
      skipped.push({ offerId: candidate.id, reason: groupKey && seenGroups.has(groupKey) ? 'grupo_ja_representado' : 'alternativa_nao_priorizada' })
      continue
    }
    if (groupKey && seenGroups.has(groupKey)) {
      skipped.push({ offerId: candidate.id, reason: 'grupo_ja_representado' })
      continue
    }
    if ((marketplaceCount.get(marketplace) || 0) >= maxPerMarketplace) {
      skipped.push({ offerId: candidate.id, reason: 'limite_marketplace' })
      continue
    }
    if ((categoryCount.get(category) || 0) >= maxPerCategory) {
      skipped.push({ offerId: candidate.id, reason: 'limite_categoria' })
      continue
    }
    if (queue.length >= maxTotal) {
      skipped.push({ offerId: candidate.id, reason: 'limite_total' })
      continue
    }
    queue.push({ offerId: candidate.id, marketplace, productType: candidate.productType, groupKey, curationScore: candidate.curationScore, reason: 'curadoria_recomendada' })
    marketplaceCount.set(marketplace, (marketplaceCount.get(marketplace) || 0) + 1)
    categoryCount.set(category, (categoryCount.get(category) || 0) + 1)
    if (groupKey) seenGroups.add(groupKey)
  }
  return { queue, skipped }
}
