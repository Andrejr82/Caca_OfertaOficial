export type TelegramEditorialPostCandidate = {
  id: string;
  offer_id: string;
  user_id?: string;
  status: string;
  created_at: string;
};

export type TelegramAutomationSetting = {
  user_id?: string | null;
  value?: { telegram_automation_enabled?: boolean } | null;
};

export function selectEnabledTelegramAutomationUserIds(
  settings: readonly TelegramAutomationSetting[],
): string[] {
  return [...new Set(settings
    .filter((setting) => Boolean(setting.user_id) && setting.value?.telegram_automation_enabled === true)
    .map((setting) => setting.user_id as string))];
}

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
