import { describe, expect, it } from "vitest";
import {
  resolveTrendOfferHandoff,
  resolveTrendOfferHandoffBlock,
  TREND_REJECTED_OFFER_MESSAGE,
} from "@/lib/trends/selection-offer-state";

describe("Trends offer handoff state", () => {
  it("bloqueia oferta rejected com feedback controlado", () => {
    expect(resolveTrendOfferHandoff("rejected")).toBe("reject");
    expect(resolveTrendOfferHandoffBlock("rejected")).toEqual({
      code: "offer_rejected",
      message: TREND_REJECTED_OFFER_MESSAGE,
    });
  });

  it("não cria bloqueio para estados reutilizáveis ou selecionáveis", () => {
    expect(resolveTrendOfferHandoffBlock("selected")).toBeNull();
    expect(resolveTrendOfferHandoffBlock("approved")).toBeNull();
    expect(resolveTrendOfferHandoffBlock("pending_manual_review")).toBeNull();
  });
});
