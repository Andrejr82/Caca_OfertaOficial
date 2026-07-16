import { describe, expect, it, vi } from "vitest";
import {
  buildExpectedContent,
  createOperationalClient,
  runBackfill,
  type BackfillDraft,
  type BackfillRepository
} from "../../../scripts/backfill-opac-drafts";

const draft: BackfillDraft = {
  id: "post-1",
  user_id: "user-1",
  offer_id: "offer-1",
  affiliate_link_id: "link-1",
  channel: "whatsapp",
  status: "draft",
  content: "copy antiga https://old.example/oferta",
  created_at: "2026-07-15T10:00:00.000Z",
  deleted_at: null,
  deleted_by: null,
  offers: {
    id: "offer-1",
    platform: "Shopee",
    product_name: "Fone Bluetooth 5.3",
    current_price: 79.9,
    old_price: 99.9,
    category: "Eletrônicos",
    explainability: {}
  },
  affiliate_links: {
    id: "link-1",
    tracked_url: "https://cacaoferta.com.br/go/wa_offer1"
  }
};
const trackedUrl = "https://cacaoferta.com.br/go/wa_offer1";

function repository(rows: BackfillDraft[] = [draft]): BackfillRepository & {
  fetchDraftBatch: ReturnType<typeof vi.fn>;
  updateContent: ReturnType<typeof vi.fn>;
} {
  return {
    fetchDraftBatch: vi.fn(async (offset: number, limit: number) => rows.slice(offset, offset + limit)),
    updateContent: vi.fn().mockResolvedValue({ updated: true })
  };
}

describe("backfill-opac-drafts", () => {
  it("configura transporte WebSocket explícito para Node 20", () => {
    const factory = vi.fn().mockReturnValue({});
    const transport = vi.fn();

    createOperationalClient("https://project.supabase.co", "service-key", factory, transport);

    expect(factory).toHaveBeenCalledWith("https://project.supabase.co", "service-key", {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport }
    });
  });

  it("dry-run não escreve", async () => {
    const repo = repository();

    const result = await runBackfill(repo, { dryRun: true });

    expect(result.needsUpdate).toBe(1);
    expect(result.updated).toBe(0);
    expect(repo.updateContent).not.toHaveBeenCalled();
  });

  it("ignora conteúdo que já corresponde ao renderer oficial", async () => {
    const correct = { ...draft, content: buildExpectedContent(draft) };
    const repo = repository([correct]);

    const result = await runBackfill(repo, { dryRun: false });

    expect(result.alreadyCorrect).toBe(1);
    expect(result.updated).toBe(0);
    expect(repo.updateContent).not.toHaveBeenCalled();
  });

  it("atualiza conteúdo antigo", async () => {
    const repo = repository();

    const result = await runBackfill(repo, { dryRun: false });

    expect(result.updated).toBe(1);
    expect(repo.updateContent).toHaveBeenCalledWith({
      postId: draft.id,
      currentContent: draft.content,
      content: buildExpectedContent(draft)
    });
  });

  it("anexa o tracked_url exatamente uma vez", () => {
    const withDuplicatedOldLink = {
      ...draft,
      content: `legado ${trackedUrl} ${trackedUrl}`
    };

    const expected = buildExpectedContent(withDuplicatedOldLink);

    expect(expected.split(trackedUrl).length - 1).toBe(1);
  });

  it("envia somente content ao update", async () => {
    const repo = repository();

    await runBackfill(repo, { dryRun: false });

    const input = repo.updateContent.mock.calls[0][0];
    expect(Object.keys(input).sort()).toEqual(["content", "currentContent", "postId"]);
    expect(input).not.toHaveProperty("status");
    expect(input).not.toHaveProperty("offer_id");
  });

  it("continua o lote quando um update individual falha", async () => {
    const second = { ...draft, id: "post-2", content: "outra copy antiga" };
    const repo = repository([draft, second]);
    repo.updateContent
      .mockResolvedValueOnce({ updated: false, error: "falha simulada" })
      .mockResolvedValueOnce({ updated: true });

    const result = await runBackfill(repo, { dryRun: false, updateConcurrency: 1 });

    expect(repo.updateContent).toHaveBeenCalledTimes(2);
    expect(result.updated).toBe(1);
    expect(result.failures).toEqual([{ postId: "post-1", reason: "falha simulada" }]);
  });

  it("não chama provider ou rede de IA", async () => {
    const provider = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = provider as typeof fetch;
    try {
      await runBackfill(repository(), { dryRun: true });
      expect(provider).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
