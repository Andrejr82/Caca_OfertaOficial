import { describe, expect, it, vi } from "vitest";
import { MemoryStateAdapter } from "@/core/state/adapters/memory-state-adapter";
import type { OfficialAICommand, OfficialAIContent, OfficialAIOffer } from "@/core/ai";
import {
  DEFAULT_BATCH_SIZE,
  getOfficialAIBatchSize,
  OfficialAIApprovalAdapter,
  SupabaseOfficialAIAdapter
} from "@/lib/ai/official/supabase-official-ai-adapter";

function chain(result: unknown) {
  const builder: any = {
    select: vi.fn(), insert: vi.fn(), upsert: vi.fn(), update: vi.fn(), eq: vi.fn(), order: vi.fn(),
    limit: vi.fn(async () => result), in: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result), single: vi.fn(async () => result)
  };
  for (const method of ["select", "insert", "upsert", "update", "eq", "order"] as const) {
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
  explainability: { contract_version: "pmav5.candidate/v1" },
  createdAt: "2026-07-15T14:00:00.000Z"
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
        category: "Casa", explainability: { contract_version: "pmav5.candidate/v1" },
        created_at: "2026-07-15T14:00:00.000Z",
        affiliate_links: [
          { channel: "telegram", tracked_url: "https://caca-oferta-oficial.vercel.app/go/tg_offer-1", sub_id: "tg_offer-1" },
          { channel: "whatsapp", tracked_url: "https://caca-oferta-oficial.vercel.app/go/wp_offer-1", sub_id: "wp_offer-1" },
          { channel: "facebook", tracked_url: "https://caca-oferta-oficial.vercel.app/go/fb_offer-1", sub_id: "fb_offer-1" },
          { channel: "instagram", tracked_url: "https://caca-oferta-oficial.vercel.app/go/ig_offer-1", sub_id: "ig_offer-1" }
        ]
      }, error: null
    });
    const client = { from: vi.fn(() => builder) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(adapter.findById("offer-1", "tenant-1")).resolves.toMatchObject(offer);
    await expect(adapter.findById("offer-1", "tenant-1")).resolves.toMatchObject({
      affiliateLinks: [
        { channel: "telegram", trackedUrl: "https://caca-oferta-oficial.vercel.app/go/tg_offer-1", subId: "tg_offer-1" },
        { channel: "whatsapp", trackedUrl: "https://caca-oferta-oficial.vercel.app/go/wp_offer-1", subId: "wp_offer-1" },
        { channel: "facebook", trackedUrl: "https://caca-oferta-oficial.vercel.app/go/fb_offer-1", subId: "fb_offer-1" },
        { channel: "instagram", trackedUrl: "https://caca-oferta-oficial.vercel.app/go/ig_offer-1", subId: "ig_offer-1" }
      ]
    });
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
      user_id: "tenant-1", offer_id: "offer-1", channel: "telegram", sub_id: "tg_offer-1"
    }), { onConflict: "offer_id,channel" });
    expect(insertedPost.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: "draft",
      content: "Telegram oficial\n\n👉 https://cacaoferta.com.br/go/tg_offer-1",
      affiliate_link_id: "link-1"
    }));
  });

  it("reutiliza o link persistido e não duplica URL já presente na copy", async () => {
    const trackedUrl = "https://caca-oferta-oficial.vercel.app/go/wp_offer-1";
    const persistedOffer = {
      ...offer,
      affiliateLinks: [{ channel: "whatsapp" as const, trackedUrl, subId: "wp_offer-1" }]
    };
    const link = chain({ data: { id: "link-wp" }, error: null });
    const noPost = chain({ data: null, error: null });
    const insertedPost = chain({ data: { id: "post-wp", affiliate_link_id: "link-wp", channel: "whatsapp", status: "draft" }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await adapter.persistDrafts({
      command: { ...command, channels: ["whatsapp"] },
      offer: persistedOffer,
      content: { ...content, channelCopies: { whatsapp: `Copy\n\n👉 Comprar:\n${trackedUrl}` } },
      channels: ["whatsapp"]
    });

    expect(link.upsert).toHaveBeenCalledWith(expect.objectContaining({ tracked_url: trackedUrl, sub_id: "wp_offer-1" }), { onConflict: "offer_id,channel" });
    expect(insertedPost.insert).toHaveBeenCalledWith(expect.objectContaining({ content: `Copy\n\n👉 Comprar:\n${trackedUrl}` }));
  });

  it("não adiciona URL direta ao draft do Instagram", async () => {
    const link = chain({ data: { id: "link-ig" }, error: null });
    const noPost = chain({ data: null, error: null });
    const insertedPost = chain({ data: { id: "post-ig", affiliate_link_id: "link-ig", channel: "instagram", status: "draft" }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(noPost).mockReturnValueOnce(insertedPost) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await adapter.persistDrafts({
      command: { ...command, channels: ["instagram"] },
      offer,
      content: { ...content, channelCopies: { instagram: "Link na bio do @caca.ofertaoficial" } },
      channels: ["instagram"]
    });

    expect(insertedPost.insert).toHaveBeenCalledWith(expect.objectContaining({ content: "Link na bio do @caca.ofertaoficial" }));
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

  it("atualiza somente o conteúdo de draft existente em regeneração Copy V2", async () => {
    const link = chain({ data: { id: "link-1" }, error: null });
    const existingPost = chain({ data: { id: "post-1", affiliate_link_id: "link-1", channel: "telegram", status: "draft" }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(existingPost).mockReturnValueOnce(existingPost) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await adapter.persistDrafts({
      command: { ...command, metadata: { copyV2: true, copyV2Regenerate: true } },
      offer,
      content: { ...content, channelCopies: { telegram: "Nova copy verificada" } },
      channels: ["telegram"]
    });

    expect(existingPost.update).toHaveBeenCalledWith(expect.objectContaining({ content: "Nova copy verificada\n\n👉 https://cacaoferta.com.br/go/tg_offer-1" }));
    expect(existingPost.insert).not.toHaveBeenCalled();
  });

  it("repara URL inválida ou duplicada ao regenerar draft existente", async () => {
    const link = chain({ data: { id: "link-1" }, error: null });
    const existingPost = chain({ data: { id: "post-1", affiliate_link_id: "link-1", channel: "telegram", status: "draft" }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(link).mockReturnValueOnce(existingPost).mockReturnValueOnce(existingPost) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await adapter.persistDrafts({
      command: { ...command, metadata: { copyV2: true, copyV2Regenerate: true } },
      offer,
      content: { ...content, channelCopies: { telegram: "Oferta\n👉 https://link-antigo.example/item\nhttps://link-duplicado.example/item" } },
      channels: ["telegram"]
    });

    expect(existingPost.update).toHaveBeenCalledWith(expect.objectContaining({
      content: "Oferta\n👉 https://cacaoferta.com.br/go/tg_offer-1"
    }));
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

  it("permite retry quando a execução anterior terminou rejeitada", async () => {
    const duplicate = chain({ data: null, error: null });
    duplicate.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    const stored = chain({
      data: {
        value: {
          fingerprint: "old-fingerprint",
          status: "completed",
          result: {
            status: "rejected", code: "PROVIDER_FAILURE", message: "provider down",
            commandId: "old-command", offerId: "offer-1", offerState: "pending_manual_review",
            failureStage: "provider", rejectedAt: "2026-07-15T14:00:00.000Z"
          }
        },
        created_at: "2026-07-15T14:00:00.000Z"
      },
      error: null
    });
    const retry = chain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(duplicate).mockReturnValueOnce(stored).mockReturnValueOnce(retry) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(adapter.begin("ai:draft:offer-1:v2", "new-fingerprint")).resolves.toEqual({ status: "started" });
    expect(retry.update).toHaveBeenCalledWith(expect.objectContaining({
      value: expect.objectContaining({ fingerprint: "new-fingerprint", status: "pending", startedAt: expect.any(String) })
    }));
  });

  it("classifica pending antigo como stale sem aguardar nem apagar a chave", async () => {
    const duplicate = chain({ data: null, error: null });
    duplicate.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    const stored = chain({
      data: {
        value: { fingerprint: "fingerprint", status: "pending" },
        created_at: "2020-01-01T00:00:00.000Z"
      },
      error: null
    });
    const client = { from: vi.fn().mockReturnValueOnce(duplicate).mockReturnValueOnce(stored) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(adapter.begin("ai:draft:old:v2", "fingerprint")).resolves.toMatchObject({
      status: "stale_pending",
      pendingSince: "2020-01-01T00:00:00.000Z"
    });
    expect(duplicate.delete).toBeUndefined();
  });

  it("retoma página stale no mesmo registro e audita sem apagar a chave", async () => {
    const duplicate = chain({ data: null, error: null });
    duplicate.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    const stored = chain({
      data: { value: { fingerprint: "fingerprint", status: "pending" }, created_at: "2020-01-01T00:00:00.000Z" },
      error: null
    });
    const restart = chain({ data: null, error: null });
    const audit = chain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(duplicate).mockReturnValueOnce(stored).mockReturnValueOnce(restart).mockReturnValueOnce(audit) };
    const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

    await expect(adapter.begin("ai:cycle:cycle-1:page:2:v1", "fingerprint")).resolves.toEqual({ status: "started" });
    expect(restart.update).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ status: "pending", startedAt: expect.any(String) }) }));
    expect(audit.insert).toHaveBeenCalledWith(expect.objectContaining({ action: "ai_cycle_page_stale_restarted" }));
    expect(restart.delete).toBeUndefined();
  });

  describe("findPendingWithoutDrafts (ADR-014 / V5 Bugfix)", () => {
    it("1. & 7. ORDER BY created_at ASC permanece preservado e limit e exclusão de offers com drafts são aplicados", async () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "10");
      const offersBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
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

      expect(offersBuilder.order).toHaveBeenCalledWith("created_at", { ascending: true });
      expect(offersBuilder.order).not.toHaveBeenCalledWith("discovered_at", expect.anything());
      expect(offersBuilder.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("offer-2");
      vi.unstubAllEnvs();
    });

    it("findPendingWithoutDrafts usa created_at ASC, limite 50 por padrão, exclui ofertas com drafts e faz chunking de 150 IDs", async () => {
      const fakeOffersData = Array.from({ length: 200 }, (_, i) => ({
        id: `offer-${i}`, user_id: "tenant-1", status: "pending_manual_review", platform: "Amazon",
        product_name: `Produto ${i}`, original_url: `https://amazon.com.br/dp/${i}`,
        image_url: `https://images.example.com/${i}.jpg`, current_price: 100 + i, old_price: 120 + i,
        category: "Casa", explainability: {}
      }));
      const offersQuery = chain({ data: fakeOffersData, error: null });
      const postsChunk1 = chain({ data: [{ offer_id: "offer-0" }, { offer_id: "offer-1" }], error: null });
      const postsChunk2 = chain({ data: [{ offer_id: "offer-160" }], error: null });
      const client = {
        from: vi.fn()
          .mockReturnValueOnce(offersQuery)
          .mockReturnValueOnce(postsChunk1)
          .mockReturnValueOnce(postsChunk2)
      };
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

      const pending = await adapter.findPendingWithoutDrafts("tenant-1");

      expect(client.from).toHaveBeenNthCalledWith(1, "offers");
      expect(offersQuery.eq).toHaveBeenCalledWith("user_id", "tenant-1");
      expect(offersQuery.eq).toHaveBeenCalledWith("status", "pending_manual_review");
      expect(offersQuery.order).toHaveBeenCalledWith("created_at", { ascending: true });
      expect(offersQuery.order).not.toHaveBeenCalledWith("discovered_at", expect.anything());
      expect(offersQuery.limit).toHaveBeenCalledWith(50);

      expect(client.from).toHaveBeenCalledTimes(3);
      expect(client.from).toHaveBeenNthCalledWith(2, "posts");
      expect(client.from).toHaveBeenNthCalledWith(3, "posts");
      expect(postsChunk1.in).toHaveBeenCalledWith("offer_id", fakeOffersData.slice(0, 150).map((o) => o.id));
      expect(postsChunk2.in).toHaveBeenCalledWith("offer_id", fakeOffersData.slice(150, 200).map((o) => o.id));

      expect(pending).toHaveLength(197);
      expect(pending.map((p) => p.id)).not.toContain("offer-0");
      expect(pending.map((p) => p.id)).not.toContain("offer-1");
      expect(pending.map((p) => p.id)).not.toContain("offer-160");
    });

    it("findPendingWithoutDrafts respeita OFFICIAL_AI_BATCH_SIZE do ambiente", async () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "25");
      try {
        const offersQuery = chain({ data: [], error: null });
        const client = { from: vi.fn().mockReturnValue(offersQuery) };
        const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

        await adapter.findPendingWithoutDrafts("tenant-1");
        expect(offersQuery.limit).toHaveBeenCalledWith(25);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("findPendingWithoutDrafts preserva code, message, details e hint de erros PostgREST e respeita tenant isolation", async () => {
      const postgrestError = {
        code: "42703",
        message: "column offers.discovered_at does not exist",
        details: "An error occurred executing query",
        hint: "Perhaps you meant created_at"
      };
      const offersQuery = chain({ data: null, error: postgrestError });
      const client = { from: vi.fn().mockReturnValue(offersQuery) };
      const adapter = new SupabaseOfficialAIAdapter(client as never, "tenant-1");

      await expect(adapter.findPendingWithoutDrafts("tenant-2")).resolves.toEqual([]);

      try {
        await adapter.findPendingWithoutDrafts("tenant-1");
        expect.unreachable("Deveria ter lançado erro");
      } catch (err: any) {
        expect(err.message).toContain("Official AI pending offers read failed: column offers.discovered_at does not exist");
        expect(err.code).toBe("42703");
        expect(err.details).toBe("An error occurred executing query");
        expect(err.hint).toBe("Perhaps you meant created_at");
      }
    });
  });

  describe("Configurable Official AI Batch Size (ADR-014)", () => {
    it("1. OFFICIAL_AI_BATCH_SIZE=50 -> retorna no máximo 50 offers via getOfficialAIBatchSize()", () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "50");
      expect(getOfficialAIBatchSize()).toBe(50);
      vi.unstubAllEnvs();
    });

    it("2. OFFICIAL_AI_BATCH_SIZE=10 -> retorna no máximo 10 via getOfficialAIBatchSize()", () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "10");
      expect(getOfficialAIBatchSize()).toBe(10);
      vi.unstubAllEnvs();
    });

    it("3. OFFICIAL_AI_BATCH_SIZE ausente -> usa 50 via getOfficialAIBatchSize()", () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "");
      expect(getOfficialAIBatchSize()).toBe(DEFAULT_BATCH_SIZE);
      vi.unstubAllEnvs();
    });

    it("4. OFFICIAL_AI_BATCH_SIZE=abc -> usa 50 via getOfficialAIBatchSize()", () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "abc");
      expect(getOfficialAIBatchSize()).toBe(DEFAULT_BATCH_SIZE);
      vi.unstubAllEnvs();
    });

    it("5. OFFICIAL_AI_BATCH_SIZE=-1 -> usa 50 via getOfficialAIBatchSize()", () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "-1");
      expect(getOfficialAIBatchSize()).toBe(DEFAULT_BATCH_SIZE);
      vi.unstubAllEnvs();
    });

    it("6. OFFICIAL_AI_BATCH_SIZE=2000 -> usa 1000 via getOfficialAIBatchSize()", () => {
      vi.stubEnv("OFFICIAL_AI_BATCH_SIZE", "2000");
      expect(getOfficialAIBatchSize()).toBe(1000);
      vi.unstubAllEnvs();
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
