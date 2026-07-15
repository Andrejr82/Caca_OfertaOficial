import { describe, expect, it, vi } from "vitest";
import { SupabaseOfficialAIRegenerationAdapter } from "@/lib/ai/official/supabase-official-ai-adapter";

describe("SupabaseOfficialAIRegenerationAdapter", () => {
  it("lê somente drafts e aplica filtros de canal, IDs e marketplace", async () => {
    const rows = [{
      id: "post-1", offer_id: "offer-1", affiliate_link_id: "link-1",
      channel: "telegram", status: "draft", content: "antes", created_at: "2026-07-15T10:00:00.000Z",
      offers: { platform: "Shopee", product_name: "Produto", current_price: 10, old_price: 20, category: "Casa" },
      affiliate_links: { id: "link-1", tracked_url: "https://cacaoferta.com.br/go/tg_offer1" }
    }];
    const query: any = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null })
    };
    const client = { from: vi.fn().mockReturnValue(query) };
    const adapter = new SupabaseOfficialAIRegenerationAdapter(client as never, "tenant-1");

    const result = await adapter.findDrafts("tenant-1", {
      marketplace: "shopee", channel: "telegram", postIds: ["post-1", "post-1"]
    });

    expect(client.from).toHaveBeenCalledWith("posts");
    expect(query.eq).toHaveBeenCalledWith("user_id", "tenant-1");
    expect(query.eq).toHaveBeenCalledWith("status", "draft");
    expect(query.eq).toHaveBeenCalledWith("channel", "telegram");
    expect(query.in).toHaveBeenCalledWith("id", ["post-1"]);
    expect(query.ilike).toHaveBeenCalledWith("offers.platform", "shopee");
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(result[0]).toMatchObject({
      postId: "post-1", offerId: "offer-1", affiliateLinkId: "link-1",
      channel: "telegram", status: "draft", marketplace: "Shopee"
    });
  });

  it("atualiza somente content com guarda de tenant, id, conteúdo anterior e status draft", async () => {
    const update: any = {
      update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "post-1" }, error: null })
    };
    const client = { from: vi.fn().mockReturnValue(update) };
    const adapter = new SupabaseOfficialAIRegenerationAdapter(client as never, "tenant-1");

    await expect(adapter.updateContent({
      tenantId: "tenant-1", postId: "post-1", expectedContent: "antes", content: "depois"
    })).resolves.toBe(true);

    expect(update.update).toHaveBeenCalledWith({ content: "depois" });
    expect(update.eq).toHaveBeenCalledWith("user_id", "tenant-1");
    expect(update.eq).toHaveBeenCalledWith("id", "post-1");
    expect(update.eq).toHaveBeenCalledWith("status", "draft");
    expect(update.eq).toHaveBeenCalledWith("content", "antes");
    expect(update.insert).toBeUndefined();
    expect(update.delete).toBeUndefined();
    expect(update.upsert).toBeUndefined();
  });

  it("lista explícita vazia não degenera para regenerar todos", async () => {
    const client = { from: vi.fn() };
    const adapter = new SupabaseOfficialAIRegenerationAdapter(client as never, "tenant-1");
    await expect(adapter.findDrafts("tenant-1", { postIds: [] })).resolves.toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("não altera tenant diferente", async () => {
    const client = { from: vi.fn() };
    const adapter = new SupabaseOfficialAIRegenerationAdapter(client as never, "tenant-1");
    await expect(adapter.updateContent({ tenantId: "tenant-2", postId: "post-1", expectedContent: "antes", content: "depois" })).resolves.toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("ignora linha que deixou de ser draft", async () => {
    const query: any = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: "post-1", status: "published", offers: {}, affiliate_links: {} }], error: null
      })
    };
    const adapter = new SupabaseOfficialAIRegenerationAdapter({ from: vi.fn().mockReturnValue(query) } as never, "tenant-1");
    await expect(adapter.findDrafts("tenant-1", {})).resolves.toEqual([]);
  });

  it("aplica cursor estável e limita o lote solicitado", async () => {
    const query: any = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null })
    };
    const adapter = new SupabaseOfficialAIRegenerationAdapter({ from: vi.fn().mockReturnValue(query) } as never, "tenant-1");

    await adapter.findDrafts("tenant-1", {
      limit: 5,
      after: { createdAt: "2026-07-15T10:00:00.000Z", postId: "00000000-0000-4000-8000-000000000001" }
    });

    expect(query.or).toHaveBeenCalledWith(
      "created_at.gt.2026-07-15T10:00:00.000Z,and(created_at.eq.2026-07-15T10:00:00.000Z,id.gt.00000000-0000-4000-8000-000000000001)"
    );
    expect(query.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: true });
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  it("rejeita cursor malformado antes de interpolar o filtro", async () => {
    const query: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn() };
    const adapter = new SupabaseOfficialAIRegenerationAdapter({ from: vi.fn().mockReturnValue(query) } as never, "tenant-1");
    await expect(adapter.findDrafts("tenant-1", {
      after: { createdAt: "2026-07-15", postId: "id),status.eq.published" }
    })).rejects.toThrow("INVALID_REGENERATION_CURSOR");
    expect(query.or).not.toHaveBeenCalled();
  });

  it("escapa curingas no filtro exato de marketplace", async () => {
    const query: any = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null })
    };
    const adapter = new SupabaseOfficialAIRegenerationAdapter({ from: vi.fn().mockReturnValue(query) } as never, "tenant-1");
    await adapter.findDrafts("tenant-1", { marketplace: "Shop%_ee" });
    expect(query.ilike).toHaveBeenCalledWith("offers.platform", "Shop\\%\\_ee");
  });
});
