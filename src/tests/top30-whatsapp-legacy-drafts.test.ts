import { describe, expect, it } from "vitest";
import type { Offer } from "@/types/domain";
import {
  prepareTop30WhatsappLegacyDrafts,
  type Top30WhatsappRepository,
} from "@/lib/offers/prepare-top30-whatsapp-legacy-drafts";

const NOW = new Date("2026-08-07T12:00:00.000Z");

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

function repository(input: { recent: Offer[]; fallback: Offer[]; published?: Set<string>; links?: Map<string, { id: string; tracked_url: string }>; drafts?: Map<string, { id: string; status: "draft" }> }) {
  const calls: string[] = [];
  const writes: Array<{ type: string; offerId: string; content?: string }> = [];
  const links = input.links ?? new Map();
  const drafts = input.drafts ?? new Map();
  const published = input.published ?? new Set<string>();
  const repo: Top30WhatsappRepository & { calls: string[]; writes: typeof writes } = {
    calls,
    writes,
    async listOffersSince(since) {
      const hours = Math.round((NOW.getTime() - since.getTime()) / 3_600_000);
      calls.push(`offers:${hours}h`);
      return hours <= 48 ? input.recent : [...input.recent, ...input.fallback];
    },
    async listAffiliateLinks() {
      calls.push("affiliate_links:whatsapp");
      return [...links.entries()].map(([offerId, link]) => ({ offer_id: offerId, channel: "whatsapp" as const, ...link }));
    },
    async listDrafts() {
      calls.push("drafts:whatsapp");
      return [...drafts.entries()].map(([offerId, draft]) => ({ offer_id: offerId, channel: "whatsapp" as const, ...draft }));
    },
    async listPublished() {
      calls.push("published:whatsapp");
      return [...published].map((offerId) => ({ offer_id: offerId, channel: "whatsapp" as const, id: `published-${offerId}`, status: "published" }));
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
      const draft = { id: `post-${input.offerId}`, status: "draft" as const };
      drafts.set(input.offerId, draft);
      return { ...draft, channel: "whatsapp" as const };
    },
  };
  return repo;
}

describe("prepareTop30WhatsappLegacyDrafts", () => {
  it("uses 48h first, falls back to 72h, and never asks for all history", async () => {
    const recent = Array.from({ length: 20 }, (_, index) => offer(`recent-${index}`, "2026-08-06T12:00:00.000Z"));
    const fallback = Array.from({ length: 10 }, (_, index) => offer(`fallback-${index}`, "2026-08-05T12:00:00.000Z"));
    const repo = repository({ recent, fallback });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.windowUsed).toBe("72h");
    expect(result.created).toBe(30);
    expect(repo.calls).toContain("offers:48h");
    expect(repo.calls).toContain("offers:72h");
    expect(repo.calls).not.toContain("offers:all");
    expect(repo.calls).not.toContain("affiliate_links:telegram");
  });

  it("creates at most Top 30 WhatsApp drafts with tracked links and no publish operation", async () => {
    const offers = Array.from({ length: 35 }, (_, index) => offer(`offer-${index}`, "2026-08-07T10:00:00.000Z"));
    const repo = repository({ recent: offers, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.windowUsed).toBe("48h");
    expect(result.created).toBe(30);
    expect(repo.writes.filter((write) => write.type === "draft")).toHaveLength(30);
    expect(repo.writes.filter((write) => write.type === "draft").every((write) => write.content?.includes("https://cacaoferta.test/go/wp_"))).toBe(true);
    expect(repo.calls).not.toContain("publish");
  });

  it("reuses drafts and preserves published offers on a second run", async () => {
    const offers = Array.from({ length: 30 }, (_, index) => offer(`offer-${index}`, "2026-08-07T10:00:00.000Z"));
    const drafts = new Map([["offer-0", { id: "existing-post", status: "draft" as const }]]);
    const published = new Set(["offer-1"]);
    const repo = repository({ recent: offers, fallback: [], drafts, published });

    const first = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });
    const writesAfterFirst = repo.writes.length;
    const second = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(first.reused).toBe(1);
    expect(first.reasons.published_protected).toBe(1);
    expect(second.reused).toBe(29);
    expect(repo.writes.length).toBe(writesAfterFirst);
  });

  it("skips an item when affiliate link creation fails and does not create a raw-link draft", async () => {
    const offers = [offer("link-fails", "2026-08-07T10:00:00.000Z"), ...Array.from({ length: 29 }, (_, index) => offer(`safe-${index}`, "2026-08-07T10:00:00.000Z"))];
    const repo = repository({ recent: offers, fallback: [] });

    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });

    expect(result.skipped).toBe(1);
    expect(result.reasons.affiliate_link_failed).toBe(1);
    expect(repo.writes.some((write) => write.type === "draft" && write.offerId === "link-fails")).toBe(false);
  });

  it("does not expose a Telegram preparation path", async () => {
    const repo = repository({ recent: [offer("offer-1", "2026-08-07T10:00:00.000Z")], fallback: [] });
    const result = await prepareTop30WhatsappLegacyDrafts(repo, { now: NOW });
    expect(result.reasons.telegram_blocked).toBe(1);
    expect(repo.calls.some((call) => call.includes("telegram"))).toBe(false);
  });
});
