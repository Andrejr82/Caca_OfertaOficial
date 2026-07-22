import { describe, expect, it } from 'vitest'
import { scoreMarketplaceOffer } from '@/core/intelligence/marketplace-policy'

describe('marketplace policy', () => {
  it('prioritizes a verified Shopee Mall offer', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Shopee', price: 299, oldPrice: 399, isMall: true, isOfficialStore: true, sellerRating: 4.8, sellerSales: 1000, hasVerifiedCoupon: true, hasExtraCommission: true, hasFreeShipping: true, deliveryDays: 2 })
    expect(result.eligible).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reasons).toEqual(expect.arrayContaining(['shopee_mall', 'cupom_verificado']))
  })

  it('blocks Amazon offers that cannot receive affiliate attribution', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Amazon', price: 100, isPrime: true, affiliateEligible: false })
    expect(result.eligible).toBe(false)
    expect(result.blockers).toContain('afiliacao_nao_elegivel')
  })

  it('blocks Mercado Livre sellers with red reputation', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Mercado Livre', price: 100, sellerReputation: 'red', sellerRating: 4.8 })
    expect(result.eligible).toBe(false)
    expect(result.blockers).toContain('reputacao_nao_confiavel')
  })

  it('rejects unsupported marketplaces instead of guessing', () => {
    expect(scoreMarketplaceOffer({ marketplace: 'Magalu', price: 100 })).toMatchObject({ marketplace: 'unsupported', eligible: false, score: 0 })
  })
})
