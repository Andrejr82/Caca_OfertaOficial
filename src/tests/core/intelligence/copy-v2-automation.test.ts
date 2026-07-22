import { describe, expect, it } from 'vitest'
import { buildAutomatedCopyQueue } from '@/core/intelligence/copy-v2-automation'

describe('automated Copy V2 queue', () => {
  it('queues only deterministic recommendations and limits volume', () => {
    const result = buildAutomatedCopyQueue([
      { id: 'a', title: 'Air Fryer Mondial 5L 220V', marketplace: 'Shopee', price: 199, oldPrice: 299, isMall: true, isOfficialStore: true, sellerRating: 4.8, hasFreeShipping: true },
      { id: 'b', title: 'Air Fryer 5L 220V', marketplace: 'Amazon', price: 189, oldPrice: 299, isPrime: true, isFulfilledByAmazon: true, affiliateEligible: true, hasFreeShipping: true },
      { id: 'c', title: 'Cesto de silicone para Air Fryer 5L', marketplace: 'Shopee', price: 29, isMall: true },
    ], { maxTotal: 5, maxPerMarketplace: 5, maxPerCategory: 5 })
    expect(result.queue).toHaveLength(1)
    expect(result.queue[0]).toMatchObject({ offerId: 'a', reason: 'curadoria_recomendada' })
    expect(result.skipped).toEqual(expect.arrayContaining([{ offerId: 'b', reason: 'grupo_ja_representado' }]))
    expect(result.skipped).toEqual(expect.arrayContaining([{ offerId: 'c', reason: expect.any(String) }]))
  })

  it('enforces marketplace and category limits', () => {
    const result = buildAutomatedCopyQueue([
      { id: '1', title: 'Cafeteira Oster 1L', marketplace: 'Shopee', price: 100, isMall: true, sellerRating: 4.8, hasFreeShipping: true },
      { id: '2', title: 'Cafeteira Mondial 1L', marketplace: 'Shopee', price: 90, isMall: true, sellerRating: 4.8, hasFreeShipping: true },
      { id: '3', title: 'Cafeteira Philco 1L', marketplace: 'Shopee', price: 80, isMall: true, sellerRating: 4.8, hasFreeShipping: true },
    ], { maxPerMarketplace: 1, maxPerCategory: 3 })
    expect(result.queue).toHaveLength(1)
    expect(result.skipped).toEqual([{ offerId: '2', reason: 'limite_marketplace' }, { offerId: '3', reason: 'limite_marketplace' }])
  })
})
