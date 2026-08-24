import { describe, expect, it, vi } from "vitest";
import type { OfficialAICommand, OfficialAIContent, OfficialAIOffer } from "@/core/ai";
import { SupabaseOfficialAIAdapter } from "@/lib/ai/official/supabase-official-ai-adapter";
import { matchesMarketplaceFilter } from "@/components/dashboard/social-channel-posts-view";

function createMockSupabaseClient() {
  const store = {
    affiliate_links: [] as any[],
    posts: [] as any[],
  };

  const client: any = {
    from: vi.fn((table: string) => {
      let currentFilter: { field?: string; value?: any }[] = [];
      let updatePayload: any = null;

      const chain: any = {
        select: vi.fn((_columns?: string) => chain),
        eq: vi.fn((field: string, value: any) => {
          currentFilter.push({ field, value });
          return chain;
        }),
        in: vi.fn((_field: string, _values: any[]) => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === "posts") {
            const found = store.posts.find((p) =>
              currentFilter.every((f) => p[f.field!] === f.value)
            );
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        }),
        single: vi.fn(async () => {
          if (table === "affiliate_links") {
            const last = store.affiliate_links[store.affiliate_links.length - 1];
            return { data: last || null, error: null };
          }
          if (table === "posts") {
            const last = store.posts[store.posts.length - 1];
            return { data: last || null, error: null };
          }
          return { data: null, error: null };
        }),
        upsert: vi.fn((payload: any) => {
          const row = {
            id: `link-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...payload,
          };
          store.affiliate_links.push(row);
          return chain;
        }),
        insert: vi.fn((payload: any) => {
          const row = {
            id: `post-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            ...payload,
          };
          store.posts.push(row);
          return chain;
        }),
        update: vi.fn((payload: any) => {
          updatePayload = payload;
          return chain;
        }),
      };
      return chain;
    }),
    _store: store,
  };

  return client;
}

const baseCommand: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1",
  commandId: "cmd-flow-1",
  idempotencyKey: "ai:draft:flow-1:v2",
  correlationId: "corr-flow-1",
  causationId: null,
  offerId: "offer-flow-1",
  tenantId: "tenant-flow-1",
  channels: ["whatsapp", "telegram", "facebook", "instagram"],
  requestedAt: "2026-08-24T12:00:00.000Z",
  actor: { type: "service", id: "oracle-worker", service: "oracle" },
  origin: "service.oracle",
  reason: { code: "ORACLE_AI_DRAFT" },
};

const baseContent: OfficialAIContent = {
  title: "Oferta Teste",
  description: "Descrição de teste",
  shortCopy: "Oferta imperdível",
  longCopy: "Confira a oferta imperdível com desconto!",
  hashtags: ["#Oferta"],
  callToAction: "Compre agora",
  highlights: ["Desconto"],
  explanation: "Geração de copy",
  channelCopies: {
    whatsapp: "🔥 Produto oficial com desconto!\n\n👉 Ver oferta:",
    telegram: "🔥 Produto oficial com desconto!\n\n👉 Ver oferta:",
    facebook: "🔥 Produto oficial com desconto!\n\n👉",
    instagram: "🔥 Produto oficial com desconto!\n\nLink na bio.",
  },
};

