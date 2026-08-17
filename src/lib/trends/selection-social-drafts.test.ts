import { describe, expect, it } from "vitest";
import { mergePanelDrafts } from "@/lib/offers/panel-draft-selection";
import { TREND_SOCIAL_CHANNELS } from "./selection-social-drafts";

describe("Trends social draft handoff", () => {
  it("prepares the operational social drafts used by the Trends handoff", () => {
    expect(TREND_SOCIAL_CHANNELS).toEqual(["facebook", "instagram", "whatsapp"]);
  });

  it("keeps active Trends drafts visible outside the editorial cohort", () => {
    const today = new Date("2026-08-17T03:00:00.000Z");
    const drafts = [
      {
        id: "trend-post",
        offer_id: "trend-offer",
        status: "draft",
        created_at: "2026-08-17T03:10:00.000Z",
        posted_at: null,
        external_id: null,
        offers: {
          id: "trend-offer",
          status: "selected",
          created_at: "2026-08-17T03:09:00.000Z",
          explainability: { provenance: "trend_experiment" },
        },
      },
      {
        id: "editorial-post",
        offer_id: "editorial-offer",
        status: "draft",
        created_at: "2026-08-17T03:20:00.000Z",
        posted_at: null,
        external_id: null,
        offers: {
          id: "editorial-offer",
          status: "selected",
          created_at: "2026-08-17T03:19:00.000Z",
          explainability: { correlation_id: "shopee-openapi-v1:latest-cycle" },
        },
      },
    ];

    const result = mergePanelDrafts(drafts, new Set(), today, new Set(["editorial-offer"]), true);

    expect(result.map((post) => post.id)).toEqual(["trend-post", "editorial-post"]);
  });
});
