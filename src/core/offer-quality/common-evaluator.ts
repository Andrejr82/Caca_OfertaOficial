import {
  createOfferQualityCandidate,
  type OfferQualityCandidate,
  type OfferQualityDecision,
  type OfferQualityReport,
  type MonetizationStatus,
} from "./types";
import { getGroupKey, validateCandidateBasics, validateNativeIdentity } from "./grouping";
import { calculateDiscount, compareCandidates, scoreCandidate } from "./scoring";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const CHANNELS = ["telegram", "whatsapp", "facebook", "instagram"] as const;
const PREFIXES = { telegram: "tg_", whatsapp: "wp_", facebook: "fb_", instagram: "ig_" } as const;

function validateMonetization(candidate: OfferQualityCandidate): MonetizationStatus {
  const links = candidate.affiliateLinks ?? [];
  const byChannel = new Map(links.map((link) => [link.channel, link]));
  if (byChannel.size !== 4 || CHANNELS.some((channel) => !byChannel.has(channel))) return "incomplete";

  for (const channel of CHANNELS) {
    const link = byChannel.get(channel);
    if (!link) return "incomplete";
    const expected = new RegExp(`/go/\${PREFIXES[channel]}\${UUID}(?:$|[?#])`, "i");
    if (!expected.test(link.trackedUrl)) return "incomplete";
  }
  return "complete";
}

function reasonCount(counts: Record<string, number>, reason: string): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

export interface OfferQualityEvaluationOptions {
  runId: string;
  generatedAt: string;
}

export function evaluateCandidates(
  rawCandidates: readonly OfferQualityCandidate[],
  options: OfferQualityEvaluationOptions,
): OfferQualityReport {
  const decisions: OfferQualityDecision[] = [];
  const rejectionCounts: Record<string, number> = {};
  const groups = new Map<string, OfferQualityCandidate[]>();

  for (const raw of rawCandidates) {
    let candidate: OfferQualityCandidate;
    try {
      candidate = createOfferQualityCandidate(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_candidate";
      reasonCount(rejectionCounts, message);
      continue;
    }

    const basic = validateCandidateBasics(candidate);
    const identity = validateNativeIdentity(candidate);
    if (!basic.valid || !identity.valid) {
      const reasons = [...basic.reasons, ...identity.reasons];
      reasons.forEach((reason) => reasonCount(rejectionCounts, reason));
      decisions.push({
        candidate,
        decision: "rejected",
        groupKey: null,
        groupEvidence: [],
        winnerSourceItemId: null,
        score: null,
        discount: null,
        monetizationStatus: "not_checked",
        reasons,
      });
      continue;
    }

    const group = getGroupKey(candidate);
    const list = groups.get(group.key) ?? [];
    list.push(candidate);
    groups.set(group.key, list);
  }

  for (const [groupKey, candidates] of groups) {
    const ranked = [...candidates].sort((a, b) => {
      const aMonetization = validateMonetization(a) === "complete";
      const bMonetization = validateMonetization(b) === "complete";
      const result = compareCandidates(
        a,
        b,
      );
      if (aMonetization !== bMonetization) return aMonetization ? -1 : 1;
      return result;
    });
    const best = ranked[0];
    const groupEvidence = getGroupKey(best).evidence;
    const bestMonetization = validateMonetization(best);
    const bestScore = scoreCandidate(best, { monetizationComplete: bestMonetization === "complete" });
    const bestDecision: OfferQualityDecision = {
      candidate: best,
      decision: bestScore.total > 0 && bestMonetization === "complete" ? "winner" : "missing_data",
      groupKey,
      groupEvidence,
      winnerSourceItemId: bestScore.total > 0 && bestMonetization === "complete" ? best.sourceItemId : null,
      score: bestScore,
      discount: calculateDiscount(best),
      monetizationStatus: bestMonetization,
      reasons: bestScore.total > 0 && bestMonetization === "complete" ? [] : ["winner_blocked"],
    };
    decisions.push(bestDecision);
    if (bestDecision.decision === "winner") {
      ranked.slice(1).forEach((candidate) => {
        decisions.push({
          candidate,
          decision: "duplicate",
          groupKey,
          groupEvidence,
          winnerSourceItemId: best.sourceItemId,
          score: scoreCandidate(candidate, { monetizationComplete: validateMonetization(candidate) === "complete" }),
          discount: calculateDiscount(candidate),
          monetizationStatus: validateMonetization(candidate),
          reasons: ["lower_ranked_in_group"],
        });
        reasonCount(rejectionCounts, "duplicate");
      });
    } else {
      ranked.slice(1).forEach((candidate) => {
        const monetizationStatus = validateMonetization(candidate);
        decisions.push({
          candidate,
          decision: "missing_data",
          groupKey,
          groupEvidence,
          winnerSourceItemId: null,
          score: scoreCandidate(candidate, { monetizationComplete: monetizationStatus === "complete" }),
          discount: calculateDiscount(candidate),
          monetizationStatus,
          reasons: ["group_has_no_eligible_winner"],
        });
        reasonCount(rejectionCounts, "missing_data");
      });
      reasonCount(rejectionCounts, "missing_data");
    }
  }

  const winners = decisions.filter((decision) => decision.decision === "winner");
  return Object.freeze({
    runId: options.runId,
    generatedAt: options.generatedAt,
    recordCount: rawCandidates.length,
    decisions: Object.freeze(decisions),
    winners: Object.freeze(winners),
    rejectionCounts: Object.freeze(rejectionCounts),
    groupCount: groups.size,
    persistAttemptCount: 0,
  });
}

export { validateMonetization };
