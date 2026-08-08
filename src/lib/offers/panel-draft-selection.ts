type PanelDraftOffer = {
  id?: string;
  status?: string | null;
  created_at?: string | null;
  explainability?: Record<string, unknown> | null;
};

export type PanelDraftPost = {
  id: string;
  offer_id: string;
  status: string;
  created_at: string;
  posted_at?: string | null;
  external_id?: string | null;
  deleted_at?: string | null;
  offers?: PanelDraftOffer | null;
};

export function isManualExpressDraft(post: PanelDraftPost): boolean {
  return post.offers?.explainability?.manual_source === true;
}

function isActiveDraft(post: PanelDraftPost): boolean {
  const offerStatus = String(post.offers?.status || "").toLowerCase();
  return post.status === "draft"
    && !post.deleted_at
    && !post.posted_at
    && !post.external_id
    && !["posted", "approved", "rejected", "deferred"].includes(offerStatus);
}

export function mergePanelDrafts<T extends PanelDraftPost>(
  drafts: readonly T[],
  editorialOfferIds: ReadonlySet<string>,
  editorialDayStart: Date,
): T[] {
  const selected = drafts.filter((post) => {
    if (!isActiveDraft(post)) return false;
    if (isManualExpressDraft(post)) return true;
    if (!editorialOfferIds.has(post.offer_id)) return false;
    const postCreatedAt = new Date(post.created_at).getTime();
    const offerCreatedAt = new Date(post.offers?.created_at || "").getTime();
    return Number.isFinite(postCreatedAt)
      && postCreatedAt >= editorialDayStart.getTime()
      && Number.isFinite(offerCreatedAt)
      && offerCreatedAt >= editorialDayStart.getTime();
  });

  const byOfferId = new Map<string, T>();
  for (const post of selected) {
    if (!byOfferId.has(post.offer_id)) byOfferId.set(post.offer_id, post);
  }
  return [...byOfferId.values()];
}
