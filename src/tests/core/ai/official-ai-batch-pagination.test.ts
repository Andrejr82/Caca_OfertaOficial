import { describe, expect, it, vi } from "vitest";
import {
  generateOfficialAI,
  type OfficialAICommand,
  type OfficialAIContent,
  type OfficialAIOffer,
  type OfficialAIServiceDependencies
} from "@/core/ai";

const BASE_COMMAND: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1",
  commandId: "cmd-batch-test",
  idempotencyKey: "ai:batch:test:v1",
  correlationId: "corr-test",
  causationId: null,
  offerId: "ALL_PENDING",
  tenantId: "tenant-1",
  providerPreference: undefined,
  channels: ["telegram", "instagram", "whatsapp"],
  requestedAt: "2026-07-15T14:00:00.000Z",
  actor: { type: "service" as const, id: "tenant-1", service: "nextjs-ai-route" },
  origin: "api.ai.generate",
  reason: { code: "GENERATE_OFFICIAL_CONTENT" }
};

const VALID_EXPLAINABILITY = {
  contract_version: "pmav5.candidate/v1",
  candidate_id: "cand-1",
  ingestion_id: "ing-1",
  correlation_id: "disc-1",
  discovery_evidence: { provider: "Shopee Native V5" },
  marketplace_metrics: { sourceItemId: "src-1" },
  affiliate_url: "https://s.shopee.com.br/test-affiliate",
  tracked_url: "https://shopee.com.br/produto/1?aff_click=1"
};

function makeOffer(id: string, valid = true): OfficialAIOffer {
  return {
    id,
    tenantId: "tenant-1",
    state: "pending_manual_review" as const,
    version: 0,
    marketplace: "Shopee",
    productName: `Produto ${id}`,
    originalUrl: `https://shopee.com.br/product/${id}`,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    currentPrice: 99.9,
    originalPrice: 149.9,
    category: "Eletronicos",
    explainability: valid ? VALID_EXPLAINABILITY : { contract_version: "legacy" },
    createdAt: "2026-07-15T14:00:00.000Z",
    affiliateLinks: valid ? [
      { channel: "telegram", trackedUrl: `https://app.com/go/tg_${id}` },
      { channel: "instagram", trackedUrl: `https://app.com/go/ig_${id}` },
      { channel: "whatsapp", trackedUrl: `https://app.com/go/wp_${id}` },
      { channel: "facebook", trackedUrl: `https://app.com/go/fb_${id}` }
    ] : []
  };
}

const DRAFT_CONTENT: OfficialAIContent = {
  title: "Oferta oficial",
  description: "Descricao validada.",
  shortCopy: "Curta.",
  longCopy: "Longa.",
  hashtags: ["#oferta"],
  callToAction: "Comprar",
  highlights: ["Destaque"],
  explanation: "Explicacao.",
  channelCopies: { telegram: "💥 ACHADO DO DIA", instagram: "✨ OFERTA EM DESTAQUE", whatsapp: "🔥 PREÇO BAIXOU" }
};

function createDeps(overrides: Partial<OfficialAIServiceDependencies> = {}): OfficialAIServiceDependencies {
  return {
    offers: { updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(null) },
    providers: {
      resolve: vi.fn().mockReturnValue({
        name: "groq" as const,
        model: "llama",
        generate: vi.fn().mockResolvedValue({
          content: DRAFT_CONTENT, provider: "groq", model: "llama", latencyMs: 10, finishReason: "stop"
        })
      })
    },
    content: {
      persistDrafts: vi.fn().mockImplementation(async ({ channels }: { channels: readonly string[] }) =>
        channels.map((ch) => ({ postId: `post-${ch}`, affiliateLinkId: `link-${ch}`, channel: ch, state: "draft" as const }))
      )
    },
    approval: { approveSelected: vi.fn() },
    idempotency: {
      begin: vi.fn().mockResolvedValue({ status: "started" }),
      complete: vi.fn().mockResolvedValue(undefined)
    },
    audit: { register: vi.fn().mockResolvedValue(undefined) },
    clock: { now: vi.fn().mockReturnValue("2026-07-15T14:00:01.000Z") },
    ...overrides
  };
}

