import { describe, expect, it, vi } from "vitest";
import { readSheinMetadata } from "@/lib/publish/actions";
import { parseSheinOneLinkHtml } from "@/lib/publish/shein-link";

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

  it("extrai a URL do produto quando o OneLink a entrega em script", async () => {
    const oneLinkHtml = `window.__DATA__ = {"url":"https:\\/\\/br.shein.com\\/Tenis-Masculino-p-123456-cat-100.html"};`;
    const productHtml = `
      <meta property="og:title" content="Tênis Masculino Shein">
      <meta property="og:image" content="https://img.ltwebstatic.com/product.jpg">
      <meta property="product:price:amount" content="69.90">
    `;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(productHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readSheinMetadata("https://onelink.shein.com/44/abc", oneLinkHtml);

    expect(result.title).toBe("Tênis Masculino Shein");
    expect(result.price).toBe(69.9);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://br.shein.com/Tenis-Masculino-p-123456-cat-100.html",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("falha fechado quando a SHEIN devolve desafio antibot sem preço", async () => {
    const oneLinkHtml = `
      <title>Não perca esta oferta grande na SHEIN!</title>
      <meta property="og:image" content="https://img.ltwebstatic.com/landing.jpg">
      <input id="url" value="https://br.shein.com/Genlund-Men-s-Summer-p-484542196-cat-2090.html?onelink=44/5wio94zbneju&amp;campaign_id=20&amp;url_from=affiliate_koc_6327469500">
    `;
    const blockedProductHtml = `
      <meta property="og:title" content="Não perca esta oferta grande na SHEIN!">
      <script>var SaPageInfo = { page_name: 'page_risk_crawler_block' };</script>
    `;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(blockedProductHtml, { status: 200 })));

    const result = await readSheinMetadata("https://onelink.shein.com/44/5wio94zbneju", oneLinkHtml);

    expect(result.title).toContain("Genlund Men s Summer");
    expect(result.imageUrl).toBe("https://img.ltwebstatic.com/landing.jpg");
    expect(result.price).toBe(0);
  });

  it.skipIf(process.env.RUN_LIVE_SHEIN_TESTS !== "1")("valida o OneLink real informado", async () => {
    vi.unstubAllGlobals();
    const response = await fetch("https://onelink.shein.com/44/5wio94zbneju", {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    expect(response.ok).toBe(true);

    const reference = parseSheinOneLinkHtml(await response.text());
    expect(reference?.productId).toBe("111711285");
    expect(reference?.productUrl).toContain("onelink=44/5wio94zbneju");
  });
});
