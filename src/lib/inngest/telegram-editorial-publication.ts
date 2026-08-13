export type TelegramEditorialPostCandidate = {
  id: string;
  offer_id: string;
  user_id?: string;
  status: string;
  created_at: string;
};

export function buildTelegramEditorialPublicationPlan(
  posts: readonly TelegramEditorialPostCandidate[],
  selectedOfferIds: readonly string[],
): TelegramEditorialPostCandidate[] {
  const selected = new Set(selectedOfferIds);
  const seenOffers = new Set<string>();
  return [...posts]
    .filter((post) => post.status === "draft" && selected.has(post.offer_id))
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
    .filter((post) => {
      if (seenOffers.has(post.offer_id)) return false;
      seenOffers.add(post.offer_id);
      return true;
    });
}
