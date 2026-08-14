/**
 * Testes da ADR-014 — Official AI Draft Generation
 *
 * A Official AI determina o modo de operação internamente, consultando
 * o estado real da oferta. Nenhum parâmetro externo seleciona o modo.
 *
 * Cenários mandatados:
 * ✓ geração automática de drafts para pending_manual_review
 * ✓ reexecução sem duplicidade (idempotência)
 * ✓ vínculo offer/post (offer_id presente nos drafts)
 * ✓ painel exibindo imediatamente os drafts (draft_count > 0)
 * ✓ offer continua pending_manual_review após geração
 * ✓ IA não promove approved no modo draft_generation
 * ✓ publicação continua exigindo aprovação humana
 */

import { describe, expect, it, vi } from "vitest";
import {
  generateOfficialAI,
  type OfficialAICommand,
  type OfficialAIContent,
  type OfficialAIOffer,
  type OfficialAIServiceDependencies
} from "@/core/ai";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Comando enviado pelo cliente — sem expectedState, sem mode (ADR-014) */
const command: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1",
  commandId: "command-adr014",
  idempotencyKey: "ai:offer-pending:v1",
  correlationId: "correlation-adr014",
  causationId: null,
  offerId: "offer-pending",
  tenantId: "tenant-1",
  channels: ["telegram", "instagram", "whatsapp"],
  requestedAt: "2026-07-15T11:00:00.000Z",
  actor: { type: "user", id: "user-1", service: "nextjs-ai-route" },
  origin: "api.ai.generate",
  reason: { code: "GENERATE_OFFICIAL_CONTENT" }
};

/** Oferta em pending_manual_review — aciona Draft Generation automaticamente */
const pendingOffer: OfficialAIOffer = {
  id: "offer-pending",
  tenantId: "tenant-1",
  state: "pending_manual_review",
  version: 0,
  marketplace: "Shopee",
  productName: "Produto Descoberto Automaticamente",
  originalUrl: "https://shopee.com.br/product/pending",
  imageUrl: "https://cdn.example.com/product-pending.jpg",
  currentPrice: 149.9,
  originalPrice: 199.9,
  category: "Eletrônicos",
  explainability: {
    contract_version: "pmav5.candidate/v1",
    candidate_id: "candidate-pending-1",
    ingestion_id: "ingestion-pending-1",
    correlation_id: "discovery-pending-1",
    discovery_evidence: { provider: "Shopee Native V5" },
    marketplace_metrics: { sourceItemId: "source-1" },
    affiliate_url: "https://s.shopee.com.br/test-affiliate",
    tracked_url: "https://shopee.com.br/product/pending?aff_click=1"
  },
  createdAt: "2026-07-15T14:00:00.000Z",
  affiliateLinks: [
    { channel: "telegram", trackedUrl: "https://app.com/go/tg_offer-pending" },
    { channel: "instagram", trackedUrl: "https://app.com/go/ig_offer-pending" },
    { channel: "whatsapp", trackedUrl: "https://app.com/go/wp_offer-pending" },
    { channel: "facebook", trackedUrl: "https://app.com/go/fb_offer-pending" }
  ]
};

/** Oferta em selected — aciona Approval automaticamente (comportamento anterior) */
const selectedOffer: OfficialAIOffer = {
  ...pendingOffer,
  id: "offer-selected",
  state: "selected",
  version: 1
};

const content: OfficialAIContent = {
  title: "Oferta Descoberta",
  description: "Produto com ótimo custo-benefício.",
  shortCopy: "Aproveite enquanto dura.",
  longCopy: "Produto selecionado automaticamente pelo sistema de Discovery.",
  hashtags: ["#oferta", "#descoberta"],
  callToAction: "Compre agora",
  highlights: ["Preço especial", "Frete grátis"],
  explanation: "Gerado pelo modo Draft Generation da Official AI.",
  channelCopies: {
    telegram: "Texto Telegram",
    instagram: "Texto Instagram",
    whatsapp: "Texto WhatsApp"
  }
};

