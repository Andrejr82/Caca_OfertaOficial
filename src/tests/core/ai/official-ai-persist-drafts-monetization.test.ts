import { describe, expect, it, vi } from "vitest";
import type { OfficialAICommand, OfficialAIContent, OfficialAIOffer } from "@/core/ai";
import { SupabaseOfficialAIAdapter } from "@/lib/ai/official/supabase-official-ai-adapter";

function createMockChain(result: unknown) {
  const builder: any = {
    select: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(async () => result),
    in: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  for (const method of ["select", "insert", "upsert", "update", "eq", "order"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

const baseCommand: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1",
  commandId: "cmd-123",
  idempotencyKey: "ai:draft:offer-ml-1:v2",
  correlationId: "corr-123",
  causationId: null,
  offerId: "offer-ml-1",
  tenantId: "tenant-1",
  channels: ["telegram"],
  requestedAt: "2026-08-18T14:00:00.000Z",
  actor: { type: "service", id: "oracle-worker", service: "oracle" },
  origin: "service.oracle",
  reason: { code: "ORACLE_AI_DRAFT" },
};

const baseMLOffer: OfficialAIOffer = {
  id: "offer-ml-1",
  tenantId: "tenant-1",
  state: "pending_manual_review",
  version: 1,
  marketplace: "Mercado Livre",
  productName: "Smartphone Galaxy S24",
  originalUrl: "https://www.mercadolivre.com.br/p/MLB321948", // URL comum de produto sem monetização
  imageUrl: "https://http2.mlstatic.com/D_123.jpg",
  currentPrice: 4500,
  originalPrice: 5000,
  category: "Celulares",
  explainability: {},
  createdAt: "2026-08-18T14:00:00.000Z",
};

const baseContent: OfficialAIContent = {
  title: "Galaxy S24",
  description: "Smartphone Samsung Galaxy S24",
  shortCopy: "Samsung Galaxy S24 em oferta!",
  longCopy: "Confira o Samsung Galaxy S24 com desconto exclusivo!",
  hashtags: ["#GalaxyS24", "#Oferta"],
  callToAction: "Compre agora",
  highlights: ["Desconto exclusivo"],
  explanation: "Geração de copy",
  channelCopies: {
    telegram: "Galaxy S24 em promoção!",
    whatsapp: "Galaxy S24 em promoção!",
    facebook: "Galaxy S24 em promoção!",
    instagram: "Galaxy S24 em promoção!",
  },
};

describe("SupabaseOfficialAIAdapter.persistDrafts — Monetização Mercado Livre & Multi-marketplace", () => {
  it("cenário 1: Mercado Livre + URL externa ou inválida => falha com ML_AFFILIATE_DESTINATION_NOT_CONFIRMED antes de qualquer gravação", async () => {
    const invalidMLOffer = { ...baseMLOffer, originalUrl: "https://example.com/invalid-product" };
    const client = { from: vi.fn() };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(
      adapter.persistDrafts({
        command: baseCommand,
        offer: invalidMLOffer,
        content: baseContent,
        channels: ["telegram"],
      })
    ).rejects.toThrow(/ML_AFFILIATE_DESTINATION_NOT_CONFIRMED/);

    // Garante que NENHUMA tabela do banco de dados foi chamada (nem affiliate_links nem posts)
    expect(client.from).not.toHaveBeenCalled();
  });

  it("cenário 2: Mercado Livre + originalUrl meli.la oficial => persiste original_url com meli.la", async () => {
    const meliUrl = "https://meli.la/12hoKT9";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      originalUrl: meliUrl,
    };

    const link = createMockChain({ data: { id: "link-ml-1" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-ml-1", affiliate_link_id: "link-ml-1", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "tenant-1",
        offer_id: "offer-ml-1",
        channel: "telegram",
        original_url: meliUrl, // URL meli.la oficial preservada
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 3: Mercado Livre + URL oficial completa (matt_tool + ua) => preserva URL completa", async () => {
    const fullOfficialUrl = "https://www.mercadolivre.com.br/produto/p/MLBU1993483730?matt_tool=38524122&ua=IDMyaTIBHsT9wgf8c7gIgU_uOp6LXQ7a2IrbCILWcmr1jPs#origin=share";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      originalUrl: fullOfficialUrl,
    };

    const link = createMockChain({ data: { id: "link-ml-2" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-ml-2", affiliate_link_id: "link-ml-2", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: fullOfficialUrl,
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 4: Mercado Livre + partner_id => persiste com partner_id preservado", async () => {
    const partnerUrl = "https://www.mercadolivre.com.br/p/MLB321948?partner_id=CACAOFERTA123";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      originalUrl: partnerUrl,
    };

    const link = createMockChain({ data: { id: "link-ml-partner" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-ml-partner", affiliate_link_id: "link-ml-partner", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: partnerUrl,
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 5: Mercado Livre + affiliate link existente válido => reutiliza link e trackedUrl existentes", async () => {
    const existingMeliUrl = "https://meli.la/ExistingValidMeli";
    const existingTrackedUrl = "https://cacaoferta.com.br/go/tg_offer-ml-1";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      affiliateLinks: [
        {
          channel: "telegram",
          trackedUrl: existingTrackedUrl,
          subId: "tg_offer-ml-1",
          originalUrl: existingMeliUrl,
        },
      ],
    };

    const link = createMockChain({ data: { id: "link-existing-1" }, error: null });
    const existingPost = createMockChain({
      data: { id: "post-existing-1", affiliate_link_id: "link-existing-1", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(existingPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: existingMeliUrl,
        tracked_url: existingTrackedUrl,
        sub_id: "tg_offer-ml-1",
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 6: Mercado Livre + explainability.manual_resolution.affiliate_url válido => persiste destino da explainability", async () => {
    const expressAffiliateUrl = "https://meli.la/ExpressGenerated123";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      explainability: {
        manual_resolution: {
          affiliate_url: expressAffiliateUrl,
        },
      },
    };

    const link = createMockChain({ data: { id: "link-express-1" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-express-1", affiliate_link_id: "link-express-1", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: expressAffiliateUrl,
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 7: Shopee => comportamento atual 100% preservado com originalUrl", async () => {
    const shopeeUrl = "https://shopee.com.br/product/123/456";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      marketplace: "Shopee",
      originalUrl: shopeeUrl,
    };

    const link = createMockChain({ data: { id: "link-shopee-1" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-shopee-1", affiliate_link_id: "link-shopee-1", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: shopeeUrl,
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 8: Amazon => comportamento atual 100% preservado com originalUrl", async () => {
    const amazonUrl = "https://www.amazon.com.br/dp/B08N5WRWNW";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      marketplace: "Amazon",
      originalUrl: amazonUrl,
    };

    const link = createMockChain({ data: { id: "link-amazon-1" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-amazon-1", affiliate_link_id: "link-amazon-1", channel: "whatsapp", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: { ...baseCommand, channels: ["whatsapp"] },
      offer,
      content: baseContent,
      channels: ["whatsapp"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: amazonUrl,
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 9: Shein => comportamento atual 100% preservado com originalUrl", async () => {
    const sheinUrl = "https://br.shein.com/goods-p-9999.html";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      marketplace: "Shein",
      originalUrl: sheinUrl,
    };

    const link = createMockChain({ data: { id: "link-shein-1" }, error: null });
    const noPost = createMockChain({ data: null, error: null });
    const insertedPost = createMockChain({
      data: { id: "post-shein-1", affiliate_link_id: "link-shein-1", channel: "facebook", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: { ...baseCommand, channels: ["facebook"] },
      offer,
      content: baseContent,
      channels: ["facebook"],
    });

    expect(result).toHaveLength(1);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        original_url: sheinUrl,
      }),
      { onConflict: "offer_id,channel" }
    );
  });

  it("cenário 10: Idempotência => segunda execução não cria post duplicado", async () => {
    const meliUrl = "https://meli.la/12hoKT9";
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      originalUrl: meliUrl,
    };

    const link = createMockChain({ data: { id: "link-ml-1" }, error: null });
    const existingDraft = createMockChain({
      data: { id: "post-existing-draft-1", affiliate_link_id: "link-ml-1", channel: "telegram", status: "draft" },
      error: null,
    });

    const client = {
      from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(existingDraft),
    };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({
      command: baseCommand,
      offer,
      content: baseContent,
      channels: ["telegram"],
    });

    expect(result).toEqual([
      {
        postId: "post-existing-draft-1",
        affiliateLinkId: "link-ml-1",
        channel: "telegram",
        state: "draft",
      },
    ]);
    expect(existingDraft.insert).not.toHaveBeenCalled();
  });

  it("cenário 11: Multi-canal com falha em um canal => nenhum post parcial é criado para nenhum canal", async () => {
    const offer: OfficialAIOffer = {
      ...baseMLOffer,
      originalUrl: "https://example.com/invalid-not-ml",
    };

    const client = { from: vi.fn() };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(
      adapter.persistDrafts({
        command: { ...baseCommand, channels: ["telegram", "whatsapp", "facebook", "instagram"] },
        offer,
        content: baseContent,
        channels: ["telegram", "whatsapp", "facebook", "instagram"],
      })
    ).rejects.toThrow(/ML_AFFILIATE_DESTINATION_NOT_CONFIRMED/);

    expect(client.from).not.toHaveBeenCalled();
  });
});
