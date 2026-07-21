import { describe, expect, it } from 'vitest'
import { extractCapacityLiters, extractModel, extractVoltage, normalizeTitle } from '@/core/classification/normalize'

describe('product normalization', () => {
  it('normalizes title accents, separators and casing', () => {
    expect(normalizeTitle('Air Fryer Mondial AFN-40-BI  4L')).toBe('air fryer mondial afn 40 bi 4l')
  })

  it('extracts capacity, voltage and model', () => {
    expect(extractCapacityLiters('Air Fryer 5,5 litros')).toBe(5.5)
    expect(extractVoltage('Liquidificador 127 V')).toBe('127V')
    expect(extractModel('Air Fryer Philco PAF95A 9,5L')).toBe('PAF95A')
  })
})
