import type { TrendSignalListItem } from "@/core/trends/types";

export function partitionTrendSignalsForView(signals: TrendSignalListItem[], strategyVersion: string) {
  return {
    operational: signals.filter((signal) => signal.classification?.strategyVersion === strategyVersion && signal.classification.decision === "eligible"),
    audit: signals.filter((signal) => signal.classification?.strategyVersion === strategyVersion && signal.classification.decision === "rejected"),
    pending: signals.filter((signal) => signal.classification?.strategyVersion !== strategyVersion || (signal.classification.decision !== "eligible" && signal.classification.decision !== "rejected"))
  };
}
