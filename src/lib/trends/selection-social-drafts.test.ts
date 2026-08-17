import { describe, expect, it } from "vitest";
import { TREND_SOCIAL_CHANNELS } from "./selection-social-drafts";

describe("Trends social draft handoff", () => {
  it("uses the same social draft channels as video approval", () => {
    expect(TREND_SOCIAL_CHANNELS).toEqual(["facebook", "instagram"]);
  });
});
