export type ShopeeReelCandidate = {
  itemId: string;
  shopId: string;
  productName: string;
  productLink: string;
  offerLink: string;
  imageUrl?: string | null;
  priceMin: number;
  priceMax?: number | null;
  shopName?: string | null;
  sales?: number | null;
  ratingStar?: number | null;
  commissionRate?: number | null;
};

export function selectLowestPriceCandidate(candidates: ShopeeReelCandidate[]) {
  return [...candidates]
    .filter((candidate) => Number.isFinite(candidate.priceMin) && candidate.priceMin >= 0 && candidate.offerLink && candidate.productLink)
    .sort((left, right) => left.priceMin - right.priceMin || left.productName.localeCompare(right.productName))[0] ?? null;
}

