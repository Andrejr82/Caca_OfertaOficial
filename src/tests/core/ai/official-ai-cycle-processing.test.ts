import { describe, expect, it, vi } from "vitest";
import {
  createOfficialAICyclePages,
  processOfficialAICyclePages,
  type OfficialAICyclePage
} from "@/core/ai/official-ai-cycle";
import {
  generateOfficialAI,
  type OfficialAICommand,
  type OfficialAIContent,
  type OfficialAIOffer,
  type OfficialAIServiceDependencies
} from "@/core/ai";
import { OFFICIAL_AI_PAGE_CONCURRENCY } from "@/core/ai/official-ai-service";

const content: OfficialAIContent = {
  title: "Oferta", description: "Descrição", shortCopy: "Curta", longCopy: "Longa",
  hashtags: ["#oferta"], callToAction: "Comprar", highlights: ["Destaque"],
  explanation: "Explicação", channelCopies: { telegram: "💥 ACHADO DO DIA", instagram: "✨ OFERTA EM DESTAQUE", whatsapp: "🔥 PREÇO BAIXOU" }
};

function offer(id: string, tenantId = "tenant-1", valid = true): OfficialAIOffer {
  return {
    id, tenantId, state: "pending_manual_review", version: 0, marketplace: "Shopee",
    productName: `Produto ${id}`, originalUrl: `https://example.com/${id}`,
    imageUrl: `https://example.com/${id}.jpg`, currentPrice: 10, originalPrice: 20,
    category: "Categoria", createdAt: "2026-07-15T12:00:00.000Z",
    explainability: valid ? {
      contract_version: "pmav5.candidate/v1", candidate_id: `candidate-${id}`,
      ingestion_id: `ingestion-${id}`, correlation_id: "cycle-1",
      discovery_evidence: { provider: "native" }, marketplace_metrics: { sourceItemId: id },
      affiliate_url: "https://s.shopee.com.br/test-affiliate",
      tracked_url: `https://shopee.com.br/product/${id}?aff_click=1`
    } : { contract_version: "legacy" },
    affiliateLinks: valid ? [
      { channel: "telegram", trackedUrl: `https://app.com/go/tg_${id}` },
      { channel: "instagram", trackedUrl: `https://app.com/go/ig_${id}` },
      { channel: "whatsapp", trackedUrl: `https://app.com/go/wp_${id}` },
      { channel: "facebook", trackedUrl: `https://app.com/go/fb_${id}` }
    ] : []
  };
}

function pageCommand(ids: string[], pageNumber = 1, totalPages = 1): OfficialAICommand {
  return {
    contractVersion: "pmav5.ai/v1", commandId: `ai:cycle:cycle-1:page:${pageNumber}:v1`,
    idempotencyKey: `ai:cycle:cycle-1:page:${pageNumber}:v1`, correlationId: "cycle-1",
    causationId: null, offerId: `CYCLE_PAGE_${pageNumber}`, tenantId: "tenant-1",
    channels: ["telegram", "instagram", "whatsapp"], requestedAt: "2026-07-15T12:00:00.000Z",
    actor: { type: "service", id: "oracle-worker", service: "oracle-worker" },
    origin: "oracle.discovery", reason: { code: "GENERATE_OFFICIAL_CONTENT" },
    batch: { operation: "PROCESS_OFFERS", offerIds: ids, pageNumber, totalPages }
  };
}

function dependencies(rows: OfficialAIOffer[]): OfficialAIServiceDependencies {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    offers: {
      updateShortName: vi.fn(), findById: vi.fn(async (id: string, tenantId: string) => {
        const row = byId.get(id);
        return row?.tenantId === tenantId ? row : null;
      }),
      findPendingWithoutDrafts: vi.fn().mockRejectedValue(new Error("backlog global não pode ser consultado"))
    },
    providers: { resolve: vi.fn(() => ({
      name: "groq" as const, model: "test", generate: vi.fn(async () => ({
        content, provider: "groq", model: "test", latencyMs: 1
      }))
    })) },
    content: { persistDrafts: vi.fn(async ({ offer: row, channels }) => channels.map((channel: "telegram" | "instagram" | "whatsapp") => ({
      postId: `post-${row.id}-${channel}`, affiliateLinkId: `link-${row.id}-${channel}`, channel, state: "draft" as const
    }))) },
    approval: { approveSelected: vi.fn() },
    idempotency: {
      begin: vi.fn(async () => ({ status: "started" as const })),
      complete: vi.fn(async () => undefined)
    },
    audit: { register: vi.fn(async () => undefined) },
    clock: { now: vi.fn(() => "2026-07-15T12:00:01.000Z") }
  };
}

