import { describe, expect, it } from "vitest";
import type { Offer } from "@/types/domain";
import { loadEditorialTop30TelegramOfferIds, loadTelegramEditorialDraftRows, selectEditorialTop30TelegramOfferIds, selectEditorialTop30TelegramSelection, type TelegramEditorialDraftRow } from "@/lib/telegram/select-editorial-top30-telegram-drafts";

const NOW = new Date("2026-08-08T12:00:00.000Z");

function offer(id: string, createdAt: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    user_id: "user-1",
    platform: "Shopee",
    product_name: `Organizador de gaveta modelo ${id}`,
    category: "Casa",
    original_url: `https://shopee.test/${id}`,
    image_url: `https://images.test/${id}.jpg`,
    current_price: 39,
    old_price: 59,
    coupon: null,
    rating: 4.8,
    estimated_commission: null,
    commission_rate: null,
    score: 80,
    status: "pending_manual_review",
    notes: null,
    seasonality: null,
    created_at: createdAt,
    updated_at: "2026-08-08T12:00:00.000Z",
    marketplace_metrics: { sales: 500, rating: 4.8, discount: 20 },
    explainability: { correlation_id: "cycle-current", discovery_evidence: { discoveredAt: "2026-08-08T10:00:00.000Z" } },
    ...overrides,
  };
}

function draft(offerRow: Offer, overrides: Partial<TelegramEditorialDraftRow> = {}): TelegramEditorialDraftRow {
  return {
    id: `post-${offerRow.id}`,
    offer_id: offerRow.id,
    channel: "telegram",
    status: "draft",
    content: "Oferta editorial",
    created_at: offerRow.created_at,
    posted_at: null,
    external_id: null,
    offers: offerRow,
    ...overrides,
  };
}