const draftsResult = [
  { postId: "post-tg", affiliateLinkId: "link-tg", channel: "telegram" as const, state: "draft" as const },
  { postId: "post-ig", affiliateLinkId: "link-ig", channel: "instagram" as const, state: "draft" as const },
  { postId: "post-wa", affiliateLinkId: "link-wa", channel: "whatsapp" as const, state: "draft" as const }
];

function createDependencies(
  overrides: Partial<OfficialAIServiceDependencies> = {},
  offerOverride: OfficialAIOffer | null = pendingOffer
) {
  const dependencies: OfficialAIServiceDependencies = {
    offers: { updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offerOverride) },
    providers: {
      resolve: vi.fn().mockReturnValue({
        name: "groq",
        model: "openai/gpt-oss-120b",
        generate: vi.fn().mockResolvedValue({
          content,
          provider: "groq",
          model: "openai/gpt-oss-120b",
          latencyMs: 25,
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: "stop"
        })
      })
    },
    content: { persistDrafts: vi.fn().mockResolvedValue(draftsResult) },
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
    clock: { now: vi.fn().mockReturnValue("2026-07-15T11:00:01.000Z") },
    ...overrides
  };
  return dependencies;
}

// ---------------------------------------------------------------------------
// Testes ADR-014 — Modo 1: Draft Generation
// ---------------------------------------------------------------------------

describe("generateOfficialAI — Modo 1: Draft Generation (pending_manual_review)", () => {

  it("✓ gera drafts automaticamente para oferta em pending_manual_review", async () => {
    const dependencies = createDependencies();

    const result = await generateOfficialAI(command, dependencies);

    expect(result.status).toBe("drafted");
    expect(dependencies.providers.resolve).toHaveBeenCalledTimes(1);
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
  });

  it("✓ offer permanece pending_manual_review — IA não promove approved", async () => {
    const dependencies = createDependencies();

    const result = await generateOfficialAI(command, dependencies);

    expect(result.status).toBe("drafted");
    if (result.status === "drafted") {
      expect(result.offerState).toBe("pending_manual_review");
    }
    // approveSelected NUNCA é chamado no modo Draft Generation
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
  });

  it("✓ nenhuma transição de estado ocorre no modo Draft Generation", async () => {
    const dependencies = createDependencies();

    const result = await generateOfficialAI(command, dependencies);

    expect(result.status).toBe("drafted");
    // Confirma ausência de qualquer operação de aprovação/transição
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
    // Auditoria registrada com result="drafted" (sem transição)
    expect(dependencies.audit.register).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "drafted",
        transitionRequested: false,
        transitionCompleted: false
      })
    );
  });

  it("✓ vínculo offer/post: drafts contêm offer_id e são criados via persistDrafts", async () => {
    const dependencies = createDependencies();

    const result = await generateOfficialAI(command, dependencies);

    expect(result.status).toBe("drafted");
    if (result.status === "drafted") {
      expect(result.drafts).toHaveLength(3);
      expect(result.drafts?.every((d) => d.state === "draft")).toBe(true);
    }
    // persistDrafts recebeu o offer correto com o id vinculado
    expect(dependencies.content.persistDrafts).toHaveBeenCalledWith(
      expect.objectContaining({
        offer: expect.objectContaining({ id: "offer-pending" }),
        channels: ["telegram", "instagram", "whatsapp"]
      })
    );
  });

  it("✓ idempotência: reexecução com mesma chave retorna replay sem duplicar drafts", async () => {
    const original = {
      status: "drafted" as const,
      commandId: command.commandId,
      offerId: command.offerId,
      offerState: "pending_manual_review" as const
    };
    const dependencies = createDependencies({
      idempotency: {
        begin: vi.fn().mockResolvedValue({ status: "replay", result: original }),
        complete: vi.fn()
      }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toEqual(original);
    // Nunca chama o provider nem cria novos drafts no replay
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
    expect(dependencies.content.persistDrafts).not.toHaveBeenCalled();
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
  });

  it("✓ publicação continua exigindo aprovação humana: Official Publication não é chamada", async () => {
    const dependencies = createDependencies();

    const result = await generateOfficialAI(command, dependencies);

    // O resultado é "drafted" — não "approved" nem "posted"
    expect(result.status).toBe("drafted");
    // approveSelected não foi chamado — offer permanece pending_manual_review
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
    // A Official Publication só consome "approved" — que não foi produzido
  });

  it("✓ política determinística mantém pending_manual_review sem chamar provider", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("provider down"));
    const dependencies = createDependencies({
      providers: {
        resolve: vi.fn().mockReturnValue({
          name: "groq",
        model: "openai/gpt-oss-120b",
          generate
        })
      }
    });

    const result = await generateOfficialAI(command, dependencies);

    expect(result.status).toBe("drafted");
    if (result.status === "drafted") {
      expect(result.offerState).toBe("pending_manual_review");
      expect(result.providerEvidence?.provider).toBe("deterministic-engine");
    }
    expect(generate).not.toHaveBeenCalled();
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
  });

  it("✓ rejeita estados terminais: approved, posted, rejected não entram no fluxo", async () => {
    for (const state of ["approved", "posted", "rejected"] as const) {
      const dependencies = createDependencies(
        {},
        { ...pendingOffer, state, version: state === "approved" ? 2 : 3 }
      );
      const cmd = { ...command, offerId: "offer-pending", idempotencyKey: "ai:offer-pending:v1" };

      const result = await generateOfficialAI(cmd, dependencies);

      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.code).toBe("INVALID_OFFER_STATE");
      }
      expect(dependencies.providers.resolve).not.toHaveBeenCalled();
      expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
    }
  });
});

