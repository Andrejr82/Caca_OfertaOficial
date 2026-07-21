import { describe, expect, it } from 'vitest'
import { classifyProduct } from '@/core/classification/classifier'

describe('deterministic product classifier', () => {
  it('classifies a known air fryer as a main product', () => {
    expect(classifyProduct({ title: 'Air Fryer Philco PAF95A 9,5L 220V 1800W' })).toMatchObject({
      productType: 'air_fryer', productRole: 'main_product', status: 'classified',
      attributes: { brand: 'philco', model: 'PAF95A', capacityLiters: 9.5, voltage: '220V' },
    })
  })

  it('excludes accessories and bundles from primary product selection', () => {
    expect(classifyProduct({ title: 'Cesto de silicone para Air Fryer 5L' })).toMatchObject({ productType: 'air_fryer', productRole: 'accessory', status: 'excluded' })
    expect(classifyProduct({ title: 'Kit Air Fryer + acessórios' })).toMatchObject({ productRole: 'bundle', status: 'excluded' })
  })

  it('requires review for conflicting capacity claims', () => {
    expect(classifyProduct({ title: 'Air Fryer Forno 10L 17L' })).toMatchObject({ productRole: 'main_product', status: 'review_required' })
  })

  it('recognizes accessory titles within product families', () => {
    expect(classifyProduct({ title: 'Suporte de celular para carro' })).toMatchObject({ productType: 'smartphone', productRole: 'accessory', status: 'excluded' })
    expect(classifyProduct({ title: 'Cadarço para tênis de corrida' })).toMatchObject({ productType: 'running_shoe', productRole: 'accessory', status: 'excluded' })
  })
})
