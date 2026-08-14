type OfferNameInput = { product_name: string; short_name?: string | null };

export function getVideoOfferDisplayName(offer: OfferNameInput): string {
  const explicitName = offer.short_name?.trim();
  if (explicitName) return explicitName;

  return offer.product_name
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}