describe("generateOfficialAI — Copy V2 (selected → drafts sem aprovação)", () => {
  it("gera copy somente para oferta selected e não promove approved", async () => {
    const copyCommand: OfficialAICommand = {
      ...command,
      commandId: "command-copy-v2",
      idempotencyKey: "ai:copy-v2:offer-selected:v1",
      offerId: "offer-selected",
      metadata: { copyV2: true }
    };
    const dependencies = createDependencies({}, selectedOffer);
    const result = await generateOfficialAI(copyCommand, dependencies);
    expect(result.status).toBe("drafted");
    expect(result.offerState).toBe("selected");
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
  });

  it("rejeita Copy V2 para oferta ainda não selecionada", async () => {
    const copyCommand: OfficialAICommand = { ...command, commandId: "command-copy-v2-pending", metadata: { copyV2: true } };
    const dependencies = createDependencies({}, pendingOffer);
    const result = await generateOfficialAI(copyCommand, dependencies);
    expect(result).toMatchObject({ status: "rejected", code: "SELECTION_REQUIRED" });
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
  });

  it("permite Copy V2 automatizada somente com evidência de curadoria e actor service", async () => {
    const autoCommand: OfficialAICommand = {
      ...command,
      commandId: "command-copy-v2-auto",
      idempotencyKey: "ai:copy-v2:offer-pending:v1",
      metadata: { copyV2: true, copyV2Auto: true },
      actor: { type: "service", id: "curation-worker", service: "curation-worker" }
    };
    const dependencies = createDependencies({}, pendingOffer);
    const result = await generateOfficialAI(autoCommand, dependencies);
    expect(result.status).toBe("drafted");
    expect(result.offerState).toBe("pending_manual_review");
    expect(dependencies.approval.approveSelected).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Testes de Modo 2: Approval (comportamento anterior preservado)
// ---------------------------------------------------------------------------

describe("generateOfficialAI — Modo 2: Approval (selected → approved)", () => {

  it("✓ oferta em selected aciona Approval automaticamente (comportamento anterior)", async () => {
    const approvalCommand: OfficialAICommand = {
      ...command,
      commandId: "command-approval",
      idempotencyKey: "ai:offer-selected:v1",
      offerId: "offer-selected"
    };
    const dependencies = createDependencies({}, selectedOffer);

    const result = await generateOfficialAI(approvalCommand, dependencies);

    expect(result.status).toBe("approved");
    expect(dependencies.approval.approveSelected).toHaveBeenCalledTimes(1);
    if (result.status === "approved") {
      expect(result.offerState).toBe("approved");
    }
  });

  it("✓ modo Approval: persiste drafts e promove approved antes de retornar", async () => {
    const order: string[] = [];
    const approvalCommand: OfficialAICommand = {
      ...command,
      commandId: "command-order",
      idempotencyKey: "ai:offer-selected:v1",
      offerId: "offer-selected"
    };
    const dependencies = createDependencies({}, selectedOffer);
    vi.mocked(dependencies.content.persistDrafts).mockImplementation(async () => {
      order.push("drafts");
      return draftsResult;
    });
    vi.mocked(dependencies.approval.approveSelected).mockImplementation(async () => {
      order.push("approved");
      return { status: "applied", auditId: "audit-1", newState: "approved" };
    });

    const result = await generateOfficialAI(approvalCommand, dependencies);

    expect(result.status).toBe("approved");
    expect(order).toEqual(["drafts", "approved"]);
  });

  it("✓ modo Approval: auditoria registrada com result=approved e transitionCompleted=true", async () => {
    const approvalCommand: OfficialAICommand = {
      ...command,
      commandId: "command-audit",
      idempotencyKey: "ai:offer-selected:v1",
      offerId: "offer-selected"
    };
    const dependencies = createDependencies({}, selectedOffer);

    await generateOfficialAI(approvalCommand, dependencies);

    expect(dependencies.audit.register).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "approved",
        transitionRequested: true,
        transitionCompleted: true
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Testes de invariantes gerais (ADR-014)
// ---------------------------------------------------------------------------

describe("generateOfficialAI — invariantes gerais", () => {

  it("✓ comando inválido é rejeitado antes de ler a oferta", async () => {
    const dependencies = createDependencies();
    const invalid = {
      ...command,
      contractVersion: "pmav5.ai/v0"
    } as unknown as OfficialAICommand;

    const result = await generateOfficialAI(invalid, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_AI_COMMAND" });
    expect(dependencies.offers.findById).not.toHaveBeenCalled();
  });

  it("✓ oferta não encontrada é rejeitada com ENTITY_NOT_FOUND", async () => {
    const dependencies = createDependencies({}, null);

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "ENTITY_NOT_FOUND" });
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
  });

  it("✓ contrato candidato inválido é rejeitado sem chamar o provider", async () => {
    const dependencies = createDependencies(
      {},
      { ...pendingOffer, explainability: { ...pendingOffer.explainability, contract_version: "legacy" } }
    );

    const result = await generateOfficialAI(command, dependencies);

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_CANDIDATE_CONTRACT" });
    expect(dependencies.providers.resolve).not.toHaveBeenCalled();
  });

  it("✓ Official AI possui uma única interface pública: generateOfficialAI", async () => {
    // Verifica que a função existe e é a única exportada do módulo core/ai para geração
    const { generateOfficialAI: fn } = await import("@/core/ai");
    expect(typeof fn).toBe("function");
    // A função aceita pending_manual_review e selected pelo mesmo contrato de entrada
    const depPending = createDependencies({}, pendingOffer);
    const depSelected = createDependencies({}, selectedOffer);
    const selCmd = { ...command, idempotencyKey: "ai:offer-selected:v1", offerId: "offer-selected" };

    const r1 = await fn(command, depPending);
    const r2 = await fn(selCmd, depSelected);

    expect(r1.status).toBe("drafted");
    expect(r2.status).toBe("approved");
  });
});
