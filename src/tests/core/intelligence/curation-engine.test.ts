import { describe, expect, it } from 'vitest'
import { curateOffers } from '@/core/intelligence/curation-engine'

describe('curation engine', () => {
  it('recommends one candidate and keeps other brands as alternatives in the same family', () => {
    const result = curateOffers([
      { id: 'mondial', title: 'Air Fryer Mondial 5L 1500W 220V', marketplace: 'Shopee', price: 249, oldPrice: 299, isOfficialStore: true, isMall: true, sellerRating: 4.8, hasFreeShipping: true },
      { id: 'generic', title: 'Air Fryer 5L 1500W 220V', marketplace: 'Amazon', price: 199, oldPrice: 299, isPrime: true, isFulfilledByAmazon: true, affiliateEligible: true, hasFreeShipping: true },
    ])
    expect(result).toHaveLength(2)
    expect(result.map((offer) => offer.decision).sort()).toEqual(['alternative', 'recommend'])
    expect(result[0].groupKeys.some((key) => key.includes('family:air_fryer:basket:5l'))).toBe(true)
  })

  it('excludes an accessory from the primary selection', () => {
    const [result] = curateOffers([{ id: 'basket', title: 'Cesto de silicone para Air Fryer 5L', marketplace: 'Shopee', price: 39, isMall: true }])
    expect(result.decision).toBe('exclude')
    expect(result.groupKeys).toEqual([])
  })

  it('does not auto-select ambiguous or ineligible offers', () => {
    const [result] = curateOffers([{ id: 'ambiguous', title: 'Air Fryer Forno 10L 17L', marketplace: 'Mercado Livre', price: 300, sellerReputation: 'red' }])
    expect(result.decision).toBe('review')
    expect(result.marketplaceScore.blockers).toContain('reputacao_nao_confiavel')
  })
})
