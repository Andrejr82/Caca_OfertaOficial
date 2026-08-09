import { describe, expect, it } from "vitest";
import { mergePanelDrafts } from "@/lib/offers/panel-draft-selection";

type FixturePost = {
  id: string;
  offer_id: string;
  status: string;
  created_at: string;
  posted_at: string | null;
  external_id: string | null;
  deleted_at?: string | null;
  offers: {
    id: string;
    platform: string;
    status: string;
    created_at: string;
    explainability?: Record<string, unknown>;
  };
};

function post(index: number, overrides: Partial<FixturePost["offers"]> = {}): FixturePost {
  return {
    id: `post-${index}`,
    offer_id: `offer-${index}`,
    status: "draft",
    created_at: "2026-08-08T12:00:00.000Z",
    posted_at: null,
    external_id: null,
    offers: {
      id: `offer-${index}`,
      platform: "Amazon",
      status: "pending_manual_review",
      created_at: "2026-08-08T12:00:00.000Z",
      ...overrides,
    },
  };
}

describe("panel draft selection", () => {
  it("exibe somente os 15 drafts do cohort atual entre 989 drafts do mesmo dia", () => {
    const currentCorrelation = "ac619781-3b00-47a6-8fa1-1290a2732e74";
    const current = [
      ...Array.from({ length: 10 }, (_, index) => post(index, { platform: "Amazon", explainability: { correlation_id: currentCorrelation } })),
      ...Array.from({ length: 3 }, (_, index) => post(100 + index, { platform: "Mercado Livre", explainability: { correlation_id: currentCorrelation } })),
      ...Array.from({ length: 2 }, (_, index) => post(200 + index, { platform: "Shopee", explainability: { correlation_id: currentCorrelation } })),
    ];
    const previous = Array.from({ length: 974 }, (_, index) => post(100 + index, { created_at: "2026-08-08T10:00:01.000Z", explainability: { correlation_id: "previous-cycle" } }));
    const visible = mergePanelDrafts([...current, ...previous], new Set(current.slice(0, 3).map((item) => item.offer_id)), new Date("2026-08-08T03:00:00.000Z"));
    expect([...current, ...previous]).toHaveLength(989);
    expect(visible).toHaveLength(15);
    expect(visible.filter((item) => item.offers.platform === "Amazon")).toHaveLength(10);
    expect(visible.filter((item) => item.offers.platform === "Mercado Livre")).toHaveLength(3);
    expect(visible.filter((item) => item.offers.platform === "Shopee")).toHaveLength(2);
  });

  it("trocar o cohort editorial oculta o anterior sem usar activeOfferIds", () => {
    const first = post(1, { explainability: { correlation_id: "cycle-a" }, created_at: "2026-08-08T10:00:01.000Z" });
    const second = post(2, { explainability: { correlation_id: "cycle-b" }, created_at: "2026-08-08T11:00:01.000Z" });

    expect(mergePanelDrafts([first, second], new Set([first.offer_id]), new Date("2026-08-08T03:00:00.000Z"))).toEqual([second]);
    expect(mergePanelDrafts([first, second], new Set([second.offer_id]), new Date("2026-08-08T03:00:00.000Z"))).toEqual([second]);
  });
  it("exibe todos os editoriais atuais mais 1 manual express fora do Top30 operacional", () => {
    const editorial = Array.from({ length: 582 }, (_, index) => post(index));
    const manual = post(999, {
      created_at: "2026-07-01T12:00:00.000Z",
      explainability: { manual_source: true },
    });
    const editorialTop30 = new Set(editorial.slice(0, 30).map((item) => item.offer_id));

    const visible = mergePanelDrafts(
      [...editorial, manual],
      editorialTop30,
      new Date("2026-08-08T03:00:00.000Z"),
    );

    expect(visible).toHaveLength(583);
    expect(visible.filter((item) => editorialTop30.has(item.offer_id))).toHaveLength(30);
    expect(visible.filter((item) => !editorialTop30.has(item.offer_id))).toHaveLength(553);
    expect(visible.filter((item) => item.offer_id === "offer-999")).toHaveLength(1);
  });

  it("não promove histórico editorial, mas preserva manual sem correlation_id", () => {
    const historical = post(1, { created_at: "2026-07-01T12:00:00.000Z" });
    const manual = post(2, {
      created_at: "2026-07-01T12:00:00.000Z",
      explainability: { manual_source: true },
    });

    const visible = mergePanelDrafts(
      [historical, manual],
      new Set<string>(),
      new Date("2026-08-08T03:00:00.000Z"),
    );

    expect(visible.map((item) => item.offer_id)).toEqual(["offer-2"]);
  });

  it("deduplica a união por offer_id mantendo um post", () => {
    const first = post(1);
    const duplicate = { ...post(1), id: "post-1-duplicate" };

    expect(mergePanelDrafts([first, duplicate], new Set(["offer-1"]), new Date("2026-08-08T03:00:00.000Z"))).toHaveLength(1);
  });

  it("mantém os 15 drafts editoriais válidos quando activeOfferIds contém apenas 3", () => {
    const drafts = [
      ...Array.from({ length: 10 }, (_, index) => post(index, { platform: "Amazon" })),
      ...Array.from({ length: 3 }, (_, index) => post(100 + index, { platform: "Mercado Livre" })),
      ...Array.from({ length: 2 }, (_, index) => post(200 + index, { platform: "Shopee" })),
    ];
    const activeOfferIds = new Set(drafts.slice(0, 3).map((item) => item.offer_id));

    const visible = mergePanelDrafts(drafts, activeOfferIds, new Date("2026-08-08T03:00:00.000Z"));

    expect(visible).toHaveLength(15);
    expect(visible.filter((item) => item.offers.platform === "Amazon")).toHaveLength(10);
    expect(visible.filter((item) => item.offers.platform === "Mercado Livre")).toHaveLength(3);
    expect(visible.filter((item) => item.offers.platform === "Shopee")).toHaveLength(2);
    expect(visible.filter((item) => activeOfferIds.has(item.offer_id))).toHaveLength(3);
  });

  it("não oculta drafts válidos ao trocar activeOfferIds para outro lote", () => {
    const drafts = [post(1), post(2), post(3)];
    const firstBatch = new Set(["offer-1"]);
    const secondBatch = new Set(["offer-3"]);

    expect(mergePanelDrafts(drafts, firstBatch, new Date("2026-08-08T03:00:00.000Z"))).toHaveLength(3);
    expect(mergePanelDrafts(drafts, secondBatch, new Date("2026-08-08T03:00:00.000Z"))).toHaveLength(3);
  });

  it("não recua para cohort antigo quando drafts do cohort atual são removidos", () => {
    const current = Array.from({ length: 15 }, (_, index) => post(index, { explainability: { correlation_id: "current" } }));
    const older = Array.from({ length: 300 }, (_, index) => post(1000 + index, { created_at: "2026-08-08T10:00:00.000Z", explainability: { correlation_id: "older" } }));
    const currentIds = new Set(current.map((item) => item.offer_id));
    const dayStart = new Date("2026-08-08T03:00:00.000Z");

    expect(mergePanelDrafts([...current, ...older], new Set(), dayStart, currentIds)).toHaveLength(15);
    expect(mergePanelDrafts([...current.slice(5), ...older], new Set(), dayStart, currentIds)).toHaveLength(10);
    expect(mergePanelDrafts(older, new Set(), dayStart, currentIds)).toHaveLength(0);
    expect(mergePanelDrafts(older, new Set(), dayStart, currentIds)).toHaveLength(0);
  });

  it("troca apenas quando uma autoridade de cohort mais nova é fornecida", () => {
    const older = post(1, { explainability: { correlation_id: "older" } });
    const newer = post(2, { explainability: { correlation_id: "newer" }, created_at: "2026-08-08T13:00:00.000Z" });
    const dayStart = new Date("2026-08-08T03:00:00.000Z");

    expect(mergePanelDrafts([older, newer], new Set(), dayStart, new Set([older.offer_id]))).toEqual([older]);
    expect(mergePanelDrafts([older, newer], new Set(), dayStart, new Set([newer.offer_id]))).toEqual([newer]);
  });

  it("mantém manual express independente do cohort autoritativo", () => {
    const manual = post(1, { created_at: "2026-07-01T12:00:00.000Z", explainability: { manual_source: true } });
    expect(mergePanelDrafts([manual], new Set(), new Date("2026-08-08T03:00:00.000Z"), new Set())).toEqual([manual]);
  });

  it("mantém protegidos fora do painel mesmo sem activeOfferIds", () => {
    const protectedDrafts = [
      post(1, { status: "posted" }),
      post(2, { status: "approved" }),
      post(3, { status: "rejected" }),
      post(4, { status: "deferred" }),
      { ...post(5), deleted_at: "2026-08-08T13:00:00.000Z" },
    ];

    expect(mergePanelDrafts(protectedDrafts, new Set(), new Date("2026-08-08T03:00:00.000Z"))).toEqual([]);
  });
});
