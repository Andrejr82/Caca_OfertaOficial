import { describe, expect, it } from 'vitest'
import { processDiscoveryV2, type RawDiscoveryItem } from '@/core/discovery-v2/pipeline'

const fixture: RawDiscoveryItem[] = [
  { externalId: 'sh-air-1', marketplace: 'Shopee', title: 'Air Fryer Mondial 5L 220V', sourceUrl: 'https://fixture/sh-air-1', rawPayload: { scenario: 'manual-fixture' }, price: 199, oldPrice: 299, isMall: true, isOfficialStore: true, sellerRating: 4.8, hasFreeShipping: true },
  { externalId: 'sh-air-2', marketplace: 'Shopee', title: 'Air Fryer 5L 220V', sourceUrl: 'https://fixture/sh-air-2', rawPayload: { scenario: 'manual-fixture' }, price: 189, oldPrice: 289, isMall: true, sellerRating: 4.8, hasFreeShipping: true },
  { externalId: 'sh-basket', marketplace: 'Shopee', title: 'Cesto de silicone para Air Fryer 5L', sourceUrl: 'https://fixture/sh-basket', rawPayload: { scenario: 'manual-fixture' }, price: 29, isMall: true },
  { externalId: 'sh-coffee', marketplace: 'Shopee', title: 'Cafeteira Oster 1L', sourceUrl: 'https://fixture/sh-coffee', rawPayload: { scenario: 'manual-fixture' }, price: 199, isMall: true, sellerRating: 4.8, hasFreeShipping: true },
  { externalId: 'am-tv', marketplace: 'Amazon', title: 'Smart TV LG 50 polegadas', sourceUrl: 'https://fixture/am-tv', rawPayload: { scenario: 'manual-fixture' }, price: 1999, oldPrice: 2299, sellerRating: 4.8, isPrime: true, isFulfilledByAmazon: true, affiliateEligible: true, hasFreeShipping: true },
  { externalId: 'am-notebook', marketplace: 'Amazon', title: 'Notebook Lenovo 15 polegadas', sourceUrl: 'https://fixture/am-notebook', rawPayload: { scenario: 'manual-fixture' }, price: 2999, sellerRating: 4.8, isPrime: true, isFulfilledByAmazon: true, affiliateEligible: true, hasFreeShipping: true },
  { externalId: 'ml-phone', marketplace: 'Mercado Livre', title: 'Smartphone Samsung Galaxy', sourceUrl: 'https://fixture/ml-phone', rawPayload: { scenario: 'manual-fixture' }, price: 1299, oldPrice: 1499, sellerRating: 4.8, sellerReputation: 'green', hasFreeShipping: true },
  { externalId: 'ml-red', marketplace: 'Mercado Livre', title: 'Smartphone Xiaomi Redmi', sourceUrl: 'https://fixture/ml-red', rawPayload: { scenario: 'manual-fixture' }, price: 999, sellerRating: 4.8, sellerReputation: 'red', hasFreeShipping: true },
]

describe('manual controlled Discovery V2 fixture', () => {
  it('keeps only one representative per comparable group and excludes accessories', () => {
    const result = processDiscoveryV2(fixture, { maxTotal: 20, maxPerMarketplace: 5, maxPerCategory: 3 })
    const queueIds = result.copyQueue.queue.map((item) => item.offerId)
    expect(queueIds).toContain('sh-air-1')
    expect(queueIds).not.toContain('sh-air-2')
    expect(queueIds).not.toContain('sh-basket')
    expect(queueIds).not.toContain('ml-red')
    expect(result.items.find((item) => item.raw.externalId === 'sh-basket')?.classification.status).toBe('excluded')
    expect(result.items.find((item) => item.raw.externalId === 'ml-red')?.curation.decision).toBe('review')
  })

  it('applies per-round total and marketplace limits', () => {
    const result = processDiscoveryV2(fixture, { maxTotal: 2, maxPerMarketplace: 1, maxPerCategory: 3 })
    expect(result.copyQueue.queue).toHaveLength(2)
    expect(new Set(result.copyQueue.queue.map((item) => item.marketplace)).size).toBe(2)
    expect(result.copyQueue.queue.every((item) => item.curationScore >= 0)).toBe(true)
  })
})