describe("Fingerprint canonico (F9.1/F9.2)", () => {
  it("mesma oferta, commandId/correlationId/requestedAt diferentes -> mesmo fingerprint", async () => {
    const fps: string[] = [];
    const deps = createDeps({
      offers: { updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(makeOffer("offer-fp")), findPendingWithoutDrafts: undefined },
      idempotency: {
        begin: vi.fn().mockImplementation(async (_k: string, fp: string) => { fps.push(fp); return { status: "started" }; }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    const base = { ...BASE_COMMAND, offerId: "offer-fp", idempotencyKey: "ai:draft:offer-fp:v2" };
    await generateOfficialAI({ ...base, commandId: "cmd-1", correlationId: "corr-1", requestedAt: "2026-01-01T00:00:00.000Z" }, deps);
    await generateOfficialAI({ ...base, commandId: "cmd-2", correlationId: "corr-2", requestedAt: "2026-12-31T23:59:59.000Z" }, deps);
    expect(fps).toHaveLength(2);
    expect(fps[0]).toBe(fps[1]);
  });

  it("offerId diferente -> fingerprint diferente", async () => {
    const fps: string[] = [];
    const deps = createDeps({
      offers: { updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => makeOffer(id)), findPendingWithoutDrafts: undefined },
      idempotency: {
        begin: vi.fn().mockImplementation(async (_k: string, fp: string) => { fps.push(fp); return { status: "started" }; }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    await generateOfficialAI({ ...BASE_COMMAND, offerId: "offerA", idempotencyKey: "ai:draft:offerA:v2" }, deps);
    await generateOfficialAI({ ...BASE_COMMAND, offerId: "offerB", idempotencyKey: "ai:draft:offerB:v2" }, deps);
    expect(fps[0]).not.toBe(fps[1]);
  });

  it("channels em ordem diferente -> mesmo fingerprint", async () => {
    const fps: string[] = [];
    const deps = createDeps({
      offers: { updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(makeOffer("offer-ch")), findPendingWithoutDrafts: undefined },
      idempotency: {
        begin: vi.fn().mockImplementation(async (_k: string, fp: string) => { fps.push(fp); return { status: "started" }; }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    const base = { ...BASE_COMMAND, offerId: "offer-ch", idempotencyKey: "ai:draft:offer-ch:v2" };
    await generateOfficialAI({ ...base, channels: ["whatsapp", "telegram", "instagram"] }, deps);
    await generateOfficialAI({ ...base, channels: ["telegram", "instagram", "whatsapp"] }, deps);
    expect(fps[0]).toBe(fps[1]);
  });
});

describe("Chave v2 no sub-command (F9.3)", () => {
  it("ALL_PENDING gera sub-commands com ai:draft:<offerId>:v2", async () => {
    const offer1 = makeOffer("offer-v2-test");
    const keys: string[] = [];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offer1),
        findPendingWithoutDrafts: vi.fn().mockResolvedValueOnce([offer1]).mockResolvedValue([])
      },
      idempotency: {
        begin: vi.fn().mockImplementation(async (k: string) => { keys.push(k); return { status: "started" }; }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    await generateOfficialAI(BASE_COMMAND, deps);
    expect(keys).toContain("ai:draft:offer-v2-test:v2");
    expect(keys).not.toContain("ai:offer-v2-test:v1");
  });
});

describe("Registros v1 nao interferem com v2 (F9.4)", () => {
  it("CONFLICT na chave v1 nao impede processamento com chave v2", async () => {
    const offer1 = makeOffer("offer-legacy");
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offer1),
        findPendingWithoutDrafts: vi.fn().mockResolvedValueOnce([offer1]).mockResolvedValue([])
      },
      idempotency: {
        begin: vi.fn().mockImplementation(async (k: string) => {
          if (k === "ai:offer-legacy:v1") return { status: "conflict" };
          return { status: "started" };
        }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect(deps.content.persistDrafts).toHaveBeenCalled();
  });
});

describe("50 invalidas + 10 validas (F9.5)", () => {
  it("visita 60, rejeita 50, gera 10, multiplas paginas", async () => {
    const invalidas = Array.from({ length: 50 }, (_, i) => makeOffer(`invalid-${i}`, false));
    const validas = Array.from({ length: 10 }, (_, i) => makeOffer(`valid-${i}`, true));
    let call = 0;
    const pages = [invalidas, validas, []];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => {
          return [...invalidas, ...validas].find((o) => o.id === id) ?? null;
        }),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = pages[call] ?? []; call++; return p; })
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect(call).toBeGreaterThanOrEqual(2);
    expect(deps.content.persistDrafts).toHaveBeenCalledTimes(10);
    expect((result as any).content.description).toContain("Visitadas: 60");
    expect((result as any).content.description).toContain("Drafts: 10");
    expect((result as any).content.description).toContain("InvalidContract: 50");
  });
});

describe("200 invalidas + 150 validas (F9.6)", () => {
  it("visita 350 em multiplas paginas, 150 com drafts", async () => {
    const invalidas = Array.from({ length: 200 }, (_, i) => makeOffer(`inv-${i}`, false));
    const validas = Array.from({ length: 150 }, (_, i) => makeOffer(`val-${i}`, true));
    const todas = [...invalidas, ...validas];
    let offset = 0;
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => todas.find((o) => o.id === id) ?? null),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = todas.slice(offset, offset + 50); offset += 50; return p; })
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect((result as any).content.description).toContain("Visitadas: 350");
    expect((result as any).content.description).toContain("Drafts: 150");
    expect(deps.content.persistDrafts).toHaveBeenCalledTimes(150);
  });
});

describe("Fila totalmente invalida (F9.7)", () => {
  it("visita todas, zero drafts, termina sem loop infinito", async () => {
    const invalidas = Array.from({ length: 30 }, (_, i) => makeOffer(`only-invalid-${i}`, false));
    let call = 0;
    const pages = [invalidas.slice(0, 15), invalidas.slice(15), []];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => invalidas.find((o) => o.id === id) ?? null),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = pages[call] ?? []; call++; return p; })
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect(deps.content.persistDrafts).not.toHaveBeenCalled();
    expect((result as any).content.description).toContain("Visitadas: 30");
    expect((result as any).content.description).toContain("Drafts: 0");
  });
});

describe("Replay rejected nao bloqueia (F9.8)", () => {
  it("primeira oferta replay rejected; segunda processada normalmente", async () => {
    const offer1 = makeOffer("replay-rej");
    const offer2 = makeOffer("ok-offer");
    const replayRejected = { status: "rejected" as const, code: "SOME_ERROR", commandId: "cmd", offerId: "replay-rej", offerState: "pending_manual_review" as const, message: "rejected", failureStage: "preconditions", rejectedAt: "t" };
    let call = 0;
    const pages = [[offer1, offer2], []];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => id === "ok-offer" ? offer2 : null),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = pages[call] ?? []; call++; return p; })
      },
      idempotency: {
        begin: vi.fn().mockImplementation(async (k: string) => {
          if (k === "ai:draft:replay-rej:v2") return { status: "replay", result: replayRejected };
          return { status: "started" };
        }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect(deps.content.persistDrafts).toHaveBeenCalledTimes(1);
  });
});

