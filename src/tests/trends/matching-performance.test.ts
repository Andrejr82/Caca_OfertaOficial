import { describe, expect, it } from "vitest";
import { matchTrendSignalsForUser } from "@/lib/trends/matching";

function classification(id: string, term: string) {
  return {
    id,
    trend_signal_id: `signal-${id}`,
    commercial_relevance: 90,
    is_product_intent: true,
    normalized_product_term: term,
    category_hint: "Teste",
    decision: "eligible",
    reason: "teste",
    ai_model: "test",
    strategy_version: "trend-commercial-v1",
    classified_at: "2026-08-10T20:00:00.000Z",
  };
}

describe("trend matching performance guards", () => {
  it("carrega ofertas uma vez e só faz discovery quando não há match local", async () => {
    let offersReads = 0;
    const persistedOpportunityRows: unknown[][] = [];

    const client = {
      from(table: string) {
        if (table === "trend_signal_classifications") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async eq() {
                      return {
                        data: [
                          classification("1", "fone bluetooth"),
                          classification("2", "cafeteira expresso"),
                        ],
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "trend_opportunities") {
          return {
            select() {
              return { async eq() { return { data: [], error: null }; } };
            },
            async upsert(rows: unknown[]) {
              persistedOpportunityRows.push(rows);
              return { error: null };
            },
          };
        }
        if (table === "offers") {
          return {
            select() {
              return {
                eq() {
                  return {
                    in() {
                      return {
                        async limit() {
                          offersReads += 1;
                          return {
                            data: [
                              {
                                id: "offer-1",
                                platform: "Shopee",
                                product_name: "Fone Bluetooth",
                                category: "Eletrônicos",
                                current_price: 99,
                                old_price: null,
                                item_id: "1",
                                product_id: null,
                                shopee_item_id: "1",
                                marketplace_metrics: {},
                              },
                              {
                                id: "offer-2",
                                platform: "Mercado Livre",
                                product_name: "Produto genérico",
                                category: "Cozinha",
                                current_price: 199,
                                old_price: null,
                                item_id: "2",
                                product_id: "2",
                                shopee_item_id: null,
                                marketplace_metrics: {},
                              },
                            ],
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`Tabela inesperada: ${table}`);
      },
    };

    const discoveryTerms: string[] = [];
    const result = await matchTrendSignalsForUser(client as never, "user-1", async (item) => {
      discoveryTerms.push(item.normalizedProductTerm ?? "");
      return [{
        id: "external-2",
        marketplace: "Mercado Livre",
        productName: "Cafeteira Expresso",
        category: "Cozinha",
        currentPrice: 199,
        productId: "2",
        itemId: "2",
      }];
    });

    expect(offersReads).toBe(1);
    expect(discoveryTerms).toEqual(["cafeteira expresso"]);
    expect(result.matchedSignals).toBe(2);
    expect(result.noMatchSignals).toBe(0);
    expect(persistedOpportunityRows).toHaveLength(1);
  });
});
