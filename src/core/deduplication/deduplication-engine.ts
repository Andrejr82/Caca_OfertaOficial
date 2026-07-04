import * as crypto from 'crypto';

export interface DeduplicationInput {
  platform?: string;
  marketplace?: string;
  product_name?: string;
  title?: string;
  current_price?: number;
  price?: number;
  item_id?: string;
  original_url?: string;
  url?: string;
  canonicalUrl?: string;
  seller?: string;
  shop_name?: string;
  commercialTier?: string;
  contentHash?: string;
}

export interface CommercialIdentity {
  marketplace: string;
  normalizedName: string;
  itemId: string | null;
  seller: string | null;
  roundedPrice: number;
  commercialHash: string;
}

export type DeduplicationDecision = 'UNIQUE' | 'DUPLICATE';

export interface DeduplicationResult {
  decision: DeduplicationDecision;
  identity: CommercialIdentity;
  reason: string;
}

export class DeduplicationEngine {
  /**
   * Normaliza strings para comparação (remove acentos, pontuação, múltiplos espaços).
   */
  static normalizeText(text: string): string {
    if (!text) return "";
    return text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ") // Remove pontuação
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Constrói a Identidade Comercial única da oferta.
   */
  static buildCommercialIdentity(offer: DeduplicationInput): CommercialIdentity {
    const marketplace = (offer.platform || offer.marketplace || "UNKNOWN").toUpperCase();
    const rawName = offer.product_name || offer.title || "";
    const normalizedName = this.normalizeText(rawName);
    
    const price = offer.current_price ?? offer.price ?? 0;
    const roundedPrice = Math.round(price * 100) / 100; // Normaliza flutuações pequenas

    const itemId = offer.item_id || null;
    const seller = offer.seller || offer.shop_name ? this.normalizeText(offer.seller || offer.shop_name || "") : null;

    // Constrói um Hash Comercial unificado
    // Preferência de identificação: 
    // 1. Marketplace + Item ID
    // 2. Marketplace + Nome Normalizado + Seller + Preço Arredondado
    
    let baseString = "";
    if (itemId) {
      baseString = `${marketplace}|ID:${itemId}`;
    } else if (seller) {
      baseString = `${marketplace}|NAME:${normalizedName}|SELLER:${seller}|PRICE:${roundedPrice}`;
    } else {
      // Fallback para URL ou Hash existente se não houver dados suficientes
      const fallbackUrl = offer.canonicalUrl || offer.original_url || offer.url || "";
      baseString = `${marketplace}|NAME:${normalizedName}|PRICE:${roundedPrice}|URL:${fallbackUrl}`;
    }

    const commercialHash = crypto.createHash('sha256').update(baseString).digest('hex');

    return {
      marketplace,
      normalizedName,
      itemId,
      seller,
      roundedPrice,
      commercialHash
    };
  }

  /**
   * Compara uma oferta entrante contra o histórico (simulado via array para a engine).
   * Responde: "Esta oferta representa um produto já conhecido?"
   */
  static evaluate(offer: DeduplicationInput, existingIdentities: string[] = []): DeduplicationResult {
    const identity = this.buildCommercialIdentity(offer);

    // Se já foi forçado um hash pela engine anterior (como o contentHash do validator)
    if (offer.contentHash && existingIdentities.includes(offer.contentHash)) {
      return { decision: 'DUPLICATE', identity, reason: 'CONTENT_HASH_EXISTENTE' };
    }

    // Compara o novo Hash Comercial com o histórico
    if (existingIdentities.includes(identity.commercialHash)) {
      return { decision: 'DUPLICATE', identity, reason: 'COMMERCIAL_IDENTITY_MATCH' };
    }

    // Compara fallback literal de URL caso falte a nova estrutura (retrocompatibilidade)
    const rawUrl = offer.original_url || offer.url;
    if (rawUrl && existingIdentities.includes(rawUrl)) {
      return { decision: 'DUPLICATE', identity, reason: 'ORIGINAL_URL_MATCH' };
    }

    return { decision: 'UNIQUE', identity, reason: 'NO_MATCH_FOUND' };
  }
}
