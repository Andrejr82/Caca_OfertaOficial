import { classifyProduct } from '@/core/classification/classifier'
import { buildGroupKeys } from '@/core/classification/grouping'
import { scoreMarketplaceOffer, type MarketplaceOfferSignals } from './marketplace-policy'

export interface CurationOfferInput extends MarketplaceOfferSignals {
  id: string
  title: string
}

export type CurationDecision = 'recommend' | 'alternative' | 'review' | 'exclude'

export interface CuratedOffer {
  id: string
  title: string
  productType?: string
  decision: CurationDecision
  curationScore: number
  groupKeys: string[]
  classificationStatus: string
  marketplaceScore: ReturnType<typeof scoreMarketplaceOffer>
  reasons: string[]
}

function priceAttractiveness(offer: CurationOfferInput): number {
  if (!offer.price || offer.price <= 0) return 0
  if (!offer.oldPrice || offer.oldPrice <= offer.price) return 25
  const percentage = (offer.oldPrice - offer.price) / offer.oldPrice
  return Math.round(Math.min(40, 25 + percentage * 20))
}

export function curateOffers(inputs: CurationOfferInput[]): CuratedOffer[] {
  const prepared = inputs.map((input) => {
    const classification = classifyProduct({ title: input.title })
    const groupKeys = buildGroupKeys(classification).map((group) => group.key)
    const marketplaceScore = scoreMarketplaceOffer(input)
    const curationScore = Math.round(marketplaceScore.score * 0.65 + priceAttractiveness(input) * 0.35)
    const reasons = [...marketplaceScore.reasons]
    if (classification.status === 'review_required') reasons.push('classificacao_requer_revisao')
    if (classification.productRole !== 'main_product') reasons.push(`papel:${classification.productRole}`)
    return { input, classification, groupKeys, marketplaceScore, curationScore, reasons }
  })

  const groupMembers = new Map<string, typeof prepared>()
  for (const candidate of prepared) {
    for (const key of candidate.groupKeys) {
      const members = groupMembers.get(key) || []
      members.push(candidate)
      groupMembers.set(key, members)
    }
  }
  for (const members of groupMembers.values()) members.sort((a, b) => b.curationScore - a.curationScore)

  return prepared.map((candidate) => {
    const { input, classification, marketplaceScore, groupKeys, curationScore, reasons } = candidate
    if (classification.productRole !== 'main_product') return { id: input.id, title: input.title, productType: classification.productType, decision: 'exclude', curationScore, groupKeys, classificationStatus: classification.status, marketplaceScore, reasons }
    if (classification.status !== 'classified' || !marketplaceScore.eligible) return { id: input.id, title: input.title, productType: classification.productType, decision: 'review', curationScore, groupKeys, classificationStatus: classification.status, marketplaceScore, reasons }
    const primaryGroup = groupKeys[0]
    const members = primaryGroup ? groupMembers.get(primaryGroup) || [] : []
    const isWinner = members[0]?.input.id === input.id
    return { id: input.id, title: input.title, productType: classification.productType, decision: isWinner ? 'recommend' : 'alternative', curationScore, groupKeys, classificationStatus: classification.status, marketplaceScore, reasons }
  })
}
