export type TrendOfferHandoffResolution = "reuse" | "select" | "reject";

export function resolveTrendOfferHandoff(status: string): TrendOfferHandoffResolution {
  if (status === "selected" || status === "approved") return "reuse";
  if (status === "pending_manual_review") return "select";
  return "reject";
}

export function resolveTrendSnapshotImageUrl(evidence: Record<string, unknown>): string | null {
  const raw = String(evidence.image_url ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
