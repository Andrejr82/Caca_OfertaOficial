import { describe, it, expect, vi } from "vitest";
import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";
import { calibrateCandidateScore } from "@/core/offer-selection/score-calibration";
import { computeIdentityGroups } from "@/core/offer-selection/identity-groups";

describe("Sprint 8 — Rastreabilidade, Audit Trace e Persistência Canônica", () => {
  it("garante que a decisão canônica carrega metadados completos para persistência de explainability", () => {
    const candidate = normalizeCandidateToV2(
      {
        marketplace: "Amazon",
        sourceItemId: "B09ABCDE",
        title: "Notebook Acer Aspire 5 Intel Core i5",
        currentPrice: 2499,
        originalPrice: 3199,
        productRole: "main_product",
        classification: { status: "classified", productType: "notebook" },
        marketplaceMetrics: { rating: 4.8, reviewCount: 1200, prime: true, shippingFree: true },
      },
      {
        correlationId: "run-cycle-12345",
        discoveredAt: "2026-09-07T18:00:00.000Z",
      },
    );

    const score = calibrateCandidateScore(candidate);
    const groups = computeIdentityGroups(candidate);

    const explainabilityPayload = {
      decision_version: candidate.contractVersion,
      score_breakdown: score,
      reasons: candidate.reasons,
      freshness: candidate.freshness,
      group_key: groups.familyKey || groups.exactKey,
      queue_selected: candidate.decision === "selected",
      audit_trace: candidate.trace,
    };

    expect(explainabilityPayload.decision_version).toBe("candidate-decision/v2");
    expect(explainabilityPayload.score_breakdown.version).toBe("candidate-decision/v2");
    expect(explainabilityPayload.audit_trace.correlationId).toBe("run-cycle-12345");
    expect(explainabilityPayload.audit_trace.discoveredAt).toBe("2026-09-07T18:00:00.000Z");
    expect(explainabilityPayload.freshness.state).toBe("new");
    expect(explainabilityPayload.queue_selected).toBe(true);
  });

  it("garante idempotência na geração de chaves de auditoria com os mesmos dados de entrada", () => {
    const rawInput = {
      marketplace: "Shopee",
      sourceItemId: "998877",
      title: "Teclado Mecânico Redragon Kumara",
      currentPrice: 179.9,
    };

    const c1 = normalizeCandidateToV2(rawInput, { correlationId: "idemp-01" });
    const c2 = normalizeCandidateToV2(rawInput, { correlationId: "idemp-01" });

    expect(c1.candidateId).toBe(c2.candidateId);
    expect(c1.nativeIdentity).toBe(c2.nativeIdentity);
    expect(c1.identityGroup.exactKey).toBe(c2.identityGroup.exactKey);
  });
});
