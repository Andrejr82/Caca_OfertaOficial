import { describe, expect, it, vi } from "vitest";
import { analyzeConversionPotential, callLLM } from "@/lib/ai/groq";

describe("robustez da fronteira legada", () => {
  it("bloqueia inferência genérica e curadoria IA antes de fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(callLLM("system", "user", {})).rejects.toThrow("LEGACY_AI_DISABLED");
    await expect(analyzeConversionPotential({} as never, 7)).rejects.toThrow("LEGACY_AI_DISABLED");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
