import { describe, expect, it } from 'vitest'
import { classifyProduct } from '@/core/classification/classifier'
import { buildGroupKeys } from '@/core/classification/grouping'

const classifiedPhilco = classifyProduct({ title: 'Air Fryer Philco PAF95A 9,5L 220V 1800W' })
const accessoryBasket = classifyProduct({ title: 'Cesto de silicone para Air Fryer 5L' })

describe('safe product grouping', () => {
  it('creates exact and family keys when critical attributes are known', () => {
    expect(buildGroupKeys(classifiedPhilco)).toEqual([
      { kind: 'exact', key: 'exact:air_fryer:philco:paf95a:basket:9.5l:220v' },
      { kind: 'family', key: 'family:air_fryer:basket:9.5l' },
    ])
  })

  it('keeps ambiguous products in a family only', () => {
    expect(buildGroupKeys({ ...classifiedPhilco, attributes: { ...classifiedPhilco.attributes, voltage: undefined }, status: 'review_required' })).toEqual([
      { kind: 'family', key: 'family:air_fryer:basket:9.5l' },
    ])
  })

  it('never groups accessories', () => {
    expect(buildGroupKeys(accessoryBasket)).toEqual([])
  })
})
