import { buildCanonicalCopyV5ChannelDraft } from "@/core/ai/official-ai-service";
import type { CopyV5Facts } from "@/core/ai/copy-v5-types";

export const TELEGRAM_CONVERSION_V4_MAX_BLOCKS = 8;

function assertTrackedUrl(trackedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(trackedUrl);
  } catch {
    throw new Error("Telegram conversion requires a valid tracked URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Telegram conversion requires an HTTPS tracked URL");
  }
  return parsed.toString();
}

/**
 * Nome legado preservado por compatibilidade; a autoridade de conteúdo é Copy V5.
 */
export function buildTelegramConversionV4(facts: CopyV5Facts, trackedUrl: string) {
  const url = assertTrackedUrl(trackedUrl);
  const baseContent = buildCanonicalCopyV5ChannelDraft(facts, "telegram");
  const withoutPlaceholder = baseContent.replace(/👉\s*$/u, "").trimEnd();
  return `${withoutPlaceholder}\n${url}`;
}
