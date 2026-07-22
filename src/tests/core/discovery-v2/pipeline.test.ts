import { describe, expect, it } from 'vitest'
import { processDiscoveryV2 } from '@/core/discovery-v2/pipeline'

describe('Discovery V2 pipeline', () => {
  it('preserves raw payload and classifies products before copy queueing', () => {
    const result = processDiscoveryV2([
      { externalId: 'air-1', marketplace: 'Shopee', title: 'Air Fryer Mondial 5L 220V', sourceUrl: 'https://shopee.test/1', rawPayload: { source: 'native' }, price: 199, oldPrice: 299, isMall: true, isOfficialStore: true, sellerRating: 4.8, hasFreeShipping: true },
      { externalId: 'basket-1', marketplace: 'Shopee', title: 'Cesto de silicone para Air Fryer 5L', sourceUrl: 'https://shopee.test/2', rawPayload: { source: 'native' }, price: 29, isMall: true },
      { externalId: 'tv-1', marketplace: 'Amazon', title: 'Smart TV LG 50 polegadas', sourceUrl: 'https://amazon.test/1', rawPayload: { source: 'bestseller' }, price: 1999, oldPrice: 2299, isPrime: true, isFulfilledByAmazon: true, affiliateEligible: true, hasFreeShipping: true, sellerRating: 4.8 },
    ])
    expect(result.items).toHaveLength(3)
    expect(result.items[0].raw.rawPayload).toEqual({ source: 'native' })
    expect(result.items[0].classification).toMatchObject({ productType: 'air_fryer', status: 'classified' })
    expect(result.items[1].classification).toMatchObject({ productRole: 'accessory', status: 'excluded' })
    expect(result.items[2].classification).toMatchObject({ productType: 'television', status: 'classified' })
    expect(result.copyQueue.queue.map((item) => item.offerId)).toEqual(expect.arrayContaining(['air-1', 'tv-1']))
    expect(result.copyQueue.queue.map((item) => item.offerId)).not.toContain('basket-1')
  })

  it('never fabricates support for an unsupported marketplace', () => {
    const [item] = processDiscoveryV2([{ externalId: 'x', marketplace: 'Magalu', title: 'Cafeteira elétrica', sourceUrl: 'https://magalu.test/1', rawPayload: {}, price: 100 }]).items
    expect(item.marketplaceScore).toMatchObject({ marketplace: 'unsupported', eligible: false })
    expect(item.curation.decision).toBe('review')
  })
})