describe("Oracle cycle pages", () => {
  it("fingerprint da página muda quando o conjunto de IDs muda", async () => {
    const fingerprints: string[] = [];
    const deps = dependencies([offer("a"), offer("b"), offer("c")]);
    deps.idempotency.begin = vi.fn(async (_key: string, fingerprint: string) => {
      fingerprints.push(fingerprint);
      return { status: "started" as const };
    });
    await generateOfficialAI(pageCommand(["a", "b"]), deps);
    await generateOfficialAI(pageCommand(["a", "c"]), deps);
    expect(fingerprints[0]).not.toBe(fingerprints[3]);
  });

  it("ciclo com 9 IDs e backlog de 2.000 processa exclusivamente os 9 IDs recebidos", async () => {
    const cycle = Array.from({ length: 9 }, (_, i) => offer(`cycle-${i}`));
    const deps = dependencies(cycle);
    const result = await generateOfficialAI(pageCommand(cycle.map((row) => row.id)), deps);
    expect(result.status).toBe("drafted");
    expect(deps.offers.findById).toHaveBeenCalledTimes(9);
    expect(deps.offers.findPendingWithoutDrafts).not.toHaveBeenCalled();
    expect(deps.content.persistDrafts).toHaveBeenCalledTimes(9);
  });

  it("limita concorrência dentro da página sem manter 50 ofertas sequenciais", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => offer(`parallel-${i}`));
    const deps = dependencies(rows);
    let active = 0;
    let peak = 0;
    deps.content.persistDrafts = vi.fn(async ({ offer: row, channels }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return channels.map((channel: "telegram" | "instagram" | "whatsapp") => ({
          postId: `post-${row.id}-${channel}`,
          affiliateLinkId: `link-${row.id}-${channel}`,
          channel,
          state: "draft" as const,
        }));
    });
    const result = await generateOfficialAI(pageCommand(rows.map((row) => row.id)), deps);
    expect(result.status).toBe("drafted");
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(OFFICIAL_AI_PAGE_CONCURRENCY);
  });

  it("120 IDs são divididos em 3 páginas, no máximo 50, e a segunda página é executada", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `offer-${i}`);
    const pages = createOfficialAICyclePages("cycle-120", ids);
    const visited: number[] = [];
    const result = await processOfficialAICyclePages(pages, async (page) => {
      visited.push(page.pageNumber);
      return { status: "completed" as const, pageNumber: page.pageNumber, offerIds: page.offerIds };
    });
    expect(pages.map((page) => page.offerIds.length)).toEqual([50, 50, 20]);
    expect(visited).toEqual([1, 2, 3]);
    expect(result.batchCompleted).toBe(true);
  });

  it("deduplica IDs sem mudar a ordem e gera namespace estável por página", () => {
    expect(createOfficialAICyclePages("corr-1", ["a", "b", "a", "c"])).toEqual([{
      correlationId: "corr-1", pageNumber: 1, totalPages: 1,
      idempotencyKey: "ai:cycle:corr-1:page:1:v1", offerIds: ["a", "b", "c"]
    }]);
  });

  it("retoma do checkpoint após interrupção sem perder nem duplicar ofertas", async () => {
    const pages = createOfficialAICyclePages("resume-cycle", Array.from({ length: 120 }, (_, i) => `id-${i}`));
    const checkpoints = new Map<number, { status: "completed"; pageNumber: number; offerIds: readonly string[] }>();
    const processed: string[] = [];
    let interrupted = false;
    const execute = async (page: OfficialAICyclePage) => {
      const saved = checkpoints.get(page.pageNumber);
      if (saved) return saved;
      if (page.pageNumber === 2 && !interrupted) {
        interrupted = true;
        throw new Error("interrupção simulada");
      }
      processed.push(...page.offerIds);
      const completed = { status: "completed" as const, pageNumber: page.pageNumber, offerIds: page.offerIds };
      checkpoints.set(page.pageNumber, completed);
      return completed;
    };
    await expect(processOfficialAICyclePages(pages, execute)).rejects.toThrow("interrupção simulada");
    const resumed = await processOfficialAICyclePages(pages, execute);
    expect(resumed.batchCompleted).toBe(true);
    expect(new Set(processed).size).toBe(120);
    expect(processed).toHaveLength(120);
  });

  it("uma oferta inválida e um ID de outro tenant são rejeitados sem bloquear as demais", async () => {
    const rows = [offer("valid-1"), offer("invalid", "tenant-1", false), offer("other-tenant", "tenant-2"), offer("valid-2")];
    const deps = dependencies(rows);
    const result = await generateOfficialAI(pageCommand(rows.map((row) => row.id)), deps);
    expect(result.status).toBe("drafted");
    expect(deps.content.persistDrafts).toHaveBeenCalledTimes(2);
    expect((result as any).batch).toMatchObject({ offersVisited: 4, draftedOffers: 2, rejectedOffers: 2 });
    expect(deps.idempotency.complete).toHaveBeenCalledWith(
      "ai:cycle:cycle-1:page:1:v1", expect.any(String), expect.objectContaining({ status: "drafted" })
    );
  });

  it("stale pending individual é registrado e não bloqueia a oferta seguinte", async () => {
    const rows = [offer("stale"), offer("next")];
    const deps = dependencies(rows);
    deps.idempotency.begin = vi.fn(async (key: string) => key === "ai:draft:stale:v2"
      ? { status: "stale_pending" as const, pendingSince: "2020-01-01T00:00:00.000Z" }
      : { status: "started" as const });
    const result = await generateOfficialAI(pageCommand(rows.map((row) => row.id)), deps);
    expect(result.status).toBe("drafted");
    expect(deps.content.persistDrafts).toHaveBeenCalledTimes(1);
    expect((result as any).batch).toMatchObject({ stalePending: 1, draftedOffers: 1, rejectedOffers: 1 });
    expect(deps.idempotency.complete).not.toHaveBeenCalledWith(
      "ai:draft:stale:v2", expect.anything(), expect.anything()
    );
  });

  it("replay drafted não persiste drafts duplicados", async () => {
    const row = offer("replay");
    const deps = dependencies([row]);
    deps.idempotency.begin = vi.fn(async (key: string) => key === "ai:draft:replay:v2"
      ? {
          status: "replay" as const,
          result: {
            status: "drafted" as const, commandId: "old", offerId: "replay",
            offerState: "pending_manual_review" as const, drafts: [], completedAt: "2026-07-15T11:00:00.000Z"
          }
        }
      : { status: "started" as const });
    const result = await generateOfficialAI(pageCommand([row.id]), deps);
    expect(deps.content.persistDrafts).not.toHaveBeenCalled();
    expect((result as any).batch).toMatchObject({ idempotentReplays: 1, draftedOffers: 0 });
  });
});
