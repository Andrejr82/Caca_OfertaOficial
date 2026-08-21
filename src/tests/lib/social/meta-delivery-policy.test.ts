import { describe, expect, it } from "vitest";
import { isInstagramReelsV4Enabled } from "@/lib/social/meta-delivery-policy";

describe("Instagram Reels delivery policy", () => {
  it("mantém Reels desligado por padrão e exige opt-in explícito", () => {
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: undefined })).toBe(false);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: "false" })).toBe(false);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: "1" })).toBe(false);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: "true" })).toBe(true);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: " TRUE " })).toBe(true);
  });
});
