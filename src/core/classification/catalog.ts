export const KNOWN_BRANDS = ['philco', 'mondial', 'oster', 'arno', 'electrolux', 'walita', 'britania'] as const

export const PRODUCT_TYPES = {
  air_fryer: /\bair\s*fryer\b/i,
  smartphone: /\b(celular|smartphone)\b/i,
  running_shoe: /\b(tenis|tênis).*(corrida|running)|(corrida|running).*\b(tenis|tênis)\b/i,
} as const

export const ACCESSORY_TERMS = /\b(cesto|silicone|suporte|cadarco|cadarço|refil|peca|peça|case|capa|pelicula|película|protetor|acessorio|acessório)\b/i
export const BUNDLE_TERMS = /\b(combo|kit|conjunto)\b/i
export const COUPON_TERMS = /\b(cupom|voucher|cashback)\b/i
