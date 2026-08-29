import { describe, expect, it } from "vitest";
import {
  isTrendOfferApprovalEligible,
  resolveTrendOfferHandoff,
  resolveTrendOfferHandoffBlock,
} from "@/lib/trends/selection-offer-state";

describe("Trends offer handoff state", () => {
  it("reabre oferta rejected para um novo teste humano do Radar", () => {
    expect(resolveTrendOfferHandoff("rejected")).toBe("reopen");
    expect(resolveTrendOfferHandoffBlock("rejected")).toBeNull();
  });

  it("não cria bloqueio para estados reutilizáveis ou selecionáveis", () => {
    expect(resolveTrendOfferHandoffBlock("selected")).toBeNull();
    expect(resolveTrendOfferHandoffBlock("approved")).toBeNull();
    expect(resolveTrendOfferHandoffBlock("pending_manual_review")).toBeNull();
  });

  it("continua bloqueando estados realmente indisponíveis", () => {
    expect(resolveTrendOfferHandoff("posted")).toBe("reject");
    expect(resolveTrendOfferHandoffBlock("posted")).toEqual({
      code: "offer_unavailable",
      message: "Esta oportunidade está vinculada a uma oferta em estado posted e não pode ser aprovada automaticamente.",
    });
  });

  it("não considera oferta posted elegível para aparecer na fila do Radar", () => {
    expect(isTrendOfferApprovalEligible("posted")).toBe(false);
    expect(isTrendOfferApprovalEligible(" POSTED ")).toBe(false);
    expect(isTrendOfferApprovalEligible(null)).toBe(false);
    expect(isTrendOfferApprovalEligible("pending_manual_review")).toBe(true);
    expect(isTrendOfferApprovalEligible("selected")).toBe(true);
    expect(isTrendOfferApprovalEligible("approved")).toBe(true);
    expect(isTrendOfferApprovalEligible("rejected")).toBe(true);
  });
});
