import { describe, expect, it } from "vitest";
import { rotateTrendCandidates } from "@/lib/trends/candidate-rotation";

const candidate = (id: string, marketplace = "Shopee") => ({
  id,
  marketplace,
  productName: `Produto ${id}`,
  itemId: id,
  marketplaceMetrics: marketplace === "Shopee" ? { itemId: id } : { productId: id }
});

describe("deterministic candidate rotation", () => {
  it("is stable for the same run and changes the page across runs", () => {
    const input = { runId: "run-a", intentKey: "air-fryer", candidates: [candidate("1"), candidate("2"), candidate("3")], pageSize: 20, maxPages: 10 };
    const first = rotateTrendCandidates(input);
    expect(rotateTrendCandidates(input)).toEqual(first);
    expect(first.offset).toBe((first.nextPage - 1) * 20);
    expect(first.pagesToQuery).toHaveLength(2);
    expect(rotateTrendCandidates({ ...input, runId: "run-b" }).nextPage).not.toBe(first.nextPage);
  });

  it("excludes every previously exposed status and deduplicates marketplace identity", () => {
    const result = rotateTrendCandidates({
      runId: "run-1",
      intentKey: "notebook",
      candidates: [candidate("1"), candidate("1"), candidate("2", "Mercado Livre")],
      exposureHistory: [
        { marketplace: "Shopee", nativeProductId: "1", exposureStatus: "published" },
        { marketplace: "Mercado Livre", nativeProductId: "2", exposureStatus: "rejected" }
      ]
    });

    expect(result.selected).toEqual([]);
    expect(result.fallbackUsed).toBe(false);
  });

  it("allows repetition only when explicitly enabled and flags the fallback", () => {
    const result = rotateTrendCandidates({
      runId: "run-1",
      intentKey: "notebook",
      candidates: [candidate("1")],
      exposureHistory: [{ marketplace: "Shopee", nativeProductId: "1", exposureStatus: "approved" }],
      limit: 1,
      allowRepeatFallback: true
    });

    expect(result.selected.map((item) => item.id)).toEqual(["1"]);
    expect(result.fallbackUsed).toBe(true);
    expect(result.repeatedCandidateIds).toEqual(["1"]);
  });
});
