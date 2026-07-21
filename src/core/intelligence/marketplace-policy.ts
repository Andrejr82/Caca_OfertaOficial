export type SupportedMarketplace = 'shopee' | 'amazon' | 'mercado_livre'

export interface MarketplaceOfferSignals {
  marketplace: string
  price?: number
  oldPrice?: number
  isOfficialStore?: boolean
  isMall?: boolean
  sellerRating?: number
  sellerSales?: number
  sellerReputation?: 'green' | 'yellow' | 'red'
  isPrime?: boolean
  isFulfilledByAmazon?: boolean
  hasVerifiedCoupon?: boolean
  hasExtraCommission?: boolean
  hasFreeShipping?: boolean
  deliveryDays?: number
  affiliateEligible?: boolean
}

export interface MarketplaceScoreBreakdown {
  marketplace: SupportedMarketplace | 'unsupported'
  score: number
  eligible: boolean
  trustScore: number
  offerScore: number
  logisticsScore: number
  monetizationScore: number
  reasons: string[]
  blockers: string[]
}

function normalizeMarketplace(value: string): SupportedMarketplace | undefined {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'shopee') return 'shopee'
  if (normalized === 'amazon') return 'amazon'
  if (normalized === 'mercado_livre' || normalized === 'mercadolivre') return 'mercado_livre'
  return undefined
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value))
}

function offerScore(offer: MarketplaceOfferSignals, reasons: string[]): number {
  const price = offer.price ?? 0
  const oldPrice = offer.oldPrice ?? 0
  if (price <= 0) return 0
  let score = 10
  if (oldPrice > price) {
    const savings = oldPrice - price
    const percentage = savings / oldPrice
    score += percentage >= 0.10 && percentage <= 0.80 ? 18 : 4
    if (savings >= 100) score += 7
    reasons.push(`economia:${savings.toFixed(2)}`)
  }
  if (offer.hasVerifiedCoupon) {
    score += 7
    reasons.push('cupom_verificado')
  }
  return clamp(score, 0, 40)
}

function logisticsScore(offer: MarketplaceOfferSignals, reasons: string[]): number {
  let score = offer.hasFreeShipping ? 10 : 3
  if (offer.hasFreeShipping) reasons.push('frete_gratis')
  if (offer.deliveryDays !== undefined) {
    if (offer.deliveryDays <= 2) score += 10
    else if (offer.deliveryDays <= 5) score += 6
  }
  return clamp(score, 0, 20)
}

function marketplaceTrustScore(marketplace: SupportedMarketplace, offer: MarketplaceOfferSignals, reasons: string[], blockers: string[]): number {
  let score = 0
  if (offer.isOfficialStore) {
    score += marketplace === 'amazon' ? 25 : 20
    reasons.push('loja_oficial')
  }
  if (marketplace === 'shopee' && offer.isMall) {
    score += 15
    reasons.push('shopee_mall')
  }
  if (marketplace === 'mercado_livre') {
    if (offer.sellerReputation === 'green') {
      score += 20
      reasons.push('reputacao_verde')
    } else if (offer.sellerReputation === 'red') {
      blockers.push('reputacao_nao_confiavel')
    }
  }
  if (offer.sellerRating !== undefined) {
    if (offer.sellerRating >= 4.7) score += 10
    else if (offer.sellerRating >= 4.3) score += 6
    else if (offer.sellerRating < 4) blockers.push('avaliacao_baixa')
  }
  if ((offer.sellerSales ?? 0) >= 100) score += 5
  if (marketplace === 'amazon' && offer.isPrime) {
    score += 10
    reasons.push('prime')
  }
  if (marketplace === 'amazon' && offer.isFulfilledByAmazon) score += 5
  return clamp(score, 0, 50)
}

function monetizationScore(marketplace: SupportedMarketplace, offer: MarketplaceOfferSignals, reasons: string[], blockers: string[]): number {
  if (offer.affiliateEligible === false) {
    blockers.push('afiliacao_nao_elegivel')
    return 0
  }
  let score = 5
  if (offer.hasExtraCommission && marketplace === 'shopee') {
    score += 5
    reasons.push('comissao_extra')
  }
  return score
}

export function scoreMarketplaceOffer(offer: MarketplaceOfferSignals): MarketplaceScoreBreakdown {
  const marketplace = normalizeMarketplace(offer.marketplace)
  if (!marketplace) {
    return { marketplace: 'unsupported', score: 0, eligible: false, trustScore: 0, offerScore: 0, logisticsScore: 0, monetizationScore: 0, reasons: [], blockers: ['marketplace_nao_suportado'] }
  }
  const reasons: string[] = []
  const blockers: string[] = []
  const trust = marketplaceTrustScore(marketplace, offer, reasons, blockers)
  const commercial = offerScore(offer, reasons)
  const logistics = logisticsScore(offer, reasons)
  const monetization = monetizationScore(marketplace, offer, reasons, blockers)
  const score = clamp(trust + commercial + logistics + monetization)
  return { marketplace, score, eligible: blockers.length === 0 && score >= 45, trustScore: trust, offerScore: commercial, logisticsScore: logistics, monetizationScore: monetization, reasons, blockers }
}
