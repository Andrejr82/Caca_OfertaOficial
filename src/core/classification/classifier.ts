import { ACCESSORY_TERMS, BUNDLE_TERMS, COUPON_TERMS, KNOWN_BRANDS, MERCADO_LIVRE_CATEGORY_TYPES, MERCADO_LIVRE_DOMAIN_TYPES, MERCADO_LIVRE_PRODUCT_TYPES, PRODUCT_TYPES } from './catalog'
import { extractCapacityLiters, extractModel, extractPowerWatts, extractVoltage, normalizeTitle } from './normalize'
import type { ClassificationResult, ProductAttributes, ProductRole } from './types'

function detectProductType(title: string, domainId?: string, categoryId?: string): { type?: string; source?: string } {
  const domainType = domainId ? MERCADO_LIVRE_DOMAIN_TYPES[domainId] : undefined
  if (domainType) return { type: domainType, source: `domain:${domainId}` }
  const categoryType = categoryId ? MERCADO_LIVRE_CATEGORY_TYPES[categoryId] : undefined
  if (categoryType) return { type: categoryType, source: `category:${categoryId}` }
  const catalogType = Object.entries(PRODUCT_TYPES).find(([, pattern]) => pattern.test(title))?.[0]
  if (catalogType) return { type: catalogType, source: 'canonical:title' }
  const mercadoLivreType = MERCADO_LIVRE_PRODUCT_TYPES.find(({ pattern }) => pattern.test(title))?.type
  if (mercadoLivreType) return { type: mercadoLivreType, source: categoryId ? `category:${categoryId}` : 'mercadolivre:title' }
  return {}
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

export function classifyProduct({ title, domainId, categoryId }: { title: string; domainId?: string; categoryId?: string }): ClassificationResult {
  const detected = detectProductType(title, domainId, categoryId)
  const productType = detected.type
  let productRole: ProductRole = 'main_product'
  if (COUPON_TERMS.test(title)) productRole = 'coupon'
  else if (ACCESSORY_TERMS.test(title)) productRole = 'accessory'
  else if (BUNDLE_TERMS.test(title) && /\+|acess[oó]rios?|conjunto de produtos?/i.test(title)) productRole = 'bundle'

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
    ruleTrace: [productType ? `type:${productType}` : 'type:unknown', ...(detected.source ? [detected.source] : []), `role:${productRole}`, conflictingCapacities ? 'capacity:conflict' : 'capacity:consistent'],
  }
}
