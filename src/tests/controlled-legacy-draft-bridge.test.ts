import { describe, expect, it } from "vitest";
import { runControlledBridge, type BridgeRepository } from "../../scripts/controlled-legacy-draft-bridge";
import type { Offer } from "@/types/domain";

const offer = (id: string, overrides: Partial<Offer> = {}): Offer => ({
  id, user_id: "user-1", platform: "Shopee", product_name: `Organizador de gaveta ${id}`, category: "Casa", original_url: `https://shopee.test/${id}`, image_url: `https://img.test/${id}.jpg`, current_price: 39, old_price: 59, coupon: null, rating: 4.8, estimated_commission: null, commission_rate: null, score: 8, status: "draft", notes: null, seasonality: null, created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z", marketplace_metrics: { sales: 300 }, ...overrides
});

function repository(offers: Offer[], state: { links?: Record<string, any>; drafts?: Record<string, any> } = {}) {
  const links = new Map(Object.entries(state.links ?? {})); const drafts = new Map(Object.entries(state.drafts ?? {})); const writes: string[] = []; const contents = new Map<string, string>();
  const repo: BridgeRepository & { writes: string[]; contents: Map<string, string> } = {
    writes, contents, async listOffers() { return offers; }, async listAffiliateLinks(channel) { return [...links.entries()].filter(([key]) => key.endsWith(`:${channel}`)).map(([key, row]) => ({ ...row, offer_id: key.split(":")[0], channel })); },
    async createAffiliateLink(input) { writes.push(`link:${input.offerId}:${input.channel}`); const row = { id: `link-${input.offerId}-${input.channel}`, tracked_url: input.trackedUrl }; links.set(`${input.offerId}:${input.channel}`, row); return row; },
    async listDrafts(channel) { return [...drafts.entries()].filter(([key]) => key.endsWith(`:${channel}`)).map(([key, row]) => ({ ...row, offer_id: key.split(":")[0], channel })); },
    async listPublished() { return []; },
    async insertDraft(input) { writes.push(`draft:${input.offerId}:${input.channel}`); contents.set(`${input.offerId}:${input.channel}`, input.content); const row = { id: `post-${input.offerId}-${input.channel}`, status: "draft", channel: input.channel }; drafts.set(`${input.offerId}:${input.channel}`, row); return row; },
    async listPanelDrafts(channel) { return [...drafts.entries()].filter(([key]) => key.endsWith(`:${channel}`)).map(([key, row]) => ({ id: row.id, offer_id: key.split(":")[0], channel, status: "draft", content: contents.get(key) ?? "copy https://cacaoferta.com.br/go/test", affiliate_link_id: "link", offers: { image_url: "https://img.test/item.jpg" }, affiliate_links: { tracked_url: "https://cacaoferta.com.br/go/test" } } as any)); }
  }; return repo;
}

describe("controlled legacy draft bridge", () => {
  it("dry-run não escreve e limita a um candidato por canal", async () => {
    const repo = repository([offer("offer-1"), offer("offer-2", { product_name: "Fone bluetooth" })]);
    const result = await runControlledBridge(repo, { dryRun: true });
    expect(result.candidates.length).toBeLessThanOrEqual(2); expect(repo.writes).toEqual([]); expect(result.drafts).toEqual([]);
  });
  it("reutiliza link e draft existentes sem duplicar", async () => {
    const repo = repository([offer("offer-1")], { links: { "offer-1:telegram": { id: "link-1", tracked_url: "https://cacaoferta.com.br/go/tg_offer-1" } }, drafts: { "offer-1:telegram": { id: "post-1", status: "draft" } } });
    const result = await runControlledBridge(repo, { dryRun: false });
    expect(repo.writes).toEqual([]); expect(result.drafts).toEqual([]);
  });
  it("bloqueia criação de posts fora da Official AI", async () => {
    const repo = repository([offer("offer-1")]);
    const result = await runControlledBridge(repo, { dryRun: false });
    expect(result.drafts).toEqual([]);
    expect(repo.writes.filter((item) => item.startsWith("draft:")).length).toBe(0);
  });
});
