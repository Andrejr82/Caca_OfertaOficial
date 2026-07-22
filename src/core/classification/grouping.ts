import type { ClassificationResult, GroupKey } from './types'

export function buildGroupKeys(result: ClassificationResult): GroupKey[] {
  if (result.productRole !== 'main_product' || !result.productType) return []
  const { brand, model, capacityLiters, voltage, formFactor } = result.attributes
  const family = capacityLiters !== undefined && formFactor
    ? [{ kind: 'family' as const, key: `family:${result.productType}:${formFactor}:${capacityLiters}l` }]
    : []
  if (result.status !== 'classified' || !brand || !model || capacityLiters === undefined || !voltage || !formFactor) return family
  return [
    { kind: 'exact', key: `exact:${result.productType}:${brand.toLowerCase()}:${model.toLowerCase()}:${formFactor}:${capacityLiters}l:${voltage.toLowerCase()}` },
    ...family,
  ]
}
