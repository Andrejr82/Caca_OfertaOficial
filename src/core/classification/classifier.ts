import { ACCESSORY_TERMS, BUNDLE_TERMS, COUPON_TERMS, KNOWN_BRANDS, PRODUCT_TYPES } from './catalog'
import { extractCapacityLiters, extractModel, extractPowerWatts, extractVoltage, normalizeTitle } from './normalize'
import type { ClassificationResult, ProductAttributes, ProductRole } from './types'

function detectProductType(title: string): string | undefined {
  return Object.entries(PRODUCT_TYPES).find(([, pattern]) => pattern.test(title))?.[0]
}

function extractAttributes(title: string, productType?: string): ProductAttributes {
  const normalized = normalizeTitle(title)
  const brand = KNOWN_BRANDS.find((candidate) => normalized.split(' ').includes(candidate))
  const attributes: ProductAttributes = {
    brand,
    model: extractModel(title),
    capacityLiters: extractCapacityLiters(title),
    voltage: extractVoltage(title),
    powerWatts: extractPowerWatts(title),
  }
  if (productType === 'air_fryer') attributes.formFactor = 'basket'
  return Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined)) as ProductAttributes
}

export function classifyProduct({ title }: { title: string }): ClassificationResult {
  const productType = detectProductType(title)
  let productRole: ProductRole = 'main_product'
  if (COUPON_TERMS.test(title)) productRole = 'coupon'
  else if (ACCESSORY_TERMS.test(title)) productRole = 'accessory'
  else if (BUNDLE_TERMS.test(title)) productRole = 'bundle'

  const capacities = [...title.matchAll(/\b\d+(?:[,.]\d+)?\s*l\b/gi)]
  const conflictingCapacities = new Set(capacities.map((match) => Number(match[0].replace(',', '.').replace(/\s*l$/i, '')))).size > 1
  const status = productRole !== 'main_product'
    ? 'excluded'
    : productType && !conflictingCapacities ? 'classified' : 'review_required'

  return {
    productType,
    productRole,
    status,
    attributes: extractAttributes(title, productType),
    ruleTrace: [productType ? `type:${productType}` : 'type:unknown', `role:${productRole}`, conflictingCapacities ? 'capacity:conflict' : 'capacity:consistent'],
  }
}
