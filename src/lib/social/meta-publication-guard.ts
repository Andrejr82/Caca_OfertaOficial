export type InstagramV4PublicationMediaType = "FEED" | "REELS";

export const INSTAGRAM_STORIES_V4_HANDOFF_MARKER = "STORIES V4 · HANDOFF MANUAL";
export const INSTAGRAM_REELS_DRAFT_MARKER = "REELS · AGUARDANDO VÍDEO";

export function isInstagramStoriesV4Handoff(content: string) {
  return content.trimStart().startsWith(INSTAGRAM_STORIES_V4_HANDOFF_MARKER);
}

export function isInstagramReelsDraft(content: string) {
  return content.trimStart().startsWith(INSTAGRAM_REELS_DRAFT_MARKER);
}

/**
 * Fail-closed guard for Instagram publication.
 * Legacy static Stories remain recognized only to quarantine historical drafts.
 * New Instagram drafts are Reel captions and must never fall through to FEED.
 */
export function assertInstagramV4PublicationAllowed(input: {
  content: string;
  mediaType: InstagramV4PublicationMediaType;
  reelsEnabled: boolean;
}) {
  if (isInstagramStoriesV4Handoff(input.content)) {
    throw new Error(
      "Legacy static Stories handoff is retired and cannot be sent through Feed/Reels transport.",
    );
  }

  if (isInstagramReelsDraft(input.content) && input.mediaType !== "REELS") {
    throw new Error("Instagram Reel draft requires REELS transport and an approved video.");
  }

  if (input.mediaType === "REELS" && !input.reelsEnabled) {
    throw new Error("Instagram Reels V4 is disabled until audiovisual generation is explicitly enabled.");
  }
}
