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

  // Sprint 3: Qualidade Shopee
  it('accepts Shopee products with rating 4.5', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Shopee', price: 100, oldPrice: 150, sellerRating: 4.5, sellerSales: 100, hasFreeShipping: true, deliveryDays: 2 })
    expect(result.eligible).toBe(true)
    expect(result.blockers).not.toContain('avaliacao_baixa')
  })

  it('rejects Shopee products with rating < 4.5', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Shopee', price: 100, sellerRating: 4.4, sellerSales: 100 })
    expect(result.eligible).toBe(false)
    expect(result.blockers).toContain('avaliacao_baixa')
  })

  it('allows Shopee products with 0 sales if they are from Mall or Official Store (lançamento)', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Shopee', price: 100, oldPrice: 150, sellerRating: 4.8, sellerSales: 0, isMall: true, hasFreeShipping: true, deliveryDays: 2 })
    expect(result.eligible).toBe(true)
    expect(result.reasons).toContain('lancamento_oficial')
    expect(result.blockers).not.toContain('vendas_insuficientes')
  })

  it('rejects Shopee products with low sales if they are not Mall or Official Store', () => {
    const result = scoreMarketplaceOffer({ marketplace: 'Shopee', price: 100, sellerRating: 4.8, sellerSales: 10 })
    expect(result.eligible).toBe(false)
    expect(result.blockers).toContain('vendas_insuficientes')
  })
})