describe("Replay drafted nao duplica (F9.9)", () => {
  it("oferta com replay drafted: persistDrafts nao chamado novamente", async () => {
    const offer1 = makeOffer("already-drafted");
    const replayDrafted = {
      status: "drafted" as const, commandId: "cmd", offerId: "already-drafted",
      offerState: "pending_manual_review" as const, content: DRAFT_CONTENT,
      drafts: [{ postId: "p1", affiliateLinkId: "l1", channel: "telegram" as const, state: "draft" as const }],
      providerEvidence: { provider: "groq", model: "llama", latencyMs: 10 }, completedAt: "t"
    };
    let call = 0;
    const pages = [[offer1], []];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offer1),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = pages[call] ?? []; call++; return p; })
      },
      idempotency: {
        begin: vi.fn().mockImplementation(async (k: string) => {
          if (k === "ai:draft:already-drafted:v2") return { status: "replay", result: replayDrafted };
          return { status: "started" };
        }),
        complete: vi.fn().mockResolvedValue(undefined)
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect(deps.content.persistDrafts).not.toHaveBeenCalled();
    expect((result as any).content.description).toContain("Visitadas: 1");
  });
});

describe("Cursor stall (F9.13)", () => {
  it("pagina repetida detectada: BATCH_CURSOR_STALLED, sem loop infinito", async () => {
    const offer1 = makeOffer("stuck");
    const stuckPage = [offer1];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offer1),
        findPendingWithoutDrafts: vi.fn().mockResolvedValue(stuckPage)
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("rejected");
    const auditCalls = vi.mocked(deps.audit.register).mock.calls;
    const stallCall = auditCalls.find((args) => args[0].errorCode === "BATCH_CURSOR_STALLED");
    expect(stallCall).toBeDefined();
  });
});

