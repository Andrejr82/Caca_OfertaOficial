import { describe, expect, it } from "vitest";

import { buildInitialCampaignChecklist, nextCampaignAction } from "@/lib/campaigns/offer-campaigns";

describe("offer campaign checklist", () => {
  it("points to Instagram Reel first", () => {
    expect(nextCampaignAction(buildInitialCampaignChecklist())).toEqual({
      channel: "instagram_reel",
      label: "Publicar Reel no Instagram",
      state: "pending",
    });
  });

  it("advances to the next unfinished channel", () => {
    const checklist = buildInitialCampaignChecklist();
    checklist.instagram_reel = { status: "published", published_at: "2026-08-22T12:00:00.000Z" };
    checklist.instagram_story = { status: "skipped", published_at: null };

    expect(nextCampaignAction(checklist).channel).toBe("facebook_feed");
  });

  it("waits for data after all channels are published or skipped", () => {
    const checklist = buildInitialCampaignChecklist();
    for (const channel of Object.keys(checklist) as Array<keyof typeof checklist>) {
      checklist[channel] = { status: "skipped", published_at: null };
    }

    expect(nextCampaignAction(checklist).label).toBe("Aguardar dados e revisar campanha");
  });
});
