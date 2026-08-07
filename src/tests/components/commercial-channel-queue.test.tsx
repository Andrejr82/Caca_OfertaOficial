import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommercialChannelQueue } from "@/components/offers/commercial-channel-queue";

const item = (overrides: any = {}) => ({ id: "1", platform: "Shopee", product_name: "Produto", category: "Casa", subcategory: "Organização", current_price: 20, image_url: null, original_url: "https://example.test", targetQueue: "manual_whatsapp", achadinhoScore: 60, commercialIntent: "utilidade_casa_essencial", commercialRiskFlags: [], commercialReasons: ["útil"], reason: "manual", suggestedCopy: "copy", caption: "caption", reelsHook: "hook", reelsScript: "script", priority: 1, ...overrides });

describe("CommercialChannelQueue", () => {
  it("keeps counts aligned with marketplace/category filters and empty state", () => {
    render(<CommercialChannelQueue candidates={[item(), item({ id: "2", platform: "Mercado Livre", category: "Tech" })]} targetQueue="manual_whatsapp" title="WhatsApp" />);
    expect(screen.getByText("2 itens")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Filtro marketplace"), { target: { value: "Mercado Livre" } });
    expect(screen.getByText("1 itens")).toBeTruthy();
    expect(screen.getByText("Produto")).toBeTruthy();
  });
});