describe("Metricas corretas (F9.14)", () => {
  it("postsPrepared e postsPersisted refletem apenas drafts reais", async () => {
    const invalida = makeOffer("inv-m", false);
    const valida = makeOffer("val-m", true);
    let call = 0;
    const pages = [[invalida, valida], []];
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => id === "inv-m" ? invalida : valida),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = pages[call] ?? []; call++; return p; })
      }
    });
    await generateOfficialAI(BASE_COMMAND, deps);
    const auditFinal = vi.mocked(deps.audit.register).mock.calls.find((args) => args[0].provider === "official-ai-batch");
    expect(auditFinal).toBeDefined();
    expect(auditFinal![0].postsPrepared).toBe(3);  // 1 oferta valida * 3 canais
    expect(auditFinal![0].postsPersisted).toBe(3); // 3 posts reais persistidos
  });
});

describe("Batch size e execucao multipaginas (F9.15)", () => {
  it("execucao processa mais de 50 ofertas em paginas separadas", async () => {
    const todas = Array.from({ length: 60 }, (_, i) => makeOffer(`big-${i}`, true));
    let offset = 0;
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockImplementation(async (id: string) => todas.find((o) => o.id === id) ?? null),
        findPendingWithoutDrafts: vi.fn().mockImplementation(async () => { const p = todas.slice(offset, offset + 50); offset += p.length; return p; })
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("drafted");
    expect((result as any).content.description).toContain("Visitadas: 60");
    expect((result as any).content.description).toContain("Drafts: 60");
    const pagesMatch = (result as any).content.description.match(/P.ginas: (\d+)/);
    expect(Number(pagesMatch?.[1])).toBeGreaterThanOrEqual(2);
  });
});

describe("Cursor Errors", () => {
  it("BATCH_CURSOR_INVALID: createdAt invalido interrompe com erro", async () => {
    const offer = makeOffer("invalid-cursor");
    offer.createdAt = offer.id; // UUID as timestamp
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offer),
        findPendingWithoutDrafts: vi.fn().mockResolvedValue([offer])
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("rejected");
    expect((result as any).code).toBe("BATCH_CURSOR_INVALID");
    expect(deps.idempotency.complete).toHaveBeenCalled();
  });

  it("BATCH_PAGE_READ_FAILED: erro no adapter retorna rejected", async () => {
    const deps = createDeps({
      offers: {
        updateShortName: vi.fn(), findById: vi.fn(),
        findPendingWithoutDrafts: vi.fn().mockRejectedValue(new Error("Supabase timeout"))
      }
    });
    const result = await generateOfficialAI(BASE_COMMAND, deps);
    expect(result.status).toBe("rejected");
    expect((result as any).code).toBe("BATCH_PAGE_READ_FAILED");
    expect(deps.idempotency.complete).toHaveBeenCalled();
  });
});
