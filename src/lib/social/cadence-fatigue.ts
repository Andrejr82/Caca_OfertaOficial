export type SocialCadenceChannel = "whatsapp" | "telegram" | "instagram" | "facebook";

export type SocialCadenceDecision = "ALLOW" | "DEFER";

export type SocialCadenceReason =
  | "same_offer_same_channel"
  | "same_cluster_same_channel"
  | "same_offer_cross_channel"
  | "channel_burst_limit";

export interface SocialCadenceHistoryItem {
  offerId: string;
  channel: SocialCadenceChannel;
  clusterKey: string;
  publishedAt: string;
}

export interface SocialCadenceInput {
  offerId: string;
  channel: SocialCadenceChannel;
  clusterKey: string;
  now: string;
  history: readonly SocialCadenceHistoryItem[];
}

export interface SocialCadencePolicy {
  sameOfferSameChannelHours: number;
  sameClusterSameChannelHours: number;
  sameOfferCrossChannelHours: number;
  channelBurstWindowHours: number;
  maxPostsPerChannelWindow: number;
}

export interface SocialCadenceResult {
  decision: SocialCadenceDecision;
  reasons: SocialCadenceReason[];
  nextEligibleAt: string | null;
  matchedHistoryCount: number;
}

export const DEFAULT_SOCIAL_CADENCE_POLICY: SocialCadencePolicy = {
  sameOfferSameChannelHours: 24,
  sameClusterSameChannelHours: 8,
  sameOfferCrossChannelHours: 2,
  channelBurstWindowHours: 2,
  maxPostsPerChannelWindow: 3,
};

function parseInstant(label: string, value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Social cadence requires valid ${label}`);
  }
  return timestamp;
}

function assertPositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Social cadence requires ${name} to be positive`);
  }
}

function hours(milliseconds: number) {
  return milliseconds / 3_600_000;
}

function addHours(timestamp: number, value: number) {
  return timestamp + value * 3_600_000;
}

/**
 * Task 9 — guardrail puro de cadência e fadiga.
 *
 * Nunca cria blacklist permanente. Quando uma regra é atingida, devolve DEFER
 * e o primeiro instante em que a oferta volta a ser elegível segundo o histórico
 * observado. A camada de publicação continua responsável por decidir se publica.
 */
export function evaluateSocialCadence(
  input: SocialCadenceInput,
  policy: SocialCadencePolicy = DEFAULT_SOCIAL_CADENCE_POLICY,
): SocialCadenceResult {
  if (!input.offerId.trim()) throw new Error("Social cadence requires offerId");
  if (!input.clusterKey.trim()) throw new Error("Social cadence requires clusterKey");

  assertPositive("sameOfferSameChannelHours", policy.sameOfferSameChannelHours);
  assertPositive("sameClusterSameChannelHours", policy.sameClusterSameChannelHours);
  assertPositive("sameOfferCrossChannelHours", policy.sameOfferCrossChannelHours);
  assertPositive("channelBurstWindowHours", policy.channelBurstWindowHours);
  if (!Number.isInteger(policy.maxPostsPerChannelWindow) || policy.maxPostsPerChannelWindow <= 0) {
    throw new Error("Social cadence requires maxPostsPerChannelWindow to be a positive integer");
  }

  const now = parseInstant("now", input.now);
  const reasons = new Set<SocialCadenceReason>();
  const eligibleTimestamps: number[] = [];
  let matchedHistoryCount = 0;
  let channelBurstCount = 0;
  let latestChannelBurstAt: number | null = null;

  for (const item of input.history) {
    const publishedAt = parseInstant("publishedAt", item.publishedAt);
    if (publishedAt > now) throw new Error("Social cadence history cannot be in the future");

    const ageHours = hours(now - publishedAt);
    let matched = false;

    if (
      item.offerId === input.offerId &&
      item.channel === input.channel &&
      ageHours < policy.sameOfferSameChannelHours
    ) {
      reasons.add("same_offer_same_channel");
      eligibleTimestamps.push(addHours(publishedAt, policy.sameOfferSameChannelHours));
      matched = true;
    }

    if (
      item.clusterKey === input.clusterKey &&
      item.channel === input.channel &&
      item.offerId !== input.offerId &&
      ageHours < policy.sameClusterSameChannelHours
    ) {
      reasons.add("same_cluster_same_channel");
      eligibleTimestamps.push(addHours(publishedAt, policy.sameClusterSameChannelHours));
      matched = true;
    }

    if (
      item.offerId === input.offerId &&
      item.channel !== input.channel &&
      ageHours < policy.sameOfferCrossChannelHours
    ) {
      reasons.add("same_offer_cross_channel");
      eligibleTimestamps.push(addHours(publishedAt, policy.sameOfferCrossChannelHours));
      matched = true;
    }

    if (item.channel === input.channel && ageHours < policy.channelBurstWindowHours) {
      channelBurstCount += 1;
      latestChannelBurstAt = latestChannelBurstAt == null ? publishedAt : Math.max(latestChannelBurstAt, publishedAt);
    }

    if (matched) matchedHistoryCount += 1;
  }

  if (channelBurstCount >= policy.maxPostsPerChannelWindow && latestChannelBurstAt != null) {
    reasons.add("channel_burst_limit");
    eligibleTimestamps.push(addHours(latestChannelBurstAt, policy.channelBurstWindowHours));
  }

  if (reasons.size === 0) {
    return {
      decision: "ALLOW",
      reasons: [],
      nextEligibleAt: null,
      matchedHistoryCount: 0,
    };
  }

  return {
    decision: "DEFER",
    reasons: [...reasons],
    nextEligibleAt: new Date(Math.max(...eligibleTimestamps)).toISOString(),
    matchedHistoryCount,
  };
}
