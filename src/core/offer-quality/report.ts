import type { OfferQualityDecision, OfferQualityReport } from "./types";

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

function sanitizeDecision(decision: OfferQualityDecision) {
  return {
    ...decision,
    candidate: {
      ...decision.candidate,
      sourceUrl: sanitizeUrl(decision.candidate.sourceUrl),
      imageUrl: sanitizeUrl(decision.candidate.imageUrl),
      affiliateLinks: decision.candidate.affiliateLinks?.map((link) => ({
        ...link,
        trackedUrl: sanitizeUrl(link.trackedUrl),
      })),
    },
  };
}

export function sanitizeReport(report: OfferQualityReport): OfferQualityReport {
  return {
    ...report,
    decisions: report.decisions.map(sanitizeDecision),
    winners: report.winners.map(sanitizeDecision),
    persistAttemptCount: 0,
  };
}

export function serializeReport(report: OfferQualityReport): string {
  return JSON.stringify(sanitizeReport(report), null, 2) + "\n";
}

export function serializeNdjson(report: OfferQualityReport): string {
  const sanitized = sanitizeReport(report);
  const header = JSON.stringify({
    type: "summary",
    runId: sanitized.runId,
    generatedAt: sanitized.generatedAt,
    recordCount: sanitized.recordCount,
    groupCount: sanitized.groupCount,
    persistAttemptCount: 0,
  });
  const rows = sanitized.decisions.map((decision) => JSON.stringify({
    type: "decision",
    ...decision,
  }));
  return [header, ...rows].join("\n") + "\n";
}
