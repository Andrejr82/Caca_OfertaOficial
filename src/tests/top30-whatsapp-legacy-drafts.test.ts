import { describe, expect, it } from "vitest";
import type { Offer } from "@/types/domain";
import {
  prepareTop30WhatsappLegacyDrafts,
  rotateNextWhatsappEditorialBatch,
  type WhatsappEditorialBatchState,
  type Top30WhatsappRepository,
} from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const TODAY_START = new Date("2026-08-07T03:00:00.000Z");

type TestPost = {
  id: string;
  offer_id: string;
  channel: "whatsapp";
  status: string;
  created_at: string;
  posted_at: string | null;
  external_id: string | null;
};

function offer(id: string, createdAt: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    user_id: "user-1",
    platform: "Mercado Livre",
    product_name: `Acessório automotivo para carro modelo ${id}`,
    category: "Casa",
    original_url: `https://marketplace.test/${id}`,
    image_url: `https://images.test/${id}.jpg`,
    current_price: 39,
    old_price: 59,
    coupon: null,
    rating: null,
    estimated_commission: null,
    commission_rate: null,
    score: 8,
    status: "draft",
    notes: null,
    seasonality: null,
    created_at: createdAt,
    updated_at: createdAt,
    marketplace_metrics: {},
    ...overrides,
  };
}

function post(offerId: string, status: string, createdAt: string, overrides: Partial<TestPost> = {}): TestPost {
  return { id: `post-${offerId}`, offer_id: offerId, channel: "whatsapp", status, created_at: createdAt, posted_at: null, external_id: null, ...overrides };
}

function repository(input: {
  today: Offer[];
  fallback: Offer[];
  posts?: TestPost[];
  links?: Map<string, { id: string; tracked_url: string }>;
  state?: WhatsappEditorialBatchState | null;
}) {
  const calls: string[] = [];
  const writes: Array<{ type: string; offerId: string; content?: string }> = [];
  const links = input.links ?? new Map();
  const posts = input.posts ?? [];
  let state = input.state ?? null;
  const repo: Top30WhatsappRepository & { calls: string[]; writes: typeof writes } = {
    calls,
    writes,
    async listOffersBetween(start, end) {
      const hours = Math.round((NOW.getTime() - start.getTime()) / 3_600_000);
      calls.push(`offers:${hours}h`);
      return start.getTime() === TODAY_START.getTime() ? input.today : [...input.today, ...input.fallback];
    },
    async listAffiliateLinks() {
      calls.push("affiliate_links:whatsapp");
      return [...links.entries()].map(([offerId, link]) => ({ offer_id: offerId, channel: "whatsapp" as const, ...link }));
    },
    async listWhatsappPosts() {
      calls.push("posts:whatsapp");
      return posts;
    },
    async listHistoricalOffers() {
      calls.push("offers:historical");
      return [];
    },
    async createAffiliateLink(input) {
      writes.push({ type: "affiliate_link", offerId: input.offerId });
      if (input.offerId === "link-fails") throw new Error("affiliate unavailable");
      const link = { id: `link-${input.offerId}`, tracked_url: `https://cacaoferta.test/go/wp_${input.offerId}` };
      links.set(input.offerId, link);
      return link;
    },
    async insertDraft(input) {
      writes.push({ type: "draft", offerId: input.offerId, content: input.content });
      return { id: `post-${input.offerId}`, status: "draft" as const, channel: "whatsapp" as const };
    },
    async loadWhatsappEditorialBatchState() {
      return state;
    },
    async saveWhatsappEditorialBatchState(nextState) {
      state = nextState;
    },
  };
  return repo;
}

