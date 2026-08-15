import { describe, expect, it } from "vitest";

import {
  MAX_AUTHORIZED_REEL_BYTES,
  authorizedReelFinalizeSchema,
  authorizedReelStartSchema,
  buildAuthorizedReelStoragePath,
} from "@/lib/videos/authorized-reel";

const validInput = {
  offerId: "11111111-1111-4111-8111-111111111111",
  fileName: "reel-produto.mp4",
  fileSize: 8_000_000,
  mimeType: "video/mp4" as const,
  rightsStatus: "creator_authorized" as const,
  sourceUrl: "https://www.instagram.com/reel/example/",
  sourceNote: "Autorizado pelo criador.",
  width: 1080,
  height: 1920,
  durationSeconds: 11.4,
};

describe("authorized reel ingestion", () => {
  it("accepts an authorized MP4 with safe metadata", () => {
    const parsed = authorizedReelStartSchema.parse(validInput);
    expect(parsed.rightsStatus).toBe("creator_authorized");
    expect(parsed.sourceUrl).toContain("instagram.com");
  });

  it("rejects oversized or non-MP4 uploads", () => {
    expect(() => authorizedReelStartSchema.parse({
      ...validInput,
      fileName: "reel.mov",
      fileSize: MAX_AUTHORIZED_REEL_BYTES + 1,
      mimeType: "video/quicktime",
    })).toThrow();
  });

  it("rejects unverified rights at ingestion", () => {
    expect(() => authorizedReelStartSchema.parse({
      ...validInput,
      rightsStatus: "unverified",
    })).toThrow();
  });

  it("builds a user-scoped storage path and validates finalize payload", () => {
    const uploadId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const path = buildAuthorizedReelStoragePath("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", uploadId);

    expect(path).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/reels/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp4");
    expect(authorizedReelFinalizeSchema.parse({ ...validInput, uploadId }).uploadId).toBe(uploadId);
  });
});
