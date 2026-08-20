export type InstagramV4PublicationMediaType = "FEED" | "REELS";

export const INSTAGRAM_STORIES_V4_HANDOFF_MARKER = "STORIES V4 · HANDOFF MANUAL";

export function isInstagramStoriesV4Handoff(content: string) {
  return content.trimStart().startsWith(INSTAGRAM_STORIES_V4_HANDOFF_MARKER);
}

/**
 * Fail-closed guard for the launch configuration of Social Copy V4.
 *
 * Stories V4 are intentionally manual in this rollout because the operator must
 * add the tracked link sticker on the third frame. The canonical handoff must
 * never fall through to the legacy Instagram FEED transport.
 *
 * Reels V4 are feature-flagged and remain disabled unless explicitly enabled.
 */
export function assertInstagramV4PublicationAllowed(input: {
  content: string;
  mediaType: InstagramV4PublicationMediaType;
  reelsEnabled: boolean;
}) {
  if (isInstagramStoriesV4Handoff(input.content)) {
    throw new Error(
      "Instagram Stories V4 uses manual link-sticker handoff and cannot be sent through the Feed/Reels transport.",
    );
  }

  if (input.mediaType === "REELS" && !input.reelsEnabled) {
    throw new Error("Instagram Reels V4 is disabled until audiovisual generation is explicitly enabled.");
  }
}