describe("Telegram editorial auto-publish selection", () => {
  it("selects only the current editorial Top30 from 582 drafts", () => {
    const rows = [
      ...Array.from({ length: 552 }, (_, index) => draft(offer(`historical-${index}`, "2026-08-07T10:00:00.000Z"))),
      ...Array.from({ length: 30 }, (_, index) => draft(offer(`current-${index}`, "2026-08-08T10:00:01.000Z"))),
    ];

    const selected = selectEditorialTop30TelegramOfferIds(rows, NOW);

    expect(rows).toHaveLength(582);
    expect(selected).toHaveLength(30);
    expect(selected.every((id) => id.startsWith("current-"))).toBe(true);
  });

  it("keeps manual express outside editorial publication and blocks old/outside drafts", () => {
    const current = Array.from({ length: 30 }, (_, index) => draft(offer(`current-${index}`, "2026-08-08T10:00:01.000Z")));
    const manual = draft(offer("manual", "2026-08-08T11:00:00.000Z", { explainability: { manual_source: true } }));
    const old = draft(offer("old", "2026-08-07T10:00:00.000Z"));
    const alreadyPublished = draft(offer("published", "2026-08-08T10:00:01.000Z"), { status: "published", external_id: "tg-1" });

    const selected = selectEditorialTop30TelegramOfferIds([...current, manual, old, alreadyPublished], NOW);

    expect(selected).toHaveLength(30);
    expect(selected).not.toContain("manual");
    expect(selected).not.toContain("old");
    expect(selected).not.toContain("published");
  });

  it("returns no candidates when no current editorial draft exists", () => {
    expect(selectEditorialTop30TelegramOfferIds([draft(offer("old", "2026-08-07T10:00:00.000Z"))], NOW)).toEqual([]);
  });

  it("keeps Shopee at Top30 while including every eligible Amazon and Mercado Livre draft", () => {
    const shopee = Array.from({ length: 50 }, (_, index) => draft(offer(`shopee-${index}`, "2026-08-08T10:00:01.000Z")));
    const amazon = Array.from({ length: 8 }, (_, index) => draft(offer(`amazon-${index}`, "2026-08-08T10:00:01.000Z", { platform: "Amazon" })));
    const mercadoLivre = Array.from({ length: 3 }, (_, index) => draft(offer(`ml-${index}`, "2026-08-08T10:00:01.000Z", { platform: "Mercado Livre" })));

    const selected = selectEditorialTop30TelegramOfferIds([...shopee, ...amazon, ...mercadoLivre], NOW);

    expect(selected).toHaveLength(41);
    expect(selected.filter((id) => id.startsWith("shopee-"))).toHaveLength(30);
    expect(selected.filter((id) => id.startsWith("amazon-"))).toHaveLength(8);
    expect(selected.filter((id) => id.startsWith("ml-"))).toHaveLength(3);
  });

  it("não retorna vazio quando o último ciclo elegível atravessa a virada do dia BRT", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const cycleCreatedAt = "2026-08-08T22:11:40.000Z";
    const shopee = Array.from({ length: 40 }, (_, index) => draft(offer(`overnight-shopee-${index}`, cycleCreatedAt)));
    const amazon = Array.from({ length: 14 }, (_, index) => draft(offer(`overnight-amazon-${index}`, cycleCreatedAt, { platform: "Amazon" })));
    const mercadoLivre = Array.from({ length: 9 }, (_, index) => draft(offer(`overnight-ml-${index}`, cycleCreatedAt, { platform: "Mercado Livre" })));

    const selected = selectEditorialTop30TelegramOfferIds([...shopee, ...amazon, ...mercadoLivre], now);

    expect(selected).toHaveLength(53);
    expect(selected.filter((id) => id.startsWith("overnight-shopee-")).length).toBe(30);
    expect(selected.filter((id) => id.startsWith("overnight-amazon-")).length).toBe(14);
    expect(selected.filter((id) => id.startsWith("overnight-ml-")).length).toBe(9);
  });

  it("publica somente o cohort editorial corrente e não mistura backlog de 24h", () => {
    const now = new Date("2026-08-09T15:30:00.000Z");
    const cohort = (scenarioId: string, correlationId: string, createdAt: string) => ({
      explainability: { scenarioId, correlation_id: correlationId, discovery_evidence: { discoveredAt: createdAt } },
    });
    const makeCohort = (prefix: string, scenarioId: string, correlationId: string, createdAt: string, shopeeCount: number, amazonCount: number, mlCount: number) => [
      ...Array.from({ length: shopeeCount }, (_, index) => draft(offer(`${prefix}-shopee-${index}`, createdAt, cohort(scenarioId, correlationId, createdAt)))),
      ...Array.from({ length: amazonCount }, (_, index) => draft(offer(`${prefix}-amazon-${index}`, createdAt, { platform: "Amazon", ...cohort(scenarioId, correlationId, createdAt) }))),
      ...Array.from({ length: mlCount }, (_, index) => draft(offer(`${prefix}-ml-${index}`, createdAt, { platform: "Mercado Livre", ...cohort(scenarioId, correlationId, createdAt) }))),
    ];
    const old = makeCohort("moveis", "moveis_editorial", "cycle-a", "2026-08-09T13:00:00.000Z", 8, 2, 1);
    const current = makeCohort("beleza", "beleza_editorial", "cycle-b", "2026-08-09T14:00:00.000Z", 10, 4, 2);
    const newest = makeCohort("pet", "pet_editorial", "cycle-c", "2026-08-09T15:00:00.000Z", 73, 0, 0);

    const currentSelection = selectEditorialTop30TelegramSelection([...old, ...current], now);
    expect(currentSelection.offerIds).toHaveLength(16);
    expect(currentSelection.offerIds.every((id) => id.startsWith("beleza-"))).toBe(true);

    const selection = selectEditorialTop30TelegramSelection([...old, ...current, ...newest], now);
    const selected = selection.offerIds;

    expect(selected).toHaveLength(30);
    expect(selected.every((id) => id.startsWith("pet-shopee-"))).toBe(true);
    expect(selected.some((id) => id.startsWith("moveis-") || id.startsWith("beleza-"))).toBe(false);
    expect(selection.diagnostics).toMatchObject({ selectedCohortCorrelationId: "cycle-c", selectedCohortScenarioId: "pet_editorial", shopeeSelected: 30, staleCohortsIgnored: 2 });
  });

  it("pagina além de 1000 posts stale para alcançar o cohort atual", async () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    const stale = Array.from({ length: 1000 }, (_, index) => draft(offer(`stale-${index}`, "2026-08-08T00:00:00.000Z")));
    const current = Array.from({ length: 10 }, (_, index) => draft(offer(`paged-current-${index}`, "2026-08-09T10:00:00.000Z", {
      explainability: { scenarioId: "beleza_editorial", correlation_id: "paged-current", discovery_evidence: { discoveredAt: "2026-08-09T10:00:00.000Z" } },
    })));
    const rows = [...stale, ...current];
    const client = {
      from() {
        const query: any = {
          from: 0,
          to: 0,
          select() { return query; },
          eq() { return query; },
          order() { return query; },
          range(from: number, to: number) { query.from = from; query.to = to; return query; },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows.slice(query.from, query.to + 1), error: null }).then(resolve); },
        };
        return query;
      },
    };

    const selected = await loadEditorialTop30TelegramOfferIds(client, now);

    expect(selected).toHaveLength(10);
    expect(selected.every((id) => id.startsWith("paged-current-"))).toBe(true);
  });

  it("falha fechado ao exceder o limite técnico de páginas", async () => {
    const client = {
      from() {
        const query: any = {
          select() { return query; }, eq() { return query; }, order() { return query; }, range() { return query; },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [draft(offer("full-page", "2026-08-09T10:00:00.000Z"))], error: null }).then(resolve); },
        };
        return query;
      },
    };
    await expect(loadTelegramEditorialDraftRows(client, { pageSize: 1, maxPages: 2 })).rejects.toThrow("maxPages=2");
  });

  it("deduplicates offers and excludes manual or published drafts from the union", () => {
    const eligible = draft(offer("eligible", "2026-08-08T10:00:01.000Z", { platform: "Amazon" }));
    const duplicate = { ...eligible, id: "post-duplicate" };
    const manual = draft(offer("manual", "2026-08-08T10:00:01.000Z", { platform: "Amazon", explainability: { manual_source: true } }));
    const published = draft(offer("published", "2026-08-08T10:00:01.000Z", { platform: "Mercado Livre" }), { status: "published", external_id: "tg-1" });

    expect(selectEditorialTop30TelegramOfferIds([eligible, duplicate, manual, published], NOW)).toEqual(["eligible"]);
  });
});
