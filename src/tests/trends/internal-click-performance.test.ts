import { describe, expect, it } from "vitest";
import { buildInternalClickSignals } from "@/core/trends/internal-click-performance";

const offers = [
  { id: "offer-1", platform: "Shopee", productName: "Fone Bluetooth M90 Pro", category: "Áudio e Acessórios" },
  { id: "offer-2", platform: "Mercado Livre", productName: "Galaxy S26 FE", category: "Eletrônicos" },
];

const links = [
  { id: "link-1", offerId: "offer-1", channel: "WhatsApp" },
  { id: "link-2", offerId: "offer-1", channel: "telegram" },
  { id: "link-3", offerId: "offer-2", channel: "instagram" },
];

const posts = [
  { id: "post-1", affiliateLinkId: "link-1", channel: "whatsapp", status: "published", deletedAt: null },
  { id: "post-2", affiliateLinkId: "link-2", channel: "telegram", status: "published", deletedAt: null },
  { id: "post-3", affiliateLinkId: "link-3", channel: "instagram", status: "published", deletedAt: null },
];

describe("internal click performance", () => {
  it("agrega cliques por produto, canal e publicação sem dupla contagem", () => {
    const result = buildInternalClickSignals({
      windowStart: "2026-08-04T00:00:00.000Z",
      windowEnd: "2026-08-11T00:00:00.000Z",
      offers,
      affiliateLinks: links,
      posts,
      clickEvents: [
        { id: "click-1", affiliateLinkId: "link-1", createdAt: "2026-08-10T10:00:00.000Z" },
        { id: "click-2", affiliateLinkId: "link-1", createdAt: "2026-08-10T10:01:00.000Z" },
        { id: "click-3", affiliateLinkId: "link-2", createdAt: "2026-08-10T10:02:00.000Z" },
        { id: "click-3", affiliateLinkId: "link-2", createdAt: "2026-08-10T10:02:00.000Z" },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      offerId: "offer-1",
      normalizedProductTerm: "fone bluetooth m90 pro",
      normalizedCategory: "audio e acessorios",
      totalClicks: 3,
      distinctEventCount: 3,
      duplicateEventCount: 1,
      clicksByChannel: { whatsapp: 2, telegram: 1 },
      unattributedPublicationClicks: 0,
    });
    expect(result[0].clicksByPublication).toEqual([
      { postId: "post-1", channel: "whatsapp", clicks: 2 },
      { postId: "post-2", channel: "telegram", clicks: 1 },
    ]);
  });

  it("não duplica clique quando o mesmo link aparece em mais de uma publicação", () => {
    const result = buildInternalClickSignals({
      windowStart: "2026-08-04T00:00:00.000Z",
      windowEnd: "2026-08-11T00:00:00.000Z",
      offers,
      affiliateLinks: links,
      posts: [
        ...posts,
        { id: "post-1b", affiliateLinkId: "link-1", channel: "whatsapp", status: "published", deletedAt: null },
      ],
      clickEvents: [
        { id: "click-1", affiliateLinkId: "link-1", createdAt: "2026-08-10T10:00:00.000Z" },
      ],
    });

    expect(result[0].totalClicks).toBe(1);
    expect(result[0].clicksByPublication).toEqual([]);
    expect(result[0].unattributedPublicationClicks).toBe(1);
  });

  it("ignora eventos fora da janela ou sem link/oferta conhecidos", () => {
    const result = buildInternalClickSignals({
      windowStart: "2026-08-04T00:00:00.000Z",
      windowEnd: "2026-08-11T00:00:00.000Z",
      offers,
      affiliateLinks: links,
      posts,
      clickEvents: [
        { id: "old", affiliateLinkId: "link-1", createdAt: "2026-08-01T10:00:00.000Z" },
        { id: "unknown", affiliateLinkId: "missing", createdAt: "2026-08-10T10:00:00.000Z" },
      ],
    });

    expect(result).toEqual([]);
  });
});
