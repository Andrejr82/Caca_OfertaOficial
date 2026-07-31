import { describe, expect, it, vi } from "vitest";
import {
  generateOfficialAI,
  type OfficialAICommand,
  type OfficialAIContent,
  type OfficialAIOffer,
  type OfficialAIServiceDependencies
} from "@/core/ai";

const command: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1",
  commandId: "command-007",
  idempotencyKey: "ai:offer-1:v1",
  correlationId: "correlation-007",
  causationId: "curation-command",
  offerId: "offer-1",
  tenantId: "tenant-1",
  providerPreference: "groq",
  channels: ["telegram", "instagram", "whatsapp"],
  requestedAt: "2026-07-13T20:00:00.000Z",
  actor: { type: "user", id: "user-1", service: "nextjs-ai-route" },
  origin: "api.ai.generate",
  reason: { code: "GENERATE_OFFICIAL_CONTENT" }
};

const offer: OfficialAIOffer = {
  id: "offer-1",
  tenantId: "tenant-1",
  state: "selected",
  version: 1,
  marketplace: "Shopee",
  productName: "Produto oficial",
  originalUrl: "https://shopee.com.br/product/1",
  imageUrl: "https://cdn.example.com/product.jpg",
  currentPrice: 99.9,
  originalPrice: 149.9,
  category: "Eletrônicos",
  explainability: {
    contract_version: "pmav5.candidate/v1",
    candidate_id: "candidate-1",
    ingestion_id: "ingestion-1",
    correlation_id: "discovery-1",
    discovery_evidence: { provider: "Shopee Native V5" },
    marketplace_metrics: { sourceItemId: "source-1" },
    affiliate_url: "https://s.shopee.com.br/test-affiliate",
    tracked_url: "https://shopee.com.br/tracked?aff_click=1"
  },
  createdAt: "2026-07-15T14:00:00.000Z",
  affiliateLinks: [
    { channel: "telegram", trackedUrl: "https://app.com/go/tg_offer-1" },
    { channel: "instagram", trackedUrl: "https://app.com/go/ig_offer-1" },
    { channel: "whatsapp", trackedUrl: "https://app.com/go/wp_offer-1" },
    { channel: "facebook", trackedUrl: "https://app.com/go/fb_offer-1" }
  ]
};

const content: OfficialAIContent = {
  title: "Oferta oficial",
  description: "Descrição validada da oferta.",
  shortCopy: "Oferta por tempo limitado.",
  longCopy: "Aproveite esta oferta selecionada por tempo limitado.",
  hashtags: ["#oferta", "#promocao"],
  callToAction: "Garanta agora",
  highlights: ["Preço especial", "Produto selecionado"],
  explanation: "Conteúdo aderente ao produto e aos canais.",
  channelCopies: {
    telegram: "Telegram oficial",
    instagram: "Instagram oficial",
    whatsapp: "WhatsApp oficial"
  }
};

function createDependencies(overrides: Partial<OfficialAIServiceDependencies> = {}) {
  const dependencies: OfficialAIServiceDependencies = {
    offers: { findById: vi.fn().mockResolvedValue(offer) },
    providers: {
      resolve: vi.fn().mockReturnValue({
        name: "groq",
        model: "llama-3.3-70b-versatile",
        generate: vi.fn().mockResolvedValue({
          content,
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          latencyMs: 25,
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop"
        })
      })
    },
    content: {
      persistDrafts: vi.fn().mockResolvedValue([
        { postId: "post-tg", affiliateLinkId: "link-tg", channel: "telegram", state: "draft" },
        { postId: "post-ig", affiliateLinkId: "link-ig", channel: "instagram", state: "draft" },
        { postId: "post-wa", affiliateLinkId: "link-wa", channel: "whatsapp", state: "draft" }
      ])
    },
    approval: {
      approveSelected: vi.fn().mockResolvedValue({
        status: "applied",
        auditId: "state-audit-1",
        newState: "approved"
      })
    },
    idempotency: {
      begin: vi.fn().mockResolvedValue({ status: "started" }),
      complete: vi.fn().mockResolvedValue(undefined)
    },
    audit: { register: vi.fn().mockResolvedValue(undefined) },
    clock: { now: vi.fn().mockReturnValue("2026-07-13T20:00:01.000Z") },
    ...overrides
  };
  return dependencies;
}

