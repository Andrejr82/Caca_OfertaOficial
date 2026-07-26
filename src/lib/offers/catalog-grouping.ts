import type { Offer } from "@/types/domain";

export function getMarketplaceCatalogKey(offer: Partial<Offer>): string {
  if (!offer.id) {
    return `unknown:${Math.random().toString(36).substring(2, 9)}`;
  }

  if (offer.platform === "Mercado Livre") {
    if (offer.original_url) {
      // Tentar extrair /p/MLB...
      const match = offer.original_url.match(/\/p\/(MLB\d+)/i);
      if (match && match[1]) {
        return `ml:catalog:${match[1].toUpperCase()}`;
      }
    }

    // Se não tiver URL de catálogo, cai no agrupamento por item_id
    if (offer.item_id) {
      return `ml:item:${offer.item_id}`;
    }
  }

  // Para Amazon, Shopee ou ML sem item_id/URL
  return `other:${offer.id}`;
}

export function selectCatalogWinner(offers: Offer[]): Offer {
  if (offers.length === 0) {
    throw new Error("Não é possível selecionar vencedor de uma lista vazia.");
  }
  if (offers.length === 1) {
    return offers[0];
  }

  // Usamos slice para não mutar o array original durante o sort
  return offers.slice().sort((a, b) => {
    // 1. Maior score (descendente)
    const scoreA = typeof a.score === "number" ? a.score : -Infinity;
    const scoreB = typeof b.score === "number" ? b.score : -Infinity;
    if (scoreB !== scoreA) return scoreB - scoreA;

    // 2. Maior desconto real (descendente)
    const discountA = (a.old_price && a.old_price > a.current_price) ? (a.old_price - a.current_price) : 0;
    const discountB = (b.old_price && b.old_price > b.current_price) ? (b.old_price - b.current_price) : 0;
    if (discountB !== discountA) return discountB - discountA;

    // 3. Menor current_price (ascendente)
    const priceA = typeof a.current_price === "number" ? a.current_price : Infinity;
    const priceB = typeof b.current_price === "number" ? b.current_price : Infinity;
    if (priceA !== priceB) return priceA - priceB;

    // 4. Menor source_position (ascendente)
    const posA = typeof a.source_position === "number" ? a.source_position : Infinity;
    const posB = typeof b.source_position === "number" ? b.source_position : Infinity;
    if (posA !== posB) return posA - posB;

    // 5. created_at mais recente (descendente)
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    // Se algum falhar no getTime (NaN), convertemos para 0
    const validTimeA = isNaN(timeA) ? 0 : timeA;
    const validTimeB = isNaN(timeB) ? 0 : timeB;
    if (validTimeB !== validTimeA) return validTimeB - validTimeA;

    // 6. Desempate final pelo id
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  })[0];
}