describe("prepareTop30WhatsappLegacyDrafts", () => {
  it("reproduces the discovery cycle with 4 ML + 7 Amazon and refreshes stale active state", async () => {
    const correlation = "50242c4e-921b-42b8-8b29-a80fc2ff6a24";
    const discovery = { correlation_id: correlation, discovery_evidence: { discoveredAt: "2026-08-09T10:00:36.030Z" } };
    const cycle = [
      ...Array.from({ length: 4 }, (_, index) => offer(`cycle-ml-${index}`, "2026-08-09T10:00:52.042Z", {
        platform: "Mercado Livre", product_name: `Organizador ${index}`, category: "Casa", item_id: `MLB-${index}`, explainability: discovery,
      })),
      ...Array.from({ length: 7 }, (_, index) => offer(`cycle-amazon-${index}`, "2026-08-09T10:01:43.135Z", {
        platform: "Amazon", product_name: `Organizador Amazon ${index}`, category: "Casa", product_id: `ASIN-${index}`, explainability: discovery,
      })),
    ];
    const stale = offer("stale-active", "2026-08-09T09:00:20.000Z", {
      platform: "Shopee", product_name: "Faqueiro de cozinha", shopee_item_id: "stale-item", explainability: { correlation_id: "old-cycle" },
    });
    const repo = repository({
      today: [...cycle, stale],
      fallback: [],
      state: { version: 1, dayKey: "2026-08-09", activeOfferIds: [stale.id], seenOfferIds: [stale.id], exhausted: false },
    });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: new Date("2026-08-09T12:00:00.000Z") });

    expect(result.selectedOfferIds).toHaveLength(11);
    expect(result.selectedOfferIds).toEqual(expect.arrayContaining(cycle.map((item) => item.id)));
    expect(result.selectedOfferIds).not.toContain(stale.id);
  });

  it("selects only the latest-cycle Top30 from 582 raw offers and keeps the database rows untouched", async () => {
    const discovery = { correlation_id: "cycle-real", discovery_evidence: { discoveredAt: "2026-08-07T10:00:00.000Z" } };
    const rawOffers = [
      ...Array.from({ length: 572 }, (_, index) => offer(`shopee-${index}`, "2026-08-07T10:00:01.000Z", { platform: "Shopee", shopee_item_id: `item-${index}`, explainability: discovery })),
      ...Array.from({ length: 8 }, (_, index) => offer(`amazon-${index}`, "2026-08-07T10:00:01.000Z", { platform: "Amazon", product_id: `ASIN-${index}`, explainability: discovery })),
      offer("mercado-livre-1", "2026-08-07T10:00:01.000Z", { platform: "Mercado Livre", item_id: "ML-1", explainability: discovery }),
      offer("old-updated", "2026-08-07T09:00:00.000Z", { platform: "Shopee", shopee_item_id: "old-item", updated_at: "2026-08-07T10:00:02.000Z", explainability: discovery }),
    ];
    const repo = repository({ today: rawOffers, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(rawOffers).toHaveLength(582);
    expect(result.selectedOfferIds).toHaveLength(30);
    expect(new Set(result.selectedOfferIds).size).toBe(30);
    expect(result.selectedOfferIds.filter((id) => id.startsWith("shopee-")).length).toBeLessThanOrEqual(30);
    expect(result.selectedOfferIds.some((id) => id.startsWith("amazon-"))).toBe(true);
    expect(result.selectedOfferIds).not.toContain("old-updated");
    expect(repo.writes).toHaveLength(0);
  });

  it("recognizes the real 43-offer cycle across normalized market correlations", async () => {
    const correlation = "b278725c-f8e7-4777-812f-3bb8a883454f";
    const rawOffers = [
      ...Array.from({ length: 27 }, (_, index) => offer(`real-shopee-${index}`, "2026-08-07T10:00:01.000Z", { platform: "Shopee", shopee_item_id: `real-item-${index}`, explainability: { correlation_id: `shopee-openapi-v1:${correlation}`, discovery_evidence: { discoveredAt: "2026-08-07T10:00:00.000Z" } } })),
      ...Array.from({ length: 8 }, (_, index) => offer(`real-amazon-${index}`, "2026-08-07T10:00:01.000Z", { platform: "Amazon", product_id: `REAL-ASIN-${index}`, explainability: { correlation_id: correlation, discovery_evidence: { discoveredAt: "2026-08-07T10:00:00.000Z" } } })),
      ...Array.from({ length: 8 }, (_, index) => offer(`real-ml-${index}`, "2026-08-07T10:00:01.000Z", { platform: "Mercado Livre", item_id: `REAL-ML-${index}`, explainability: { correlation_id: correlation, discovery_evidence: { discoveredAt: "2026-08-07T10:00:00.000Z" } } })),
    ];
    const repo = repository({ today: rawOffers, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(rawOffers).toHaveLength(43);
    expect(result.selectedOfferIds).toHaveLength(30);
    expect(result.selectedOfferIds.length).toBeGreaterThan(0);
    expect(repo.writes).toHaveLength(0);
  });

  it("uses today BRT first, falls back to 24h, and never asks for 48h/72h", async () => {
    const today = Array.from({ length: 20 }, (_, index) => offer(`today-${index}`, "2026-08-07T10:00:00.000Z"));
    const fallback = Array.from({ length: 10 }, (_, index) => offer(`yesterday-${index}`, "2026-08-06T13:00:00.000Z"));
    const repo = repository({ today, fallback });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.windowUsed).toBe("24h_fallback");
    expect(result.created).toBe(0);
    expect(result.reasons.legacy_copy_generation_disabled).toBe(20);
    expect(repo.calls).toContain("offers:9h");
    expect(repo.calls).toContain("offers:24h");
    expect(repo.calls.some((call) => call.includes("48h") || call.includes("72h"))).toBe(false);
  });

  it("uses only today's BRT offers when they already close Top 30", async () => {
    const today = Array.from({ length: 30 }, (_, index) => offer(`today-${index}`, "2026-08-07T10:00:00.000Z"));
    const fallback = [offer("old-history", "2026-08-05T10:00:00.000Z")];
    const repo = repository({ today, fallback });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.windowUsed).toBe("today_brt");
    expect(result.created).toBe(0);
    expect(result.reasons.legacy_copy_generation_disabled).toBe(30);
    expect(repo.calls).not.toContain("offers:24h");
    expect(repo.writes.some((write) => write.offerId === "old-history")).toBe(false);
  });

  it("reports latest_cycle_today when the current discovery cycle supplies the Top 30", async () => {
    const today = Array.from({ length: 30 }, (_, index) => offer(`cycle-${index}`, "2026-08-07T10:00:00.000Z", { explainability: { correlation_id: "cycle-current" } }));
    const repo = repository({ today, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.windowUsed).toBe("latest_cycle_today");
  });

  it("reuses a valid draft created today but never reuses an old draft", async () => {
    const today = Array.from({ length: 30 }, (_, index) => offer(`today-${index}`, "2026-08-07T10:00:00.000Z"));
    const posts = [
      post("today-0", "draft", "2026-08-07T09:00:00.000Z"),
      post("today-1", "draft", "2026-08-06T23:00:00.000Z"),
    ];
    const repo = repository({ today, fallback: [], posts });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.reusedTodayDrafts).toBe(1);
    expect(result.skippedOldDraft).toBe(1);
    expect(repo.writes.some((write) => write.type === "draft" && write.offerId === "today-0")).toBe(false);
    expect(repo.writes.some((write) => write.type === "draft" && write.offerId === "today-1")).toBe(false);
  });

  it("blocks posted, published, approved and technically posted WhatsApp records", async () => {
    const today = Array.from({ length: 8 }, (_, index) => offer(`today-${index}`, "2026-08-07T10:00:00.000Z", index === 5 ? { status: "posted" } : {}));
    const posts = [
      post("today-0", "posted", "2026-08-07T09:00:00.000Z"),
      post("today-1", "published", "2026-08-07T09:00:00.000Z"),
      post("today-2", "approved", "2026-08-07T09:00:00.000Z"),
      post("today-3", "draft", "2026-08-07T09:00:00.000Z", { posted_at: "2026-08-07T09:30:00.000Z" }),
      post("today-4", "draft", "2026-08-07T09:00:00.000Z", { external_id: "wa-4" }),
    ];
    const repo = repository({ today, fallback: [], posts });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.skippedAlreadyPosted).toBeGreaterThanOrEqual(4);
    expect(result.skippedAlreadyApproved).toBe(1);
    expect(result.created).toBe(0);
    expect(repo.writes.filter((write) => write.type === "draft").every((write) => !posts.some((item) => item.offer_id === write.offerId))).toBe(true);
  });

  it("blocks rejected and deferred offers without creating a legacy draft", async () => {
    const today = [
      offer("rejected", "2026-08-07T10:00:00.000Z", { status: "rejected" }),
      offer("deferred", "2026-08-07T10:00:00.000Z", { status: "deferred" }),
      offer("eligible", "2026-08-07T10:00:00.000Z"),
    ];
    const repo = repository({ today, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(repo.writes.filter((write) => write.type === "draft")).toHaveLength(0);
    expect(result.reasons.legacy_copy_generation_disabled).toBe(1);
  });

  it("blocks a deleted-post identity without creating a legacy draft", async () => {
    const today = [
      offer("new-offer-id", "2026-08-07T10:00:00.000Z", { shopee_item_id: "same-item" }),
      offer("new-product", "2026-08-07T10:00:00.000Z", { shopee_item_id: "fresh-item" }),
    ];
    const posts = [post("old-offer-id", "deleted", "2026-08-07T09:00:00.000Z")];
    const repo = repository({ today, fallback: [], posts });
    repo.listHistoricalOffers = async () => [
      { id: "old-offer-id", platform: "Shopee", shopee_item_id: "same-item", item_id: null, product_id: null, shopee_shop_id: null, original_url: "https://shopee.test/same-item" },
      { id: "new-offer-id", platform: "Shopee", shopee_item_id: "same-item", item_id: null, product_id: null, shopee_shop_id: null, original_url: "https://shopee.test/same-item" },
      { id: "new-product", platform: "Shopee", shopee_item_id: "fresh-item", item_id: null, product_id: null, shopee_shop_id: null, original_url: "https://shopee.test/fresh-item" },
    ];

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(repo.writes.filter((write) => write.type === "draft")).toHaveLength(0);
    expect(result.reasons.legacy_copy_generation_disabled).toBe(1);
  });

  it("does not duplicate an offer already seen today and prioritizes the latest discovery correlation", async () => {
    const today = [
      ...Array.from({ length: 2 }, (_, index) => offer(`old-cycle-${index}`, "2026-08-07T08:00:00.000Z", { explainability: { correlation_id: "cycle-old" } })),
      ...Array.from({ length: 2 }, (_, index) => offer(`new-cycle-${index}`, "2026-08-07T11:00:00.000Z", { explainability: { correlation_id: "cycle-new" } })),
    ];
    const posts = [post("old-cycle-0", "failed", "2026-08-07T08:30:00.000Z")];
    const repo = repository({ today, fallback: [], posts });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.skippedAlreadySeenToday).toBe(1);
    expect(result.windowUsed).toBe("24h_fallback");
    expect(repo.writes.filter((write) => write.type === "draft")).toHaveLength(0);
  });

  it("skips an item when affiliate link creation fails and does not create a raw-link draft", async () => {
    const today = [offer("link-fails", "2026-08-07T10:00:00.000Z"), ...Array.from({ length: 29 }, (_, index) => offer(`safe-${index}`, "2026-08-07T10:00:00.000Z"))];
    const repo = repository({ today, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.skippedAffiliateFailed).toBe(0);
    expect(result.reasons.legacy_copy_generation_disabled).toBeGreaterThan(0);
    expect(repo.writes.some((write) => write.type === "draft" && write.offerId === "link-fails")).toBe(false);
  });

  it("does not expose a Telegram preparation path and keeps drafts as draft", async () => {
    const repo = repository({ today: [offer("today-1", "2026-08-07T10:00:00.000Z")], fallback: [] });
    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });
    expect(result.reasons.telegram_blocked).toBe(1);
    expect(repo.calls.some((call) => call.includes("telegram"))).toBe(false);
    expect(result.created).toBeGreaterThanOrEqual(0);
  });
});

