import { identifyLatestDiscoveryCohort, normalizeDiscoveryCorrelationId } from "@/lib/offers/commercial-curation-queue";
import type { Offer } from "@/types/domain";

type PanelDraftOffer = {
  id?: string;
  platform?: string | null;
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

export function isTrendExperimentDraft(post: PanelDraftPost): boolean {
  const explainability = post.offers?.explainability;
  if (!explainability || typeof explainability !== "object") return false;
  if (explainability.provenance === "trend_experiment") return true;
  const trendExecution = explainability.trend_execution;
  return Boolean(trendExecution && typeof trendExecution === "object" && "origin" in trendExecution && trendExecution.origin === "trend");
}

function isActiveDraft(post: PanelDraftPost, allowApprovedOfferDrafts: boolean): boolean {
  const offerStatus = String(post.offers?.status || "").toLowerCase();
  return post.status === "draft"
    && !post.deleted_at
    && !post.posted_at
    && !post.external_id
    && !["posted", "rejected", "deferred"].includes(offerStatus)
    && (allowApprovedOfferDrafts || offerStatus !== "approved");
}

export function mergePanelDrafts<T extends PanelDraftPost>(
  drafts: readonly T[],
  _editorialOfferIds: ReadonlySet<string>,
  editorialDayStart: Date,
  authoritativeCohortOfferIds?: ReadonlySet<string>,
  allowApprovedOfferDrafts = false,
): T[] {
  const currentCohortOfferIds = authoritativeCohortOfferIds ?? getCurrentCohortOfferIds(drafts, editorialDayStart, allowApprovedOfferDrafts);
  const selected = drafts.filter((post) => {
    if (!isActiveDraft(post, allowApprovedOfferDrafts)) return false;
    if (isManualExpressDraft(post) || isTrendExperimentDraft(post)) return true;
    if (!currentCohortOfferIds.has(post.offer_id)) return false;
    const postCreatedAt = new Date(post.created_at).getTime();
    const offerCreatedAt = new Date(post.offers?.created_at || "").getTime();
    return Number.isFinite(postCreatedAt)
      && postCreatedAt >= editorialDayStart.getTime()
      && (allowApprovedOfferDrafts || (Number.isFinite(offerCreatedAt) && offerCreatedAt >= editorialDayStart.getTime()));
  });

  const byOfferId = new Map<string, T>();
  for (const post of selected) {
    if (!byOfferId.has(post.offer_id)) byOfferId.set(post.offer_id, post);
  }
  return [...byOfferId.values()];
}

function getCurrentCohortOfferIds<T extends PanelDraftPost>(drafts: readonly T[], editorialDayStart: Date, useDiscoveryEvidence: boolean): Set<string> {
  if (!useDiscoveryEvidence) {
    const cohortAnchor = new Date(editorialDayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
    const offers = drafts
      .filter((post) => !isManualExpressDraft(post) && !isTrendExperimentDraft(post) && post.offers?.id && post.offers.created_at)
      .map((post) => ({
        id: post.offers?.id || post.offer_id,
        created_at: post.offers?.created_at || post.created_at,
        explainability: post.offers?.explainability || null,
      })) as Offer[];
    return new Set(identifyLatestDiscoveryCohort(offers, cohortAnchor).map((offer) => offer.id));
  }

  const dayEnd = editorialDayStart.getTime() + 24 * 60 * 60 * 1000;
  const rows = drafts
    .filter((post) => !isManualExpressDraft(post) && !isTrendExperimentDraft(post))
    .map((post) => {
      const explainability = post.offers?.explainability || {};
      const correlationId = normalizeDiscoveryCorrelationId(
        typeof explainability.correlation_id === "string" ? explainability.correlation_id : null,
      );
      const evidence = explainability.discovery_evidence;
      const discoveredAt = evidence && typeof evidence === "object" && "discoveredAt" in evidence
        ? new Date(String(evidence.discoveredAt)).getTime()
        : NaN;
      const createdAt = new Date(post.offers?.created_at || "").getTime();
      return { post, correlationId, discoveredAt, createdAt };
    });

  const evidenced = rows.filter((row) => row.discoveredAt >= editorialDayStart.getTime() && row.discoveredAt < dayEnd);
  const legacyRows = rows.filter((row) => row.createdAt >= editorialDayStart.getTime()
    && row.createdAt < dayEnd);
  const sourceRows = evidenced.length > 0 ? evidenced : legacyRows;
  if (sourceRows.length === 0) return new Set();

  const correlatedRows = sourceRows.filter((row) => row.correlationId);
  if (correlatedRows.length === 0) return new Set(sourceRows.map((row) => row.post.offer_id));
  const latestCorrelation = correlatedRows
    .sort((left, right) => (right.discoveredAt || right.createdAt) - (left.discoveredAt || left.createdAt))[0].correlationId;
  return new Set(correlatedRows.filter((row) => row.correlationId === latestCorrelation).map((row) => row.post.offer_id));
}