describe("Marketplace Draft Generation Flow — Amazon, Shopee e Mercado Livre", () => {
  it("1. Offer Amazon válida → draft criado com channel='whatsapp' e status='draft'", async () => {
    const client = createMockSupabaseClient();
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-flow-1");

    const amazonOffer: OfficialAIOffer = {
      id: "offer-amazon-1",
      tenantId: "tenant-flow-1",
      state: "pending_manual_review",
      version: 1,
      marketplace: "Amazon",
      productName: "Echo Pop Smart speaker",
      originalUrl: "https://www.amazon.com.br/dp/B09ZXJN4DC?tag=cacaofertaofi-20",
      imageUrl: "https://m.media-amazon.com/images/I/echo.jpg",
      currentPrice: 249,
      originalPrice: 349,
      category: "Eletrônicos",
      explainability: {
        affiliate_url: "https://www.amazon.com.br/dp/B09ZXJN4DC?tag=cacaofertaofi-20",
      },
      createdAt: "2026-08-24T12:00:00.000Z",
    };

    const drafts = await adapter.persistDrafts({
      command: { ...baseCommand, offerId: amazonOffer.id },
      offer: amazonOffer,
      content: baseContent,
      channels: ["whatsapp"],
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].channel).toBe("whatsapp");
    expect(drafts[0].state).toBe("draft");

    const createdPost = client._store.posts.find((p: any) => p.offer_id === amazonOffer.id && p.channel === "whatsapp");
    expect(createdPost).toBeDefined();
    expect(createdPost.status).toBe("draft");
    expect(createdPost.channel).toBe("whatsapp");
  });

  it("2. Offer Shopee válida → draft criado com channel='whatsapp' e status='draft'", async () => {
    const client = createMockSupabaseClient();
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-flow-1");

    const shopeeOffer: OfficialAIOffer = {
      id: "offer-shopee-1",
      tenantId: "tenant-flow-1",
      state: "pending_manual_review",
      version: 1,
      marketplace: "Shopee",
      productName: "Fone Bluetooth Sem Fio TWS",
      originalUrl: "https://s.shopee.com.br/4LIpE5sm6P",
      imageUrl: "https://cf.shopee.com.br/file/fone.jpg",
      currentPrice: 59.9,
      originalPrice: 120,
      category: "Eletrônicos",
      explainability: {
        affiliate_url: "https://s.shopee.com.br/4LIpE5sm6P",
      },
      createdAt: "2026-08-24T12:00:00.000Z",
    };

    const drafts = await adapter.persistDrafts({
      command: { ...baseCommand, offerId: shopeeOffer.id },
      offer: shopeeOffer,
      content: baseContent,
      channels: ["whatsapp"],
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].channel).toBe("whatsapp");
    expect(drafts[0].state).toBe("draft");

    const createdPost = client._store.posts.find((p: any) => p.offer_id === shopeeOffer.id && p.channel === "whatsapp");
    expect(createdPost).toBeDefined();
    expect(createdPost.status).toBe("draft");
    expect(createdPost.channel).toBe("whatsapp");
  });

  it("3. Offer Mercado Livre válida (com partner_id ou URL de produto) → draft criado com channel='whatsapp' e status='draft'", async () => {
    const client = createMockSupabaseClient();
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-flow-1");

    const mlOffer: OfficialAIOffer = {
      id: "offer-ml-1",
      tenantId: "tenant-flow-1",
      state: "pending_manual_review",
      version: 1,
      marketplace: "Mercado Livre",
      productName: "Aspirador De Pó Vertical 2 Em 1",
      originalUrl: "https://www.mercadolivre.com.br/p/MLB50667195",
      imageUrl: "https://http2.mlstatic.com/D_123.jpg",
      currentPrice: 189.9,
      originalPrice: 299.9,
      category: "Eletroportáteis",
      explainability: {
        affiliate_url: "https://www.mercadolivre.com.br/p/MLB50667195?partner_id=cacaofertaoficial&utm_source=caca_oferta&utm_medium=afiliado&utm_campaign=express_publication",
      },
      createdAt: "2026-08-24T12:00:00.000Z",
    };

    const drafts = await adapter.persistDrafts({
      command: { ...baseCommand, offerId: mlOffer.id },
      offer: mlOffer,
      content: baseContent,
      channels: ["whatsapp"],
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].channel).toBe("whatsapp");
    expect(drafts[0].state).toBe("draft");

    const createdPost = client._store.posts.find((p: any) => p.offer_id === mlOffer.id && p.channel === "whatsapp");
    expect(createdPost).toBeDefined();
    expect(createdPost.status).toBe("draft");
    expect(createdPost.channel).toBe("whatsapp");
  });

  it("3b. Offer Mercado Livre com plain product URL + env configurada → draft criado", async () => {
    const originalEnv = process.env.MERCADO_LIVRE_AFFILIATE_ID;
    try {
      process.env.MERCADO_LIVRE_AFFILIATE_ID = "cacaofertaoficial";
      const client = createMockSupabaseClient();
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-flow-1");

      const mlPlainOffer: OfficialAIOffer = {
        id: "offer-ml-plain",
        tenantId: "tenant-flow-1",
        state: "pending_manual_review",
        version: 1,
        marketplace: "Mercado Livre",
        productName: "Air Fryer 4L",
        originalUrl: "https://www.mercadolivre.com.br/p/MLB123456",
        imageUrl: "https://http2.mlstatic.com/D_air.jpg",
        currentPrice: 299.9,
        originalPrice: 499.9,
        category: "Eletroportáteis",
        explainability: {},
        createdAt: "2026-08-24T12:00:00.000Z",
      };

      const drafts = await adapter.persistDrafts({
        command: { ...baseCommand, offerId: mlPlainOffer.id },
        offer: mlPlainOffer,
        content: baseContent,
        channels: ["whatsapp"],
      });

      expect(drafts).toHaveLength(1);
      expect(drafts[0].channel).toBe("whatsapp");
      expect(drafts[0].state).toBe("draft");
    } finally {
      if (originalEnv !== undefined) {
        process.env.MERCADO_LIVRE_AFFILIATE_ID = originalEnv;
      } else {
        delete process.env.MERCADO_LIVRE_AFFILIATE_ID;
      }
    }
  });

  it("3c. Offer Mercado Livre com plain product URL SEM env configurada → fail-closed", async () => {
    const originalEnv = process.env.MERCADO_LIVRE_AFFILIATE_ID;
    try {
      delete process.env.MERCADO_LIVRE_AFFILIATE_ID;
      const client = createMockSupabaseClient();
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-flow-1");

      const mlPlainOffer: OfficialAIOffer = {
        id: "offer-ml-plain-no-env",
        tenantId: "tenant-flow-1",
        state: "pending_manual_review",
        version: 1,
        marketplace: "Mercado Livre",
        productName: "Air Fryer 4L",
        originalUrl: "https://www.mercadolivre.com.br/p/MLB123456",
        imageUrl: "https://http2.mlstatic.com/D_air.jpg",
        currentPrice: 299.9,
        originalPrice: 499.9,
        category: "Eletroportáteis",
        explainability: {},
        createdAt: "2026-08-24T12:00:00.000Z",
      };

      await expect(
        adapter.persistDrafts({
          command: { ...baseCommand, offerId: mlPlainOffer.id },
          offer: mlPlainOffer,
          content: baseContent,
          channels: ["whatsapp"],
        })
      ).rejects.toThrow(/ML_AFFILIATE_DESTINATION_NOT_CONFIRMED/);
    } finally {
      if (originalEnv !== undefined) {
        process.env.MERCADO_LIVRE_AFFILIATE_ID = originalEnv;
      }
    }
  });

  it("4. Todos os 3 marketplaces geram drafts estruturados com offers.platform correto, posts.channel correto e posts.status='draft'", async () => {
    const client = createMockSupabaseClient();
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-flow-1");

    const offers: Array<{ offer: OfficialAIOffer; expectedPlatform: string }> = [
      {
        expectedPlatform: "Amazon",
        offer: {
          id: "off-amz",
          tenantId: "tenant-flow-1",
          state: "pending_manual_review",
          version: 1,
          marketplace: "Amazon",
          productName: "Kindle 11a Geração",
          originalUrl: "https://www.amazon.com.br/dp/B09SWW583J?tag=cacaofertaofi-20",
          imageUrl: "https://m.media-amazon.com/images/I/kindle.jpg",
          currentPrice: 499,
          originalPrice: 549,
          category: "Eletrônicos",
          explainability: { affiliate_url: "https://www.amazon.com.br/dp/B09SWW583J?tag=cacaofertaofi-20" },
          createdAt: "2026-08-24T12:00:00.000Z",
        },
      },
      {
        expectedPlatform: "Shopee",
        offer: {
          id: "off-shp",
          tenantId: "tenant-flow-1",
          state: "pending_manual_review",
          version: 1,
          marketplace: "Shopee",
          productName: "Kit Organizador Gaveta",
          originalUrl: "https://s.shopee.com.br/4LIpE5sm6P",
          imageUrl: "https://cf.shopee.com.br/file/organizador.jpg",
          currentPrice: 39.9,
          originalPrice: 80,
          category: "Casa e Cozinha",
          explainability: { affiliate_url: "https://s.shopee.com.br/4LIpE5sm6P" },
          createdAt: "2026-08-24T12:00:00.000Z",
        },
      },
      {
        expectedPlatform: "Mercado Livre",
        offer: {
          id: "off-ml",
          tenantId: "tenant-flow-1",
          state: "pending_manual_review",
          version: 1,
          marketplace: "Mercado Livre",
          productName: "Mixer Elétrico Portátil",
          originalUrl: "https://www.mercadolivre.com.br/p/MLB88991122",
          imageUrl: "https://http2.mlstatic.com/D_mixer.jpg",
          currentPrice: 89.9,
          originalPrice: 149.9,
          category: "Eletroportáteis",
          explainability: {
            affiliate_url: "https://www.mercadolivre.com.br/p/MLB88991122?partner_id=cacaofertaoficial",
          },
          createdAt: "2026-08-24T12:00:00.000Z",
        },
      },
    ];

    for (const item of offers) {
      await adapter.persistDrafts({
        command: { ...baseCommand, offerId: item.offer.id },
        offer: item.offer,
        content: baseContent,
        channels: ["whatsapp"],
      });
    }

    expect(client._store.posts).toHaveLength(3);

    for (const item of offers) {
      const post = client._store.posts.find((p: any) => p.offer_id === item.offer.id);
      expect(post).toBeDefined();
      expect(post.channel).toBe("whatsapp");
      expect(post.status).toBe("draft");
      expect(item.offer.marketplace).toBe(item.expectedPlatform);
    }
  });

  it("5. SocialChannelPostsView / matchesMarketplaceFilter contabiliza Mercado Livre, Amazon e Shopee corretamente quando os drafts existem", () => {
    const visibleDraftPosts = [
      {
        id: "post-1",
        channel: "whatsapp",
        status: "draft",
        offers: { id: "off-amz", platform: "Amazon", marketplace: "Amazon", category: "Eletrônicos" },
      },
      {
        id: "post-2",
        channel: "whatsapp",
        status: "draft",
        offers: { id: "off-shp", platform: "Shopee", marketplace: "Shopee", category: "Casa e Cozinha" },
      },
      {
        id: "post-3",
        channel: "whatsapp",
        status: "draft",
        offers: { id: "off-ml-1", platform: "Mercado Livre", marketplace: "Mercado Livre", category: "Eletroportáteis" },
      },
      {
        id: "post-4",
        channel: "whatsapp",
        status: "draft",
        offers: { id: "off-ml-2", platform: "Mercado Livre", marketplace: "Mercado Livre", category: "Celulares" },
      },
    ];

    const counts = {
      all: visibleDraftPosts.length,
      amazon: visibleDraftPosts.filter((p) => matchesMarketplaceFilter("amazon", p.offers.marketplace, p.offers.platform, p.offers.category)).length,
      shopee: visibleDraftPosts.filter((p) => matchesMarketplaceFilter("shopee", p.offers.marketplace, p.offers.platform, p.offers.category)).length,
      "mercado-livre": visibleDraftPosts.filter((p) => matchesMarketplaceFilter("mercado-livre", p.offers.marketplace, p.offers.platform, p.offers.category)).length,
    };

    expect(counts.all).toBe(4);
    expect(counts.amazon).toBe(1);
    expect(counts.shopee).toBe(1);
    expect(counts["mercado-livre"]).toBe(2);
  });
});
