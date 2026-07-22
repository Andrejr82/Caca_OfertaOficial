export type ProductRole = 'main_product' | 'accessory' | 'bundle' | 'coupon'
export type ClassificationStatus = 'classified' | 'review_required' | 'excluded'
export type Voltage = '127V' | '220V' | 'BIVOLT'

export interface ProductAttributes {
  brand?: string
  model?: string
  capacityLiters?: number
  voltage?: Voltage
  powerWatts?: number
  formFactor?: string
}

export interface ClassificationResult {
  productType?: string
  productRole: ProductRole
  status: ClassificationStatus
  attributes: ProductAttributes
  ruleTrace: string[]
}

export interface GroupKey {
  kind: 'exact' | 'family'
  key: string
}
