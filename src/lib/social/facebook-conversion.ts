import { buildCanonicalCopyV5ChannelDraft } from "@/core/ai/official-ai-service";
import type { CopyV5Facts } from "@/core/ai/copy-v5-types";

export interface FacebookConversionV4 {
  feed: string;
  firstComment: string;
}

export const FACEBOOK_CONVERSION_V4_MAX_FEED_BLOCKS = 8;

function assertTrackedUrl(trackedUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(trackedUrl);
  } catch {
    throw new Error("Facebook conversion requires a valid tracked URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Facebook conversion requires an HTTPS tracked URL");
  }
  return parsed.toString();
}

/**
 * Nome legado preservado por compatibilidade; a autoridade de conteúdo é Copy V5.
 */
export function buildFacebookConversionV4(facts: CopyV5Facts, trackedUrl: string): FacebookConversionV4 {
  const url = assertTrackedUrl(trackedUrl);
  return {
    feed: buildCanonicalCopyV5ChannelDraft(facts, "facebook"),
    firstComment: `👉 Link da oferta: ${url}`,
  };
}
