export interface InternalClickOffer {
  id: string;
  platform: string;
  productName: string;
  category: string | null;
}

export interface InternalClickAffiliateLink {
  id: string;
  offerId: string;
  channel: string;
}

export interface InternalClickPost {
  id: string;
  affiliateLinkId: string | null;
  channel: string;
  status: string;
  deletedAt: string | null;
}

export interface InternalClickEvent {
  id: string;
  affiliateLinkId: string;
  createdAt: string;
}

export interface InternalClickPublicationMetric {
  postId: string;
  channel: string;
  clicks: number;
}

export interface InternalClickSignal {
  source: "click_events";
  offerId: string;
  marketplace: string;
  productName: string;
  normalizedProductTerm: string;
  category: string | null;
  normalizedCategory: string | null;
  windowStart: string;
  windowEnd: string;
  totalClicks: number;
  distinctEventCount: number;
  duplicateEventCount: number;
  clicksByChannel: Record<string, number>;
  clicksByPublication: InternalClickPublicationMetric[];
  unattributedPublicationClicks: number;
}

export interface BuildInternalClickSignalsInput {
  windowStart: string;
  windowEnd: string;
  offers: InternalClickOffer[];
  affiliateLinks: InternalClickAffiliateLink[];
  posts: InternalClickPost[];
  clickEvents: InternalClickEvent[];
}

function parseTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function normalizeInternalPerformanceLabel(value: string | null | undefined): string | null {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  return normalized || null;
}

function normalizeChannel(value: string): string {
  return normalizeInternalPerformanceLabel(value)?.replace(/\s+/gu, "_") ?? "unknown";
}

export function buildInternalClickSignals(input: BuildInternalClickSignalsInput): InternalClickSignal[] {
  const start = parseTimestamp(input.windowStart);
  const end = parseTimestamp(input.windowEnd);
  if (start === null || end === null || end <= start) throw new Error("Janela de performance interna inválida.");

  const offerById = new Map(input.offers.map((offer) => [offer.id, offer]));
  const linkById = new Map(input.affiliateLinks.map((link) => [link.id, link]));
  const publishedPostsByLink = new Map<string, InternalClickPost[]>();
  for (const post of input.posts) {
    if (!post.affiliateLinkId || post.deletedAt || post.status !== "published") continue;
    const current = publishedPostsByLink.get(post.affiliateLinkId) ?? [];
    current.push(post);
    publishedPostsByLink.set(post.affiliateLinkId, current);
  }

  const seenEventIds = new Set<string>();
  const duplicateByOffer = new Map<string, number>();
  const metricsByOffer = new Map<string, InternalClickSignal>();

  for (const event of input.clickEvents) {
    const observedAt = parseTimestamp(event.createdAt);
    if (observedAt === null || observedAt < start || observedAt >= end) continue;
    const link = linkById.get(event.affiliateLinkId);
    if (!link) continue;
    const offer = offerById.get(link.offerId);
    if (!offer) continue;

    if (seenEventIds.has(event.id)) {
      duplicateByOffer.set(offer.id, (duplicateByOffer.get(offer.id) ?? 0) + 1);
      continue;
    }
    seenEventIds.add(event.id);

    const signal = metricsByOffer.get(offer.id) ?? {
      source: "click_events" as const,
      offerId: offer.id,
      marketplace: offer.platform,
      productName: offer.productName,
      normalizedProductTerm: normalizeInternalPerformanceLabel(offer.productName) ?? offer.id,
      category: offer.category,
      normalizedCategory: normalizeInternalPerformanceLabel(offer.category),
      windowStart: new Date(start).toISOString(),
      windowEnd: new Date(end).toISOString(),
      totalClicks: 0,
      distinctEventCount: 0,
      duplicateEventCount: 0,
      clicksByChannel: {},
      clicksByPublication: [],
      unattributedPublicationClicks: 0,
    };

    signal.totalClicks += 1;
    signal.distinctEventCount += 1;
    const channel = normalizeChannel(link.channel);
    signal.clicksByChannel[channel] = (signal.clicksByChannel[channel] ?? 0) + 1;

    const candidatePosts = publishedPostsByLink.get(link.id) ?? [];
    if (candidatePosts.length === 1) {
      const post = candidatePosts[0];
      const publicationChannel = normalizeChannel(post.channel || link.channel);
      const current = signal.clicksByPublication.find((metric) => metric.postId === post.id);
      if (current) current.clicks += 1;
      else signal.clicksByPublication.push({ postId: post.id, channel: publicationChannel, clicks: 1 });
    } else {
      signal.unattributedPublicationClicks += 1;
    }

    metricsByOffer.set(offer.id, signal);
  }

  for (const [offerId, duplicateCount] of duplicateByOffer) {
    const signal = metricsByOffer.get(offerId);
    if (signal) signal.duplicateEventCount = duplicateCount;
  }

  return [...metricsByOffer.values()]
    .map((signal) => ({
      ...signal,
      clicksByPublication: [...signal.clicksByPublication]
        .sort((a, b) => b.clicks - a.clicks || a.postId.localeCompare(b.postId, "pt-BR")),
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks
      || a.normalizedProductTerm.localeCompare(b.normalizedProductTerm, "pt-BR")
      || a.offerId.localeCompare(b.offerId));
}
