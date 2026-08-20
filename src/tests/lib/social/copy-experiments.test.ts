import { describe, expect, it } from "vitest";
import { evaluateSocialCopyExperiment } from "@/lib/social/copy-experiments";
import { buildSocialCommercialTelemetrySnapshot } from "@/lib/social/commercial-telemetry";

function snapshot(input: {
  impressions?: number | null;
  clicks?: number;
  purchases?: number;
  earnings?: number | null;
}) {
  return buildSocialCommercialTelemetrySnapshot({
    offerId: "jiesipote",
    channel: "whatsapp",
    published: true,
    impressions: input.impressions ?? null,
    clicks: input.clicks ?? 0,
    purchases: input.purchases ?? 0,
    affiliateEarningsBRL: input.earnings ?? null,
  });
}

describe("Task 8 — Experimentos A/B de Copy", () => {
  it("mantém learning quando a exposição mínima ainda não foi atingida", () => {
    const result = evaluateSocialCopyExperiment("exp-1", [
      { variantId: "proof-a", angle: "proof", telemetry: snapshot({ impressions: 100, clicks: 8 }) },
      { variantId: "price-b", angle: "price", telemetry: snapshot({ impressions: 110, clicks: 10 }) },
    ]);

    expect(result.status).toBe("learning");
    expect(result.metric).toBeNull();
    expect(result.leaderVariantId).toBeNull();
    expect(result.reasons).toContain("minimum_exposure_not_reached");
  });

  it("usa conversão como métrica prioritária quando todos têm cliques suficientes", () => {
    const result = evaluateSocialCopyExperiment("exp-2", [
      { variantId: "proof-a", angle: "proof", telemetry: snapshot({ impressions: 1000, clicks: 50, purchases: 3, earnings: 15 }) },
      { variantId: "saving-b", angle: "saving", telemetry: snapshot({ impressions: 1000, clicks: 50, purchases: 1, earnings: 5 }) },
    ]);

    expect(result.status).toBe("leader");
    expect(result.metric).toBe("conversion_rate");
    expect(result.leaderVariantId).toBe("proof-a");
    expect(result.leaderAngle).toBe("proof");
  });

  it("usa CTR quando não há cliques suficientes para comparar conversão mas há impressões suficientes", () => {
    const result = evaluateSocialCopyExperiment("exp-3", [
      { variantId: "price-a", angle: "price", telemetry: snapshot({ impressions: 500, clicks: 15 }) },
      { variantId: "standard-b", angle: "standard", telemetry: snapshot({ impressions: 500, clicks: 8 }) },
    ]);

    expect(result.status).toBe("leader");
    expect(result.metric).toBe("ctr");
    expect(result.leaderVariantId).toBe("price-a");
    expect(result.leaderAngle).toBe("price");
  });

  it("não declara líder quando a vantagem observada é pequena", () => {
    const result = evaluateSocialCopyExperiment("exp-4", [
      { variantId: "proof-a", angle: "proof", telemetry: snapshot({ impressions: 1000, clicks: 100, purchases: 5 }) },
      { variantId: "benefit-b", angle: "benefit", telemetry: snapshot({ impressions: 1000, clicks: 95, purchases: 5 }) },
    ]);

    expect(result.status).toBe("learning");
    expect(result.leaderVariantId).toBeNull();
    expect(result.reasons).toContain("no_clear_observational_lead");
  });

  it("impede comparar ofertas ou canais diferentes", () => {
    const base = snapshot({ impressions: 500, clicks: 30 });
    const otherOffer = { ...base, offerId: "outra-oferta" };

    expect(() => evaluateSocialCopyExperiment("exp-5", [
      { variantId: "proof-a", angle: "proof", telemetry: base },
      { variantId: "price-b", angle: "price", telemetry: otherOffer },
    ])).toThrow(/same offer and channel/iu);
  });

  it("impede ângulos e ids duplicados no mesmo experimento", () => {
    const telemetry = snapshot({ impressions: 500, clicks: 30 });

    expect(() => evaluateSocialCopyExperiment("exp-6", [
      { variantId: "a", angle: "proof", telemetry },
      { variantId: "b", angle: "proof", telemetry },
    ])).toThrow(/Duplicate social copy experiment angle/iu);

    expect(() => evaluateSocialCopyExperiment("exp-7", [
      { variantId: "a", angle: "proof", telemetry },
      { variantId: "a", angle: "price", telemetry },
    ])).toThrow(/Duplicate social copy experiment variantId/iu);
  });
});
