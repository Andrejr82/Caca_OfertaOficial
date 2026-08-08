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
      status: "pending_manual_review",
      created_at: "2026-08-08T12:00:00.000Z",
      ...overrides,
    },
  };
}

describe("panel draft selection", () => {
  it("exibe 30 editoriais selecionados mais 1 manual express fora do Top30", () => {
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

    expect(visible).toHaveLength(31);
    expect(visible.filter((item) => editorialTop30.has(item.offer_id))).toHaveLength(30);
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
});