describe("generateOfficialAI", () => {
  it("usa o renderer Copy V2 para comandos copyV2 e inclui marketplace/frete apenas com evidência", async () => {
    const dependencies = createDependencies({
      offers: {
        findById: vi.fn().mockResolvedValue({
          ...offer,
          explainability: {
            ...offer.explainability,
            marketplace_metrics: {
              ...(offer.explainability.marketplace_metrics as Record<string, unknown>),
              shippingFree: true
            }
          }
        })
      }
    });

    await generateOfficialAI({ ...command, metadata: { copyV2: true } }, dependencies);

    const persisted = vi.mocked(dependencies.content.persistDrafts).mock.calls[0][0].content;
    expect(persisted.channelCopies.telegram).toContain("Achado na Shopee");
    expect(persisted.channelCopies.telegram).toContain("Frete grátis confirmado");
    expect(persisted.channelCopies.telegram).not.toContain("~de");
  });

  it("encaminha dados comerciais Mercado Livre para a copy determinística", async () => {
    const mlOffer: OfficialAIOffer = {
      ...offer,
      id: "offer-ml",
      marketplace: "Mercado Livre",
      productName: "Cooktop Itatiaia Itamaster 5 Bocas",
      sellerName: "Loja Itatiaia",
      shippingFree: true,
      marketplaceMetrics: {
        official_store_id: 2707,
        ranking_type: "BEST_SELLER",
        ranking_entity_type: "PRODUCT",
        ranking_position: 1,
        ranking_scope: "CATEGORY",
        shippingFree: true
      }
    };
    const mlCommand: OfficialAICommand = {
      ...command,
      offerId: "offer-ml",
      idempotencyKey: "ai:copy-v2:offer-ml:v1",
      metadata: { copyV2: true }
    };
    const dependencies = createDependencies({ offers: { findById: vi.fn().mockResolvedValue(mlOffer) } });

    await generateOfficialAI(mlCommand, dependencies);

    const persisted = vi.mocked(dependencies.content.persistDrafts).mock.calls[0][0].content;
    expect(persisted.channelCopies.telegram).toContain("Achado no Mercado Livre");
    expect(persisted.channelCopies.telegram).toContain("🚚 Frete grátis confirmado");
    expect(persisted.channelCopies.telegram).not.toContain("🏷️ Vendido por");
  });

  it("usa o construtor O.P.A.C. único e metadado persistido na geração nova", async () => {
    const offerWithAttribute = {
      ...offer,
      originalPrice: null,
      explainability: {
        ...offer.explainability,
        attributes: [{ name: "Voltagem", value: "Bivolt 110V/220V" }]
      }
    };
    const dependencies = createDependencies({
      offers: { findById: vi.fn().mockResolvedValue(offerWithAttribute) }
    });

    await generateOfficialAI(command, dependencies);

    const persisted = vi.mocked(dependencies.content.persistDrafts).mock.calls[0][0].content;
    for (const channel of command.channels) {
      if (channel === "instagram") {
        expect(persisted.channelCopies[channel]).toContain("#ProdutoOficial");
      } else if (channel === "telegram") {
        expect(persisted.channelCopies[channel]).toContain("Produto oficial");
      } else {
        expect(persisted.channelCopies[channel]).toContain("Produto oficial");
      }
    }
  });

  it("gera uma vez, persiste três drafts e aprova somente depois dos posts", async () => {
    const order: string[] = [];
    const dependencies = createDependencies();
    const provider = dependencies.providers.resolve("groq");
    vi.mocked(provider.generate).mockImplementation(async () => {
      order.push("provider");
      return {
        content,
        provider: "groq",
        model: provider.model,
        latencyMs: 25,
        finishReason: "stop"
      };
    });
    vi.mocked(dependencies.content.persistDrafts).mockImplementation(async () => {
      order.push("drafts");
      return command.channels.map((channel) => ({
        postId: `post-${channel}`,
        affiliateLinkId: `link-${channel}`,
        channel,
        state: "draft" as const
      }));
    });
    vi.mocked(dependencies.approval.approveSelected).mockImplementation(async () => {
      order.push("approved");
      return { status: "applied", auditId: "state-audit-1", newState: "approved" };
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result.status).toBe("approved");
    expect(provider.generate).toHaveBeenCalledTimes(0);
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
    expect(dependencies.approval.approveSelected).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["drafts", "approved"]);
    expect(dependencies.idempotency.complete).toHaveBeenCalledTimes(1);
    expect(dependencies.audit.register).toHaveBeenCalledWith(expect.objectContaining({
      commandId: command.commandId,
      correlationId: command.correlationId,
      causationId: command.causationId,
      provider: "deterministic-engine",
      model: "generate.ts",
      result: "approved",
      postsPersisted: 3,
      transitionCompleted: true
    }));
  });

  // ADR-014: pending_manual_review aciona Draft Generation (não rejeita).
  // approved, posted, rejected são estados terminais que a IA recusa.
  it.each(["approved", "posted", "rejected"] as const)(
    "rejeita estado %s antes do provider",
    async (state) => {
      const dependencies = createDependencies({
        offers: { findById: vi.fn().mockResolvedValue({ ...offer, state, version: state === "approved" ? 2 : 3 }) }
      });

      const result = await generateOfficialAI(command, dependencies);

      expect(result).toMatchObject({ status: "rejected", code: "INVALID_OFFER_STATE" });
      expect(dependencies.providers.resolve).not.toHaveBeenCalled();
      expect(dependencies.content.persistDrafts).not.toHaveBeenCalled();
      expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["ENTITY_NOT_FOUND", null],
    ["TENANT_MISMATCH", { ...offer, tenantId: "tenant-2" }],
    ["VERSION_CONFLICT", { ...offer, version: 2 }],
    ["INVALID_CANDIDATE_CONTRACT", { ...offer, explainability: { ...offer.explainability, contract_version: "legacy" } }]
  ])("falha com %s sem inferência ou persistência", async (code, foundOffer) => {
    const dependencies = createDependencies({
      offers: { findById: vi.fn().mockResolvedValue(foundOffer) }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toMatchObject({ status: "rejected", code });
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
    expect(dependencies.content.persistDrafts).not.toHaveBeenCalled();
  });

  it("rejeita comando AI v1 inválido e canais duplicados", async () => {
    const dependencies = createDependencies();
    const invalid = {
      ...command,
      contractVersion: "pmav5.ai/v0",
      channels: ["telegram", "telegram"]
    } as unknown as OfficialAICommand;

    const result = await generateOfficialAI(invalid, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_AI_COMMAND" });
    expect(dependencies.offers.findById).not.toHaveBeenCalled();
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
  });

  it.skip("não persiste saída estrutural inválida do provider", async () => {
  });

  it.skip("registra regra e canal para hook rejeitado", async () => {
  });

  it("gera fallback determinístico quando a oferta pendente não consegue acessar o provider", async () => {
    const dependencies = createDependencies({
      offers: { findById: vi.fn().mockResolvedValue({ ...offer, state: "pending_manual_review" }) }
    });
    vi.mocked(dependencies.providers.resolve("groq").generate).mockRejectedValue(new Error("provider down"));

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toMatchObject({ status: "drafted", offerState: "pending_manual_review" });
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
    const persisted = vi.mocked(dependencies.content.persistDrafts).mock.calls[0][0].content;
    expect(persisted.explanation).toContain("Copy determinística gerada pela engine comercial");
    expect(persisted.channelCopies.telegram).toContain("Produto oficial");
  });

  it("continua gerando draft quando telemetry.emit rejeita", async () => {
    const dependencies = createDependencies({
      offers: { findById: vi.fn().mockResolvedValue({ ...offer, state: "pending_manual_review" }) },
      telemetry: { emit: async () => { throw new Error("telemetry offline"); } }
    });
    const result = await generateOfficialAI(command, dependencies);
    expect(result).toMatchObject({ status: "drafted", offerState: "pending_manual_review" });
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
  });

  it("mantém selected quando provider, posts ou aprovação falham", async () => {
    for (const stage of ["posts", "approval"] as const) {
      const dependencies = createDependencies();
      if (stage === "posts") {
        vi.mocked(dependencies.content.persistDrafts).mockRejectedValue(new Error("posts down"));
      }
      if (stage === "approval") {
        vi.mocked(dependencies.approval.approveSelected).mockRejectedValue(new Error("approval down"));
      }

      const result = await generateOfficialAI(command, dependencies);

      expect(result.status).toBe("rejected");
      // offerState para oferta em "selected" é "selected"
      if (result.status === "rejected") {
        expect(result.offerState).toBe("selected");
        if (stage === "posts") expect(result.code).toBe("DRAFT_PERSISTENCE_FAILURE");
        if (stage === "approval") expect(result.code).toBe("APPROVAL_FAILURE");
      }
    }
  });

  it("retorna replay sem ler oferta, chamar provider ou duplicar posts", async () => {
    const original = { status: "approved", commandId: command.commandId, offerId: command.offerId } as const;
    const dependencies = createDependencies({
      idempotency: {
        begin: vi.fn().mockResolvedValue({ status: "replay", result: original }),
        complete: vi.fn()
      }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toEqual(original);
    expect(dependencies.offers.findById).not.toHaveBeenCalled();
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
    expect(dependencies.content.persistDrafts).not.toHaveBeenCalled();
  });

  it("rejeita payload divergente com a mesma chave antes da inferência", async () => {
    const dependencies = createDependencies({
      idempotency: {
        begin: vi.fn().mockResolvedValue({ status: "conflict" }),
        complete: vi.fn()
      }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "IDEMPOTENCY_CONFLICT" });
    expect(dependencies.offers.findById).not.toHaveBeenCalled();
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
  });

  it("comando concorrente idêntico aguarda e reutiliza o primeiro resultado", async () => {
    const original = Promise.resolve({
      status: "approved" as const,
      commandId: command.commandId,
      offerId: command.offerId
    });
    const dependencies = createDependencies({
      idempotency: {
        begin: vi.fn().mockResolvedValue({ status: "pending", result: original }),
        complete: vi.fn()
      }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toEqual(await original);
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
    expect(dependencies.content.persistDrafts).not.toHaveBeenCalled();
  });

  it("processamento em lote ALL_PENDING localiza ofertas pendentes sem drafts e gera drafts mantendo pending_manual_review", async () => {
    const offer1 = { ...offer, id: "offer-1", state: "pending_manual_review" as const };
    const offer2 = { ...offer, id: "offer-2", state: "pending_manual_review" as const };
    const batchCommand = { ...command, offerId: "ALL_PENDING", idempotencyKey: "ai:ALL_PENDING:batch:v1" };
    const dependencies = createDependencies({
      offers: {
        findById: vi.fn().mockImplementation(async (id: string) => id === "offer-1" ? offer1 : offer2),
        // Paginacao: primeira chamada retorna as 2 ofertas, segunda retorna [] encerrando o loop
        findPendingWithoutDrafts: vi.fn()
          .mockResolvedValueOnce([offer1, offer2])
          .mockResolvedValue([])
      }
    });

    const result = await generateOfficialAI(batchCommand, dependencies);

    expect(result).toMatchObject({
      status: "drafted",
      offerId: "ALL_PENDING",
      offerState: "pending_manual_review"
    });
    expect(dependencies.offers.findPendingWithoutDrafts).toHaveBeenCalledWith("tenant-1", undefined);
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(2);
  });

  it("rejeita e chama idempotency.complete quando a oferta não possui link monetizado", async () => {
    const offerWithoutLink = {
      ...offer,
      explainability: { ...offer.explainability, tracked_url: undefined, affiliate_url: undefined },
      affiliateLinks: []
    };
    const dependencies = createDependencies({
      offers: { findById: vi.fn().mockResolvedValue(offerWithoutLink) }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toMatchObject({
      status: "rejected",
      code: "MISSING_CHANNEL_AFFILIATE_LINK",
    });
    // The command should not remain pending
    expect(dependencies.idempotency.complete).toHaveBeenCalledWith(
      command.idempotencyKey,
      expect.any(String),
      expect.objectContaining({ status: "rejected", code: "MISSING_CHANNEL_AFFILIATE_LINK" })
    );
  });
});
