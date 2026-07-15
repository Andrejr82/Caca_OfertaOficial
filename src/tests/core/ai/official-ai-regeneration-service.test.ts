import { describe, expect, it, vi } from "vitest";
import {
  regenerateOfficialDrafts,
  buildCopyV2ChannelCopy,
  type OfficialAIDraftForRegeneration,
  type OfficialAIRegenerationCommand,
  type OfficialAIRegenerationDependencies
} from "@/core/ai";

const command: OfficialAIRegenerationCommand = {
  contractVersion: "pmav5.ai-regeneration/v1",
  commandId: "regen-1",
  correlationId: "correlation-1",
  tenantId: "tenant-1",
  filters: { marketplace: "Shopee", channel: "whatsapp", postIds: ["post-1"] }
};

const draft: OfficialAIDraftForRegeneration = {
  postId: "post-1",
  offerId: "offer-1",
  affiliateLinkId: "link-1",
  channel: "whatsapp",
  status: "draft",
  createdAt: "2026-07-15T10:00:00.000Z",
  currentContent: "Olá! Temos um novo tênis que você vai amar.",
  trackedUrl: "https://cacaoferta.com.br/go/wa_offer1",
  marketplace: "Shopee",
  productName: "Tênis Casual Feminino",
  currentPrice: 79.9,
  originalPrice: 99.9,
  category: "Calçados",
  shippingFree: null,
  rating: null,
  coupon: null,
  evidence: {}
};

const generatedContent = {
  title: "Tênis Casual Feminino",
  description: "Oferta objetiva.",
  shortCopy: "Tênis Casual Feminino por R$ 79,90.",
  longCopy: "Tênis Casual Feminino por R$ 79,90 na Shopee.",
  hashtags: ["#oferta"],
  callToAction: "Aproveite",
  highlights: ["Preço atual"],
  explanation: "Somente fatos fornecidos.",
  channelCopies: {
    whatsapp: "👟 *Tênis Casual Feminino*\n\n💰 R$ 79,90\n\n🛒 Aproveite:"
  }
};

function dependencies(content = generatedContent): OfficialAIRegenerationDependencies {
  return {
    drafts: {
      findDrafts: vi.fn().mockResolvedValue([draft]),
      updateContent: vi.fn().mockResolvedValue(true)
    },
    providers: {
      resolve: vi.fn().mockReturnValue({
        name: "groq",
        model: "model",
        generate: vi.fn().mockResolvedValue({
          content,
          provider: "groq",
          model: "model",
          latencyMs: 10
        })
      })
    },
  };
}

describe("regenerateOfficialDrafts", () => {
  it("filtra drafts existentes e atualiza somente conteúdo, preservando identidade", async () => {
    const deps = dependencies();

    const result = await regenerateOfficialDrafts(command, deps);

    expect(deps.drafts.findDrafts).toHaveBeenCalledWith("tenant-1", command.filters);
    expect(deps.drafts.updateContent).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      postId: "post-1",
      expectedContent: draft.currentContent,
      content: `${buildCopyV2ChannelCopy(draft, "whatsapp")}\n\n${draft.trackedUrl}`
    });
    expect(result.items[0]).toMatchObject({
      postId: "post-1",
      offerId: "offer-1",
      affiliateLinkId: "link-1",
      channel: "whatsapp",
      status: "draft",
      createdAt: draft.createdAt,
      beforeContent: draft.currentContent
    });
  });

  it.each([
    "Olá! Temos um novo tênis.",
    "Confira o tênis por R$ 79,90.",
    "Olá! Tênis por R$ 79,90.",
    "Tênis por R$ 79,90 [link]",
    "Tênis: https://link-inventado.example",
    "Tênis: www.link-inventado.example"
  ])("recusa copy genérica ou com dado não sustentado: %s", async (copy) => {
    const deps = dependencies({
      ...generatedContent,
      channelCopies: { whatsapp: copy }
    });

    const result = await regenerateOfficialDrafts(command, deps);

    expect(result).toMatchObject({ matched: 1, updated: 0, failed: 1 });
    expect(deps.drafts.updateContent).not.toHaveBeenCalled();
  });

  it("retorna no-op sem exigir provider quando nenhum draft corresponde", async () => {
    const deps = dependencies();
    vi.mocked(deps.drafts.findDrafts).mockResolvedValue([]);
    vi.mocked(deps.providers.resolve).mockImplementation(() => { throw new Error("provider ausente"); });
    await expect(regenerateOfficialDrafts(command, deps)).resolves.toMatchObject({ matched: 0, updated: 0, failed: 0 });
    expect(deps.providers.resolve).not.toHaveBeenCalled();
  });

  it("descarta alegações inventadas pelo provider e renderiza somente fatos confiáveis", async () => {
    const deps = dependencies({
      ...generatedContent,
      channelCopies: { whatsapp: "Frete grátis, 10x sem juros e estoque acabando por R$ 1,99." }
    });
    await expect(regenerateOfficialDrafts(command, deps)).resolves.toMatchObject({ updated: 1, failed: 0 });
    expect(deps.drafts.updateContent).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.not.stringMatching(/frete grátis|10x|estoque|R\$ 1,99/iu)
    }));
  });

  it("retorna cursor somente para lote completo e totalmente atualizado", async () => {
    const deps = dependencies();
    const drafts = Array.from({ length: 5 }, (_, index) => ({
      ...draft,
      postId: `00000000-0000-4000-8000-00000000000${index}`,
      createdAt: index === 4 ? "2026-07-15T10:00:04+00:00" : `2026-07-15T10:00:0${index}.000Z`
    }));
    vi.mocked(deps.drafts.findDrafts).mockResolvedValue(drafts);

    const result = await regenerateOfficialDrafts({ ...command, filters: { limit: 5 } }, deps);

    expect(result.nextCursor).toEqual({
      createdAt: "2026-07-15T10:00:04.000Z",
      postId: drafts[4].postId
    });
  });

  it("não retorna cursor após falha parcial", async () => {
    const deps = dependencies();
    const drafts = Array.from({ length: 5 }, (_, index) => ({ ...draft, postId: `post-${index}` }));
    vi.mocked(deps.drafts.findDrafts).mockResolvedValue(drafts);
    vi.mocked(deps.drafts.updateContent).mockResolvedValueOnce(false);

    const result = await regenerateOfficialDrafts({ ...command, filters: { limit: 5 } }, deps);

    expect(result).toMatchObject({ matched: 5, updated: 4, failed: 1, nextCursor: null });
  });
});
