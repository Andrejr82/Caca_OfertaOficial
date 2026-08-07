import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommercialCurationPanel } from "@/components/offers/commercial-curation-panel";

const candidate: any = {
  id: "offer-1", platform: "Shopee", product_name: "Organizador de gaveta", current_price: 39,
  image_url: null, original_url: "https://example.test", commercialIntent: "casa_organizada_antes_depois",
  achadinhoScore: 82.5, automaticEligible: true, manualReviewRequired: false, rejected: false,
  commercialReasons: ["preço na faixa preferencial"], commercialRiskFlags: [], recommendedChannel: "telegram",
  suggestedCopy: "🔥 Organização simples que ajuda de verdade\n\nOrganizador de gaveta\n💰 R$ 39,00\n\n🔗 Ver oferta",
};

describe("CommercialCurationPanel", () => {
  it("renders an empty queue safely and exposes the legacy preparation control", () => {
    render(<CommercialCurationPanel candidates={[]} />);
    expect(screen.getByText("Curadoria Comercial")).toBeTruthy();
    expect(screen.getAllByText("Sem candidatos.").length).toBe(3);
    render(<CommercialCurationPanel candidates={[candidate]} />);
    expect(screen.queryByRole("button", { name: "Copiar copy" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver oferta" }).getAttribute("href")).toBe(candidate.original_url);
    window.confirm = () => false;
    fireEvent.click(screen.getByRole("button", { name: "Preparar aprovação" }));
    expect(screen.getByLabelText("Canal do draft Organizador de gaveta")).toBeTruthy();
  });
});
