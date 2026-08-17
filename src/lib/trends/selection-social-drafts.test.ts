import { describe, expect, it } from "vitest";
import { TREND_SOCIAL_CHANNELS } from "./selection-social-drafts";

describe("Trends social draft handoff", () => {
  it("prepares the operational social drafts used by the Trends handoff", () => {
    expect(TREND_SOCIAL_CHANNELS).toEqual(["facebook", "instagram", "whatsapp"]);
  });
});
