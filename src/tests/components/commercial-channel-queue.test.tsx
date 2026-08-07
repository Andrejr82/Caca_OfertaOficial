import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommercialCurationPanel } from "@/components/offers/commercial-curation-panel";

const item = (overrides: any = {}) => ({ id: "1", platform: "Shopee", product_name: "Produto", current_price: 20, image_url: null, original_url: "https://example.test", achadinhoScore: 60, commercialIntent: "utilidade_casa_essencial", commercialRiskFlags: [], commercialReasons: ["útil"], automaticEligible: true, manualReviewRequired: false, rejected: false, suggestedCopy: "copy", ...overrides });

describe("commercial queue uses the legacy panel", () => {
  it("keeps approval preparation and removes the manual copy action", () => {
    render(<CommercialCurationPanel candidates={[item()]} />);
    expect(screen.getByRole("button", { name: "Preparar aprovação" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copiar copy" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver oferta" }).getAttribute("href")).toBe("https://example.test");
  });
});
