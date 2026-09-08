import { describe, it, expect, vi } from "vitest";
import { selectCycleCommercialPortfolio } from "@/lib/ai/official/select-cycle-commercial-portfolio";

describe("selectCycleCommercialPortfolio V2", () => {
  it("retorna lista vazia quando nenhum offerId é fornecido", async () => {
    const supabase = {};
    const result = await selectCycleCommercialPortfolio(supabase, "user-1", []);
    expect(result.received).toBe(0);
    expect(result.selected).toBe(0);
    expect(result.selectedOfferIds).toEqual([]);
  });

  it("seleciona ofertas aprovadas usando o motor de portfólio V2 determinístico", async () => {
    const mockData = [
      {
        id: "offer-1",
        product_name: "Monitor Gamer 24",
        platform: "Amazon",
        current_price: 799.9,
        old_price: 999.9,
        category: "informatica",
        status: "approved",
        explainability: {
          score: {
            total: 88,
            semantic: 25,
            evidence: 23,
            value: 20,
            logistics: 10,
            freshness: 10,
            version: "candidate-decision/v2",
          },
        },
      },
      {
        id: "offer-2",
        product_name: "Mouse Sem Fio",
        platform: "Shopee",
        current_price: 39.9,
        old_price: 59.9,
        category: "informatica",
        status: "approved",
        explainability: {
          score: {
            total: 75,
            semantic: 20,
            evidence: 20,
            value: 15,
            logistics: 10,
            freshness: 10,
            version: "candidate-decision/v2",
          },
        },
      },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    };

    const result = await selectCycleCommercialPortfolio(supabase, "user-1", ["offer-1", "offer-2"]);
    expect(result.received).toBe(2);
    expect(result.selected).toBe(2);
    expect(result.selectedOfferIds).toEqual(["offer-1", "offer-2"]);
    expect(result.rejected).toBe(0);
  });

  it("lança erro se coorte aprovada estiver vazia", async () => {
    const mockData = [
      {
        id: "offer-1",
        status: "rejected",
      },
    ];

    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    };

    await expect(
      selectCycleCommercialPortfolio(supabase, "user-1", ["offer-1"])
    ).rejects.toThrow("Coorte aprovada vazia após persistência.");
  });
});
