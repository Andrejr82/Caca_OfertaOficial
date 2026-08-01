import { describe, expect, it, vi } from "vitest";
import { fetchAndNormalizeDriveImage } from "@/lib/images/drive-upload";

describe("fetchAndNormalizeDriveImage", () => {
  it("converte uma imagem válida para JPEG", async () => {
    const source = await import("sharp").then(({ default: sharp }) => sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, { status: 200, headers: { "content-type": "text/html" } })));

    const result = await fetchAndNormalizeDriveImage("https://example.test/image");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.extension).toBe(".jpg");
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.buffer.subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  it("rejeita resposta que não contém imagem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>bloqueado</html>", { status: 200 })));
    await expect(fetchAndNormalizeDriveImage("https://example.test/image")).rejects.toThrow("não é uma imagem válida");
  });
});
