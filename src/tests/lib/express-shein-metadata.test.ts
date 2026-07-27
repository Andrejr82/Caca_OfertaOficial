import { describe, expect, it, vi } from "vitest";
import { readSheinMetadata } from "@/lib/publish/actions";

describe("Publicação Expressa — metadados Shein OneLink", () => {
  it("busca a página real do produto indicada no OneLink e extrai o preço", async () => {
    const oneLinkHtml = `
      <title>Não perca esta oferta grande na SHEIN!</title>
      <meta property="og:image" content="https://img.shein.test/landing.jpg">
      <input id="url" value="https://br.shein.com/Produto-p-123456-cat-100.html?onelink=44/abc&amp;url_from=affiliate">
    `;
    const productHtml = `
      <script type="application/ld+json">
        {"name":"Produto Shein","image":"https://img.shein.test/product.jpg","offers":{"price":"69.90"}}
      </script>
    `;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(productHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readSheinMetadata(
      "https://onelink.shein.com/44/abc",
      oneLinkHtml,
    );

    expect(result.price).toBe(69.9);
    expect(result.title).toBe("Produto Shein");
    expect(result.imageUrl).toBe("https://img.shein.test/product.jpg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://br.shein.com/Produto-p-123456-cat-100.html?onelink=44/abc&url_from=affiliate",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
