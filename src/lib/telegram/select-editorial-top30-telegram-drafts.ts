import type { Offer } from "@/types/domain";
import { selectEditorialTop30 } from "@/lib/offers/commercial-channel-router";
import { normalizeDiscoveryCorrelationId } from "@/lib/offers/commercial-curation-queue";

export type TelegramEditorialDraftRow = {
  id: string;
  offer_id: string;
  channel: "telegram";
  status: string;
  content: string;
  created_at: string;
  posted_at: string | null;
  external_id: string | null;
  offers: Offer | null;
};

export type TelegramEditorialSelection = {
  offerIds: string[];
  diagnostics: {
    selectedCohortCorrelationId: string | null;
    selectedCohortScenarioId: string | null;
    selectedCohortDiscoveredAt: string | null;
    shopeeSelected: number;
    amazonSelected: number;
    mercadoLivreSelected: number;
    staleCohortsIgnored: number;
    loadedRows: number;
    eligibleDraftOffers: number;
  };
};

const PROTECTED_POST_STATUSES = new Set(["published", "posted", "approved", "rejected", "deferred", "deleted", "publishing"]);
const TELEGRAM_POST_PAGE_SIZE = 1000;
const TELEGRAM_POST_MAX_PAGES = 100;

function hasPublicationEvidence(post: Pick<TelegramEditorialDraftRow, "status" | "posted_at" | "external_id">): boolean {
  return PROTECTED_POST_STATUSES.has(post.status.toLowerCase()) || Boolean(post.posted_at || post.external_id);
}

export function selectEditorialTop30TelegramOfferIds(rows: readonly TelegramEditorialDraftRow[], now = new Date()): string[] {
  return selectEditorialTop30TelegramSelection(rows, now).offerIds;
}

function cohortMetadata(offer: Offer) {
  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability as Record<string, unknown> : {};
  const correlationId = normalizeDiscoveryCorrelationId(typeof explainability.correlation_id === "string" ? explainability.correlation_id : null);
  const scenarioId = typeof explainability.scenarioId === "string" ? explainability.scenarioId : null;
  const evidence = explainability.discovery_evidence && typeof explainability.discovery_evidence === "object" ? explainability.discovery_evidence as Record<string, unknown> : {};
  const discoveredAt = typeof evidence.discoveredAt === "string" ? evidence.discoveredAt : null;
  const timestamp = new Date(discoveredAt || offer.created_at).getTime();
  const key = correlationId ? `correlation:${correlationId}` : scenarioId ? `scenario:${scenarioId}` : `day:${new Date(offer.created_at).toISOString().slice(0, 10)}`;
  return { key, correlationId, scenarioId, discoveredAt, timestamp };
}

export function selectEditorialTop30TelegramSelection(rows: readonly TelegramEditorialDraftRow[], now = new Date()): TelegramEditorialSelection {
  const fallbackStart = now.getTime() - 24 * 60 * 60 * 1000;
  const protectedOfferIds = new Set(rows.filter(hasPublicationEvidence).map((post) => post.offer_id));
  const eligibleDraftOffers = new Map<string, Offer>();

  for (const post of rows) {
    const createdAt = new Date(post.created_at).getTime();
    if (post.status !== "draft" || hasPublicationEvidence(post) || protectedOfferIds.has(post.offer_id)) continue;
    if (!Number.isFinite(createdAt) || createdAt < fallbackStart || createdAt > now.getTime() || !post.offers) continue;
    if (post.offers.explainability?.manual_source === true) continue;
    if (!eligibleDraftOffers.has(post.offer_id)) eligibleDraftOffers.set(post.offer_id, post.offers);
  }

  const eligibleOffers = [...eligibleDraftOffers.values()];
  const cohorts = new Map<string, { offers: Offer[]; correlationId: string | null; scenarioId: string | null; discoveredAt: string | null; timestamp: number }>();
  for (const offer of eligibleOffers) {
    const metadata = cohortMetadata(offer);
    const cohort = cohorts.get(metadata.key) || { offers: [], correlationId: metadata.correlationId, scenarioId: metadata.scenarioId, discoveredAt: metadata.discoveredAt, timestamp: metadata.timestamp };
    cohort.offers.push(offer);
    cohort.timestamp = Math.max(cohort.timestamp, metadata.timestamp);
    if (!cohort.discoveredAt && metadata.discoveredAt) cohort.discoveredAt = metadata.discoveredAt;
    cohorts.set(metadata.key, cohort);
  }
  const orderedCohorts = [...cohorts.values()].sort((left, right) => right.timestamp - left.timestamp);
  const selectedCohort = orderedCohorts[0] || { offers: [], correlationId: null, scenarioId: null, discoveredAt: null, timestamp: 0 };
  const cohortOffers = selectedCohort.offers;
  const selectedShopeeIds = selectEditorialTop30(
    cohortOffers.filter((offer) => offer.platform === "Shopee"),
    30,
    now,
    { allowRecentFallback: true },
  ).map((candidate) => candidate.id);
  const nonShopeeIds = cohortOffers
    .filter((offer) => offer.platform === "Amazon" || offer.platform === "Mercado Livre")
    .map((offer) => offer.id);
  const offerIds = [...new Set([...selectedShopeeIds, ...nonShopeeIds])];
  return {
    offerIds,
    diagnostics: {
      selectedCohortCorrelationId: selectedCohort.correlationId,
      selectedCohortScenarioId: selectedCohort.scenarioId,
      selectedCohortDiscoveredAt: selectedCohort.discoveredAt,
      shopeeSelected: selectedShopeeIds.length,
      amazonSelected: nonShopeeIds.filter((id) => cohortOffers.some((offer) => offer.id === id && offer.platform === "Amazon")).length,
      mercadoLivreSelected: nonShopeeIds.filter((id) => cohortOffers.some((offer) => offer.id === id && offer.platform === "Mercado Livre")).length,
      staleCohortsIgnored: Math.max(0, orderedCohorts.length - 1),
      loadedRows: rows.length,
      eligibleDraftOffers: eligibleOffers.length,
    },
  };
}

export async function loadTelegramEditorialDraftRows(client: { from: (table: string) => any }, options: { pageSize?: number; maxPages?: number } = {}): Promise<TelegramEditorialDraftRow[]> {
  const pageSize = options.pageSize || TELEGRAM_POST_PAGE_SIZE;
  const maxPages = options.maxPages || TELEGRAM_POST_MAX_PAGES;
  const rows: TelegramEditorialDraftRow[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from("posts")
      .select("id,offer_id,channel,status,content,created_at,posted_at,external_id,offers(*)")
      .eq("channel", "telegram")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    const pageRows = (data || []) as TelegramEditorialDraftRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) return rows;
  }
  throw new Error(`Telegram posts pagination exceeded technical maxPages=${maxPages}`);
}

export async function loadEditorialTop30TelegramSelection(client: { from: (table: string) => any }, now = new Date()): Promise<TelegramEditorialSelection> {
  const rows = await loadTelegramEditorialDraftRows(client);
  return selectEditorialTop30TelegramSelection(rows, now);
}

export async function loadEditorialTop30TelegramOfferIds(client: { from: (table: string) => any }, now = new Date()): Promise<string[]> {
  return (await loadEditorialTop30TelegramSelection(client, now)).offerIds;
}