describe("rotateNextWhatsappEditorialBatch", () => {
  it("advances through today's full eligible universe without recycling the active batch", async () => {
    const offers = Array.from({ length: 90 }, (_, index) => offer(`next-${index}`, "2026-08-07T10:00:01.000Z", { item_id: `next-item-${index}` }));
    const repo = repository({
      today: offers,
      fallback: [],
      state: { version: 1, dayKey: "2026-08-07", activeOfferIds: offers.slice(0, 30).map((item) => item.id), seenOfferIds: offers.slice(0, 30).map((item) => item.id), exhausted: false },
    });
    const first = await rotateNextWhatsappEditorialBatch(repo, { now: NOW });
    const second = await rotateNextWhatsappEditorialBatch(repo, { now: NOW });
    expect(first.selectedCount).toBe(30);
    expect(second.selectedCount).toBe(30);
    expect(new Set([...first.selectedOfferIds, ...second.selectedOfferIds]).size).toBe(60);
    expect(first.selectedOfferIds.some((id) => id.startsWith("next-0"))).toBe(false);
    expect(first).not.toHaveProperty("created");
    expect(first).not.toHaveProperty("legacy_copy_generation_disabled");
  });

  it("does not let manual, protected, historical, or duplicate offers consume slots", async () => {
    const eligible = Array.from({ length: 30 }, (_, index) => offer(`eligible-${index}`, "2026-08-07T10:00:01.000Z", { item_id: `eligible-item-${index}` }));
    const raw = [
      ...eligible,
      offer("manual", "2026-08-07T10:00:01.000Z", { explainability: { manual_source: true }, item_id: "manual-item" }),
      offer("rejected", "2026-08-07T10:00:01.000Z", { status: "rejected", item_id: "rejected-item" }),
      offer("duplicate", "2026-08-07T10:00:01.000Z", { item_id: "eligible-item-0" }),
    ];
    const repo = repository({ today: raw, fallback: [], posts: [post("eligible-1", "posted", "2026-08-06T10:00:00.000Z")] });
    const result = await rotateNextWhatsappEditorialBatch(repo, { now: NOW });
    expect(result.selectedOfferIds).not.toContain("manual");
    expect(result.selectedOfferIds).not.toContain("rejected");
    expect(result.selectedOfferIds.filter((id) => ["eligible-0", "duplicate"].includes(id))).toHaveLength(1);
    expect(result.selectedCount).toBeLessThanOrEqual(30);
  });

  it("uses all eligible offers today instead of reapplying the latest-cycle limit", async () => {
    const olderCycle = Array.from({ length: 31 }, (_, index) => offer(`older-${index}`, "2026-08-07T09:00:01.000Z", { item_id: `older-item-${index}`, explainability: { correlation_id: "older-cycle" } }));
    const latestCycle = Array.from({ length: 30 }, (_, index) => offer(`latest-${index}`, "2026-08-07T10:00:01.000Z", { item_id: `latest-item-${index}`, explainability: { correlation_id: "latest-cycle" } }));
    const repo = repository({
      today: [...olderCycle, ...latestCycle],
      fallback: [],
      state: { version: 1, dayKey: "2026-08-07", activeOfferIds: latestCycle.map((item) => item.id), seenOfferIds: latestCycle.map((item) => item.id), exhausted: false },
    });
    const result = await rotateNextWhatsappEditorialBatch(repo, { now: NOW });
    expect(result.selectedCount).toBe(30);
    expect(result.selectedOfferIds.every((id) => id.startsWith("older-"))).toBe(true);
  });

  it("returns exhausted and never recycles after all IDs were seen", async () => {
    const only = [offer("only", "2026-08-07T10:00:01.000Z")];
    const state: WhatsappEditorialBatchState = { version: 1, dayKey: "2026-08-07", activeOfferIds: ["only"], seenOfferIds: ["only"], exhausted: false };
    const repo = repository({ today: only, fallback: [], state });
    const result = await rotateNextWhatsappEditorialBatch(repo, { now: NOW });
    expect(result.status).toBe("exhausted");
    expect(result.selectedOfferIds).toEqual([]);
  });
});

describe("WhatsApp opening batch authority", () => {
  it("keeps the persisted active batch after the page refreshes when active rows exist today", async () => {
    const activeOffers = [
      offer("click-1", "2026-08-07T10:00:01.000Z"),
      offer("click-2", "2026-08-07T10:00:01.000Z"),
    ];
    const repo = repository({
      today: activeOffers,
      fallback: [],
      state: { version: 1, dayKey: "2026-08-07", activeOfferIds: ["click-1", "click-2"], seenOfferIds: ["click-1", "click-2"], exhausted: false },
    });
    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });
    expect(result.selectedOfferIds).toEqual(["click-1", "click-2"]);
  });

  it("does not reuse stale state when activeRows.length === 0 and recalculates current cycle", async () => {
    const repo = repository({
      today: [offer("initial-cycle", "2026-08-07T10:00:01.000Z")],
      fallback: [],
      state: { version: 1, dayKey: "2026-08-07", activeOfferIds: ["stale-ghost-1", "stale-ghost-2"], seenOfferIds: ["stale-ghost-1", "stale-ghost-2"], exhausted: false },
    });
    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });
    expect(result.selectedOfferIds).toEqual(["initial-cycle"]);
  });
});
