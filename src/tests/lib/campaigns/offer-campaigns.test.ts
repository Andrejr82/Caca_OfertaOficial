import { describe, expect, it, vi } from "vitest";
import {
  buildCampaignWindow,
  buildInitialCampaignChecklist,
  startOfferCampaign,
} from "@/lib/campaigns/offer-campaigns";

function createSupabaseMock(options: {
  existing?: any;
  inserted?: any;
  insertError?: any;
  concurrent?: any;
} = {}) {
  let lookupCount = 0;
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () => ({ data: options.inserted ?? null, error: options.insertError ?? null }),
    }),
  }));

  const from = vi.fn((table: string) => {
    if (table !== "offer_campaigns") throw new Error(`Tabela inesperada: ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => {
                    lookupCount += 1;
                    return {
                      data: lookupCount === 1 ? options.existing ?? null : options.concurrent ?? null,
                      error: null,
                    };
                  },
                }),
              }),
            }),
          }),
        }),
      }),
      insert,
    };
  });

  return { client: { from }, insert };
}

describe("offer campaigns", () => {
  it("builds the five-channel checklist as pending", () => {
    expect(buildInitialCampaignChecklist()).toEqual({
      instagram_reel: { status: "pending", published_at: null },
      instagram_story: { status: "pending", published_at: null },
      facebook_feed: { status: "pending", published_at: null },
      facebook_group: { status: "pending", published_at: null },
      whatsapp: { status: "pending", published_at: null },
    });
  });

  it("uses a 48-hour campaign window by default", () => {
    const start = new Date("2026-08-22T12:00:00.000Z");
    expect(buildCampaignWindow(start)).toEqual({
      startedAt: "2026-08-22T12:00:00.000Z",
      endsAt: "2026-08-24T12:00:00.000Z",
    });
  });

  it("returns an existing open campaign without inserting another", async () => {
    const existing = { id: "campaign-1", offer_id: "offer-1", status: "active" };
    const { client, insert } = createSupabaseMock({ existing });

    const result = await startOfferCampaign(client, "user-1", "offer-1");

    expect(result).toEqual({ campaign: existing, created: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates one active campaign with the default 48-hour window", async () => {
    const inserted = { id: "campaign-2", offer_id: "offer-2", status: "active" };
    const { client, insert } = createSupabaseMock({ inserted });
    const now = new Date("2026-08-22T12:00:00.000Z");

    const result = await startOfferCampaign(client, "user-1", "offer-2", { now });

    expect(result).toEqual({ campaign: inserted, created: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      offer_id: "offer-2",
      status: "active",
      started_at: "2026-08-22T12:00:00.000Z",
      ends_at: "2026-08-24T12:00:00.000Z",
      official_links: {},
    }));
  });

  it("recovers the concurrent campaign when the database unique index wins the race", async () => {
    const concurrent = { id: "campaign-3", offer_id: "offer-3", status: "active" };
    const { client } = createSupabaseMock({
      insertError: { code: "23505", message: "duplicate key" },
      concurrent,
    });

    const result = await startOfferCampaign(client, "user-1", "offer-3");
    expect(result).toEqual({ campaign: concurrent, created: false });
  });
});
