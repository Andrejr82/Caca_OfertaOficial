import { describe, expect, it, vi } from "vitest";
import { fetchAndNormalizeDriveImage } from "@/lib/images/drive-upload";

describe("fetchAndNormalizeDriveImage", () => {
  it("preserva uma imagem válida com assinatura reconhecida", async () => {
    // sharp's package exports do not expose its declaration through bundler resolution.
    // @ts-expect-error The runtime import is valid; this is a test-only package typing gap.
    const source = await import("sharp").then(({ default: sharp }) => sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, { status: 200, headers: { "content-type": "text/html" } })));

    const result = await fetchAndNormalizeDriveImage("https://example.test/image");
    expect(result.contentType).toBe("image/png");
    expect(result.extension).toBe(".png");
    expect(result.buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("rejeita resposta que não contém imagem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>bloqueado</html>", { status: 200 })));
    await expect(fetchAndNormalizeDriveImage("https://example.test/image")).rejects.toThrow("não é uma imagem válida");
  });
});
