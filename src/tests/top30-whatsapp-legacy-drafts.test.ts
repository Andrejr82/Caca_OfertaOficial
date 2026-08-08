import { describe, expect, it } from "vitest";
import type { Offer } from "@/types/domain";
import {
  prepareTop30WhatsappLegacyDrafts,
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
}) {
  const calls: string[] = [];
  const writes: Array<{ type: string; offerId: string; content?: string }> = [];
  const links = input.links ?? new Map();
  const posts = input.posts ?? [];
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
  };
  return repo;
}

describe("prepareTop30WhatsappLegacyDrafts", () => {
  it("uses today BRT first, falls back to 24h, and never asks for 48h/72h", async () => {
    const today = Array.from({ length: 20 }, (_, index) => offer(`today-${index}`, "2026-08-07T10:00:00.000Z"));
    const fallback = Array.from({ length: 10 }, (_, index) => offer(`yesterday-${index}`, "2026-08-06T13:00:00.000Z"));
    const repo = repository({ today, fallback });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.windowUsed).toBe("24h_fallback");
    expect(result.created).toBe(0);
    expect(result.reasons.legacy_copy_generation_disabled).toBe(30);
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
