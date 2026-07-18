import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/core/ai/official-ai-service";

describe("Official AI worker pool", () => {
  it.each([3, 5, 8])("limits %s-item workload to five workers", async (size) => {
    let active = 0;
    let peak = 0;
    const values = await mapWithConcurrency(Array.from({ length: size }, (_, index) => index), 5, async (index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return index;
    });

    expect(values).toEqual(Array.from({ length: size }, (_, index) => index));
    expect(peak).toBe(Math.min(size, 5));
  });

  it("waits for every worker and preserves individual result failures", async () => {
    const values = await mapWithConcurrency([1, 2, 3], 5, async (value) => {
      try {
        if (value === 2) throw new Error("offer failed");
        return { value, error: null };
      } catch (error) {
        return { value, error: error instanceof Error ? error.message : String(error) };
      }
    });

    expect(values).toEqual([
      { value: 1, error: null },
      { value: 2, error: "offer failed" },
      { value: 3, error: null }
    ]);
  });
});
