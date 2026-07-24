import { describe, expect, it } from 'vitest'
import { buildAutomatedCopyQueue, type DeferredCopyQueueItem } from '@/core/intelligence/copy-v2-automation'
import { DeduplicationEngine } from '@/core/deduplication/deduplication-engine'

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

  it('1. categoria abaixo do limite', () => {
    const result = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG 50 polegadas', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Smart TV Samsung 55 polegadas', marketplace: 'Amazon', price: 1600, oldPrice: 2100, isPrime: true, hasFreeShipping: true },
    ], { maxPerCategory: 3 })
    expect(result.queue).toHaveLength(2)
    expect(result.deferred).toHaveLength(0)
  })

  it('2. categoria exatamente no limite', () => {
    const result = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG 50 polegadas', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Smart TV Samsung 55 polegadas', marketplace: 'Amazon', price: 1600, oldPrice: 2100, isPrime: true, hasFreeShipping: true },
    ], { maxPerCategory: 2 })
    expect(result.queue).toHaveLength(2)
    expect(result.deferred).toHaveLength(0)
  })

  it('3. categoria acima do limite e 4. excedentes marcados como adiados', () => {
    const result = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Smart TV Samsung', marketplace: 'Amazon', price: 1600, oldPrice: 2100, isPrime: true, hasFreeShipping: true },
      { id: '3', title: 'Smart TV Philco', marketplace: 'Amazon', price: 1700, oldPrice: 2200, isPrime: true, hasFreeShipping: true },
    ], { maxPerCategory: 2, maxPerMarketplace: 10 })
    expect(result.queue).toHaveLength(2)
    expect(result.deferred).toHaveLength(1)
    expect(result.deferred[0].reason).toBe('limite_categoria')
    expect(result.deferred[0].attempts).toBe(1)
  })

  it('5. item adiado reaparecendo em ciclo posterior e 6. não reaparecendo no mesmo ciclo', () => {
    const cycle1 = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Smart TV Samsung', marketplace: 'Amazon', price: 1600, oldPrice: 2100, isPrime: true, hasFreeShipping: true },
      { id: '3', title: 'Smart TV Philco', marketplace: 'Amazon', price: 1700, oldPrice: 2200, isPrime: true, hasFreeShipping: true },
    ], { maxPerCategory: 2, maxPerMarketplace: 10 })

    expect(cycle1.deferred).toHaveLength(1)
    expect(cycle1.queue.find(q => q.offerId === cycle1.deferred[0].offerId)).toBeUndefined()

    const cycle2 = buildAutomatedCopyQueue([
      { id: '4', title: 'Smartphone Motorola', marketplace: 'Mercado Livre', price: 1000, oldPrice: 1500, sellerReputation: 'green', hasFreeShipping: true },
    ], { maxPerCategory: 2, maxPerMarketplace: 10 }, cycle1.deferred)

    expect(cycle2.queue).toHaveLength(2)
    expect(cycle2.queue.find(q => q.offerId === cycle1.deferred[0].offerId)).toBeDefined()
    expect(cycle2.queue.find(q => q.offerId === cycle1.deferred[0].offerId)?.reason).toBe('curadoria_recuperada')
    expect(cycle2.deferred).toHaveLength(0)
  })

  it('7. prioridade por score entre adiados', () => {
    const fakeDeferred1: DeferredCopyQueueItem = {
      offerId: 'd1', marketplace: 'Shopee', productType: 'television', title: 'D1', curationScore: 10, originalPosition: 1, reason: 'limite_categoria',
      deferredAt: new Date().toISOString(), attempts: 1, nextEligibleAt: new Date().toISOString(),
      commercialHash: 'd1_hash'
    }
    const fakeDeferred2: DeferredCopyQueueItem = {
      offerId: 'd2', marketplace: 'Shopee', productType: 'television', title: 'D2', curationScore: 90, originalPosition: 2, reason: 'limite_categoria',
      deferredAt: new Date().toISOString(), attempts: 1, nextEligibleAt: new Date().toISOString(),
      commercialHash: 'd2_hash'
    }
    const cycle = buildAutomatedCopyQueue([
      { id: 'n1', title: 'Smart TV LG', marketplace: 'Shopee', price: 10, oldPrice: 200, isMall: true, isOfficialStore: true, sellerRating: 5.0, hasFreeShipping: true }
    ], { maxPerCategory: 2 }, [fakeDeferred1, fakeDeferred2])

    expect(cycle.queue[0].offerId).toBe('d2')
    expect(cycle.queue[1].offerId).toBe('n1')
    expect(cycle.deferred[0].offerId).toBe('d1')
  })

  it('8. ausência de duplicidade (deduplication by CommercialIdentity)', () => {
    const identicalItem = { id: 'dup', title: 'Smart TV LG 50', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true };
    const hash = DeduplicationEngine.buildCommercialIdentity({
      platform: 'Amazon', title: 'Smart TV LG 50', price: 1500, item_id: 'dup'
    }).commercialHash;

    const fakeDeferred: DeferredCopyQueueItem = {
      offerId: 'dup_old', marketplace: 'Amazon', productType: 'television', title: 'Smart TV LG 50', curationScore: 100, originalPosition: 1, reason: 'limite_categoria',
      deferredAt: new Date().toISOString(), attempts: 1, nextEligibleAt: new Date().toISOString(),
      commercialHash: hash
    }

    const cycle = buildAutomatedCopyQueue([identicalItem], { maxPerCategory: 5 }, [fakeDeferred])
    expect(cycle.queue).toHaveLength(1)
    expect(cycle.queue[0].offerId).toBe('dup_old')
  })

  it('9. limite de tentativas', () => {
    const now = new Date();
    const fakeDeferred: DeferredCopyQueueItem = {
      offerId: 'd1', marketplace: 'Shopee', title: 'D1', curationScore: 50, originalPosition: 1, reason: 'limite_categoria',
      deferredAt: now.toISOString(), attempts: 3, nextEligibleAt: now.toISOString(),
      commercialHash: 'd1_hash'
    }
    const cycle = buildAutomatedCopyQueue([], { deferredMaxAttempts: 3, clock: () => now }, [fakeDeferred])
    expect(cycle.queue).toHaveLength(0)
    expect(cycle.deferred).toHaveLength(0)
    expect(cycle.skipped).toHaveLength(1)
    expect(cycle.skipped[0].reason).toBe('deferred_max_attempts')
  })

  it('10. expiração por TTL', () => {
    const now = new Date('2026-07-24T12:00:00Z');
    const past = new Date('2026-07-23T10:00:00Z');
    const fakeDeferred: DeferredCopyQueueItem = {
      offerId: 'd1', marketplace: 'Shopee', title: 'D1', curationScore: 50, originalPosition: 1, reason: 'limite_categoria',
      deferredAt: past.toISOString(), attempts: 1, nextEligibleAt: past.toISOString(),
      commercialHash: 'd1_hash'
    }
    const cycle = buildAutomatedCopyQueue([], { deferredTtlHours: 24, clock: () => now }, [fakeDeferred])
    expect(cycle.queue).toHaveLength(0)
    expect(cycle.deferred).toHaveLength(0)
    expect(cycle.skipped).toHaveLength(1)
    expect(cycle.skipped[0].reason).toBe('deferred_ttl_expired')
  })

  it('11. compatibilidade com MAX_DAILY_PER_CATEGORY e precedência', () => {
    process.env.MAX_DAILY_PER_CATEGORY = '2';
    process.env.MAX_PER_QUEUE_CATEGORY = '1';
    
    const c1 = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Smart TV Samsung', marketplace: 'Amazon', price: 1600, oldPrice: 2100, isPrime: true, hasFreeShipping: true },
    ]);
    expect(c1.queue).toHaveLength(1);
    expect(c1.deferred).toHaveLength(1);

    delete process.env.MAX_PER_QUEUE_CATEGORY;
    const c2 = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Smart TV Samsung', marketplace: 'Amazon', price: 1600, oldPrice: 2100, isPrime: true, hasFreeShipping: true },
      { id: '3', title: 'Smart TV Philco', marketplace: 'Amazon', price: 1700, oldPrice: 2200, isPrime: true, hasFreeShipping: true },
    ]);
    expect(c2.queue).toHaveLength(2);
    
    delete process.env.MAX_DAILY_PER_CATEGORY;
    const c3 = buildAutomatedCopyQueue(Array.from({length: 6}).map((_, i) => (
      { id: `${i}`, title: `Smart TV ${i}`, marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true }
    )));
    expect(c3.queue).toHaveLength(5);
    expect(c3.deferred).toHaveLength(1);
  })

  it('14. filas com várias categorias', () => {
    const cycle = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '2', title: 'Air Fryer Mondial', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
      { id: '3', title: 'Smartphone Moto', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
    ], { maxPerCategory: 1 });
    expect(cycle.queue).toHaveLength(3);
    expect(cycle.deferred).toHaveLength(0);
  })

  it('15. fila sem produtos suficientes para completar o lote', () => {
    const cycle = buildAutomatedCopyQueue([
      { id: '1', title: 'Smart TV LG', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true },
    ], { maxTotal: 30, maxPerCategory: 5 });
    expect(cycle.queue).toHaveLength(1);
  })

  it('ordem determinística em execuções repetidas', () => {
    const itemA = { id: 'A', title: 'Smart TV A', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true };
    const itemB = { id: 'B', title: 'Smart TV B', marketplace: 'Amazon', price: 1500, oldPrice: 2000, isPrime: true, hasFreeShipping: true };
    
    const c1 = buildAutomatedCopyQueue([itemA, itemB]);
    const c2 = buildAutomatedCopyQueue([itemB, itemA]);
    
    expect(c1.queue.map(q => q.offerId)).toEqual(c2.queue.map(q => q.offerId));
  })
})
