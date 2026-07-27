import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExpressFallbackMetadata, fetchExpressFallbackMetadataDetailed } from "@/lib/publish/actions";

describe("fetchExpressFallbackMetadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ORACLE_REMOTE_URL;
    delete process.env.ORACLE_API_KEY;
  });

  it("usa o gateway Oracle e normaliza a resposta de extração", async () => {
    process.env.ORACLE_REMOTE_URL = "https://oracle.example.com/";
    process.env.ORACLE_API_KEY = "test-key";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { extract: { title: "Produto confirmado", image: "https://cdn.example.com/item.jpg", price: "199.90" } },
      }),
    } as Response);

    await expect(fetchExpressFallbackMetadata("https://www.mercadolivre.com.br/item/MLB1"))
      .resolves.toEqual({ title: "Produto confirmado", imageUrl: "https://cdn.example.com/item.jpg", price: 199.9 });
    expect(fetchMock).toHaveBeenCalledWith("https://oracle.example.com/api/scrape", expect.objectContaining({ method: "POST" }));
  });

  it("não chama rede quando a configuração do gateway não existe", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    await expect(fetchExpressFallbackMetadata("https://shopee.com.br/item")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distingue erro HTTP da Oracle de configuração ausente", async () => {
    process.env.ORACLE_REMOTE_URL = "https://oracle.example.com";
    process.env.ORACLE_API_KEY = "test-key";
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" } as Response);

    await expect(fetchExpressFallbackMetadataDetailed("https://example.com/item"))
      .resolves.toMatchObject({ data: null, failureCode: "HTTP_ERROR", httpStatus: 401 });
  });
});
