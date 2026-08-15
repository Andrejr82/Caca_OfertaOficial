import { describe, expect, it } from "vitest";

const AUTO_REEL_MODULE = "@/lib/videos/auto-reel";

const offer = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Tênis casual masculino",
  price: 129.9,
  marketplace: "Shopee",
  imageUrl: "https://cdn.example.com/products/tenis.jpg",
};

const visualAnalysis = {
  visualScore: 86,
  productCoherent: true,
  verticalSuitable: true,
  productVisible: true,
  durationSeconds: 11.8,
  visualRisks: [],
};

async function autoReel() {
  return import(AUTO_REEL_MODULE);
}

describe("Reels Studio Automático — contrato de oferta real", () => {
  it("constrói snapshot factual a partir do offerId e não de dados arbitrários do cliente", async () => {
    const { buildOfferSnapshot } = await autoReel();
    const snapshot = await buildOfferSnapshot({
      offerId: offer.id,
      userId: offer.ownerId,
      clientProduct: { ...offer, title: "título adulterado", price: 0 },
      offerRepository: { findOwnedOffer: async () => offer },
    });

    expect(snapshot).toEqual({
      offerId: offer.id,
      title: offer.title,
      price: offer.price,
      marketplace: offer.marketplace,
      imageUrl: offer.imageUrl,
    });
  });

  it("rejeita offerId inexistente", async () => {
    const { buildOfferSnapshot } = await autoReel();
    await expect(buildOfferSnapshot({
      offerId: "22222222-2222-4222-8222-222222222222",
      userId: offer.ownerId,
      offerRepository: { findOwnedOffer: async () => null },
    })).rejects.toThrow();
  });

  it("rejeita oferta pertencente a outro usuário", async () => {
    const { buildOfferSnapshot } = await autoReel();
    await expect(buildOfferSnapshot({
      offerId: offer.id,
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      offerRepository: { findOwnedOffer: async () => null },
    })).rejects.toThrow();
  });

  it("rejeita geração sem imagem, preço ou título factual", async () => {
    const { buildOfferSnapshot } = await autoReel();

    for (const incomplete of [
      { ...offer, imageUrl: null },
      { ...offer, price: null },
      { ...offer, title: "" },
    ]) {
      await expect(buildOfferSnapshot({
        offerId: offer.id,
        userId: offer.ownerId,
        offerRepository: { findOwnedOffer: async () => incomplete },
      })).rejects.toThrow();
    }
  });
});

describe("Reels Studio Automático — criação e estados", () => {
  it("cria job auto-generated-reel com snapshot, estilo e estado inicial", async () => {
    const { createAutoReelJob } = await autoReel();
    const job = await createAutoReelJob({
      offerId: offer.id,
      userId: offer.ownerId,
      offerRepository: { findOwnedOffer: async () => offer },
    });

    expect(job).toMatchObject({
      source: "auto-generated-reel",
      type: "auto-generated-reel",
      offerId: offer.id,
      productSnapshot: offer,
      style: "demonstrative-reel",
      status: "queued",
      stage: "queued",
      attempt: 1,
    });
    expect(job.source).not.toBe("authorized-reel-v1");
  });

  it("aceita somente transições lineares válidas até ready_for_review", async () => {
    const { transitionAutoReelJob } = await autoReel();
    let job = { status: "queued" };

    for (const status of ["planning", "generating_visual", "scenes_ready", "analyzing", "dubbing", "rendering", "ready_for_review"]) {
      job = transitionAutoReelJob(job, status);
      expect(job.status).toBe(status);
    }
  });

  it("rejeita transições impossíveis e preserva estados finais", async () => {
    const { transitionAutoReelJob } = await autoReel();
    expect(() => transitionAutoReelJob({ status: "queued" }, "dubbing")).toThrow();
    expect(() => transitionAutoReelJob({ status: "approved" }, "queued")).toThrow();
    expect(() => transitionAutoReelJob({ status: "failed" }, "ready_for_review")).toThrow();
  });
});

describe("Reels Studio Automático — qualidade e factualidade", () => {
  it("valida o contrato bounded da análise visual", async () => {
    const { validateVisualAnalysis } = await autoReel();
    expect(validateVisualAnalysis(visualAnalysis)).toEqual(visualAnalysis);
    expect(() => validateVisualAnalysis({ ...visualAnalysis, visualScore: 101 })).toThrow();
  });

  it("falha fechado quando o produto não é coerente antes de dubbing ou ready", async () => {
    const { canAdvanceFromVisualAnalysis } = await autoReel();
    const rejected = { ...visualAnalysis, productCoherent: false };

    expect(canAdvanceFromVisualAnalysis(rejected, "dubbing")).toBe(false);
    expect(canAdvanceFromVisualAnalysis(rejected, "ready_for_review")).toBe(false);
  });

  it("envia ao Dubbing V2 somente o snapshot factual, sem fatos do conceito visual", async () => {
    const { buildDubbingV2Payload } = await autoReel();
    const payload = buildDubbingV2Payload({ productSnapshot: offer }, {
      visualConcept: "modelo usando o produto em uma viagem internacional",
      inventedBrand: "Marca Inventada",
    });

    expect(payload.productSnapshot).toEqual(offer);
    expect(JSON.stringify(payload)).not.toContain("Marca Inventada");
    expect(JSON.stringify(payload)).not.toContain("viagem internacional");
  });
});

describe("Reels Studio Automático — regeneração e aprovação", () => {
  it("gera nova tentativa sem sobrescrever a tentativa anterior", async () => {
    const { regenerateAutoReel } = await autoReel();
    const previous = { id: "job-1", offerId: offer.id, attempt: 1, videoUrl: "old.mp4" };
    const regenerated = await regenerateAutoReel(previous);

    expect(regenerated.offerId).toBe(offer.id);
    expect(regenerated.attempt).toBe(2);
    expect(regenerated.id).not.toBe(previous.id);
    expect(regenerated.videoUrl).not.toBe(previous.videoUrl);
    expect(previous).toEqual({ id: "job-1", offerId: offer.id, attempt: 1, videoUrl: "old.mp4" });
  });

  it("permite aprovação somente em ready_for_review e nunca publica automaticamente", async () => {
    const { approveAutoReel } = await autoReel();
    const approved = await approveAutoReel({ status: "ready_for_review" });

    expect(approved.status).toBe("approved");
    expect(approved.published).not.toBe(true);
    expect(() => approveAutoReel({ status: "queued" })).toThrow();
    expect(() => approveAutoReel({ status: "failed" })).toThrow();
  });

  it("rejeição e falha não publicam", async () => {
    const { rejectAutoReel, failAutoReel } = await autoReel();
    expect((await rejectAutoReel({ status: "ready_for_review" })).published).not.toBe(true);
    expect((await failAutoReel({ status: "rendering" })).published).not.toBe(true);
  });
});
