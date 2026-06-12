import { describe, it, expect } from "vitest";
import { generateQuickPostAction } from "../lib/publish/actions";

describe("Shein Link Test", () => {
  it("should generate proper tracking link and data", async () => {
    const result = await generateQuickPostAction("https://onelink.shein.com/38/5sd1v3cywzzk", "telegram");
    console.log(JSON.stringify(result, null, 2));
    expect(result.ok).toBe(true);
  });
});
