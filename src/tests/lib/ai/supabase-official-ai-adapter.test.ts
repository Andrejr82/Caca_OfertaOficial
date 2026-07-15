import { describe, expect, it, vi } from "vitest";
import { MemoryStateAdapter } from "@/core/state/adapters/memory-state-adapter";
import type { OfficialAICommand, OfficialAIContent, OfficialAIOffer } from "@/core/ai";
import {
  OfficialAIApprovalAdapter,
  SupabaseOfficialAIAdapter
} from "@/lib/ai/official/supabase-official-ai-adapter";

function chain(result: unknown) {
  const builder = {
    select: vi.fn(), insert: vi.fn(), upsert: vi.fn(), update: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn(async () => result), single: vi.fn(async () => result)
  };
  for (const method of ["select", "insert", "upsert", "update", "eq"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

const command: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1",
  commandId: "command-1",
  idempotencyKey: "ai:offer-1:v1",
  correlationId: "correlation-1",
  causationId: "curation-1",
  offerId: "offer-1",
  tenantId: "tenant-1",
  channels: ["telegram"],
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
  marketplace: "Amazon",
  productName: "Produto",
  originalUrl: "https://amazon.com.br/dp/1",
  imageUrl: "https://images.example.com/1.jpg",
  currentPrice: 100,
  originalPrice: 120,
  category: "Casa",
  explainability: { contract_version: "pmav5.candidate/v1" }
};

const content: OfficialAIContent = {
  title: "Título", description: "Descrição", shortCopy: "Curta", longCopy: "Longa",
  hashtags: ["#oferta"], callToAction: "Comprar", highlights: ["Destaque"],
  explanation: "Explicação", channelCopies: { telegram: "Telegram oficial" }
};

describe("SupabaseOfficialAIAdapter", () => {
  it("carrega oferta por id e tenant e materializa Candidate persistido", async () => {
    const builder = chain({
      data: {
        id: "offer-1", user_id: "tenant-1", status: "selected", platform: "Amazon",
        product_name: "Produto", original_url: "https://amazon.com.br/dp/1",
        image_url: "https://images.example.com/1.jpg", current_price: 100, old_price: 120,
        category: "Casa", explainability: { contract_version: "pmav5.candidate/v1" }
      }, error: null
    });
    const client = { from: vi.fn(() => builder) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(adapter.findById("offer-1", "tenant-1")).resolves.toMatchObject(offer);
    expect(client.from).toHaveBeenCalledWith("offers");
    expect(builder.eq).toHaveBeenCalledWith("id", "offer-1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "tenant-1");
  });

  it("cria link determinístico e post exclusivamente draft", async () => {
    const link = chain({ data: { id: "link-1" }, error: null });
    const noPost = chain({ data: null, error: null });
    const insertedPost = chain({ data: { id: "post-1", affiliate_link_id: "link-1", channel: "telegram", status: "draft" }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    const result = await adapter.persistDrafts({ command, offer, content, channels: ["telegram"] });

    expect(result).toEqual([{ postId: "post-1", affiliateLinkId: "link-1", channel: "telegram", state: "draft" }]);
    expect(link.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "tenant-1", offer_id: "offer-1", channel: "telegram", sub_id: "tg_offer1"
    }), { onConflict: "offer_id,channel" });
    expect(insertedPost.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: "draft",
      content: "Telegram oficial\n\nhttps://cacaoferta.com.br/go/tg_offer1",
      affiliate_link_id: "link-1"
    }));
  });

  it("reutiliza post draft existente sem inserir outro", async () => {
    const link = chain({ data: { id: "link-1" }, error: null });
    const existingPost = chain({ data: { id: "post-1", affiliate_link_id: "link-1", channel: "telegram", status: "draft" }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(existingPost) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(adapter.persistDrafts({ command, offer, content, channels: ["telegram"] })).resolves.toHaveLength(1);
    expect(client.from).toHaveBeenCalledTimes(2);
    expect(existingPost.insert).not.toHaveBeenCalled();
  });

  it("persiste auditoria e idempotência no storage existente", async () => {
    const audit = chain({ data: null, error: null });
    const reserve = chain({ data: null, error: null });
    const complete = chain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(audit).mockReturnValueOnce(reserve).mockReturnValueOnce(complete) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await adapter.register({
      timestamp: command.requestedAt, commandId: command.commandId, idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId, causationId: command.causationId, offerId: command.offerId,
      tenantId: command.tenantId, actor: command.actor, origin: command.origin, reason: command.reason,
      provider: "groq", model: "llama", latencyMs: 10, result: "approved", replay: false,
      failureStage: null, errorCode: null, postsPrepared: 1, postsPersisted: 1,
      transitionRequested: true, transitionCompleted: true
    });
    await expect(adapter.begin(command.idempotencyKey, "fingerprint")).resolves.toEqual({ status: "started" });
    await adapter.complete(command.idempotencyKey, "fingerprint", { status: "approved", commandId: "command-1", offerId: "offer-1" });

    expect(audit.insert).toHaveBeenCalledWith(expect.objectContaining({ integration: "official-ai-service", action: "ai_generation" }));
    expect(reserve.insert).toHaveBeenCalledWith(expect.objectContaining({ key: `pmav5.ai.idempotency.${command.idempotencyKey}` }));
    expect(complete.update).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ status: "completed" }) }));
  });

  describe("findPendingWithoutDrafts (ADR-014 / V5 Bugfix)", () => {
    function mockChain(result: unknown) {
      const builder: any = {
        select: vi.fn(), eq: vi.fn(), in: vi.fn(async () => result)
      };
      for (const method of ["select", "eq"] as const) {
        builder[method].mockReturnValue(builder);
      }
      return builder;
    }

    it("1. consulta encontra offers sem drafts e 2. exclui offers com draft ativo", async () => {
      const offersBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({
          data: [
            { id: "offer-1", user_id: "tenant-1", status: "pending_manual_review", platform: "Amazon", product_name: "P1", current_price: 10, category: "C1" },
            { id: "offer-2", user_id: "tenant-1", status: "pending_manual_review", platform: "Shopee", product_name: "P2", current_price: 20, category: "C2" }
          ],
          error: null
        }))
      };
      const postsBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn(async () => ({
          data: [{ offer_id: "offer-1" }],
          error: null
        }))
      };
      const client = { from: vi.fn((table: string) => table === "offers" ? offersBuilder : postsBuilder) };
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

      const result = await adapter.findPendingWithoutDrafts("tenant-1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("offer-2");
      expect(postsBuilder.in).toHaveBeenCalledWith("offer_id", ["offer-1", "offer-2"]);
    });

    it("3. não falha com 400 ao processar muitos IDs realizando chunking de 150 em 150", async () => {
      const manyOffers = Array.from({ length: 350 }, (_, idx) => ({
        id: `offer-${idx}`, user_id: "tenant-1", status: "pending_manual_review", platform: "Amazon", product_name: `P${idx}`, current_price: 10, category: "C1"
      }));
      const offersBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: manyOffers, error: null }))
      };
      const postsBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn(async (col, ids) => ({ data: [], error: null }))
      };
      const client = { from: vi.fn((table: string) => table === "offers" ? offersBuilder : postsBuilder) };
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

      const result = await adapter.findPendingWithoutDrafts("tenant-1");
      expect(result).toHaveLength(350);
      expect(postsBuilder.in).toHaveBeenCalledTimes(3);
      expect(postsBuilder.in.mock.calls[0][1]).toHaveLength(150);
      expect(postsBuilder.in.mock.calls[1][1]).toHaveLength(150);
      expect(postsBuilder.in.mock.calls[2][1]).toHaveLength(50);
    });

    it("4. tenant isolation preservado - rejeita tenantId diferente do adapter e filtra queries por user_id", async () => {
      const client = { from: vi.fn() };
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");
      const result = await adapter.findPendingWithoutDrafts("tenant-2");
      expect(result).toEqual([]);
      expect(client.from).not.toHaveBeenCalled();
    });

    it("7. erro Supabase preserva code/message/details/hint encapsulados e acessíveis programaticamente", async () => {
      const offersBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({
          data: [{ id: "offer-1", user_id: "tenant-1", status: "pending_manual_review", platform: "Amazon", product_name: "P1", current_price: 10, category: "C1" }],
          error: null
        }))
      };
      const postsError = { code: "PGRST100", message: "Bad Request", details: "URI Too Long", hint: "Reduce array size" };
      const postsBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn(async () => ({ data: null, error: postsError }))
      };
      const client = { from: vi.fn((table: string) => table === "offers" ? offersBuilder : postsBuilder) };
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

      try {
        await adapter.findPendingWithoutDrafts("tenant-1");
        expect.unreachable("deveria ter lançado erro");
      } catch (err: any) {
        expect(err.message).toContain("Official AI existing drafts check failed: Bad Request | code=PGRST100 | details=URI Too Long | hint=Reduce array size");
        expect(err.code).toBe("PGRST100");
        expect(err.details).toBe("URI Too Long");
        expect(err.hint).toBe("Reduce array size");
      }
    });
  });
});

it("OfficialAIApprovalAdapter usa o State Service com CAS selected para approved", async () => {
  const memory = new MemoryStateAdapter([{
    entityType: "offer", entityId: "offer-1", tenantId: "tenant-1", state: "selected", version: 1
  }]);
  const adapter = new OfficialAIApprovalAdapter({
    repository: memory, audit: memory, idempotency: memory,
    clock: { now: () => "2026-07-13T20:00:01.000Z" },
    uuid: { generate: () => "state-audit-1" }
  });

  const result = await adapter.approveSelected({
    command, offer,
    drafts: [{ postId: "post-1", affiliateLinkId: "link-1", channel: "telegram", state: "draft" }]
  });

  expect(result).toEqual({ status: "applied", auditId: "state-audit-1", newState: "approved" });
  await expect(memory.findById("offer", "offer-1", "tenant-1")).resolves.toMatchObject({ state: "approved", version: 2 });
});
